"""NLP tutor chatbot.

Pipeline for each student message
---------------------------------
1. Intent classification. A few high-precision regular-expression rules run
   first; otherwise the message is turned into TF-IDF features (word 1-2 grams
   plus character 3-5 grams) and a scikit-learn logistic regression trained on
   labelled example phrases picks the intent.
2. A response policy per intent:
   * hint / answer_request / frustrated / stuck -> the next step of a graded
     "hint ladder" for the current question: the professor's hints, then the
     chapter to re-read, then eliminating wrong options, then the concept with
     the answer masked out. The bot never reveals the answer.
   * chapter -> which chapter of the level teaches this question.
   * trace   -> the worked code example from that chapter (answer masked).
   * explain -> retrieval: hybrid TF-IDF cosine similarity over every chapter of
     the course plus a concept knowledge base (optionally refined by a Hugging
     Face extractive QA model when HF_QA_MODEL is configured).
   * greeting / thanks / help_usage -> short conversational replies.
"""
import json
import os
import re

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.pipeline import FeatureUnion, Pipeline

HERE = os.path.dirname(__file__)

TRAINING = {
    "greeting": ["hi", "hello", "hey there", "good morning", "hiya", "hello tutor", "hey", "good evening",
                 "hi can you help", "hello is anyone there", "greetings"],
    "hint": ["give me a hint", "can i have a hint", "hint please", "i need a clue", "any tips for this question",
             "point me in the right direction", "help me with this question", "how do i start this one",
             "what should i think about", "another hint", "next hint", "nudge me", "i am stuck on this question",
             "can you help me solve this", "how do i approach this", "help", "what is the first step"],
    "answer_request": ["what is the answer", "just tell me the answer", "give me the answer", "which option is correct",
                       "is it option a", "is the answer b", "tell me the correct one", "what is the right answer",
                       "solve it for me", "reveal the answer", "which one is right", "show me the solution"],
    "explain": ["what is a variable", "explain loops", "what does range do", "how does a for loop work",
                "what is machine learning", "explain overfitting", "what does roi mean", "define swot analysis",
                "what is binary search", "explain big o notation", "what is a dictionary", "what is generative ai",
                "explain transformational leadership", "explain the concept", "why is that",
                "what does this question mean", "i do not understand the concept", "explain the concept behind this",
                "how does this work", "what is kotter's model", "what is bias in ai"],
    "chapter": ["which chapter is this", "which chapter covers this", "where can i read about this",
                "what should i re-read", "where is this in the notes", "which chapter should i review"],
    "trace": ["show me an example", "walk me through it", "step by step", "show me a code trace",
              "give me an example", "demonstrate it", "trace the code"],
    "frustrated": ["this is too hard", "i give up", "i am so confused", "i am completely lost", "i hate this",
                   "i cannot do this", "this makes no sense", "i keep getting it wrong", "i feel stupid",
                   "i am never going to pass", "no idea"],
    "stuck": ["still stuck", "still do not get it", "still confused", "go deeper", "that did not help",
              "not helping", "more help", "still stuck go deeper"],
    "thanks": ["thanks", "thank you", "cheers", "that helped", "great thanks", "ok got it", "makes sense now",
               "brilliant", "awesome"],
    "help_usage": ["how does this website work", "how do i unlock the next level", "what is the pass mark",
                   "how are tests marked", "can i retake the test", "how do levels work", "what can you do"],
}

RULES = [
    (re.compile(r"\b(the answer|correct answer|right answer|solution|which option|is it (option )?[a-d]\b|just tell me)"), "answer_request"),
    (re.compile(r"\b(still|deeper|not helping|didn.?t help)\b"), "stuck"),
    (re.compile(r"\b(give up|too hard|completely lost|confus|frustrat|impossible|no idea|hate this|can.?t do)"), "frustrated"),
    (re.compile(r"\b(which|what) chapter|re-?read|where (can|do|should) i read"), "chapter"),
    (re.compile(r"\b(trace|step.?by.?step|walk me|example|demonstrat)"), "trace"),
    (re.compile(r"\b(hint|clue|nudge)\b"), "hint"),
]

STOPWORDS = set(
    "a an the is are was what how why do does did i me my you it this that to of in on for with can could please "
    "explain tell about mean means question one whats define definition work works difference between concept behind".split()
)
LADDER_INTENTS = ("hint", "answer_request", "frustrated", "stuck")


def _norm(text):
    return re.sub(r"\s+", " ", str(text).strip().lower().replace("’", "'")).strip(" .!?")


class TutorBot:
    def __init__(self, hf_model: str = ""):
        utterances, labels = [], []
        for intent, examples in TRAINING.items():
            utterances += examples
            labels += [intent] * len(examples)
        features = FeatureUnion([
            ("words", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)),
            ("chars", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)),
        ])
        self.intent_model = Pipeline([("tfidf", features), ("clf", LogisticRegression(max_iter=2000, C=8))])
        self.intent_model.fit(utterances, labels)

        with open(os.path.join(HERE, "knowledge_base.json"), encoding="utf-8") as fh:
            self.kb = json.load(fh)
        self.hf_model_name = hf_model
        self._hf = None

    # ------------------------------------------------------------------ intent
    def classify(self, message: str):
        text = _norm(message)
        for pattern, intent in RULES:
            if pattern.search(text):
                return intent, 1.0
        proba = self.intent_model.predict_proba([text])[0]
        idx = int(np.argmax(proba))
        intent, conf = self.intent_model.classes_[idx], float(proba[idx])
        if conf < 0.30:
            intent = "explain"  # unclear messages are treated as questions about content
        return intent, round(conf, 3)

    # ------------------------------------------------------------- helpers
    @staticmethod
    def accepted_answers(question):
        if question.qtype == "mcq":
            return [question.answer]
        return [a.strip() for a in question.answer.split("|") if a.strip()]

    def mask(self, text, question):
        """Hide the answer inside a piece of text."""
        for ans in self.accepted_answers(question):
            if len(ans) >= 2:
                text = re.sub(re.escape(ans), "____", text, flags=re.IGNORECASE)
        return text

    @staticmethod
    def chapter_ref(level, question):
        chapters = level.chapters or []
        i = question.chapter or 0
        if 0 <= i < len(chapters):
            return f'Chapter {i + 1}: "{chapters[i].get("title", "")}"'
        return "this level's chapters"

    @staticmethod
    def chapter_code(level, question):
        chapters = level.chapters or []
        i = question.chapter or 0
        if 0 <= i < len(chapters):
            for kind, text in chapters[i].get("blocks", []):
                if kind == "code":
                    return text
        return None

    # --------------------------------------------------------- hint ladder
    def hint_ladder(self, level, question):
        ladder = [h for h in (question.hints or []) if h and h.strip()]
        ladder.append(f"📖 This is covered in {self.chapter_ref(level, question)} — re-read the part about {question.topic}.")
        if question.qtype == "mcq" and len(question.options or []) > 2:
            wrong = [o for o in question.options if _norm(o) != _norm(question.answer)]
            # deterministic choice so repeated requests are consistent
            eliminated = sorted(wrong, key=lambda o: (len(o) * 31 + question.id) % 11)[:2]
            names = " and ".join(f'"{o}"' for o in eliminated)
            ladder.append(f"You can rule out {names}. Compare what is left carefully.")
        elif question.qtype == "short":
            first = self.accepted_answers(question)[0]
            words = len(first.split())
            ladder.append(f'The expected answer is {words} word{"s" if words != 1 else ""} long and starts with "{first[0]}".')
        if question.explanation:
            ladder.append("Here is the idea behind it: " + self.mask(question.explanation, question))
        return ladder

    # ------------------------------------------------------------ retrieval
    def _passages(self, level):
        passages = []
        course = level.course if level is not None else None
        if course is not None:
            for lv in course.levels:
                for ci, ch in enumerate(lv.chapters or []):
                    text = " ".join(t for k, t in ch.get("blocks", []) if k != "h")
                    passages.append({"source": f"{course.title} · Level {lv.number} · Chapter {ci + 1}: {ch.get('title', '')}",
                                     "title": ch.get("title", ""), "text": text})
        passages += [{"source": f"Concept: {k['topic']}", "title": k["topic"], "text": k["text"]} for k in self.kb]
        return passages

    @staticmethod
    def _content_words(text):
        return [w for w in re.findall(r"[a-z0-9']+", text.lower()) if w not in STOPWORDS]

    def retrieve(self, query, level=None):
        """Hybrid lexical retrieval: word TF-IDF + character n-gram TF-IDF (robust to
        abbreviations such as 'dict' -> 'dictionaries') + a bonus when the query
        names the passage's title."""
        passages = self._passages(level)
        words = self._content_words(query) or re.findall(r"[a-z0-9']+", query.lower())
        corpus = [(p["title"] + " ") * 2 + p["text"] for p in passages]
        q = " ".join(words)
        wm = TfidfVectorizer(stop_words="english", sublinear_tf=True).fit_transform(corpus + [q])
        cm = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True).fit_transform(corpus + [q])
        sims = 0.6 * cosine_similarity(wm[-1], wm[:-1])[0] + 0.4 * cosine_similarity(cm[-1], cm[:-1])[0]
        for i, p in enumerate(passages):
            title_words = re.findall(r"[a-z]+", p["title"].lower())
            if any(len(w) >= 3 and any(t.startswith(w) or w.startswith(t) for t in title_words) for w in words):
                sims[i] += 0.25
        best = int(np.argmax(sims))
        return passages[best], float(sims[best])

    def _hf_answer(self, query, context):
        if not self.hf_model_name:
            return None
        try:
            if self._hf is None:
                from transformers import pipeline  # optional dependency
                self._hf = pipeline("question-answering", model=self.hf_model_name)
            out = self._hf(question=query, context=context)
            return out["answer"] if out.get("score", 0) > 0.3 else None
        except Exception:  # model unavailable - fall back silently to retrieval
            self.hf_model_name = ""
            return None

    # ------------------------------------------------------------- respond
    def respond(self, message, question=None, level=None, hints_given=0):
        intent, conf = self.classify(message)
        out = {"intent": intent, "confidence": conf, "hint_level": 0, "hints_remaining": None,
               "source": None, "code": None}
        q, lv = question, level

        def next_hint(prefix=""):
            ladder = self.hint_ladder(lv, q)
            step = min(hints_given, len(ladder))
            if step < len(ladder):
                out["hint_level"], out["hints_remaining"] = step + 1, len(ladder) - step - 1
                return f"{prefix}💡 Hint {step + 1} of {len(ladder)}: {ladder[step]}"
            passage, _ = self.retrieve(f"{q.topic} {q.text}", lv)
            out["hint_level"], out["hints_remaining"], out["source"] = len(ladder) + 1, 0, passage["source"]
            return (f"{prefix}You've seen every hint for this question. Re-read this, then trust your reasoning:\n\n"
                    f"“{self.mask(passage['text'], q)}”")

        if intent == "greeting":
            reply = ("Hi! Ask me for a hint, an example, an explanation of the concept, or which chapter to re-read. "
                     "I won't give away the answer — I'll help you reach it.")
        elif intent == "thanks":
            reply = "You're welcome — keep going! Ask again whenever you get stuck."
        elif intent == "help_usage":
            pm = lv.pass_mark if lv else 60
            reply = (f"Each level has chapters and a test. Score {pm}% or more and the next level unlocks. If you don't, "
                     "re-read the chapters and retake it — your best score counts. Hints you use are recorded so the "
                     "platform can personalise your learning path.")
        elif intent in LADDER_INTENTS and q is not None:
            prefix = {
                "answer_request": "I can't give you the answer during a test — that wouldn't help you learn. Here's the next step instead.\n\n",
                "stuck": "Let's go one level deeper.\n\n",
                "frustrated": "That's completely normal — struggling means you're learning. Let's take one small step.\n\n",
            }.get(intent, "")
            reply = next_hint(prefix)
        elif intent in LADDER_INTENTS:
            reply = ("That's normal! Tell me the topic and I'll explain it simply." if intent == "frustrated" else
                     "Select a question and press \"AI Tutor\" — I'll give you graded hints for it. Or ask me about any concept, e.g. \"What is a for loop?\"")
        elif intent == "chapter":
            reply = (f"📖 Re-read {self.chapter_ref(lv, q)}. Look for the part about {q.topic}, then come back to this question."
                     if q is not None else "Ask me about a specific question and I'll tell you which chapter covers it.")
        elif intent == "trace":
            code = self.chapter_code(lv, q) if q is not None else None
            if code:
                reply = f"Here's the worked example from {self.chapter_ref(lv, q)}. Trace it line by line and compare it with the question:"
                out["code"] = self.mask(code, q)
            elif q is not None:
                reply = f"There's no code for this one, so think of a real example: {self.mask(q.explanation or '', q)}"
            else:
                reply = "Ask about a question and I'll show a worked example."
        else:  # explain
            vague = len(self._content_words(message)) == 0
            if q is not None and vague:
                reply = (f"Here's the concept behind this question: {self.mask(q.explanation or '', q)}\n\n"
                         f"📖 More detail in {self.chapter_ref(lv, q)}.")
            else:
                passage, score = self.retrieve(message, lv)
                if score < 0.08:
                    reply = ("I don't have material on that yet. Try the key term, e.g. \"explain binary search\", "
                             "or ask for a hint on this question.")
                else:
                    text = self.mask(passage["text"], q) if q is not None else passage["text"]
                    short = self._hf_answer(message, passage["text"]) if q is None else None
                    reply = (f"In short: {short}.\n\n" if short else "") + text
                    out["source"] = passage["source"]
        out["reply"] = reply
        return out


_bot = None


def get_bot(hf_model=""):
    global _bot
    if _bot is None:
        _bot = TutorBot(hf_model)
    return _bot
