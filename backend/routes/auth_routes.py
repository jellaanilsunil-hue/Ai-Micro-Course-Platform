"""Registration, login and professor approval."""
import re
import secrets

from flask import Blueprint, current_app, g, jsonify, request

from auth import create_token, login_required
from extensions import db
from models import User

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD = 6


@bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = data.get("role", "student")

    if role not in ("student", "professor"):
        return jsonify(error="Role must be student or professor."), 400
    if len(name) < 2:
        return jsonify(error="Enter your full name."), 400
    if not EMAIL_RE.match(email):
        return jsonify(error="Enter a valid email address."), 400
    if len(password) < MIN_PASSWORD:
        return jsonify(error=f"Password must be at least {MIN_PASSWORD} characters."), 400
    if User.query.filter_by(email=email).first():
        return jsonify(error="An account with this email already exists."), 409

    user = User(name=name, email=email, role=role)
    user.set_password(password)
    if role == "student":
        user.student_id = (data.get("student_id") or "").strip() or None
        user.status = "approved"
    else:
        department = (data.get("department") or "").strip()
        if not department:
            return jsonify(error="Enter your department."), 400
        user.department = department
        user.status = "pending"
        user.approval_code = f"{secrets.randbelow(900000) + 100000}"
    db.session.add(user)
    db.session.commit()

    if role == "professor":
        body = {"pending": True, "user": user.to_dict(),
                "message": "Professor account created. It can sign in once an administrator approves it."}
        if current_app.config["SHOW_APPROVAL_CODE"]:
            body["approval_code"] = user.approval_code  # prototype only: stands in for an email to the admin
        return jsonify(body), 201
    return jsonify(token=create_token(user), user=user.to_dict()), 201


@bp.post("/approve")
def approve_professor():
    """Administrator approves a pending professor with the 6-digit code from registration."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    code = (data.get("code") or "").strip()
    if not email or not re.fullmatch(r"\d{6}", code):
        return jsonify(error="Enter the professor's email and the 6-digit code."), 400
    prof = User.query.filter_by(email=email, role="professor").first()
    if prof is None:
        return jsonify(error="No professor account uses that email."), 404
    if prof.status == "approved":
        return jsonify(message="This professor is already approved.", user=prof.to_dict())
    if not secrets.compare_digest(prof.approval_code or "", code):
        return jsonify(error="That code doesn't match. Check the code shown at registration."), 400
    prof.status = "approved"
    prof.approval_code = None
    db.session.commit()
    return jsonify(message=f"{prof.name} is approved and can now sign in.", user=prof.to_dict())


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    user = User.query.filter_by(email=email).first()
    if user is None or not user.check_password(data.get("password") or ""):
        return jsonify(error="Incorrect email or password."), 401
    portal = data.get("role")
    if portal and portal != user.role:
        label = "Student" if user.role == "student" else "Professor"
        return jsonify(error=f"This is a {user.role} account — switch the role above to \"{label}\"."), 403
    if user.role == "professor" and user.status != "approved":
        return jsonify(error="Your account is waiting for administrator approval.", pending=True), 403
    return jsonify(token=create_token(user), user=user.to_dict())


@bp.get("/me")
@login_required()
def me():
    return jsonify(user=g.user.to_dict())
