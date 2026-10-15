"""Database models (SQLAlchemy). Works with SQLite for development and PostgreSQL in production."""
from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from extensions import db


def utcnow():
    return datetime.now(timezone.utc)


def iso(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:  # SQLite drops the timezone; values are stored in UTC
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # "student" | "professor"
    student_id = db.Column(db.String(40))  # students only
    department = db.Column(db.String(120))  # professors only
    status = db.Column(db.String(20), default="approved")  # professors start "pending"
    approval_code = db.Column(db.String(6))  # 6-digit code an admin enters to approve
    is_sample = db.Column(db.Boolean, default=False)  # sample pilot learner (demo data)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)

    def set_password(self, password: str):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "email": self.email, "role": self.role,
            "student_id": self.student_id, "department": self.department, "status": self.status,
        }


class Course(db.Model):
    __tablename__ = "courses"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default="")
    category = db.Column(db.String(80), default="General")
    icon = db.Column(db.String(8), default="📘")
    is_published = db.Column(db.Boolean, default=True)
    professor_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)

    professor = db.relationship("User")
    levels = db.relationship(
        "Level", back_populates="course", order_by="Level.number", cascade="all, delete-orphan"
    )
    enrollments = db.relationship("Enrollment", back_populates="course", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "category": self.category,
            "icon": self.icon,
            "is_published": self.is_published,
            "professor": self.professor.name if self.professor else None,
            "level_count": len(self.levels),
            "chapter_count": sum(len(lv.chapters or []) for lv in self.levels),
            "question_count": sum(len(lv.questions) for lv in self.levels),
            "created_at": iso(self.created_at),
        }


class Level(db.Model):
    __tablename__ = "levels"
    __table_args__ = (db.UniqueConstraint("course_id", "number", name="uq_level_number"),)

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False)
    number = db.Column(db.Integer, nullable=False)
    title = db.Column(db.String(200), nullable=False)
    pass_mark = db.Column(db.Integer, default=60)  # minimum accuracy (%) to unlock the next level
    tip = db.Column(db.Text, default="")  # revision tip shown during the test
    # Reading material: [{"title": "...", "blocks": [["p", "text"], ["code", "..."], ["tip", "..."]]}]
    # Block kinds: "h" heading, "p" paragraph, "code" code sample, "tip" / "warn" / "ok" callouts
    chapters = db.Column(db.JSON, default=list)

    course = db.relationship("Course", back_populates="levels")
    questions = db.relationship(
        "Question", back_populates="level", order_by="Question.id", cascade="all, delete-orphan"
    )

    def to_dict(self, include_chapters=False):
        data = {
            "id": self.id,
            "course_id": self.course_id,
            "number": self.number,
            "title": self.title,
            "pass_mark": self.pass_mark,
            "tip": self.tip,
            "chapter_count": len(self.chapters or []),
            "chapter_titles": [c.get("title", "") for c in (self.chapters or [])],
            "question_count": len(self.questions),
        }
        if include_chapters:
            data["chapters"] = self.chapters or []
        return data


class Question(db.Model):
    __tablename__ = "questions"

    id = db.Column(db.Integer, primary_key=True)
    level_id = db.Column(db.Integer, db.ForeignKey("levels.id"), nullable=False)
    text = db.Column(db.Text, nullable=False)
    qtype = db.Column(db.String(10), nullable=False, default="mcq")  # "mcq" | "short"
    options = db.Column(db.JSON, default=list)  # MCQ choices
    # MCQ: the exact correct option. Short answer: accepted answers separated by "|"
    answer = db.Column(db.String(500), nullable=False)
    explanation = db.Column(db.Text, default="")  # the concept, used for feedback and the chatbot
    hints = db.Column(db.JSON, default=list)  # ordered hints, gentlest first
    topic = db.Column(db.String(120), default="General")
    difficulty = db.Column(db.Integer, default=1)  # 1 easy, 2 medium, 3 hard
    chapter = db.Column(db.Integer, default=0)  # index of the chapter that teaches this

    level = db.relationship("Level", back_populates="questions")

    def to_dict(self, reveal=False):
        data = {
            "id": self.id,
            "level_id": self.level_id,
            "text": self.text,
            "qtype": self.qtype,
            "options": self.options or [],
            "topic": self.topic,
            "difficulty": self.difficulty,
            "chapter": self.chapter or 0,
        }
        if reveal:
            data.update(answer=self.answer, explanation=self.explanation, hints=self.hints or [])
        return data


class Enrollment(db.Model):
    __tablename__ = "enrollments"
    __table_args__ = (db.UniqueConstraint("user_id", "course_id", name="uq_enrollment"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False)
    enrolled_at = db.Column(db.DateTime(timezone=True), default=utcnow)

    user = db.relationship("User")
    course = db.relationship("Course", back_populates="enrollments")


class Attempt(db.Model):
    __tablename__ = "attempts"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    level_id = db.Column(db.Integer, db.ForeignKey("levels.id", ondelete="CASCADE"), nullable=False)
    correct = db.Column(db.Integer, nullable=False)
    total = db.Column(db.Integer, nullable=False)
    accuracy = db.Column(db.Float, nullable=False)
    passed = db.Column(db.Boolean, nullable=False)
    time_taken_sec = db.Column(db.Integer, default=0)
    hints_used = db.Column(db.Integer, default=0)
    details = db.Column(db.JSON, default=list)  # [{question_id, given, correct}]
    features = db.Column(db.JSON, default=dict)  # ML features captured before the attempt
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)

    user = db.relationship("User")
    level = db.relationship("Level")

    def to_dict(self):
        lv = self.level
        return {
            "id": self.id,
            "level_id": self.level_id,
            "level_title": lv.title if lv else None,
            "level_number": lv.number if lv else None,
            "course_id": lv.course_id if lv else None,
            "course_title": lv.course.title if lv else None,
            "course_icon": lv.course.icon if lv else None,
            "correct": self.correct,
            "total": self.total,
            "accuracy": self.accuracy,
            "passed": self.passed,
            "time_taken_sec": self.time_taken_sec,
            "hints_used": self.hints_used,
            "created_at": iso(self.created_at),
        }


class Mastery(db.Model):
    """Bayesian Knowledge Tracing state: probability the learner knows a topic."""

    __tablename__ = "mastery"
    __table_args__ = (db.UniqueConstraint("user_id", "course_id", "topic", name="uq_mastery"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    topic = db.Column(db.String(120), nullable=False)
    p_know = db.Column(db.Float, nullable=False)
    observations = db.Column(db.Integer, default=0)
    updated_at = db.Column(db.DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ChatMessage(db.Model):
    __tablename__ = "chat_messages"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    level_id = db.Column(db.Integer, db.ForeignKey("levels.id", ondelete="SET NULL"), nullable=True)
    question_id = db.Column(db.Integer, db.ForeignKey("questions.id", ondelete="SET NULL"), nullable=True)
    message = db.Column(db.Text, nullable=False)
    reply = db.Column(db.Text, nullable=False)
    intent = db.Column(db.String(40))
    hint_level = db.Column(db.Integer, default=0)  # 0 = not a hint
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)


class Feedback(db.Model):
    """System Usability Scale (SUS) responses collected during the pilot evaluation."""

    __tablename__ = "feedback"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    responses = db.Column(db.JSON, nullable=False)  # ten answers, each 1-5
    sus_score = db.Column(db.Float, nullable=False)
    comment = db.Column(db.Text, default="")
    created_at = db.Column(db.DateTime(timezone=True), default=utcnow)
