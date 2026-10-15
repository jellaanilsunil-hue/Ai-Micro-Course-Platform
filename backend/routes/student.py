"""Student-facing API: dashboard, courses, chapters, level tests, practice, progress, certificate, AI tutor."""
import random

from flask import Blueprint, current_app, g, jsonify, request

from auth import login_required
from extensions import db
from ml import adaptive
from ml.knowledge_tracing import P_INIT, label, record_answer, topic_mastery
from models import Attempt, ChatMessage, Course, Enrollment, Feedback, Level, Question
from nlp.tutor_bot import get_bot
from services import (best_accuracy, course_complete, current_level, grade_submission, has_passed,
                      is_correct, is_enrolled, is_unlocked, learning_path, level_status, mastery_rows, test_order)

bp = Blueprint("student", __name__, url_prefix="/api")


def _visible_course(course_id):
    course = db.session.get(Course, course_id)
    if course is None or (not course.is_published and g.user.role != "professor"):
        return None
    return course


def _course_card(c, user):
    d = c.to_dict()
    passed = sum(1 for lv in c.levels if has_passed(user.id, lv.id))
    started = Attempt.query.join(Level).filter(Attempt.user_id == user.id, Level.course_id == c.id).first() is not None
    d.update(enrolled=is_enrolled(user.id, c.id), levels_passed=passed,
             progress=round(100 * passed / len(c.levels)) if c.levels else 0,
             state="complete" if course_complete(user, c) else "in progress" if started else "not started")
    return d


def _my_attempts(user_id):
    return Attempt.query.filter_by(user_id=user_id).order_by(Attempt.created_at.desc()).all()


# ------------------------------------------------------------------ dashboard
@bp.get("/dashboard")
@login_required(role="student")
def dashboard():
    courses = Course.query.filter_by(is_published=True).order_by(Course.id).all()
    mine = _my_attempts(g.user.id)
    passed_levels = sum(1 for c in courses for lv in c.levels if has_passed(g.user.id, lv.id))
    return jsonify(
        stats={"courses": len(courses), "levels_passed": passed_levels, "tests_taken": len(mine),
               "average_score": round(sum(a.accuracy for a in mine) / len(mine)) if mine else 0},
        path=learning_path(g.user, courses),
        courses=[_course_card(c, g.user) for c in courses],
    )


@bp.get("/courses")
@login_required()
def list_courses():
    courses = Course.query.filter_by(is_published=True).order_by(Course.id).all()
    return jsonify(courses=[_course_card(c, g.user) for c in courses])


@bp.post("/courses/<int:course_id>/enroll")
@login_required(role="student")
def enroll(course_id):
    if _visible_course(course_id) is None:
        return jsonify(error="Course not found."), 404
    if not is_enrolled(g.user.id, course_id):
        db.session.add(Enrollment(user_id=g.user.id, course_id=course_id))
        db.session.commit()
    return jsonify(ok=True)


@bp.get("/courses/<int:course_id>")
@login_required()
def course_detail(course_id):
    course = _visible_course(course_id)
    if course is None:
        return jsonify(error="Course not found."), 404
    data = _course_card(course, g.user)
    levels = []
    for lv in course.levels:
        st = level_status(g.user, lv)
        if g.user.role == "student" and st["status"] == "unlocked" and lv.questions:
            st["readiness"] = adaptive.readiness(g.user.id, lv)
        levels.append(st)
    data["levels"] = levels
    return jsonify(course=data)


def _unlocked_level_or_error(level_id):
    level = db.session.get(Level, level_id)
    if level is None or not _visible_course(level.course_id):
        return None, (jsonify(error="Level not found."), 404)
    if not is_unlocked(g.user, level):
        return None, (jsonify(error="This level is locked. Pass the previous level first."), 403)
    return level, None


# ------------------------------------------------------------------ chapters
@bp.get("/levels/<int:level_id>")
@login_required()
def level_content(level_id):
    level, err = _unlocked_level_or_error(level_id)
    if err:
        return err
    data = level_status(g.user, level)
    data["chapters"] = level.chapters or []
    data["course"] = level.course.to_dict()
    if g.user.role == "student" and level.questions:
        data["readiness"] = adaptive.readiness(g.user.id, level)
    return jsonify(level=data)


# ------------------------------------------------------------------ tests
@bp.get("/levels/<int:level_id>/test")
@login_required(role="student")
def start_test(level_id):
    level, err = _unlocked_level_or_error(level_id)
    if err:
        return err
    if not level.questions:
        return jsonify(error="This level has no questions yet."), 400
    return jsonify(level=level.to_dict(), course=level.course.to_dict(),
                   questions=[q.to_dict() for q in test_order(level)])


@bp.post("/levels/<int:level_id>/submit")
@login_required(role="student")
def submit_test(level_id):
    level, err = _unlocked_level_or_error(level_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    answers = data.get("answers") or {}
    if not isinstance(answers, dict):
        return jsonify(error="Answers must be an object of question id -> answer."), 400
    result = grade_submission(g.user, level, answers, data.get("time_taken_sec", 0))
    result["course"] = level.course.to_dict()
    result["level"] = level.to_dict()
    return jsonify(result)


# ------------------------------------------------------------------ practice
@bp.get("/courses/<int:course_id>/practice")
@login_required(role="student")
def practice_set(course_id):
    course = _visible_course(course_id)
    if course is None or not is_enrolled(g.user.id, course_id):
        return jsonify(error="Enrol in the course first."), 403
    mastery = topic_mastery(g.user.id, course_id)
    pool = [q for lv in course.levels if is_unlocked(g.user, lv) for q in lv.questions]
    random.shuffle(pool)
    pool.sort(key=lambda q: mastery.get(q.topic, P_INIT))  # weakest topics first
    picked = pool[:5]
    return jsonify(course=course.to_dict(), questions=[q.to_dict() for q in picked],
                   focus_topics=sorted({q.topic for q in picked}))


@bp.post("/practice/check")
@login_required(role="student")
def practice_check():
    data = request.get_json(silent=True) or {}
    q = db.session.get(Question, data.get("question_id") or 0)
    if q is None or not is_unlocked(g.user, q.level):
        return jsonify(error="Question not found."), 404
    ok = is_correct(q, data.get("answer"))
    state = record_answer(g.user.id, q.level.course_id, q.topic, ok, q.qtype)
    db.session.commit()
    out = {"correct": ok, "topic": q.topic, "mastery": round(state.p_know, 3), "mastery_label": label(state.p_know)}
    if has_passed(g.user.id, q.level_id) or ok:
        out["correct_answer"] = q.answer.split("|")[0]
        out["explanation"] = q.explanation
    else:
        out["explanation"] = get_bot().mask(q.explanation or "", q)
    return jsonify(out)


# ------------------------------------------------------------------ progress & certificate
@bp.get("/progress")
@login_required(role="student")
def progress():
    courses = Course.query.filter_by(is_published=True).order_by(Course.id).all()
    mine = _my_attempts(g.user.id)
    all_levels = [lv for c in courses for lv in c.levels]
    out = []
    for c in courses:
        card = _course_card(c, g.user)
        card["levels"] = [dict(lv.to_dict(), passed=has_passed(g.user.id, lv.id),
                               best_accuracy=best_accuracy(g.user.id, lv.id)) for lv in c.levels]
        card["mastery"] = mastery_rows(g.user.id, c.id)
        out.append(card)
    return jsonify(
        user=g.user.to_dict(),
        stats={"levels_passed": sum(1 for lv in all_levels if has_passed(g.user.id, lv.id)),
               "levels_total": len(all_levels), "tests_taken": len(mine),
               "average_score": round(sum(a.accuracy for a in mine) / len(mine)) if mine else 0,
               "hints_used": sum(a.hints_used for a in mine)},
        courses=out,
        attempts=[a.to_dict() for a in mine[:100]],
    )


@bp.get("/courses/<int:course_id>/certificate")
@login_required(role="student")
def certificate(course_id):
    course = _visible_course(course_id)
    if course is None:
        return jsonify(error="Course not found."), 404
    if not course_complete(g.user, course):
        return jsonify(error="Pass every level of this course to receive the certificate."), 403
    passes = (Attempt.query.join(Level)
              .filter(Attempt.user_id == g.user.id, Level.course_id == course_id, Attempt.passed.is_(True))
              .order_by(Attempt.created_at.desc()).all())
    scores = [best_accuracy(g.user.id, lv.id) for lv in course.levels]
    return jsonify(
        name=g.user.name, course=course.to_dict(),
        levels=[{"number": lv.number, "title": lv.title, "best": s} for lv, s in zip(course.levels, scores)],
        average=round(sum(scores) / len(scores)),
        achieved_at=passes[0].to_dict()["created_at"] if passes else None,
        certificate_id=f"EDU-C{course.id}-U{g.user.id}",
    )


# ------------------------------------------------------------------ AI tutor
@bp.post("/chat")
@login_required()
def chat():
    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify(error="Type a message first."), 400
    if len(message) > 1000:
        return jsonify(error="Please keep messages under 1000 characters."), 400

    question = level = None
    if data.get("question_id"):
        question = db.session.get(Question, int(data["question_id"]))
        if question is None or not is_unlocked(g.user, question.level):
            return jsonify(error="Question not found."), 404
        level = question.level
    elif data.get("level_id"):
        level = db.session.get(Level, int(data["level_id"]))
        if level is None or not is_unlocked(g.user, level):
            return jsonify(error="Level not found."), 404

    hints_given = 0
    if question is not None:  # the hint ladder restarts after each test attempt
        last = (Attempt.query.filter_by(user_id=g.user.id, level_id=level.id)
                .order_by(Attempt.created_at.desc()).first())
        q = ChatMessage.query.filter(ChatMessage.user_id == g.user.id, ChatMessage.question_id == question.id,
                                     ChatMessage.hint_level > 0)
        if last:
            q = q.filter(ChatMessage.created_at > last.created_at)
        hints_given = q.count()

    bot = get_bot(current_app.config.get("HF_QA_MODEL", ""))
    result = bot.respond(message, question=question, level=level, hints_given=hints_given)
    db.session.add(ChatMessage(
        user_id=g.user.id, level_id=level.id if level else None,
        question_id=question.id if question else None, message=message, reply=result["reply"],
        intent=result["intent"], hint_level=result["hint_level"],
    ))
    db.session.commit()
    return jsonify(result)


# ------------------------------------------------------------------ pilot feedback (SUS)
def sus_score(responses):
    """Standard System Usability Scale scoring: odd items r-1, even items 5-r, total x 2.5."""
    return sum((r - 1) if i % 2 == 0 else (5 - r) for i, r in enumerate(responses)) * 2.5


@bp.post("/feedback")
@login_required()
def feedback():
    data = request.get_json(silent=True) or {}
    responses = data.get("responses")
    if (not isinstance(responses, list) or len(responses) != 10
            or not all(isinstance(r, int) and 1 <= r <= 5 for r in responses)):
        return jsonify(error="Please answer all ten statements (1-5)."), 400
    score = sus_score(responses)
    db.session.add(Feedback(user_id=g.user.id, responses=responses, sus_score=score,
                            comment=(data.get("comment") or "")[:2000]))
    db.session.commit()
    return jsonify(sus_score=score), 201
