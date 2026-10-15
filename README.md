# EduAI Micro-Courses — AI-Powered Adaptive Tutoring Platform

A functional prototype for the University of Chester AI-Powered Micro-Courses project, covering programming, algorithmic thinking, AI Leadership and the Micro MBA.

**Students:**
- read short chapters level by level
- take a test at the end of each level
- unlock the next level only when they reach the pass mark
- get graded hints from an NLP tutor chatbot when they are stuck

**Machine-learning models:**
- track each student's mastery of every topic
- predict their chance of passing the next test

**Professors:**
- have their own login, approved by an administrator
- are the only users who can create courses, chapters and tests
- see learning analytics for their courses

| Layer | Technology |
|---|---|
| Frontend | React 18 + React Router, built with Vite (Node.js) |
| Backend API | Python 3.10+, Flask, Flask-SQLAlchemy, JWT authentication (PyJWT) |
| Machine learning | scikit-learn: logistic-regression readiness model, plus Bayesian Knowledge Tracing |
| NLP | scikit-learn TF-IDF intent classifier, graded hint ladder, hybrid TF-IDF retrieval; optional Hugging Face QA model |
| Database | SQLite for local development, PostgreSQL in production (same code) |

---

## Development version

This is the **development (pre-deployment) version** of the project: source code only. It has no Docker files, no production server and no pre-built website. You run the backend and frontend separately on your own computer while you develop and test.

## What is in this folder

```
ai-micro-courses/
├── backend/            Python Flask API: auth, courses, chapters, tests, ML, NLP chatbot, analytics, pytest tests
│   ├── app.py          starts the development server (http://localhost:5000)
│   ├── seed_courses.json   course content (4 courses, 9 levels, 27 chapters, 45 questions)
│   └── .env.example    settings you can override
├── frontend/           React app (Vite / Node.js): student and professor portals
│   └── src/            pages/, components/, api.js, auth.jsx, styles.css
├── docs/USER_GUIDE.md  step-by-step walkthrough of every feature
└── README.md           this file
```

---

## 1. Run it locally

**Easiest (Windows):** double-click `1_setup_windows.bat` once, then `2_start_windows.bat` whenever you want to run the project. The website opens at http://localhost:5173.
**macOS:** `bash 1_setup_mac.sh` once, then `bash 2_start_mac.sh`.

**Manually (two terminals):**

You need **Python 3.10+** and **Node.js 18+**.

**Terminal 1 — backend (Flask API):**

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate      macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

The API runs at http://localhost:5000. On first start it creates `microcourses.db`, then loads the courses, the demo accounts and five sample pilot learners.

**Terminal 2 — frontend (React):**

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Vite forwards every `/api` request to Flask on port 5000, and saved changes to the React code reload in the browser straight away.

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Student | alice@chester.ac.uk | Student123! |
| Professor | prof.chen@chester.ac.uk | Prof123! |
| Professor | prof.taylor@chester.ac.uk | Prof123! |

The sample learners (bob@, chloe@, dev@, ewa@ and farah@chester.ac.uk) also use Student123!.

### Run the tests

```bash
cd backend
pytest
```

All 9 tests should pass.

### Reset the data

Stop the backend, delete `backend/microcourses.db` and start it again.

---

## 2. What the system does

### Accounts
- **Sign-in page:** a Student/Professor switch, demo-account buttons and a help chatbot.
- **Registration:** includes a password strength meter. Students are active straight away and can add a student ID.
- **Professor approval:** professors give their department and start as **pending**. They receive a 6-digit code, and an administrator enters it under **Admin: approve a professor account** to activate them. Until then, sign-in is refused. In production the code would be emailed to the administrator; the prototype shows it on screen (`SHOW_APPROVAL_CODE`).
- **Security:** passwords are hashed (Werkzeug PBKDF2). Every request carries a signed JWT that expires after 12 hours, and roles are checked on the server for every route.

### Student portal
- **Dashboard:** stats, the four courses with progress, and an **AI learning path**. For each course in progress it recommends the next step, such as "re-read Chapter 2 — your weakest topic is Loops" or "you're ready for the Level 2 test", with the predicted chance of passing.
- **Course page:** levels with Passed, Attempted or Locked status, best score and an AI readiness badge. Opening a course enrols the student.
- **Chapter reader:** chapter tabs, worked code examples with syntax highlighting, and tip and warning callouts. After the last chapter the student sees their readiness and a **Start level test** button.
- **Level test:**
  - one question at a time, with question-number dots, a progress bar and a revision tip
  - topic and difficulty badges
  - a **Hint** button
  - an **AI Tutor** chat panel with quick-reply chips
  - a warning before submitting with unanswered questions
- **Results:**
  - Score, correct/total, pass mark and hints used.
  - **Pass:** the next level unlocks, and the correct answers and explanations are shown.
  - **Fail:** the student sees which answers were wrong and the concept behind each, but not the correct answers, so the retake still tests understanding. The result links to the chapters that cover the missed questions.
  - Both cases show the AI readiness for the next attempt and updated topic mastery.
- **My progress:** a profile header, per-course level tiles, topic mastery bars and full test history.
- **Certificate:** issued when every level of a course is passed.
- **Feedback:** the 10-item System Usability Scale for the pilot evaluation.

### Professor portal
- **Portal:** stats, an alert listing learners predicted to be at risk, and the professor's courses with **Publish/Unpublish**. A course can't be published without at least one level.
- **New course:** title, category, description and an icon.
- **Manage course:**
  - add a level with a title, pass mark, revision tip, chapters and test questions in one form
  - chapter text is plain paragraphs; indent a paragraph by 4 spaces to show it as code
  - each question has four options, the correct answer, its chapter, a topic, a tutor hint and a concept explanation
  - view or delete levels
- **Analytics** (across the professor's published courses):
  - learners, attempts, average score, pass rate, at-risk count and tutor requests
  - a learner × level table with best scores, attempt counts and AI readiness
  - the hardest questions and class topic mastery
  - what learners ask the tutor (NLP intents)
  - the readiness model's accuracy, AUC and feature weights, with **Retrain now**
  - SUS results

---

## 3. AI components (for the dissertation)

### 3.1 ML — learner modelling and adaptivity (`backend/ml/`)

**Bayesian Knowledge Tracing** (`knowledge_tracing.py`, Corbett & Anderson 1994) keeps a probability `p_know` for every (student, course, topic). It starts at 0.30. Every answer in a test or practice updates it with Bayes' rule, using:
- slip = 0.10
- guess = 0.25 for multiple choice, 0.05 for short answer
- learning rate = 0.15

Mastery of 0.8 or more counts as "mastered" and under 0.5 as "needs work". The estimates drive:
- the mastery bars
- the dashboard learning path (the weakest topic and its chapter)
- class topic mastery in the analytics
- one feature of the readiness model

**Readiness model** (`adaptive.py`): a scikit-learn pipeline (StandardScaler → LogisticRegression) predicts the probability that a learner passes a level. It uses six features, all captured *before* each attempt:

| Feature | Meaning |
|---|---|
| prior_accuracy | mean accuracy on earlier tests in the course |
| topic_mastery | mean BKT `p_know` over the level's topics |
| hints_per_q | tutor hints used per question so far |
| secs_per_q | time spent per question so far |
| attempt_no | which attempt at this level this is |
| difficulty | mean difficulty of the level's questions |

- **Cold start:** a new platform has no history, so the model is bootstrapped with 800 synthetic learners from a documented generative model. Real attempts are added automatically and weighted 3 times; use **Retrain now**.
- **Evaluation:** 25% hold-out accuracy and ROC-AUC. Once there are at least 10 real attempts, accuracy and AUC on real attempts are reported too.
- **Outputs:** the probability, a band (ready, almost or review) and advice for students; at-risk flags (under 40% after an attempt) and feature weights for professors.

### 3.2 NLP — tutor chatbot (`backend/nlp/tutor_bot.py`)

1. **Intent classification.** High-precision regular-expression rules run first. Otherwise, word (1–2 gram) and character (3–5 gram) TF-IDF features feed a logistic regression trained on labelled example phrases. There are 10 intents: greeting, hint, answer_request, explain, chapter, trace, frustrated, stuck, thanks and help_usage.
2. **Hint ladder.** Each request moves one step through the ladder for that question. The ladder restarts after each test attempt.
   1. The professor's hints, gentlest first.
   2. The chapter to re-read.
   3. Two wrong options eliminated (multiple choice), or the answer's length and first letter (short answer).
   4. The concept explanation with the answer masked as `____`.
   5. A related passage from the course.

   Requests for the answer, "I'm stuck" and "I give up" all get the next step with an encouraging lead-in. The answer is never revealed.
3. **Chapter and example.** "Which chapter covers this?" names the chapter. "Show me an example" returns that chapter's worked code, with the answer masked.
4. **Explanations.** Hybrid retrieval combines word TF-IDF, character n-gram TF-IDF (so "dict" matches "Dictionaries") and a title bonus. It searches every chapter of the course plus a 31-concept knowledge base (`knowledge_base.json`). Below a similarity threshold the tutor says it has no material, rather than guessing.
5. **Logging.** Every message is stored with its intent and hint level. This feeds the analytics and the "hints per question" feature.
6. **Optional Hugging Face.** Set `HF_QA_MODEL=distilbert-base-cased-distilled-squad` and install `transformers` and `torch`. An extractive QA model then adds a one-line summary on top of retrieval.

**Why retrieval and not a generative model:** it cannot invent facts or leak answers, needs no paid API, keeps student data local, and its behaviour can be tested automatically.

---

## 4. Architecture

```
React SPA (Vite)  ──HTTPS/JSON + JWT──►  Flask API
  pages/Login, Register, Feedback          routes/auth_routes.py   register · approve · login · me
  pages/student/*                          routes/student.py       dashboard · courses · chapters · tests · practice ·
  pages/professor/*                                                progress · certificate · chat · feedback
  components/TutorChat, HelpChat, ui       routes/professor.py     overview · courses · levels · questions · analytics · ML
                                           services.py             unlocking · marking · learning path
                                           ml/  knowledge_tracing.py · adaptive.py
                                           nlp/ tutor_bot.py · knowledge_base.json
                                                │ SQLAlchemy
                                           SQLite (dev) / PostgreSQL (prod)
```

**Data model:**
- **User:** role, student ID or department, approval status and code
- **Course:** icon, published flag
- **Level:** number, pass mark, revision tip, chapters (JSON)
- **Question:** multiple choice or short answer, options, answer, explanation, hints, topic, difficulty, chapter
- **Enrollment**
- **Attempt:** accuracy, pass/fail, per-question details, ML features
- **Mastery:** BKT state
- **ChatMessage:** intent, hint level
- **Feedback:** SUS responses

Course content is in `backend/seed_courses.json`, so it can be edited without touching code.

### Main API endpoints

| Method | Path | Who |
|---|---|---|
| POST | /api/auth/register, /api/auth/login, /api/auth/approve | anyone |
| GET | /api/dashboard, /api/progress | student |
| GET | /api/courses, /api/courses/:id | signed in |
| POST | /api/courses/:id/enroll | student |
| GET | /api/levels/:id (chapters), /api/levels/:id/test | student, unlocked levels only |
| POST | /api/levels/:id/submit | student |
| GET | /api/courses/:id/certificate | student, course completed |
| GET/POST | /api/courses/:id/practice, /api/practice/check | student |
| POST | /api/chat `{message, question_id?, level_id?}` | signed in |
| POST | /api/feedback | signed in |
| GET | /api/professor/overview, /api/professor/analytics | professor |
| POST/GET/PUT/DELETE | /api/professor/courses[/:id], /api/professor/courses/:id/levels, /api/professor/levels/:id, /api/professor/levels/:id/questions, /api/professor/questions/:id | professor, own courses only |
| GET/POST | /api/professor/ml, /api/professor/ml/retrain | professor |

---

## 5. Configuration

All settings are environment variables (see `backend/.env.example`).

| Variable | Default | Purpose |
|---|---|---|
| `SECRET_KEY` | dev value | JWT signing key — **change in production** |
| `DATABASE_URL` | local SQLite | e.g. `postgresql://user:pass@host:5432/db` |
| `SHOW_APPROVAL_CODE` | 1 | show the professor approval code on screen (prototype) |
| `DEFAULT_PASS_MARK` | 60 | default level pass mark (%) |
| `SEED_DEMO_DATA` | 1 | load courses and demo accounts into an empty database |
| `SEED_SAMPLE_LEARNERS` | 1 | also create five sample pilot learners |
| `HF_QA_MODEL` | (empty) | optional Hugging Face QA model |
| `CORS_ORIGINS` | localhost:5173 | allowed frontend origins |

To reset everything, stop the server, delete `backend/microcourses.db` and start it again.

---

## 6. Deploying later

Deployment is not part of this version. When you are ready to deploy:
1. Build the frontend with `npm run build`; Flask serves `frontend/dist` automatically.
2. Run Flask behind a production server such as gunicorn.
3. Use PostgreSQL via `DATABASE_URL` and set a strong `SECRET_KEY`.
4. Set `SHOW_APPROVAL_CODE=0` and email approval codes instead.

## 7. Suggested evaluation plan (objective 7)

1. Recruit Micro MBA or AI Leadership students, give each an account, and ask them to complete two levels.
2. Collect SUS scores on the Feedback page. A score of 68 or more is above average.
3. From the analytics, record:
   - pass rate and accuracy by level
   - hints per question, and outcomes with versus without hints
   - the tutor intent mix
   - the readiness model's AUC on real attempts after retraining
4. Hold short interviews about how useful the hints and the learning path were.
5. Report limitations:
   - a small sample
   - a synthetic cold-start prior
   - a retrieval-based (not generative) chatbot, chosen so it cannot invent facts or leak answers

## 8. Ideas for extension

- An in-browser code runner for programming questions (e.g. Pyodide).
- A generative LLM tutor behind the same hint-ladder guard rails.
- Item response theory to calibrate question difficulty.
- Email delivery of approval codes and an at-risk digest for professors.
- An accessibility audit with screen-reader users.
