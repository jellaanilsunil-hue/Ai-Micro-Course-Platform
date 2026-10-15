"""API tests. Run from the backend folder with:  pytest"""
import pytest

from app import create_app
from config import TestConfig
from extensions import db
from seed import seed

STUDENT = ("alice@chester.ac.uk", "Student123!")
PROF = ("prof.chen@chester.ac.uk", "Prof123!")


@pytest.fixture()
def app():
    app = create_app(TestConfig)
    with app.app_context():
        seed(samples=False)
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def login(client, email, password, role=None):
    r = client.post("/api/auth/login", json={"email": email, "password": password, "role": role})
    assert r.status_code == 200, r.json
    return {"Authorization": f"Bearer {r.json['token']}"}


@pytest.fixture()
def student(client):
    return login(client, *STUDENT, role="student")


@pytest.fixture()
def prof(client):
    return login(client, *PROF, role="professor")


def python_course(client, headers):
    return next(c for c in client.get("/api/courses", headers=headers).json["courses"] if c["title"] == "Python Programming")


def answers_for(client, prof, course_id, level_index, correct=True):
    level = client.get(f"/api/professor/courses/{course_id}", headers=prof).json["course"]["levels"][level_index]
    return {str(q["id"]): (q["answer"] if correct else next(o for o in q["options"] if o != q["answer"]))
            for q in level["questions"]}


# ---------------------------------------------------------------- accounts
def test_student_registration_and_login(client):
    r = client.post("/api/auth/register", json={"name": "Sam Lee", "email": "sam@x.com", "password": "abc123"})
    assert r.status_code == 201 and r.json["user"]["role"] == "student" and r.json["token"]
    assert client.post("/api/auth/login", json={"email": "sam@x.com", "password": "abc123", "role": "student"}).status_code == 200
    # wrong portal
    assert client.post("/api/auth/login", json={"email": "sam@x.com", "password": "abc123", "role": "professor"}).status_code == 403
    # duplicate and short password
    assert client.post("/api/auth/register", json={"name": "Sam", "email": "sam@x.com", "password": "abc123"}).status_code == 409
    assert client.post("/api/auth/register", json={"name": "Sam", "email": "s2@x.com", "password": "abc"}).status_code == 400


def test_professor_needs_admin_approval(client):
    body = {"name": "Dr New", "email": "new@x.com", "password": "teach1", "role": "professor", "department": "CS"}
    r = client.post("/api/auth/register", json=body)
    assert r.status_code == 201 and r.json["pending"] and len(r.json["approval_code"]) == 6
    code = r.json["approval_code"]
    assert client.post("/api/auth/login", json={"email": "new@x.com", "password": "teach1"}).status_code == 403
    wrong = "000000" if code != "000000" else "111111"
    assert client.post("/api/auth/approve", json={"email": "new@x.com", "code": wrong}).status_code == 400
    assert client.post("/api/auth/approve", json={"email": "new@x.com", "code": code}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "new@x.com", "password": "teach1", "role": "professor"}).status_code == 200


def test_requires_token(client):
    assert client.get("/api/courses").status_code == 401


# ---------------------------------------------------------------- roles & authoring
def test_only_professor_can_author(client, student, prof):
    assert client.post("/api/professor/courses", json={"title": "X", "category": "Y"}, headers=student).status_code == 403
    r = client.post("/api/professor/courses", json={"title": "Data Analysis", "category": "Programming", "icon": "📈"}, headers=prof)
    assert r.status_code == 201 and r.json["course"]["is_published"] is False
    cid = r.json["course"]["id"]
    # cannot publish an empty course
    assert client.put(f"/api/professor/courses/{cid}", json={"is_published": True}, headers=prof).status_code == 400
    level = {"title": "CSV files", "pass_mark": 60, "tip": "Chapter 1",
             "chapters": [{"title": "Reading files", "text": "CSV stores tables.\n\n    import csv"}],
             "questions": [{"text": "Which module reads CSV?", "options": ["csv", "json", "math", "os"],
                            "answer": "csv", "topic": "Files", "hints": ["Same name as the format"], "chapter": 0}]}
    bad = dict(level, questions=[dict(level["questions"][0], answer="xml")])
    assert client.post(f"/api/professor/courses/{cid}/levels", json=bad, headers=prof).status_code == 400
    r = client.post(f"/api/professor/courses/{cid}/levels", json=level, headers=prof)
    assert r.status_code == 201
    assert r.json["level"]["chapters"][0]["blocks"][1] == ["code", "import csv"]
    assert client.put(f"/api/professor/courses/{cid}", json={"is_published": True}, headers=prof).status_code == 200
    assert any(c["id"] == cid for c in client.get("/api/courses", headers=student).json["courses"])


# ---------------------------------------------------------------- learning flow
def test_level_gating_pass_fail_and_certificate(client, student, prof):
    c = python_course(client, student)
    cid = c["id"]
    client.post(f"/api/courses/{cid}/enroll", headers=student)
    levels = client.get(f"/api/courses/{cid}", headers=student).json["course"]["levels"]
    assert [lv["status"] for lv in levels] == ["unlocked", "locked", "locked"]
    l1, l2 = levels[0]["id"], levels[1]["id"]
    assert client.get(f"/api/levels/{l2}/test", headers=student).status_code == 403

    chapters = client.get(f"/api/levels/{l1}", headers=student).json["level"]["chapters"]
    assert len(chapters) == 3 and chapters[0]["blocks"]
    test = client.get(f"/api/levels/{l1}/test", headers=student).json
    assert all("answer" not in q for q in test["questions"]) and test["level"]["tip"]

    r = client.post(f"/api/levels/{l1}/submit", json={"answers": answers_for(client, prof, cid, 0, False)}, headers=student).json
    assert r["passed"] is False and r["accuracy"] == 0
    assert all("correct_answer" not in f for f in r["feedback"]) and r["weak_chapters"]
    assert client.get(f"/api/levels/{l2}/test", headers=student).status_code == 403

    r = client.post(f"/api/levels/{l1}/submit", json={"answers": answers_for(client, prof, cid, 0)}, headers=student).json
    assert r["passed"] is True and r["next_level"]["id"] == l2
    assert client.get(f"/api/levels/{l2}/test", headers=student).status_code == 200
    assert client.get(f"/api/courses/{cid}/certificate", headers=student).status_code == 403

    for i, lv in enumerate(levels[1:], start=1):
        client.post(f"/api/levels/{lv['id']}/submit", json={"answers": answers_for(client, prof, cid, i)}, headers=student)
    cert = client.get(f"/api/courses/{cid}/certificate", headers=student).json
    assert cert["name"] == "Alice Johnson" and cert["average"] == 100

    dash = client.get("/api/dashboard", headers=student).json
    assert dash["stats"]["levels_passed"] == 3
    prog = client.get("/api/progress", headers=student).json
    assert prog["stats"]["tests_taken"] == 4
    stats = client.get("/api/professor/analytics", headers=prof).json
    assert stats["summary"]["attempts"] == 4 and stats["summary"]["learners"] == 1


# ---------------------------------------------------------------- chatbot
def test_chatbot_hint_ladder_never_reveals_answer(client, student, prof):
    cid = python_course(client, student)["id"]
    client.post(f"/api/courses/{cid}/enroll", headers=student)
    q = client.get(f"/api/professor/courses/{cid}", headers=prof).json["course"]["levels"][0]["questions"][0]
    seen = []
    for msg in ["give me a hint", "another hint", "just tell me the answer", "still stuck", "i give up", "hint", "hint"]:
        r = client.post("/api/chat", json={"message": msg, "question_id": q["id"]}, headers=student).json
        seen.append(r["hint_level"])
        assert q["answer"] not in r["reply"].replace("____", "")
    assert seen[:4] == [1, 2, 3, 4]


def test_chatbot_intents(client, student):
    cid = python_course(client, student)["id"]
    client.post(f"/api/courses/{cid}/enroll", headers=student)
    expect = {"hello": "greeting", "what is binary search": "explain", "this is too hard": "frustrated",
              "which chapter covers this?": "chapter", "show me an example": "trace", "thanks!": "thanks"}
    for msg, intent in expect.items():
        assert client.post("/api/chat", json={"message": msg}, headers=student).json["intent"] == intent, msg
    r = client.post("/api/chat", json={"message": "what is binary search"}, headers=student).json
    assert "sorted" in r["reply"].lower()


# ---------------------------------------------------------------- ML + SUS
def test_ml_model_and_knowledge_tracing(client, prof):
    from ml.knowledge_tracing import bkt_update
    assert bkt_update(0.3, True) > 0.3 > bkt_update(0.3, False)
    info = client.post("/api/professor/ml/retrain", headers=prof).json
    assert info["metrics"]["holdout_auc"] > 0.7 and len(info["feature_importance"]) == 6


def test_sus_feedback(client, student, prof):
    r = client.post("/api/feedback", json={"responses": [5, 1, 5, 1, 5, 1, 5, 1, 5, 1]}, headers=student)
    assert r.json["sus_score"] == 100.0
    assert client.post("/api/feedback", json={"responses": [3]}, headers=student).status_code == 400
    assert client.get("/api/professor/analytics", headers=prof).json["sus"]["mean"] == 100.0
