"""Readiness model: predicts whether a learner is likely to pass a level.

A scikit-learn logistic regression is trained on learner features captured
*before* each test attempt (so the same features are available when we make
a prediction for a level the learner has not tried yet).

Cold start: a new platform has no attempt history, so the model is
bootstrapped with synthetic learners drawn from a documented generative
model. Once real attempts exist they are added to the training set (and
weighted more heavily), so the model gradually adapts to the actual cohort.
"""
import threading
from datetime import datetime, timezone

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ml.knowledge_tracing import P_INIT, topic_mastery
from models import Attempt, ChatMessage, Level

FEATURES = [
    "prior_accuracy",   # mean accuracy (%) on earlier tests in this course
    "topic_mastery",    # mean BKT p_know over the level's topics
    "hints_per_q",      # historical chatbot hints per question answered
    "secs_per_q",       # historical seconds spent per question
    "attempt_no",       # which attempt at this level this would be
    "difficulty",       # mean question difficulty of the level (1-3)
]
FEATURE_LABELS = {
    "prior_accuracy": "Earlier test accuracy",
    "topic_mastery": "Topic mastery (knowledge tracing)",
    "hints_per_q": "Hints used per question",
    "secs_per_q": "Time per question",
    "attempt_no": "Attempt number",
    "difficulty": "Level difficulty",
}
REAL_WEIGHT = 3.0

_lock = threading.Lock()
_state = {"model": None, "info": {}}


# --------------------------------------------------------------------- features
def compute_features(user_id: int, level: Level) -> dict:
    course_id = level.course_id
    previous = (
        Attempt.query.join(Level)
        .filter(Attempt.user_id == user_id, Level.course_id == course_id)
        .all()
    )
    answered = sum(a.total for a in previous)
    prior_accuracy = float(np.mean([a.accuracy for a in previous])) if previous else 50.0
    hints_per_q = (sum(a.hints_used for a in previous) / answered) if answered else 0.5
    secs_per_q = (sum(a.time_taken_sec for a in previous) / answered) if answered else 45.0

    mastery = topic_mastery(user_id, course_id)
    topics = {q.topic for q in level.questions} or {"General"}
    topic_m = float(np.mean([mastery.get(t, P_INIT) for t in topics]))

    attempt_no = 1 + sum(1 for a in previous if a.level_id == level.id)
    difficulty = float(np.mean([q.difficulty or 1 for q in level.questions])) if level.questions else 1.0

    return {
        "prior_accuracy": round(prior_accuracy, 2),
        "topic_mastery": round(topic_m, 4),
        "hints_per_q": round(hints_per_q, 3),
        "secs_per_q": round(min(secs_per_q, 600.0), 1),
        "attempt_no": attempt_no,
        "difficulty": round(difficulty, 2),
    }


def _vector(f: dict):
    return [float(f.get(k, 0)) for k in FEATURES]


# --------------------------------------------------------------------- training
def synthetic_data(n=800, seed=42):
    rng = np.random.default_rng(seed)
    prior = rng.uniform(20, 100, n)
    mastery = np.clip(rng.beta(2, 2, n) * 0.6 + prior / 100 * 0.4, 0, 1)
    hints = rng.exponential(0.6, n)
    secs = rng.uniform(10, 150, n)
    attempt = rng.integers(1, 5, n)
    difficulty = rng.uniform(1, 3, n)
    z = (
        4.0 * (mastery - 0.5)
        + 3.0 * (prior / 100 - 0.6)
        - 0.8 * hints
        - 0.7 * (difficulty - 2)
        + 0.3 * (attempt - 1)
        - 0.004 * (secs - 45)
    )
    p = 1 / (1 + np.exp(-z))
    y = (rng.uniform(0, 1, n) < p).astype(int)
    X = np.column_stack([prior, mastery, hints, secs, attempt, difficulty])
    return X, y


def train():
    """(Re)train on synthetic + real attempts. Must run inside an app context."""
    Xs, ys = synthetic_data()
    real = [a for a in Attempt.query.all() if a.features]
    Xr = np.array([_vector(a.features) for a in real]) if real else np.empty((0, len(FEATURES)))
    yr = np.array([int(a.passed) for a in real]) if real else np.empty((0,), dtype=int)

    X = np.vstack([Xs, Xr])
    y = np.concatenate([ys, yr])
    w = np.concatenate([np.ones(len(ys)), np.full(len(yr), REAL_WEIGHT)])

    X_tr, X_te, y_tr, y_te, w_tr, _ = train_test_split(X, y, w, test_size=0.25, random_state=7, stratify=y)
    model = Pipeline([("scale", StandardScaler()), ("clf", LogisticRegression(max_iter=1000))])
    model.fit(X_tr, y_tr, clf__sample_weight=w_tr)
    proba = model.predict_proba(X_te)[:, 1]
    metrics = {
        "holdout_accuracy": round(float(accuracy_score(y_te, proba >= 0.5)), 3),
        "holdout_auc": round(float(roc_auc_score(y_te, proba)), 3),
    }

    # Evaluate on real data only, when there is enough of it to mean something
    if len(yr) >= 10 and len(set(yr)) == 2:
        pr = model.predict_proba(Xr)[:, 1]
        metrics["real_accuracy"] = round(float(accuracy_score(yr, pr >= 0.5)), 3)
        metrics["real_auc"] = round(float(roc_auc_score(yr, pr)), 3)

    # Refit on everything for use
    model.fit(X, y, clf__sample_weight=w)
    coefs = model.named_steps["clf"].coef_[0]
    importance = sorted(
        ({"feature": FEATURE_LABELS[f], "weight": round(float(c), 3)} for f, c in zip(FEATURES, coefs)),
        key=lambda d: -abs(d["weight"]),
    )
    with _lock:
        _state["model"] = model
        _state["info"] = {
            "algorithm": "Logistic regression (scikit-learn) on standardised features",
            "synthetic_samples": int(len(ys)),
            "real_samples": int(len(yr)),
            "metrics": metrics,
            "feature_importance": importance,
            "trained_at": datetime.now(timezone.utc).isoformat(),
        }
    return _state["info"]


def model_info():
    if _state["model"] is None:
        train()
    return _state["info"]


# ------------------------------------------------------------------- prediction
def readiness(user_id: int, level: Level) -> dict:
    if _state["model"] is None:
        train()
    f = compute_features(user_id, level)
    p = float(_state["model"].predict_proba([_vector(f)])[0, 1])
    if p >= 0.7:
        band, advice = "ready", "You look ready - go ahead and take the test."
    elif p >= 0.4:
        band, advice = "almost", "Review your weaker topics first, then try the test."
    else:
        band, advice = "review", "Revise the notes and practise before testing; use the tutor's hints when stuck."
    return {"probability": round(p, 3), "band": band, "advice": advice, "features": f}


def hints_used_since_last_attempt(user_id: int, level_id: int) -> int:
    last = (
        Attempt.query.filter_by(user_id=user_id, level_id=level_id)
        .order_by(Attempt.created_at.desc())
        .first()
    )
    q = ChatMessage.query.filter(
        ChatMessage.user_id == user_id, ChatMessage.level_id == level_id, ChatMessage.hint_level > 0
    )
    if last:
        q = q.filter(ChatMessage.created_at > last.created_at)
    return q.count()
