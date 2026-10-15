"""JWT authentication and role-based access control."""
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import current_app, g, jsonify, request

from extensions import db
from models import User


def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=current_app.config["JWT_EXPIRY_HOURS"]),
    }
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm="HS256")


def login_required(role=None):
    """Protect a route. `role` restricts it to "student" or "professor"."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            header = request.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                return jsonify(error="Please log in first."), 401
            try:
                payload = jwt.decode(header[7:], current_app.config["SECRET_KEY"], algorithms=["HS256"])
            except jwt.ExpiredSignatureError:
                return jsonify(error="Your session has expired. Please log in again."), 401
            except jwt.InvalidTokenError:
                return jsonify(error="Invalid session. Please log in again."), 401

            user = db.session.get(User, int(payload["sub"]))
            if user is None:
                return jsonify(error="Account not found."), 401
            if user.role == "professor" and user.status != "approved":
                return jsonify(error="Your account is waiting for administrator approval."), 403
            if role and user.role != role:
                return jsonify(error=f"Only {role}s can do this."), 403
            g.user = user
            return fn(*args, **kwargs)

        return wrapper

    return decorator
