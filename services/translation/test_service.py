"""Engineering API contracts; Stub is explicitly simulated, not model evidence."""
from fastapi.testclient import TestClient
from .app import create_app
from .engine import IndicEngine, TranslationFailure, language_code, MANIFEST

KEY = "contract-only-key-longer-than-32-characters"


class Stub:
    models = {}
    error = "MODEL_NOT_PREPARED"
    successful_inferences = 0

    def translate(self, *args):
        raise TranslationFailure("MODEL_LOADING_FAILED", 503)


def test_backend_authentication_precedes_body_validation():
    client = TestClient(create_app(Stub(), KEY))
    assert client.post("/v1/translate", content="not-json").status_code == 401
    assert client.get("/health").status_code == 401


def test_simulated_unavailable_model_never_returns_fake_translation():
    client = TestClient(create_app(Stub(), KEY))
    result = client.post("/v1/translate", json={"body": "Synthetic private original"}, headers={"Authorization": "Bearer " + KEY})
    assert result.status_code == 503
    assert result.json() == {"error": {"code": "MODEL_LOADING_FAILED"}}
    assert "original" not in result.text


def test_invalid_inputs_and_oversized_requests_do_not_echo_complaints():
    client = TestClient(create_app(Stub(), KEY))
    headers = {"Authorization": "Bearer " + KEY}
    assert client.post("/v1/translate", json={"body": "x", "role": "admin"}, headers=headers).status_code == 422
    assert client.post("/v1/translate", content="x" * 131073, headers=headers).status_code == 413


def test_official_checkpoints_pinned_and_languages_explicit():
    assert language_code("mr") == "mar_Deva"
    assert language_code("hi") == "hin_Deva"
    for model in MANIFEST.values():
        assert model["id"].startswith("ai4bharat/indictrans2-")
        assert len(model["revision"]) == 40
        assert model["license"] == "MIT"


def test_actual_open_source_language_identification():
    engine = IndicEngine()
    assert engine.detect("आमच्या महाविद्यालयामध्ये विद्यार्थ्यांना आवश्यक शैक्षणिक सुविधा मिळत नाहीत आणि याबाबत तक्रार नोंदवायची आहे.") == "mr"
    assert engine.detect("हमारे महाविद्यालय में विद्यार्थियों को आवश्यक शैक्षणिक सुविधाएं नहीं मिल रही हैं और हम इसकी शिकायत करना चाहते हैं।") == "hi"
