import asyncio
import importlib.util
import logging
import os
import threading
from pathlib import Path
from typing import Dict, Generator, List, Tuple

from app.db.database import SessionLocal
from app.services.ai_service import AIService
from app.services.avatar_realtime_service import clean_spoken_text, split_speakable_segments
from app.services.tts_service import generate_piper_speech, generate_speech

logger = logging.getLogger(__name__)

MOUNT_PATH = "/api/v1/avatar/rtc"
DEFAULT_STT_MODEL = "moonshine/base"
DEFAULT_TTS_MODEL = "piper"
DEFAULT_TTS_VOICE = "en_US-lessac-medium"
DEFAULT_TTS_LANG = "en-us"

_stream = None
_stt_model = None
_kokoro_bundle = None
_mount_error = None
_lock = threading.Lock()
_model_lock = threading.Lock()


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _configured_tts_model() -> str:
    return os.getenv("FASTRTC_TTS_MODEL", DEFAULT_TTS_MODEL).strip().lower()


def _configured_tts_voice() -> str:
    explicit_voice = os.getenv("FASTRTC_TTS_VOICE")
    if explicit_voice:
        return explicit_voice

    gender = os.getenv("FASTRTC_TTS_GENDER", "female").strip().lower()
    if gender == "male":
        return os.getenv("PIPER_MALE_VOICE", "en_US-ryan-medium")
    return os.getenv("PIPER_FEMALE_VOICE", DEFAULT_TTS_VOICE)


def _missing_dependencies() -> List[str]:
    required_modules = {
        "fastrtc": "fastrtc[vad,stt]",
        "aiortc": "aiortc",
        "moonshine_onnx": "fastrtc-moonshine-onnx",
        "onnxruntime": "onnxruntime",
        "soundfile": "soundfile",
    }

    if _configured_tts_model() == "kokoro":
        required_modules["kokoro_onnx"] = "kokoro-onnx"

    return [
        package
        for module, package in required_modules.items()
        if importlib.util.find_spec(module) is None
    ]


def get_fastrtc_voice_health() -> Dict[str, object]:
    missing = _missing_dependencies()
    enabled = _env_bool("ENABLE_FASTRTC_AVATAR", default=False)
    available = not missing
    mounted = _stream is not None
    is_kokoro = _configured_tts_model() == "kokoro"

    return {
        "status": "ready" if enabled and available and mounted else "unavailable",
        "enabled": enabled,
        "available": available,
        "mounted": mounted,
        "missing_dependencies": missing,
        "mount_path": MOUNT_PATH,
        "offer_url": f"{MOUNT_PATH}/webrtc/offer",
        "websocket_offer_url": f"{MOUNT_PATH}/websocket/offer",
        "models": {
            "stt": os.getenv("FASTRTC_STT_MODEL", DEFAULT_STT_MODEL),
            "tts": _configured_tts_model(),
            "voice": _configured_tts_voice(),
            "gender": os.getenv("FASTRTC_TTS_GENDER", "female"),
            "language": os.getenv("FASTRTC_TTS_LANG", DEFAULT_TTS_LANG),
            "stt_loaded": _stt_model is not None,
            "tts_loaded": (_kokoro_bundle is not None) if is_kokoro else True,
        },
        "install": {
            "requirements": "backend/requirements-voice.txt",
            "command": "pip install -r backend/requirements-voice.txt",
        },
        "error": _mount_error,
    }


def mount_fastrtc_voice(app) -> bool:
    """Mount the local-voice-ai-agent style FastRTC endpoint when dependencies exist."""
    global _mount_error, _stream

    if not _env_bool("ENABLE_FASTRTC_AVATAR", default=False):
        logger.info("FastRTC avatar voice is disabled. Set ENABLE_FASTRTC_AVATAR=true to enable it.")
        return False

    missing = _missing_dependencies()
    if missing:
        _mount_error = f"Missing optional FastRTC dependencies: {', '.join(missing)}"
        logger.warning("%s. Install backend/requirements-voice.txt to enable the endpoint.", _mount_error)
        return False

    try:
        with _lock:
            if _stream is None:
                _stream = _create_stream()
            _stream.mount(app, path=MOUNT_PATH, tags=["Avatar FastRTC"])
            _mount_error = None
            logger.info("Mounted FastRTC avatar voice endpoint at %s", MOUNT_PATH)
            return True
    except Exception as exc:
        _mount_error = str(exc)
        logger.exception("Failed to mount FastRTC avatar voice endpoint.")
        return False


def _create_stream():
    from fastrtc import ReplyOnPause, Stream

    return Stream(
        ReplyOnPause(_reply_to_audio, can_interrupt=True),
        modality="audio",
        mode="send-receive",
    )


def _load_stt_model():
    global _stt_model

    if _stt_model is not None:
        return _stt_model

    from fastrtc import get_stt_model

    with _model_lock:
        if _stt_model is None:
            _stt_model = get_stt_model(os.getenv("FASTRTC_STT_MODEL", DEFAULT_STT_MODEL))

    return _stt_model


def _load_kokoro_tts():
    global _kokoro_bundle

    if _kokoro_bundle is not None:
        return _kokoro_bundle

    from fastrtc import KokoroTTSOptions, get_tts_model

    with _model_lock:
        if _kokoro_bundle is None:
            tts_model = get_tts_model("kokoro")
            tts_options = KokoroTTSOptions(
                voice=os.getenv("FASTRTC_TTS_VOICE", "af_heart"),
                speed=float(os.getenv("FASTRTC_TTS_SPEED", "1.0")),
                lang=os.getenv("FASTRTC_TTS_LANG", DEFAULT_TTS_LANG),
            )
            _kokoro_bundle = (tts_model, tts_options)

    return _kokoro_bundle


def _stream_tts_sync(text: str) -> Generator[Tuple[int, object], None, None]:
    if _configured_tts_model() == "kokoro":
        tts_model, tts_options = _load_kokoro_tts()
        yield from tts_model.stream_tts_sync(text, tts_options)
        return

    yield from _stream_file_tts_sync(text)


def _stream_file_tts_sync(text: str) -> Generator[Tuple[int, object], None, None]:
    import numpy as np
    import soundfile as sf

    gender = os.getenv("FASTRTC_TTS_GENDER", "female")
    if _configured_tts_model() == "piper":
        audio_path = _run_async(generate_piper_speech(text, gender=gender))
    else:
        audio_path = _run_async(
            generate_speech(
                text,
                voice=os.getenv("FASTRTC_EDGE_VOICE", "en-US-AriaNeural"),
                gender=gender,
            )
        )

    try:
        samples, sample_rate = sf.read(audio_path, dtype="float32", always_2d=False)
    except Exception:
        import librosa

        samples, sample_rate = librosa.load(audio_path, sr=None, mono=True)

    if getattr(samples, "ndim", 1) > 1:
        samples = samples.mean(axis=1)

    samples = np.asarray(samples, dtype=np.float32)
    if samples.size:
        yield sample_rate, samples

    try:
        Path(audio_path).unlink(missing_ok=True)
    except Exception:
        logger.debug("Could not delete generated FastRTC audio file: %s", audio_path, exc_info=True)


def _run_async(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)

    result = {}

    def runner():
        try:
            result["value"] = asyncio.run(coro)
        except Exception as exc:
            result["error"] = exc

    thread = threading.Thread(target=runner, daemon=True)
    thread.start()
    thread.join()

    if "error" in result:
        raise result["error"]

    return result.get("value")


def _reply_to_audio(audio: Tuple[int, object]) -> Generator[Tuple[int, object], None, None]:
    """Transcribe browser audio, answer with FinWise context, and stream local TTS audio."""
    db = SessionLocal()
    ai = AIService()

    try:
        stt_model = _load_stt_model()
        transcript = clean_spoken_text(stt_model.stt(audio))

        if not transcript:
            yield from _stream_tts_sync("I did not catch that. Please say it again.")
            return

        buffer = ""
        has_spoken = False

        for delta in ai.generate_stream(transcript, db, section="avatar", history=[]):
            if not delta:
                continue

            buffer += delta
            segments, buffer = split_speakable_segments(buffer, force=False)
            for segment in segments:
                for audio_chunk in _stream_tts_sync(segment):
                    has_spoken = True
                    yield audio_chunk

        segments, _ = split_speakable_segments(buffer, force=True)
        for segment in segments:
            for audio_chunk in _stream_tts_sync(segment):
                has_spoken = True
                yield audio_chunk

        if not has_spoken:
            yield from _stream_tts_sync("I am here. Please ask me again.")
    except Exception:
        logger.exception("FastRTC voice turn failed.")
        try:
            yield from _stream_tts_sync("Something went wrong with the voice pipeline.")
        except Exception:
            return
    finally:
        db.close()
