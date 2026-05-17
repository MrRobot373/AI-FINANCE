import logging
import os
import time
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class TranscriptionResult:
    text: str
    engine: str
    model: str
    device: str
    compute_type: str
    duration_ms: int


class STTService:
    """GPU-ready speech-to-text facade.

    Prefers faster-whisper because it supports CTranslate2 acceleration. If it
    cannot load on the requested device, it falls back to CPU faster-whisper,
    then to the existing openai-whisper SpeechService.
    """

    _instance = None
    _fw_model = None
    _fw_status = None
    _fallback_service = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        self.model_name = os.getenv("FASTER_WHISPER_MODEL", os.getenv("STT_MODEL", "base.en"))
        self.requested_device = os.getenv("FASTER_WHISPER_DEVICE", os.getenv("STT_DEVICE", "auto")).lower()
        self.requested_compute = os.getenv("FASTER_WHISPER_COMPUTE_TYPE", os.getenv("STT_COMPUTE_TYPE", "auto")).lower()

    def _cuda_available(self) -> bool:
        try:
            import ctranslate2

            return ctranslate2.get_cuda_device_count() > 0
        except Exception:
            return False

    def _device_candidates(self):
        if self.requested_device in {"cuda", "gpu"}:
            return ["cuda", "cpu"]
        if self.requested_device == "cpu":
            return ["cpu"]
        return ["cuda", "cpu"] if self._cuda_available() else ["cpu"]

    def _compute_type_for(self, device: str) -> str:
        if self.requested_compute != "auto":
            return self.requested_compute
        return "float16" if device == "cuda" else "int8"

    def _load_faster_whisper(self):
        if STTService._fw_model is not None:
            return STTService._fw_model, STTService._fw_status

        try:
            from faster_whisper import WhisperModel
        except Exception as e:
            logger.warning("[STT] faster-whisper unavailable: %s", e)
            return None, None

        last_error: Optional[Exception] = None
        for device in self._device_candidates():
            compute_type = self._compute_type_for(device)
            try:
                logger.info(
                    "[STT] Loading faster-whisper model=%s device=%s compute_type=%s",
                    self.model_name,
                    device,
                    compute_type,
                )
                model = WhisperModel(self.model_name, device=device, compute_type=compute_type)
                STTService._fw_model = model
                STTService._fw_status = {
                    "engine": "faster-whisper",
                    "model": self.model_name,
                    "device": device,
                    "compute_type": compute_type,
                }
                logger.info("[STT] faster-whisper loaded: %s", STTService._fw_status)
                return STTService._fw_model, STTService._fw_status
            except Exception as e:
                last_error = e
                logger.warning("[STT] faster-whisper failed on %s/%s: %s", device, compute_type, e)

        if last_error:
            logger.warning("[STT] Falling back to openai-whisper after faster-whisper errors.")
        return None, None

    def _load_openai_whisper(self):
        if STTService._fallback_service is None:
            from app.services.speech_service import SpeechService

            STTService._fallback_service = SpeechService()
        return STTService._fallback_service

    def transcribe_file(self, audio_path: str) -> TranscriptionResult:
        started = time.perf_counter()

        model, status = self._load_faster_whisper()
        if model is not None and status is not None:
            segments, _info = model.transcribe(
                audio_path,
                language="en",
                beam_size=1,
                vad_filter=True,
                condition_on_previous_text=False,
            )
            text = " ".join(segment.text.strip() for segment in segments if segment.text).strip()
            duration_ms = int((time.perf_counter() - started) * 1000)
            return TranscriptionResult(
                text=text,
                engine=status["engine"],
                model=status["model"],
                device=status["device"],
                compute_type=status["compute_type"],
                duration_ms=duration_ms,
            )

        fallback = self._load_openai_whisper()
        text = fallback.transcribe_file(audio_path)
        duration_ms = int((time.perf_counter() - started) * 1000)
        return TranscriptionResult(
            text=text,
            engine="openai-whisper",
            model=os.getenv("WHISPER_MODEL", "base"),
            device="cuda" if self._torch_cuda_available() else "cpu",
            compute_type="fp16" if self._torch_cuda_available() else "fp32",
            duration_ms=duration_ms,
        )

    def _torch_cuda_available(self) -> bool:
        try:
            import torch

            return bool(torch.cuda.is_available())
        except Exception:
            return False

    def health(self):
        model, status = self._load_faster_whisper()
        if model is not None and status is not None:
            return {**status, "ready": True, "cuda_available": self._cuda_available()}

        return {
            "engine": "openai-whisper",
            "model": os.getenv("WHISPER_MODEL", "base"),
            "device": "cuda" if self._torch_cuda_available() else "cpu",
            "compute_type": "fp16" if self._torch_cuda_available() else "fp32",
            "ready": True,
            "cuda_available": self._torch_cuda_available(),
        }
