"""Professor-only API: author courses, levels, chapters and test questions; learning analytics."""
from collections import Counter, defaultdict

from flask import Blueprint, current_app, g, jsonify, request

from auth import login_required
from extensions import db
from ml import adaptive
from ml.knowledge_tracing import label, topic_mastery
from models import Attempt, ChatMessage, Course, Feedback, Level, Question, User
from services import best_accuracy, current_level, has_passed

bp = Blueprint("professor", __name__, url_prefix="/api/professor")

CHAPTER_BLOCK_KINDS = {"h", "p", "code", "tip", "warn", "ok"}


def _own_course(course_id):
    c = db.session.get(Course, course_id)
    return c if c and c.professor_id == g.user.id else None


def _own_level(level_id):
    lv = db.session.get(Level, level_id)
    return lv if lv and lv.course.professor_id == g.user.id else None


def _own_question(qid):
    q = db.session.get(Question, qid)
    return q if q and q.level.course.professor_id == g.user.id else None


def _not_found(what="Item"):
    return jsonify(error=f"{what} not found, or it belongs to another professor."), 404


def _learners(course):
    """Students who have taken at least one test in the course."""
    ids = {a.user_id for lv in course.levels for a in Attempt.query.filter_by(level_id=lv.id)}
    return [u for u in (db.session.get(User, i) for i in sorted(ids)) if u and u.role == "student"]


def _student_status(user, course):
    lv = current_level(user, course)
    if lv is None:
        return {"done": True}
    if not lv.questions:
        return {"done": False, "level": lv.number, "readiness": None, "at_risk": False}
    r = adaptive.readiness(user.id, lv)
    tries = Attempt.query.filter_by(user_id=user.id, level_id=lv.id).count()
    return {"done": False, "level": lv.number, "readiness": r["probability"], "band": r["band"],
            "at_risk": r["probability"] < 0.4 and tries > 0}


# ------------------------------------------------------------------ overview & courses
@bp.get("/overview")
@login_required(role="professor")
def overview():
    courses = Course.query.filter_by(professor_id=g.user.id).order_by(Course.id).all()
    learners, at_risk, cards = set(), 0, []
    for c in courses:
        ls = _learners(c)
        learners |= {u.id for u in ls}
        at_risk += sum(1 for u in ls if _student_status(u, c).get("at_risk"))
        cards.append(dict(c.to_dict(), learners=len(ls)))
    return jsonify(
        user=g.user.to_dict(),
        stats={"courses": len(courses), "published": sum(c.is_published for c in courses),
               "levels": sum(len(c.levels) for c in courses), "learners": len(learners), "at_risk": at_risk},
        courses=cards,
    )


@bp.post("/courses")
@login_required(role="professor")
def create_course():
    data = request.get_json(silent=True) or {}
    title, category = (data.get("title") or "").strip(), (data.get("category") or "").strip()
    if not title or not category:
        return jsonify(error="Enter a title and a category."), 400
    c = Course(title=title, category=category, description=(data.get("description") or "").strip() or "A new micro-course.",
               icon=(data.get("icon") or "📘")[:8], is_published=False, professor_id=g.user.id)
    db.session.add(c)
    db.session.commit()
    return jsonify(course=c.to_dict()), 201


@bp.get("/courses/<int:course_id>")
@login_required(role="professor")
def get_course(course_id):
    c = _own_course(course_id)
    if not c:
        return _not_found("Course")
    data = c.to_dict()
    data["levels"] = [dict(lv.to_dict(include_chapters=True),
                           questions=[q.to_dict(reveal=True) for q in lv.questions]) for lv in c.levels]
    return jsonify(course=data)


@bp.put("/courses/<int:course_id>")
@login_required(role="professor")
def update_course(course_id):
    c = _own_course(course_id)
    if not c:
        return _not_found("Course")
    data = request.get_json(silent=True) or {}
    if "title" in data:
        if not str(data["title"]).strip():
            return jsonify(error="Course title is required."), 400
        c.title = data["title"].strip()
    for field in ("description", "category", "icon"):
        if field in data:
            setattr(c, field, data[field])
    if "is_published" in data:
        if data["is_published"] and not c.levels:
            return jsonify(error=f'Add at least one level to "{c.title}" before publishing.'), 400
        c.is_published = bool(data["is_published"])
    db.session.commit()
    return jsonify(course=c.to_dict())


@bp.delete("/courses/<int:course_id>")
@login_required(role="professor")
def delete_course(course_id):
    c = _own_course(course_id)
    if not c:
        return _not_found("Course")
    for lv in c.levels:
        Attempt.query.filter_by(level_id=lv.id).delete()
    db.session.delete(c)
    db.session.commit()
    return jsonify(ok=True)


# ------------------------------------------------------------------ levels
def _clean_chapters(raw):
    """Validate chapters: [{title, blocks:[[kind, text], ...]}] or {title, text} (plain text, blank-line paragraphs,
    paragraphs indented by 4 spaces become code)."""
    chapters = []
    for i, ch in enumerate(raw or []):
        title = str(ch.get("title") or "").strip() or f"Chapter {i + 1}"
        if "blocks" in ch:
            blocks = [[k, str(t)] for k, t in ch["blocks"] if k in CHAPTER_BLOCK_KINDS and str(t).strip()]
        else:
            blocks = []
            for para in str(ch.get("text") or "").split("\n\n"):
                if not para.strip():
                    continue
                lines = para.rstrip().split("\n")
                if all(line.startswith("    ") for line in lines if line.strip()):
                    blocks.append(["code", "\n".join(line[4:] for line in lines)])
                else:
                    blocks.append(["p", para.strip()])
        chapters.append({"title": title, "blocks": blocks or [["p", "Content coming soon."]]})
    return chapters


def _validate_level(data, partial=False):
    if not partial or "title" in data:
        if not str(data.get("title") or "").strip():
            return "Enter a level title."
    if "pass_mark" in data:
        try:
            pm = int(data["pass_mark"])
        except (TypeError, ValueError):
            return "Pass mark must be a number."
        if not 0 <= pm <= 100:
            return "Pass mark must be between 0 and 100."
    return None


@bp.post("/courses/<int:course_id>/levels")
@login_required(role="professor")
def create_level(course_id):
    """Create a level with its chapters and (optionally) its test questions in one request."""
    c = _own_course(course_id)
    if not c:
        return _not_found("Course")
    data = request.get_json(silent=True) or {}
    err = _validate_level(data)
    if err:
        return jsonify(error=err), 400
    chapters = _clean_chapters(data.get("chapters"))
    if "chapters" in data and not chapters:
        return jsonify(error="Add at least one chapter so students have something to read."), 400
    number = max((lv.number for lv in c.levels), default=0) + 1
    lv = Level(course_id=c.id, number=number, title=data["title"].strip(), chapters=chapters,
               tip=(data.get("tip") or "").strip() or "Review the chapters before answering.",
               pass_mark=int(data.get("pass_mark", current_app.config["DEFAULT_PASS_MARK"])))
    db.session.add(lv)
    db.session.flush()
    questions = data.get("questions")
    if questions is not None:
        if not questions:
            db.session.rollback()
            return jsonify(error="Add at least one question."), 400
        for i, qd in enumerate(questions, start=1):
            fields, qerr = _question_fields(qd, chapters=len(chapters))
            if qerr:
                db.session.rollback()
                return jsonify(error=f"Question {i}: {qerr}"), 400
            db.session.add(Question(level_id=lv.id, **fields))
    db.session.commit()
    return jsonify(level=dict(lv.to_dict(include_chapters=True), questions=[q.to_dict(True) for q in lv.questions])), 201


@bp.put("/levels/<int:level_id>")
@login_required(role="professor")
def update_level(level_id):
    lv = _own_level(level_id)
    if not lv:
        return _not_found("Level")
    data = request.get_json(silent=True) or {}
    err = _validate_level(data, partial=True)
    if err:
        return jsonify(error=err), 400
    if "title" in data:
        lv.title = data["title"].strip()
    if "tip" in data:
        lv.tip = data["tip"]
    if "chapters" in data:
        lv.chapters = _clean_chapters(data["chapters"])
    if "pass_mark" in data:
        lv.pass_mark = int(data["pass_mark"])
    db.session.commit()
    return jsonify(level=lv.to_dict(include_chapters=True))


@bp.delete("/levels/<int:level_id>")
@login_required(role="professor")
def delete_level(level_id):
    lv = _own_level(level_id)
    if not lv:
        return _not_found("Level")
    course = lv.course
    Attempt.query.filter_by(level_id=lv.id).delete()
    db.session.delete(lv)
    db.session.flush()
    for i, other in enumerate(sorted(course.levels, key=lambda x: x.number), start=1):
        other.number = i  # keep levels numbered 1..n
    if not course.levels:
        course.is_published = False
    db.session.commit()
    return jsonify(ok=True)


# ------------------------------------------------------------------ questions
def _question_fields(data, existing=None, chapters=None):
    merged = {
        "text": existing.text if existing else "", "qtype": existing.qtype if existing else "mcq",
        "options": existing.options if existing else [], "answer": existing.answer if existing else "",
        "explanation": existing.explanation if existing else "", "hints": existing.hints if existing else [],
        "topic": existing.topic if existing else "General", "difficulty": existing.difficulty if existing else 2,
        "chapter": existing.chapter if existing else 0,
    }
    merged.update({k: v for k, v in data.items() if k in merged})
    merged["text"] = str(merged["text"] or "").strip()
    merged["answer"] = str(merged["answer"] or "").strip()
    merged["topic"] = str(merged["topic"] or "").strip() or "General"
    merged["options"] = [str(o).strip() for o in (merged["options"] or [])]
    merged["hints"] = [str(h).strip() for h in (merged["hints"] or []) if str(h).strip()]

    if not merged["text"]:
        return None, "Enter the question text."
    if merged["qtype"] not in ("mcq", "short"):
        return None, "Question type must be 'mcq' or 'short'."
    if merged["qtype"] == "mcq":
        if len(merged["options"]) < 2 or any(not o for o in merged["options"]):
            return None, "Fill in every option."
        if len({o.lower() for o in merged["options"]}) != len(merged["options"]):
            return None, "The options must be different."
        if merged["answer"] not in merged["options"]:
            return None, "The correct answer must be one of the options."
    else:
        merged["options"] = []
        if not merged["answer"]:
            return None, "Enter the accepted answer."
    try:
        merged["difficulty"] = int(merged["difficulty"])
        merged["chapter"] = int(merged["chapter"] or 0)
    except (TypeError, ValueError):
        return None, "Difficulty and chapter must be numbers."
    if merged["difficulty"] not in (1, 2, 3):
        return None, "Difficulty must be 1, 2 or 3."
    if chapters is not None:
        merged["chapter"] = max(0, min(chapters - 1, merged["chapter"]))
    return merged, None


@bp.post("/levels/<int:level_id>/questions")
@login_required(role="professor")
def create_question(level_id):
    lv = _own_level(level_id)
    if not lv:
        return _not_found("Level")
    fields, err = _question_fields(request.get_json(silent=True) or {}, chapters=len(lv.chapters or []) or 1)
    if err:
        return jsonify(error=err), 400
    q = Question(level_id=lv.id, **fields)
    db.session.add(q)
    db.session.commit()
    return jsonify(question=q.to_dict(reveal=True)), 201


@bp.put("/questions/<int:qid>")
@login_required(role="professor")
def update_question(qid):
    q = _own_question(qid)
    if not q:
        return _not_found("Question")
    fields, err = _question_fields(request.get_json(silent=True) or {}, existing=q,
                                   chapters=len(q.level.chapters or []) or 1)
    if err:
        return jsonify(error=err), 400
    for k, v in fields.items():
        setattr(q, k, v)
    db.session.commit()
    return jsonify(question=q.to_dict(reveal=True))


@bp.delete("/questions/<int:qid>")
@login_required(role="professor")
def delete_question(qid):
    q = _own_question(qid)
    if not q:
        return _not_found("Question")
    db.session.delete(q)
    db.session.commit()
    return jsonify(ok=True)


# ------------------------------------------------------------------ analytics
INTENT_NAMES = {"hint": "Hint", "explain": "Explain concept", "chapter": "Which chapter", "trace": "Example / trace",
                "frustrated": "Frustrated", "answer_request": "Asked for answer", "stuck": "Still stuck",
                "greeting": "Greeting", "thanks": "Thanks", "help_usage": "How it works"}


@bp.get("/analytics")
@login_required(role="professor")
def analytics():
    """Learning analytics across all of this professor's published courses."""
    courses = Course.query.filter_by(professor_id=g.user.id, is_published=True).order_by(Course.id).all()
    level_ids = [lv.id for c in courses for lv in c.levels]
    attempts = Attempt.query.filter(Attempt.level_id.in_(level_ids)).all() if level_ids else []
    chats = ChatMessage.query.filter(ChatMessage.level_id.in_(level_ids)).all() if level_ids else []
    questions = {q.id: q for c in courses for lv in c.levels for q in lv.questions}

    tables, learner_ids, at_risk, topic_totals = [], set(), 0, defaultdict(list)
    for c in courses:
        rows = []
        for u in _learners(c):
            learner_ids.add(u.id)
            st = _student_status(u, c)
            at_risk += bool(st.get("at_risk"))
            cells = []
            for lv in c.levels:
                n = Attempt.query.filter_by(user_id=u.id, level_id=lv.id).count()
                cells.append({"best": best_accuracy(u.id, lv.id), "attempts": n, "passed": has_passed(u.id, lv.id)})
            rows.append({"id": u.id, "name": u.name, "student_id": u.student_id or u.email,
                         "sample": bool(u.is_sample), "levels": cells, "status": st})
            for t, p in topic_mastery(u.id, c.id).items():
                topic_totals[t].append(p)
        tables.append({"course": c.to_dict(), "levels": [lv.to_dict() for lv in c.levels], "learners": rows})

    per_q = defaultdict(lambda: [0, 0])
    for a in attempts:
        for d in a.details or []:
            if d["question_id"] in questions:
                per_q[d["question_id"]][0] += int(d["correct"])
                per_q[d["question_id"]][1] += 1
    hardest = sorted(({"question_id": qid, "text": questions[qid].text, "topic": questions[qid].topic,
                       "percent_correct": round(100 * ok / n), "responses": n}
                      for qid, (ok, n) in per_q.items() if n >= 2), key=lambda d: d["percent_correct"])[:5]

    intents = Counter(m.intent for m in chats)
    fb = Feedback.query.order_by(Feedback.created_at.desc()).all()
    return jsonify(
        summary={"learners": len(learner_ids), "attempts": len(attempts),
                 "average_score": round(sum(a.accuracy for a in attempts) / len(attempts)) if attempts else 0,
                 "pass_rate": round(100 * sum(a.passed for a in attempts) / len(attempts)) if attempts else 0,
                 "at_risk": at_risk, "tutor_requests": len(chats)},
        courses=tables,
        hardest_questions=hardest,
        topic_mastery=sorted(({"topic": t, "p_know": round(sum(v) / len(v), 3), "label": label(sum(v) / len(v)),
                               "learners": len(v)} for t, v in topic_totals.items()), key=lambda d: d["p_know"])[:8],
        chat_intents=[{"intent": k, "name": INTENT_NAMES.get(k, k), "count": v} for k, v in intents.most_common()],
        model=adaptive.model_info(),
        sus={"responses": len(fb), "mean": round(sum(f.sus_score for f in fb) / len(fb), 1) if fb else None,
             "comments": [f.comment for f in fb if f.comment][:3]},
    )


@bp.get("/ml")
@login_required(role="professor")
def ml_info():
    return jsonify(adaptive.model_info())


@bp.post("/ml/retrain")
@login_required(role="professor")
def ml_retrain():
    return jsonify(adaptive.train())
