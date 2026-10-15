"""Bayesian Knowledge Tracing (Corbett & Anderson, 1994).

Each learner has a probability p_know of having mastered each topic. Every
answered question updates that belief, which lets the system find knowledge
gaps and recommend what to review.
"""
from extensions import db
from models import Mastery

P_INIT = 0.30   # prior probability the learner already knows a topic
P_LEARN = 0.15  # probability of learning the topic after an opportunity
P_SLIP = 0.10   # knows it but answers wrongly
GUESS = {"mcq": 0.25, "short": 0.05}  # answers correctly without knowing it

MASTERED = 0.80
WEAK = 0.50


def bkt_update(p_know: float, correct: bool, qtype: str = "mcq") -> float:
    guess = GUESS.get(qtype, 0.2)
    if correct:
        evidence = p_know * (1 - P_SLIP)
        posterior = evidence / (evidence + (1 - p_know) * guess)
    else:
        evidence = p_know * P_SLIP
        posterior = evidence / (evidence + (1 - p_know) * (1 - guess))
    return posterior + (1 - posterior) * P_LEARN


def get_state(user_id: int, course_id: int, topic: str) -> Mastery:
    row = Mastery.query.filter_by(user_id=user_id, course_id=course_id, topic=topic).first()
    if row is None:
        row = Mastery(user_id=user_id, course_id=course_id, topic=topic, p_know=P_INIT, observations=0)
        db.session.add(row)
    return row


def record_answer(user_id: int, course_id: int, topic: str, correct: bool, qtype: str):
    row = get_state(user_id, course_id, topic)
    row.p_know = round(bkt_update(row.p_know, correct, qtype), 4)
    row.observations = (row.observations or 0) + 1
    return row


def topic_mastery(user_id: int, course_id: int) -> dict:
    rows = Mastery.query.filter_by(user_id=user_id, course_id=course_id).all()
    return {r.topic: r.p_know for r in rows}


def label(p: float) -> str:
    if p >= MASTERED:
        return "mastered"
    if p >= WEAK:
        return "developing"
    return "needs work"
