import asyncio
import hmac
import os
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from .engine import IndicEngine, TranslationFailure


class TranslationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subject: str = Field(default="", max_length=4000)
    body: str = Field(min_length=1, max_length=20000)
    sourceLanguage: str = "auto"
    targetLanguage: str = "en"


def create_app(engine=None, key=None):
    key = key or os.getenv("SYNAPSE_TRANSLATION_API_KEY", "")
    if len(key) < 32:
        raise RuntimeError("TRANSLATION_SERVICE_KEY_REQUIRED")
    api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    engine = engine or IndicEngine()
    executor = ThreadPoolExecutor(max_workers=1)
    busy = False

    @api.middleware("http")
    async def authenticate(request: Request, call_next):
        supplied = request.headers.get("authorization", "")
        if not hmac.compare_digest(supplied.encode(), ("Bearer " + key).encode()):
            return JSONResponse({"error": {"code": "AUTHENTICATION_REQUIRED"}}, status_code=401)
        # Limit bodies before Pydantic sees/logs source text, including chunked requests.
        size, body = 0, []
        async for chunk in request.stream():
            size += len(chunk)
            if size > 131072:
                return JSONResponse({"error": {"code": "REQUEST_TOO_LARGE"}}, status_code=413)
            body.append(chunk)
        request._body = b"".join(body)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @api.exception_handler(RequestValidationError)
    async def validation_error(request, error):
        return JSONResponse({"error": {"code": "INVALID_REQUEST"}}, status_code=422)

    @api.get("/health")
    async def health():
        return {"provider": "AI4Bharat IndicTrans2", "loadedDirections": sorted(engine.models),
                "modelLoadingState": engine.error, "stage":getattr(engine,'stage','IDLE'), "realInferenceVerified": engine.successful_inferences > 0}

    @api.post("/v1/translate")
    async def translate(data: TranslationInput):
        nonlocal busy
        if busy:
            return JSONResponse({"error": {"code": "MODEL_BUSY"}}, status_code=429)
        busy = True
        try:
            # A single bounded worker prevents parallel CPU model exhaustion.
            # Engine checks a real inference deadline and rejects partial output.
            future = asyncio.get_running_loop().run_in_executor(
                executor, lambda: engine.translate(data.subject, data.body, data.sourceLanguage, data.targetLanguage))
            def finished(_):
                nonlocal busy
                busy = False
            future.add_done_callback(finished)
            return await asyncio.shield(future)
        except TranslationFailure as error:
            return JSONResponse({"error": {"code": error.code}}, status_code=error.status)
        except Exception:
            return JSONResponse({"error": {"code": "INFERENCE_FAILED"}}, status_code=503)
    return api
