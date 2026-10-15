# Deploying the backend (Render + PostgreSQL)

Changes made for production:
- `requirements.txt`: added `gunicorn` (production server) and `psycopg2-binary` (PostgreSQL driver)
- `config.py`: database URL pinned to the psycopg2 driver (SQLAlchemy 2.1 otherwise crashes on start-up); CORS origins trimmed of spaces / trailing slashes
- `backend/.python-version`: Python 3.12
- `render.yaml`: one-click Render Blueprint (web service + free PostgreSQL)

Start command (one worker on purpose, because the ML model and tutor bot are held in memory):

    gunicorn --preload --workers 1 --threads 4 --timeout 120 --bind 0.0.0.0:$PORT "app:create_app()"

Environment variables:

| Name | Value |
|---|---|
| DATABASE_URL | PostgreSQL connection string (Render fills this in) |
| SECRET_KEY | long random string, 32+ characters (Render generates it) |
| CORS_ORIGINS | your frontend URL, e.g. https://eduai.vercel.app (separate several with commas) |
| SHOW_APPROVAL_CODE | 1 for the prototype/pilot, 0 for real production |
| SEED_DEMO_DATA / SEED_SAMPLE_LEARNERS | 1 to load demo courses + sample learners into an empty database |

Check it works: https://<your-service>.onrender.com/api/health  ->  {"status":"ok"}
