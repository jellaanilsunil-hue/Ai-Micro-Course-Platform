"""Application configuration. Every value can be overridden with an environment variable."""
import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "sqlite:///" + os.path.join(BASE_DIR, "microcourses.db"))
    # Some hosts (Heroku, older AWS templates) still hand out "postgres://"
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    # Pin the psycopg2 driver: SQLAlchemy 2.1+ otherwise defaults to psycopg (v3),
    # which is not installed, and the app crashes on start-up.
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return url


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me-in-production")
    SQLALCHEMY_DATABASE_URI = _database_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_SORT_KEYS = False

    JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "12"))

    # New professor accounts start as "pending" and receive a 6-digit code that
    # an administrator enters to approve them, so students cannot give
    # themselves authoring rights. In production the code would be emailed to
    # the administrator; for the prototype it is returned to the browser and
    # shown on screen (set SHOW_APPROVAL_CODE=0 to stop that).
    SHOW_APPROVAL_CODE = os.getenv("SHOW_APPROVAL_CODE", "1") == "1"

    CORS_ORIGINS = [o.strip().rstrip("/") for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

    # Minimum percentage needed to pass a level when the professor sets none
    DEFAULT_PASS_MARK = int(os.getenv("DEFAULT_PASS_MARK", "60"))

    # Load the demo courses/accounts when the database is empty
    SEED_DEMO_DATA = os.getenv("SEED_DEMO_DATA", "1") == "1"
    # Also create five sample pilot learners so the analytics are not empty
    SEED_SAMPLE_LEARNERS = os.getenv("SEED_SAMPLE_LEARNERS", "1") == "1"

    # Optional: name of a Hugging Face extractive QA model, e.g.
    # "distilbert-base-cased-distilled-squad". Leave empty to use the built-in
    # TF-IDF retrieval only (no large downloads needed).
    HF_QA_MODEL = os.getenv("HF_QA_MODEL", "")

    FRONTEND_DIST = os.getenv("FRONTEND_DIST", os.path.join(BASE_DIR, "..", "frontend", "dist"))


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite://"
    SEED_DEMO_DATA = False
    SECRET_KEY = "test-secret-key-that-is-long-enough-for-hs256"
