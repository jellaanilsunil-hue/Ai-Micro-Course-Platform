"""Load demo accounts, the four micro-courses and (optionally) sample pilot learners.

Run manually with:  python seed.py      (it also runs automatically on an empty database)
Course content lives in seed_courses.json so it can be edited without touching code.
"""
import json
import math
import os
import random
from datetime import datetime, timedelta, timezone

from extensions import db
from ml import adaptive
from ml.knowledge_tracing import record_answer
from models import Attempt, ChatMessage, Course, Enrollment, Feedback, Level, Question, User

HERE = os.path.dirname(__file__)

DEMO_ACCOUNTS = [
    # key, name, email, password, role, extra
    ("s1", "Alice Johnson", "alice@chester.ac.uk", "Student123!", "student", {"student_id": "STU001"}),
    ("p1", "Dr Wei Chen", "prof.chen@chester.ac.uk", "Prof123!", "professor", {"department": "Computer Science"}),
    ("p2", "Dr Sarah Taylor", "prof.taylor@chester.ac.uk", "Prof123!", "professor", {"department": "Business School"}),
]

# Sample pilot learners so the professor analytics have data. "ability" is on a 0-1.6 scale.
SAMPLE_LEARNERS = [
    ("Bob Smith", "STU002", 0.55, ["c1", "c3", "c4"]),
    ("Chloe Adeyemi", "STU003", 1.45, ["c1", "c2", "c3"]),
    ("Dev Patel", "STU004", 0.95, ["c1", "c2", "c4"]),
    ("Ewa Nowak", "STU005", 0.15, ["c1", "c3"]),
    ("Farah Khan", "STU006", 1.15, ["c2", "c3", "c4"]),
]
SAMPLE_FEEDBACK = [
    ([4, 2, 4, 1, 4, 2, 5, 1, 4, 2], "The hints felt like a real tutor."),
    ([5, 1, 4, 2, 5, 1, 4, 2, 5, 1], "Love that the next level unlocks automatically."),
    ([3, 2, 4, 2, 4, 2, 4, 2, 3, 2], ""),
    ([4, 2, 5, 1, 4, 1, 5, 2, 4, 2], "Would like more practice questions per level."),
    ([4, 1, 4, 2, 4, 2, 4, 1, 4, 2], ""),
]
TUTOR_INTENTS = ["hint", "hint", "hint", "explain", "chapter", "trace", "frustrated", "answer_request", "stuck"]


def load_courses(professors):
    with open(os.path.join(HERE, "seed_courses.json"), encoding="utf-8") as fh:
        specs = json.load(fh)
    by_key = {}
    for spec in specs:
        c = Course(title=spec["title"], description=spec["desc"], category=spec["cat"], icon=spec["icon"],
                   is_published=spec.get("pub", True), professor_id=professors[spec["by"]].id)
        db.session.add(c)
        db.session.flush()
        for lv in spec["levels"]:
            level = Level(course_id=c.id, number=lv["n"], title=lv["title"], pass_mark=lv["pm"],
                          tip=lv.get("tip", ""), chapters=lv["chapters"])
            db.session.add(level)
            db.session.flush()
            for q in lv["qs"]:
                db.session.add(Question(
                    level_id=level.id, text=q["q"], qtype="mcq", options=q["opts"], answer=q["opts"][q["ans"]],
                    explanation=q.get("why", ""), hints=q.get("hints", []), topic=q.get("topic", "General"),
                    difficulty=q.get("diff", 1), chapter=q.get("ch", 0)))
        by_key[spec["id"]] = c
    return by_key


def simulate_learners(courses_by_key):
    """Create sample learners with realistic attempts, hints and SUS feedback (marked is_sample)."""
    rng = random.Random(2026)
    now = datetime.now(timezone.utc)
    for si, (name, sid, ability, keys) in enumerate(SAMPLE_LEARNERS):
        u = User(name=name, email=name.split()[0].lower() + "@chester.ac.uk", role="student", student_id=sid,
                 status="approved", is_sample=True)
        u.set_password("Student123!")
        db.session.add(u)
        db.session.flush()
        t = now - timedelta(days=21 - si)
        for key in keys:
            course = courses_by_key[key]
            db.session.add(Enrollment(user_id=u.id, course_id=course.id))
            stop = False
            for li, level in enumerate(course.levels):
                if stop:
                    break
                for att in range(3):
                    db.session.flush()
                    features = adaptive.compute_features(u.id, level)
                    details, correct, hints = [], 0, 0
                    for q in level.questions:
                        z = ability * 2.2 - (q.difficulty - 1) * 0.9 + att * 0.6 - li * 0.35 - 0.4
                        ok = rng.random() < 1 / (1 + math.exp(-z))
                        wrong = [o for o in q.options if o != q.answer]
                        details.append({"question_id": q.id, "given": q.answer if ok else rng.choice(wrong), "correct": ok})
                        correct += ok
                        record_answer(u.id, course.id, q.topic, ok, q.qtype)
                        if rng.random() < 0.55 - ability * 0.25:
                            hints += 1
                            db.session.add(ChatMessage(user_id=u.id, level_id=level.id, question_id=q.id,
                                                       message="(sample)", reply="(sample)",
                                                       intent=rng.choice(TUTOR_INTENTS), hint_level=1, created_at=t))
                    accuracy = round(100 * correct / len(level.questions), 1)
                    passed = accuracy >= level.pass_mark
                    db.session.add(Attempt(user_id=u.id, level_id=level.id, correct=correct, total=len(level.questions),
                                           accuracy=accuracy, passed=passed, hints_used=hints, details=details,
                                           time_taken_sec=int(len(level.questions) * (25 + rng.random() * 60)),
                                           features=features, created_at=t))
                    t += timedelta(days=0.3 + rng.random())
                    if passed:
                        break
                    if att == 2:
                        stop = True
                if rng.random() < 0.15:  # some learners pause mid-course
                    stop = True
        resp, comment = SAMPLE_FEEDBACK[si]
        score = sum((r - 1) if i % 2 == 0 else (5 - r) for i, r in enumerate(resp)) * 2.5
        db.session.add(Feedback(user_id=u.id, responses=resp, sus_score=score, comment=comment,
                                created_at=now - timedelta(days=si)))


def seed(samples=True):
    if User.query.first():
        return False
    users = {}
    for key, name, email, pw, role, extra in DEMO_ACCOUNTS:
        u = User(name=name, email=email, role=role, status="approved", **extra)
        u.set_password(pw)
        db.session.add(u)
        users[key] = u
    db.session.flush()
    courses = load_courses(users)
    db.session.flush()
    if samples:
        simulate_learners(courses)
    db.session.commit()
    adaptive.train()  # include the sample attempts in the readiness model
    return True


if __name__ == "__main__":
    from app import create_app

    app = create_app()
    with app.app_context():
        print("Seeded demo data." if seed() else "Database already has users - nothing to do.")
