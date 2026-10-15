"""Shared domain logic: level unlocking, marking and grading."""
import re

from extensions import db
from ml import adaptive
from ml.knowledge_tracing import P_INIT, label, record_answer, topic_mastery
from models import Attempt, Enrollment, Level


def normalise(text) -> str:
    text = str(text or "").strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text.strip(" .,'\"")


def is_correct(question, given) -> bool:
    if given is None or str(given).strip() == "":
        return False
    g = normalise(given)
    accepted = [question.answer] if question.qtype == "mcq" else question.answer.split("|")
    for a in accepted:
        a = normalise(a)
        if g == a:
            return True
        try:  # numeric answers: "4.0" == "4"
            if abs(float(g) - float(a)) < 1e-9:
                return True
        except ValueError:
            pass
    return False


def is_enrolled(user_id, course_id) -> bool:
    return Enrollment.query.filter_by(user_id=user_id, course_id=course_id).first() is not None


def previous_level(level):
    return (
        Level.query.filter(Level.course_id == level.course_id, Level.number < level.number)
        .order_by(Level.number.desc())
        .first()
    )


def has_passed(user_id, level_id) -> bool:
    return Attempt.query.filter_by(user_id=user_id, level_id=level_id, passed=True).first() is not None


def is_unlocked(user, level) -> bool:
    if user.role == "professor":
        return True
    if not is_enrolled(user.id, level.course_id):
        return False
    prev = previous_level(level)
    return prev is None or has_passed(user.id, prev.id)


def level_status(user, level) -> dict:
    attempts = Attempt.query.filter_by(user_id=user.id, level_id=level.id).all()
    passed = any(a.passed for a in attempts)
    if passed:
        status = "passed"
    elif is_unlocked(user, level):
        status = "unlocked"
    else:
        status = "locked"
    data = level.to_dict()
    data.update(
        status=status,
        attempts=len(attempts),
        best_accuracy=max((a.accuracy for a in attempts), default=None),
    )
    return data


def current_level(user, course):
    """First level the learner has not passed yet (None when the course is complete)."""
    for lv in course.levels:
        if not has_passed(user.id, lv.id):
            return lv
    return None


def course_complete(user, course) -> bool:
    return bool(course.levels) and current_level(user, course) is None


def best_accuracy(user_id, level_id):
    rows = Attempt.query.filter_by(user_id=user_id, level_id=level_id).all()
    return max((a.accuracy for a in rows), default=None)


def test_order(level):
    """Questions are served easiest first (adaptive warm-up), then by id."""
    return sorted(level.questions, key=lambda q: (q.difficulty or 1, q.id))


def mastery_rows(user_id, course_id, topics=None):
    m = topic_mastery(user_id, course_id)
    names = topics if topics is not None else sorted(m, key=lambda t: m[t])
    return [{"topic": t, "p_know": round(m.get(t, P_INIT), 3), "label": label(m.get(t, P_INIT))} for t in names]


def weakest_topic(user_id, level):
    """Lowest-mastery topic of a level, with the chapter that teaches it (None if nothing is weak)."""
    m = topic_mastery(user_id, level.course_id)
    best = None
    for q in level.questions:
        if q.topic in m and (best is None or m[q.topic] < best["p_know"]):
            best = {"topic": q.topic, "p_know": round(m[q.topic], 3), "chapter": q.chapter or 0}
    return best if best and best["p_know"] < 0.6 else None


def learning_path(user, courses):
    """Up to three next-step recommendations for the student dashboard."""
    def has_attempts(c):
        return Attempt.query.join(Level).filter(Attempt.user_id == user.id, Level.course_id == c.id).first() is not None

    started = [c for c in courses if has_attempts(c) and not course_complete(user, c)]
    picks = started[:3] if started else [c for c in courses if is_enrolled(user.id, c.id)][:1] or courses[:1]
    out = []
    for c in picks:
        lv = current_level(user, c)
        if lv is None or not lv.questions:
            continue
        r = adaptive.readiness(user.id, lv)
        weak = weakest_topic(user.id, lv)
        if not started:
            action, kind, chapter = f"Start with Level {lv.number}: {lv.title} — read the {len(lv.chapters or [])} short chapters first.", "read", 0
        elif weak and r["band"] != "ready":
            action = (f"Your weakest topic is {weak['topic']} ({round(weak['p_know'] * 100)}% mastery). "
                      f"Re-read Chapter {weak['chapter'] + 1} before testing.")
            kind, chapter = "read", weak["chapter"]
        elif r["band"] == "ready":
            action, kind, chapter = f"You're ready for the Level {lv.number} test.", "test", 0
        else:
            action, kind, chapter = f"Read the Level {lv.number} chapters, then try the test.", "read", 0
        out.append({"course": c.to_dict(), "level": lv.to_dict(), "readiness": r, "action": action,
                    "kind": kind, "chapter": chapter, "enrolled": is_enrolled(user.id, c.id)})
    return out


def grade_submission(user, level, answers: dict, time_taken_sec: int) -> dict:
    """Mark a test, store the attempt, update knowledge tracing and return feedback."""
    questions = test_order(level)
    features = adaptive.compute_features(user.id, level)  # captured before this attempt
    hints = adaptive.hints_used_since_last_attempt(user.id, level.id)

    details, correct = [], 0
    for q in questions:
        given = answers.get(str(q.id), answers.get(q.id))
        ok = is_correct(q, given)
        correct += ok
        details.append({"question_id": q.id, "given": given, "correct": ok})
        record_answer(user.id, level.course_id, q.topic or "General", ok, q.qtype)

    total = len(questions)
    accuracy = round(100.0 * correct / total, 1) if total else 0.0
    passed = accuracy >= level.pass_mark
    attempt = Attempt(
        user_id=user.id, level_id=level.id, correct=correct, total=total, accuracy=accuracy,
        passed=passed, time_taken_sec=max(0, int(time_taken_sec or 0)), hints_used=hints,
        details=details, features=features,
    )
    db.session.add(attempt)
    db.session.commit()

    from nlp.tutor_bot import get_bot
    bot = get_bot()
    chapters = level.chapters or []
    feedback = []
    for q, d in zip(questions, details):
        item = {"question_id": q.id, "text": q.text, "topic": q.topic, "chapter": q.chapter or 0,
                "your_answer": d["given"], "correct": d["correct"]}
        if passed:
            item["correct_answer"] = q.answer.split("|")[0] if q.qtype == "short" else q.answer
            item["explanation"] = q.explanation
        elif not d["correct"]:
            # Failed attempts get the concept but not the answer, so a retake stays meaningful
            item["explanation"] = bot.mask(q.explanation or "", q)
        feedback.append(item)

    nxt = Level.query.filter(Level.course_id == level.course_id, Level.number > level.number) \
        .order_by(Level.number).first()
    weak_chapters = sorted({f["chapter"] for f in feedback if not f["correct"]})
    topics = list(dict.fromkeys(q.topic for q in questions))
    target = nxt if (passed and nxt) else (None if passed else level)
    return {
        "attempt": attempt.to_dict(),
        "accuracy": accuracy,
        "correct": correct,
        "total": total,
        "pass_mark": level.pass_mark,
        "passed": passed,
        "feedback": feedback,
        "weak_topics": sorted({f["topic"] for f in feedback if not f["correct"]}),
        "weak_chapters": [{"index": i, "title": chapters[i]["title"] if i < len(chapters) else ""} for i in weak_chapters],
        "mastery": mastery_rows(user.id, level.course_id, topics),
        "next_level": nxt.to_dict() if (passed and nxt) else None,
        "course_completed": passed and nxt is None,
        "recommendation": adaptive.readiness(user.id, target) if target else None,
        "recommendation_for": target.number if target else None,
    }
