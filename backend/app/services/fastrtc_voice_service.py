import importlib.util
import logging
import math
import os
import queue
import tempfile
import threading
import time
import uuid
import wave
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

MOUNT_PATH = "/api/v1/avatar/rtc"

# Bob defaults from OminousIndustries/Bob chatbot.py.
DEFAULT_PREF_SAMPLE_RATE = 16000
DEFAULT_FRAME_MS = 30
DEFAULT_SILENCE_THRESHOLD = 120.0
DEFAULT_END_SILENCE_MS = 800
DEFAULT_MIN_SPEECH_MS = 300
DEFAULT_MAX_RECORDING_MS = 15000
DEFAULT_WHISPER_MODEL = "small.en"
DEFAULT_WHISPER_BEAM_SIZE = 3
DEFAULT_WHISPER_BEST_OF = 3
DEFAULT_WHISPER_NO_SPEECH_THRESHOLD = 0.45
DEFAULT_WHISPER_INITIAL_PROMPT = (
    "Banking and finance conversation. Common terms include rupees, bank account, "
    "savings account, current account, credit card, debit card, UPI, EMI, loan, "
    "home loan, mutual fund, SIP, insurance, tax, budget, expense, income, Nifty, "
    "Sensex, stock, portfolio, FD, RD, and interest rate."
)
DEFAULT_LLM_MODEL = "qwen2.5:0.5b"
DEFAULT_TTS_VOICE = "af_heart"
DEFAULT_FEMALE_TTS_VOICE = "af_heart"
DEFAULT_MALE_TTS_VOICE = "am_adam"
DEFAULT_TTS_SPEED = 1.1
DEFAULT_TTS_LANG_CODE = "a"
DEFAULT_OUTPUT_SAMPLE_RATE = 24000
DEFAULT_SYSTEM_PROMPT = (
    "You are FinWise, a banking and personal finance voice assistant for an Indian user. "
    "Help with bank accounts, cards, loans, budgeting, expenses, savings, investments, "
    "insurance, taxes, financial goals, and market questions. If the user asks something "
    "unrelated to banking or finance, briefly redirect them back to money matters. "
    "Keep replies conversational, practical, and under two short sentences. Use rupees "
    "for Indian currency. Do not promise guaranteed returns or give unsafe financial advice."
)

_stream = None
_runtime = None
_mount_error = None
_lock = threading.Lock()
_runtime_lock = threading.Lock()


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return float(raw)


def _env_str(name: str, default: str) -> str:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip()


def _bob_config() -> Dict[str, object]:
    return {
        "pref_sample_rate": _env_int("BOB_PREF_SAMPLE_RATE", DEFAULT_PREF_SAMPLE_RATE),
        "frame_ms": _env_int("BOB_FRAME_MS", DEFAULT_FRAME_MS),
        "silence_threshold": _env_float("BOB_SILENCE_THRESHOLD", DEFAULT_SILENCE_THRESHOLD),
        "end_silence_ms": _env_int("BOB_END_SILENCE_MS", DEFAULT_END_SILENCE_MS),
        "min_speech_ms": _env_int("BOB_MIN_SPEECH_MS", DEFAULT_MIN_SPEECH_MS),
        "max_recording_ms": _env_int("BOB_MAX_RECORDING_MS", DEFAULT_MAX_RECORDING_MS),
        "calibration_ms": _env_int("BOB_CALIBRATION_MS", 300),
        "whisper_model": _env_str("BOB_WHISPER_MODEL", DEFAULT_WHISPER_MODEL),
        "whisper_device": _env_str("BOB_WHISPER_DEVICE", "cpu"),
        "whisper_compute_type": _env_str("BOB_WHISPER_COMPUTE_TYPE", "int8"),
        "whisper_cpu_threads": _env_int("BOB_WHISPER_CPU_THREADS", 4),
        "whisper_beam_size": _env_int("BOB_WHISPER_BEAM_SIZE", DEFAULT_WHISPER_BEAM_SIZE),
        "whisper_best_of": _env_int("BOB_WHISPER_BEST_OF", DEFAULT_WHISPER_BEST_OF),
        "whisper_no_speech_threshold": _env_float(
            "BOB_WHISPER_NO_SPEECH_THRESHOLD",
            DEFAULT_WHISPER_NO_SPEECH_THRESHOLD,
        ),
        "whisper_initial_prompt": _env_str(
            "BOB_WHISPER_INITIAL_PROMPT",
            DEFAULT_WHISPER_INITIAL_PROMPT,
        ),
        "whisper_hotwords": _env_str(
            "BOB_WHISPER_HOTWORDS",
            "rupees UPI EMI SIP mutual fund Nifty Sensex bank account credit card debit card loan insurance tax",
        ),
        "whisper_download_root": _env_str(
            "BOB_WHISPER_DOWNLOAD_ROOT",
            str(Path.home() / ".cache" / "whisper"),
        ),
        "llm_model": _env_str("BOB_LLM_MODEL", DEFAULT_LLM_MODEL),
        "llm_temperature": _env_float("BOB_LLM_TEMPERATURE", 0.7),
        "llm_num_predict": _env_int("BOB_LLM_NUM_PREDICT", 60),
        "llm_top_p": _env_float("BOB_LLM_TOP_P", 0.9),
        "system_prompt": _env_str("BOB_SYSTEM_PROMPT", DEFAULT_SYSTEM_PROMPT),
        "tts_voice": _env_str("BOB_TTS_VOICE", DEFAULT_TTS_VOICE),
        "tts_female_voice": _env_str("BOB_TTS_FEMALE_VOICE", DEFAULT_FEMALE_TTS_VOICE),
        "tts_male_voice": _env_str("BOB_TTS_MALE_VOICE", DEFAULT_MALE_TTS_VOICE),
        "tts_speed": _env_float("BOB_TTS_SPEED", DEFAULT_TTS_SPEED),
        "tts_lang_code": _env_str("BOB_TTS_LANG_CODE", DEFAULT_TTS_LANG_CODE),
        "tts_device": _env_str("BOB_TTS_DEVICE", _env_str("BOB_WHISPER_DEVICE", "cpu")),
        "output_sample_rate": _env_int("BOB_OUTPUT_SAMPLE_RATE", DEFAULT_OUTPUT_SAMPLE_RATE),
    }


def _normalize_avatar_gender(gender: Optional[str]) -> str:
    normalized = (gender or "").strip().lower()
    if normalized in {"female", "f", "woman", "girl"}:
        return "female"
    if normalized in {"male", "m", "man", "boy"}:
        return "male"
    return "female"


def _avatar_voice_for_gender(gender: Optional[str], explicit_voice: Optional[str] = None) -> Tuple[str, str]:
    config = _bob_config()
    normalized = _normalize_avatar_gender(gender)
    voice = (explicit_voice or "").strip()
    if not voice:
        voice = str(config["tts_male_voice"] if normalized == "male" else config["tts_female_voice"])
    return normalized, voice


def _safe_find_spec(module: str) -> bool:
    try:
        return importlib.util.find_spec(module) is not None
    except (ImportError, ModuleNotFoundError, ValueError):
        return False


def _missing_dependencies() -> List[str]:
    required_modules = {
        "fastrtc": "fastrtc",
        "aiortc": "aiortc",
        "faster_whisper": "faster-whisper",
        "ollama": "ollama",
        "kokoro": "kokoro",
        "numpy": "numpy",
    }
    return [
        package
        for module, package in required_modules.items()
        if not _safe_find_spec(module)
    ]


def get_fastrtc_voice_health() -> Dict[str, object]:
    missing = _missing_dependencies()
    enabled = _env_bool("ENABLE_FASTRTC_AVATAR", default=False)
    available = not missing
    mounted = _stream is not None
    runtime = _runtime
    config = _bob_config()

    return {
        "status": "ready" if enabled and available and mounted else "unavailable",
        "enabled": enabled,
        "available": available,
        "mounted": mounted,
        "missing_dependencies": missing,
        "mount_path": MOUNT_PATH,
        "offer_url": f"{MOUNT_PATH}/webrtc/offer",
        "websocket_offer_url": f"{MOUNT_PATH}/websocket/offer",
        "pipeline": {
            "source": "OminousIndustries/Bob",
            "transport": "FastRTC WebRTC",
            "vad": "Bob RMS silence detector",
            "stt": f"faster-whisper:{config['whisper_model']}",
            "llm": config["llm_model"],
            "tts": "kokoro.KPipeline",
            "voice": config["tts_voice"],
            "female_voice": config["tts_female_voice"],
            "male_voice": config["tts_male_voice"],
            "config": config,
        },
        "models": {
            "whisper": runtime.whisper_loaded if runtime else False,
            "ollama": runtime.ollama_ready if runtime else False,
            "kokoro": runtime.tts_loaded if runtime else False,
            "warmup_started": runtime.warmup_started if runtime else False,
            "device": runtime.device if runtime else config["whisper_device"],
            "compute_type": runtime.compute_type if runtime else config["whisper_compute_type"],
            "tts_device": runtime.tts_device if runtime else config["tts_device"],
        },
        "install": {
            "requirements": "backend/requirements-voice.txt",
            "command": "pip install -r backend/requirements-voice.txt",
        },
        "error": _mount_error,
    }


def set_fastrtc_avatar_voice(
    webrtc_id: str,
    gender: Optional[str] = None,
    voice: Optional[str] = None,
) -> Dict[str, object]:
    if not _stream:
        return {"status": "failed", "error": "FastRTC stream is not mounted."}

    normalized_gender, selected_voice = _avatar_voice_for_gender(gender, voice)
    payload = {
        "type": "avatar_voice_config",
        "gender": normalized_gender,
        "tts_voice": selected_voice,
    }
    connections = getattr(_stream, "connections", {})
    if isinstance(connections, dict) and webrtc_id not in connections:
        return {
            "status": "pending",
            "error": "WebRTC session is not ready yet.",
            "webrtc_id": webrtc_id,
            "gender": normalized_gender,
            "voice": selected_voice,
        }

    try:
        _stream.set_input(webrtc_id, payload)
    except Exception as exc:
        logger.exception("Failed to set avatar voice for WebRTC session %s.", webrtc_id)
        return {"status": "failed", "error": str(exc)}

    return {
        "status": "ok",
        "webrtc_id": webrtc_id,
        "gender": normalized_gender,
        "voice": selected_voice,
    }


def mount_fastrtc_voice(app) -> bool:
    """Mount the browser WebRTC endpoint backed by Bob's local voice stack."""
    global _mount_error, _stream

    if not _env_bool("ENABLE_FASTRTC_AVATAR", default=False):
        logger.info("Avatar realtime voice is disabled. Set ENABLE_FASTRTC_AVATAR=true to enable it.")
        return False

    missing = _missing_dependencies()
    if missing:
        _mount_error = f"Missing Bob voice requirements: {', '.join(missing)}"
        logger.warning("%s. Install backend/requirements-voice.txt.", _mount_error)
        return False

    try:
        with _lock:
            if _stream is None:
                _stream = _create_stream()
            _stream.mount(app, path=MOUNT_PATH, tags=["Avatar Bob Voice"])
            _mount_error = None
            _get_runtime().warmup_async()
            logger.info("Mounted Bob avatar voice endpoint at %s", MOUNT_PATH)
            return True
    except Exception as exc:
        _mount_error = str(exc)
        logger.exception("Failed to mount Bob avatar voice endpoint.")
        return False


def _create_stream():
    from fastrtc import Stream

    return Stream(
        _create_bob_handler(),
        modality="audio",
        mode="send-receive",
    )


def _get_runtime():
    global _runtime

    if _runtime is not None:
        return _runtime

    with _runtime_lock:
        if _runtime is None:
            _runtime = BobVoiceRuntime()
    return _runtime


def _save_wav(audio_data: bytes, filepath: Path, sample_rate: int, channels: int) -> None:
    with wave.open(str(filepath), "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(audio_data)


def _to_numpy_audio(audio) -> np.ndarray:
    try:
        import torch

        if isinstance(audio, torch.Tensor):
            audio = audio.detach().cpu().float().numpy()
    except Exception:
        pass

    audio = np.asarray(audio, dtype=np.float32)
    if audio.ndim > 1:
        audio = np.squeeze(audio)
    return audio.astype(np.float32, copy=False)


def _resample_audio(audio: np.ndarray, source_sample_rate: int, target_sample_rate: int) -> np.ndarray:
    if source_sample_rate == target_sample_rate or audio.size == 0:
        return audio.astype(np.float32, copy=False)

    try:
        from scipy.signal import resample_poly

        divisor = math.gcd(source_sample_rate, target_sample_rate)
        return resample_poly(
            audio,
            target_sample_rate // divisor,
            source_sample_rate // divisor,
        ).astype(np.float32)
    except Exception:
        logger.debug("Falling back to linear audio resampling.", exc_info=True)
        duration = audio.shape[0] / float(source_sample_rate)
        target_size = max(1, int(duration * target_sample_rate))
        source_x = np.linspace(0.0, duration, num=audio.shape[0], endpoint=False)
        target_x = np.linspace(0.0, duration, num=target_size, endpoint=False)
        return np.interp(target_x, source_x, audio).astype(np.float32)


def _patch_espeak_wrapper_for_kokoro() -> None:
    """Kokoro/Misaki expects this hook; phonemizer-fork 3.3.2 does not expose it."""
    try:
        from phonemizer.backend.espeak.wrapper import EspeakWrapper
    except Exception:
        return

    if hasattr(EspeakWrapper, "set_data_path"):
        return

    def set_data_path(cls, data_path):
        cls._ESPEAK_DATA_PATH = data_path

    EspeakWrapper.set_data_path = classmethod(set_data_path)


class BobVoiceRuntime:
    def __init__(self):
        self.config = _bob_config()
        self.whisper = None
        self.tts = None
        self.ollama = None
        self.output_sample_rate = int(self.config["output_sample_rate"])
        self.whisper_loaded = False
        self.tts_loaded = False
        self.ollama_ready = False
        self.warmup_started = False
        self.device = str(self.config["whisper_device"])
        self.compute_type = str(self.config["whisper_compute_type"])
        self.tts_device = str(self.config["tts_device"])
        self._models_loaded = False
        self._warmup_thread = None
        self._load_lock = threading.RLock()

    def warmup_async(self) -> None:
        if self.warmup_started or self._models_loaded:
            return
        self.warmup_started = True

        def warmup_runner():
            global _mount_error
            try:
                self.load_models()
            except Exception as exc:
                _mount_error = f"Bob voice warmup failed: {exc}"
                logger.exception("Bob voice warmup failed.")

        self._warmup_thread = threading.Thread(target=warmup_runner, daemon=True)
        self._warmup_thread.start()

    def load_models(self) -> None:
        with self._load_lock:
            if self._models_loaded:
                return

            from faster_whisper import WhisperModel
            import ollama

            _patch_espeak_wrapper_for_kokoro()
            from kokoro import KPipeline

            logger.info("Loading Bob Faster-Whisper model %s", self.config["whisper_model"])
            self.whisper = WhisperModel(
                str(self.config["whisper_model"]),
                device=str(self.config["whisper_device"]),
                compute_type=str(self.config["whisper_compute_type"]),
                cpu_threads=int(self.config["whisper_cpu_threads"]),
                download_root=str(self.config["whisper_download_root"]),
            )
            self.whisper_loaded = True

            logger.info("Loading Bob Kokoro TTS pipeline on %s.", self.tts_device)
            self.tts = KPipeline(lang_code=str(self.config["tts_lang_code"]), device=self.tts_device)
            self.output_sample_rate = int(getattr(self.tts, "sample_rate", self.output_sample_rate) or self.output_sample_rate)
            self.tts_loaded = True

            logger.info("Checking Bob Ollama client.")
            self.ollama = ollama
            self.ollama.list()
            self.ollama_ready = True
            self._models_loaded = True

    def transcribe_audio(self, audio_data: bytes, sample_rate: int, channels: int = 1) -> Optional[str]:
        self.load_models()
        temp_dir = Path(tempfile.gettempdir()) / "finwise-bob"
        temp_dir.mkdir(parents=True, exist_ok=True)
        audio_path = temp_dir / f"recording-{uuid.uuid4().hex}.wav"

        try:
            _save_wav(audio_data, audio_path, sample_rate=sample_rate, channels=channels)
            segments, _info = self.whisper.transcribe(
                str(audio_path),
                language="en",
                beam_size=int(self.config["whisper_beam_size"]),
                best_of=int(self.config["whisper_best_of"]),
                temperature=0.0,
                condition_on_previous_text=False,
                no_speech_threshold=float(self.config["whisper_no_speech_threshold"]),
                initial_prompt=str(self.config["whisper_initial_prompt"]),
                hotwords=str(self.config["whisper_hotwords"]),
                vad_filter=True,
                vad_parameters={
                    "min_silence_duration_ms": 500,
                    "speech_pad_ms": 200,
                },
            )
            text = " ".join(segment.text.strip() for segment in segments)
            return text.strip() if text else None
        finally:
            try:
                audio_path.unlink(missing_ok=True)
            except Exception:
                logger.debug("Could not delete Bob temp recording %s", audio_path, exc_info=True)

    def generate_response(self, user_text: str) -> str:
        self.load_models()
        try:
            response = self.ollama.chat(
                model=str(self.config["llm_model"]),
                messages=[
                    {"role": "system", "content": str(self.config["system_prompt"])},
                    {"role": "user", "content": user_text},
                ],
                options={
                    "temperature": float(self.config["llm_temperature"]),
                    "num_predict": int(self.config["llm_num_predict"]),
                    "top_p": float(self.config["llm_top_p"]),
                },
            )
            return response["message"]["content"].strip()
        except Exception:
            logger.exception("Bob Ollama response failed.")
            return "I'm sorry, I had trouble processing that."

    def synthesize(self, text: str, voice: Optional[str] = None):
        self.load_models()
        source_sample_rate = int(getattr(self.tts, "sample_rate", self.output_sample_rate) or self.output_sample_rate)
        generator = self.tts(
            text,
            voice=str(voice or self.config["tts_voice"]),
            speed=float(self.config["tts_speed"]),
        )

        for _graphemes, _phonemes, audio in generator:
            audio_np = _to_numpy_audio(audio)
            audio_np = _resample_audio(audio_np, source_sample_rate, self.output_sample_rate)
            if audio_np.size:
                yield audio_np


def _create_bob_handler():
    from fastrtc.tracks import StreamHandler
    from fastrtc.utils import create_message

    class BobSpeechToSpeechHandler(StreamHandler):
        def __init__(self):
            runtime = _get_runtime()
            super().__init__(
                expected_layout="mono",
                output_sample_rate=runtime.output_sample_rate,
                input_sample_rate=int(runtime.config["pref_sample_rate"]),
            )
            self.runtime = runtime
            self.turn_queue = queue.Queue()
            self.output_queue = queue.Queue()
            self.stop_event = threading.Event()
            self.interrupt_event = threading.Event()
            self.worker_thread = None
            self.responding = False
            self.recording = False
            self.audio_frames: List[bytes] = []
            self.silence_ms = 0.0
            self.speech_ms = 0.0
            self.total_ms = 0.0
            self.noise_samples: List[float] = []
            self.threshold = float(self.runtime.config["silence_threshold"])
            self.input_lock = threading.Lock()
            self.avatar_gender = _normalize_avatar_gender(None)
            self.tts_voice = str(self.runtime.config["tts_female_voice"])
            self.voice_lock = threading.Lock()

        def copy(self):
            return BobSpeechToSpeechHandler()

        def start_up(self):
            self.runtime.warmup_async()
            self.worker_thread = threading.Thread(target=self._process_turns, daemon=True)
            self.worker_thread.start()

        def shutdown(self):
            self.stop_event.set()
            self.interrupt_event.set()

        def set_args(self, args: List[object]):
            try:
                super().set_args(args)
            except Exception:
                logger.debug("Could not store FastRTC handler args.", exc_info=True)

            for arg in args:
                if not isinstance(arg, dict) or arg.get("type") != "avatar_voice_config":
                    continue
                gender, voice = _avatar_voice_for_gender(
                    str(arg.get("gender") or ""),
                    str(arg.get("tts_voice") or ""),
                )
                with self.voice_lock:
                    self.avatar_gender = gender
                    self.tts_voice = voice
                self.send_message_sync(create_message(
                    "log",
                    {
                        "event": "voice_config",
                        "gender": gender,
                        "voice": voice,
                    },
                ))
            self._clear_output()
            if self.worker_thread and self.worker_thread.is_alive():
                self.worker_thread.join(timeout=1)

        def receive(self, frame: Tuple[int, object]) -> None:
            sample_rate, array = frame
            audio = np.squeeze(array)
            if audio.size == 0:
                return
            if audio.dtype == np.int16:
                pcm16 = audio.astype(np.int16, copy=False)
            else:
                pcm16 = (np.clip(audio.astype(np.float32), -1.0, 1.0) * 32767.0).astype(np.int16)

            samples = pcm16.astype(np.float32)
            rms = float(np.sqrt(np.mean(samples * samples))) if samples.size else 0.0
            frame_ms = float(len(pcm16) / float(sample_rate) * 1000.0)
            threshold = self._current_threshold(rms)

            with self.input_lock:
                if not self.recording:
                    if rms <= threshold:
                        return

                    self.recording = True
                    self.audio_frames = [pcm16.tobytes()]
                    self.silence_ms = 0.0
                    self.speech_ms = frame_ms
                    self.total_ms = frame_ms
                    self.send_message_sync(create_message("log", "started_talking"))
                    return

                self.audio_frames.append(pcm16.tobytes())
                self.total_ms += frame_ms

                if rms < threshold:
                    self.silence_ms += frame_ms
                else:
                    self.silence_ms = 0.0
                    self.speech_ms += frame_ms

                if (
                    self.silence_ms >= float(self.runtime.config["end_silence_ms"])
                    and self.speech_ms >= float(self.runtime.config["min_speech_ms"])
                ) or self.total_ms >= float(self.runtime.config["max_recording_ms"]):
                    captured = b"".join(self.audio_frames)
                    self._reset_recording()
                    if captured:
                        self.turn_queue.put((int(sample_rate), captured, 1))

        def emit(self):
            if self.stop_event.is_set():
                return None

            try:
                audio = self.output_queue.get(timeout=0.05)
            except queue.Empty:
                return None

            if audio is None:
                return None
            return self.runtime.output_sample_rate, audio.astype(np.float32)

        def _current_threshold(self, rms: float) -> float:
            config = self.runtime.config
            calibration_frames = max(
                1,
                int(float(config["calibration_ms"]) / max(1.0, float(config["frame_ms"]))),
            )
            if not self.recording and len(self.noise_samples) < calibration_frames:
                self.noise_samples.append(rms)

            if self.noise_samples:
                noise_floor = float(np.median(self.noise_samples))
                self.threshold = max(float(config["silence_threshold"]), noise_floor * 1.8)
            return self.threshold

        def _reset_recording(self):
            self.recording = False
            self.audio_frames = []
            self.silence_ms = 0.0
            self.speech_ms = 0.0
            self.total_ms = 0.0
            self.noise_samples = []
            self.threshold = float(self.runtime.config["silence_threshold"])

        def _clear_output(self):
            while True:
                try:
                    self.output_queue.get_nowait()
                except queue.Empty:
                    break
            try:
                self.clear_queue()
            except Exception:
                logger.debug("Could not clear FastRTC output queue.", exc_info=True)

        def _process_turns(self):
            while not self.stop_event.is_set():
                try:
                    sample_rate, audio_data, channels = self.turn_queue.get(timeout=0.1)
                except queue.Empty:
                    continue

                self.interrupt_event.clear()
                self.send_message_sync(create_message("log", "pause_detected"))
                self.responding = True
                try:
                    transcript = self.runtime.transcribe_audio(audio_data, sample_rate, channels=channels)
                    if self.interrupt_event.is_set():
                        continue
                    if not transcript:
                        self.send_message_sync(create_message("warning", "No speech detected in the captured audio."))
                        self.send_message_sync(create_message("end_stream", ""))
                        continue

                    self.send_message_sync(create_message(
                        "log",
                        {
                            "event": "user_transcript",
                            "role": "user",
                            "text": transcript,
                        },
                    ))

                    if any(word in transcript.lower() for word in ["goodbye", "bye", "stop", "exit", "quit", "shut down", "turn off"]):
                        reply = "Goodbye!"
                        self.send_message_sync(create_message(
                            "log",
                            {
                                "event": "assistant_reply",
                                "role": "assistant",
                                "text": reply,
                            },
                        ))
                        self._queue_tts(reply)
                        continue

                    reply = self.runtime.generate_response(transcript)
                    self.send_message_sync(create_message(
                        "log",
                        {
                            "event": "assistant_reply",
                            "role": "assistant",
                            "text": reply,
                        },
                    ))
                    self._queue_tts(reply)
                except Exception:
                    logger.exception("Bob speech-to-speech turn failed.")
                    self.send_message_sync(create_message("error", "Bob voice pipeline failed."))
                finally:
                    self.responding = False
                    self.send_message_sync(create_message("end_stream", ""))

        def _queue_tts(self, text: str):
            first_chunk = True
            with self.voice_lock:
                tts_voice = self.tts_voice
            try:
                for audio in self.runtime.synthesize(text, voice=tts_voice):
                    if self.interrupt_event.is_set() or self.stop_event.is_set():
                        break
                    if first_chunk:
                        self.send_message_sync(create_message("log", "response_starting"))
                        first_chunk = False
                    self.output_queue.put(audio)
                    time.sleep(0.005)
            except Exception:
                logger.exception("Bob Kokoro TTS failed.")
                self.send_message_sync(create_message("error", "Bob TTS failed."))

    return BobSpeechToSpeechHandler()
