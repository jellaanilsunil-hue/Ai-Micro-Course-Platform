# User Guide — EduAI Micro-Courses

This guide walks through every feature in order, so a marker or pilot tester can check that each objective in the scoping document is met. Everything below happens at http://localhost:5173 after starting the backend and frontend (see section 1).

## 1. Start the system

1. **Terminal 1:** `cd backend` → `pip install -r requirements.txt` → `python app.py`
2. **Terminal 2:** `cd frontend` → `npm install` → `npm run dev`
3. Open http://localhost:5173

| Role | Email | Password |
|---|---|---|
| Student | alice@chester.ac.uk | Student123! |
| Professor | prof.chen@chester.ac.uk | Prof123! |

## 2. Student journey

1. **Sign in.** Leave the switch on **Student**, press **Student demo**, then **Sign in**. To make a new account, press **Register**; student accounts work immediately.
2. **Dashboard.** You see your stats, the **AI learning path** (the next step for each course, with a predicted chance of passing) and the four micro-courses.
3. **Open a course.** Click **Python Programming**. Level 1 is open and Levels 2–3 show 🔒 until the previous level is passed.
4. **Read chapters.** Press **📖 Read chapters**, move through the chapter tabs, then press **Start level test** after the last chapter, under your AI readiness score.
5. **Take the test.** Answer one question at a time.
   - **💡 Hint** shows the next hint for that question.
   - **🤖 AI Tutor** opens the chatbot. Try the chips (*Give me a hint*, *Show me an example*, *Which chapter covers this?*, *I'm completely lost*) or type a question.
   - Hints get more specific each time, but the tutor never gives the answer. Asking "just tell me the answer" makes it decline and give the next step.
6. **Results.**
   - **Pass** (score ≥ pass mark): the next level unlocks, and the correct answers and explanations are shown.
   - **Fail:** you see which answers were wrong and the concept behind each, but not the correct answers. You also get links to the chapters to re-read, your readiness for a retake and updated topic mastery.
7. **My progress.** This page shows level tiles per course, topic mastery bars and your test history.
8. **Certificate.** It appears on the course page and on My progress once every level of the course is passed.
9. **Feedback.** Answer the 10-question System Usability Scale. Your score from 0 to 100 is calculated straight away.

## 3. Professor journey

1. **Register as a professor.**
   - Choose **Professor** on the registration page and enter your department.
   - The account is created as **pending** and a 6-digit code is shown.
   - **Approve as admin now** (or **Admin: approve a professor account** on the sign-in page) activates it, after which you can sign in.
   - Or skip this and use **Professor demo**.
2. **Portal.** You see your stats, an alert if learners are predicted at risk, and your courses with **Manage** and **Publish/Unpublish**.
3. **New course.** Enter a title, category, description and icon. New courses start as drafts.
4. **Add level.**
   - Enter a title, pass mark and revision tip.
   - Add chapters: separate paragraphs with a blank line, and indent a paragraph by 4 spaces to show it as code.
   - Add questions: four options, the correct answer, which chapter teaches it, a topic, a tutor hint and a concept explanation.
5. **Publish.** Students see the course once it has at least one level and is published.
6. **Analytics.**
   - summary stats
   - a learner × level score table with AI readiness and at-risk flags
   - the hardest questions and class topic mastery
   - what learners ask the tutor
   - the readiness model's accuracy, AUC and feature weights (**Retrain now**)
   - pilot SUS results

## 4. How each scoping-document objective is met

| Objective | Where it is in the system |
|---|---|
| Needs analysis: diagnostic quizzes, modular courses | Levels of short chapters, each ending in a test; pass marks gate progress |
| System design: learner profiling, adaptive delivery, real-time feedback | `backend/models.py` (User, Attempt, Mastery), level unlocking in `services.py`, instant marking and feedback |
| ML component | `backend/ml/knowledge_tracing.py` (Bayesian Knowledge Tracing) and `backend/ml/adaptive.py` (scikit-learn logistic regression, readiness and at-risk) |
| NLP component | `backend/nlp/tutor_bot.py`: TF-IDF intent classifier, hint ladder, chapter and example answers, retrieval; optional Hugging Face model |
| Interface & experience | React app in `frontend/`: responsive, keyboard-accessible, works at phone width |
| Pilot evaluation | SUS questionnaire, learning analytics, readiness-model AUC on real attempts |
| Final report | `README.md` sections 3–7 cover the design rationale and technical detail |

## 5. Automated tests

```bash
cd backend
pytest
```

All 9 tests should pass.
