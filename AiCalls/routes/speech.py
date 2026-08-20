# routes/speech.py
"""
Speech-to-text (ASR) endpoints backed by the admin-managed `speechllm` tier.
Audio bytes are forwarded to the litellm Router's transcription API.
"""
import os
import tempfile
from datetime import datetime, timezone
from fastapi import APIRouter, UploadFile, File, HTTPException  # type: ignore
from lib.litellm_config import router, _llm_log, _schedule_log, get_current_config

speech_router = APIRouter()

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # 25 MB


@speech_router.post("/agent/stt")
async def transcribe_audio(file: UploadFile = File(...)):
    # Pre-flight: a Speech (ASR) provider must be configured on the router.
    configured = any(
        entry.get("model_name") == "speechllm"
        for entry in get_current_config().get("model_list", [])
    )
    if not configured:
        raise HTTPException(
            status_code=503,
            detail="Speech-to-text is not configured yet. Ask an administrator to add a Speech (ASR) provider.",
        )

    filename   = file.filename or "speech.webm"
    ext        = os.path.splitext(filename)[1].lower() or ".webm"
    contents   = await file.read()

    if not contents:
        raise HTTPException(status_code=400, detail="Empty audio file received")
    if len(contents) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio file too large (max 25MB)")

    start       = datetime.now(timezone.utc)
    tmp         = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    tmp_path    = tmp.name
    text        = ""

    try:
        tmp.write(contents)
        tmp.close()
        with open(tmp_path, "rb") as audio_file:
            response = await router.atranscription(
                model="speechllm",
                file=audio_file,
            )
        text = response.get("text", "") if isinstance(response, dict) else getattr(response, "text", "") or ""
    except Exception as e:
        latency = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
        status_code = getattr(e, "status_code", None)
        short = str(e).split('\n')[0][:200]
        _llm_log.error(f"FAILURE tier=speechllm latency={latency}ms error={short!r}")
        _schedule_log(
            type="failure",
            virtual_model="speechllm",
            model="speechllm",
            latency_ms=latency,
            error=short,
            error_details={"status_code": status_code} if status_code else None,
            mode="speech-to-text",
        )
        raise HTTPException(status_code=502, detail=f"Speech-to-text failed: {short}")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    latency = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
    _llm_log.info(f"SUCCESS tier=speechllm latency={latency}ms chars={len(text)}")
    _schedule_log(
        type="success",
        virtual_model="speechllm",
        model="speechllm",
        latency_ms=latency,
        error=f"SUCCESS transcription ({len(text)} chars)",
        mode="speech-to-text",
    )
    return {"text": text}