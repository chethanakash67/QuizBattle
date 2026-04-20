import unittest

from app import app, parse_questions, sessions


class QuizAppTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        sessions.clear()

    def tearDown(self):
        sessions.clear()

    def test_parse_questions_supports_multiline_questions(self):
        sample_text = """
        1. What is the capital
        of France?
        A) London
        B) Paris
        C) Berlin
        D) Rome
        Answer: B
        """.strip()

        questions = parse_questions(sample_text)

        self.assertEqual(len(questions), 1)
        self.assertEqual(questions[0]["question"], "What is the capital of France?")
        self.assertEqual(questions[0]["answer"], "B")

    def test_submit_quiz_tracks_unanswered_separately(self):
        start_response = self.client.post(
            "/api/quiz/start",
            json={
                "questions": [
                    {
                        "id": 1,
                        "question": "Capital of France?",
                        "options": [
                            {"label": "A", "text": "London"},
                            {"label": "B", "text": "Paris"},
                        ],
                        "answer": "B",
                    },
                    {
                        "id": 2,
                        "question": "2 + 2?",
                        "options": [
                            {"label": "A", "text": "3"},
                            {"label": "B", "text": "4"},
                        ],
                        "answer": "B",
                    },
                ],
                "shuffle_questions": False,
                "shuffle_options": False,
            },
        )

        self.assertEqual(start_response.status_code, 200)
        session_id = start_response.get_json()["session_id"]

        submit_response = self.client.post(
            "/api/quiz/submit",
            json={
                "session_id": session_id,
                "answers": {"1": "B"},
            },
        )

        payload = submit_response.get_json()
        self.assertEqual(submit_response.status_code, 200)
        self.assertEqual(payload["correct"], 1)
        self.assertEqual(payload["wrong"], 0)
        self.assertEqual(payload["unanswered"], 1)
        self.assertEqual(payload["answered"], 1)

    def test_start_quiz_relabels_shuffled_options_and_scores_by_text(self):
        start_response = self.client.post(
            "/api/quiz/start",
            json={
                "questions": [
                    {
                        "id": 1,
                        "question": "Capital of France?",
                        "options": [
                            {"label": "A", "text": "London"},
                            {"label": "B", "text": "Paris"},
                            {"label": "C", "text": "Berlin"},
                        ],
                        "answer": "B",
                    }
                ],
                "shuffle_questions": False,
                "shuffle_options": True,
            },
        )

        payload = start_response.get_json()
        self.assertEqual(start_response.status_code, 200)
        question = payload["questions"][0]
        self.assertEqual(
            [option["label"] for option in question["options"]],
            ["A", "B", "C"],
        )

        paris_option = next(
            option for option in question["options"] if option["text"] == "Paris"
        )

        submit_response = self.client.post(
            "/api/quiz/submit",
            json={
                "session_id": payload["session_id"],
                "answers": {"1": "Paris"},
            },
        )

        submit_payload = submit_response.get_json()
        self.assertEqual(submit_response.status_code, 200)
        self.assertEqual(submit_payload["correct"], 1)
        self.assertEqual(
            submit_payload["results"][0]["user_answer"],
            paris_option["label"],
        )

    def test_parse_questions_supports_true_false_options(self):
        sample_text = """
        1. Python is dynamically typed.
        True) Yes
        False) No
        Answer: True
        """.strip()

        questions = parse_questions(sample_text)

        self.assertEqual(len(questions), 1)
        self.assertEqual(questions[0]["answer"], "TRUE")
        self.assertEqual(questions[0]["options"][0]["label"], "TRUE")


if __name__ == "__main__":
    unittest.main()
