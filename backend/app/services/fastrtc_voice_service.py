import importlib.util
import logging
import os
import queue
import sys
import threading
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests

from app.db.database import SessionLocal
from app.services.ai_service import AIService
from app.services.avatar_realtime_service import clean_spoken_text

logger = logging.getLogger(__name__)

MOUNT_PATH = "/api/v1/avatar/rtc"
DEFAULT_PIPELINE_DIR = Path.home() / "Downloads" / "new s to s"
DEFAULT_VAD_MODEL = "pyannote/segmentation-3.0"
DEFAULT_WHISPER_MODEL = "openai/whisper-tiny.en"
DEFAULT_LLM_MODEL = "qwen2.5:0.5b-instruct-q8_0"
DEFAULT_TTS_MODEL = "kokoro.pth"
DEFAULT_VOICE_NAME = "af_nicole"
DEFAULT_OLLAMA_URL = "http://localhost:11434/api/chat"

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


def _pipeline_dir() -> Path:
    return Path(os.getenv("ON_DEVICE_S2S_DIR", str(DEFAULT_PIPELINE_DIR))).expanduser()


def _read_env_file(path: Path) -> Dict[str, str]:
    if not path.exists():
        return {}

    values = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def _pipeline_env() -> Dict[str, str]:
    return _read_env_file(_pipeline_dir() / ".env")


def _pipeline_setting(name: str, default: str) -> str:
    return os.getenv(f"ON_DEVICE_S2S_{name}") or os.getenv(name) or _pipeline_env().get(name, default)


def _safe_find_spec(module: str) -> bool:
    try:
        return importlib.util.find_spec(module) is not None
    except (ImportError, ModuleNotFoundError, ValueError):
        return False


def _asset_status() -> Dict[str, object]:
    root = _pipeline_dir()
    env = _pipeline_env()
    model_name = os.getenv("ON_DEVICE_S2S_TTS_MODEL") or os.getenv("TTS_MODEL") or env.get("TTS_MODEL", DEFAULT_TTS_MODEL)
    voice_name = os.getenv("ON_DEVICE_S2S_VOICE_NAME") or os.getenv("VOICE_NAME") or env.get("VOICE_NAME", DEFAULT_VOICE_NAME)
    model_path = root / "data" / "models" / model_name
    voice_path = root / "data" / "voices" / f"{voice_name}.pt"

    return {
        "pipeline_dir": str(root),
        "source_exists": (root / "src" / "utils" / "config.py").exists(),
        "model": model_name,
        "model_exists": model_path.exists(),
        "voice": voice_name,
        "voice_exists": voice_path.exists(),
        "pyannote_token_configured": bool(env.get("HUGGINGFACE_TOKEN") or os.getenv("HUGGINGFACE_TOKEN")),
    }


def _missing_dependencies() -> List[str]:
    required_modules = {
        "fastrtc": "fastrtc",
        "aiortc": "aiortc",
        "torch": "torch",
        "transformers": "transformers",
        "pyannote.audio": "pyannote.audio",
        "phonemizer": "phonemizer",
        "soundfile": "soundfile",
        "pydantic_settings": "pydantic-settings",
        "requests": "requests",
    }

    missing = [
        package
        for module, package in required_modules.items()
        if not _safe_find_spec(module)
    ]

    assets = _asset_status()
    if not assets["source_exists"]:
        missing.append(f"attached pipeline source at {assets['pipeline_dir']}")
    if not assets["model_exists"]:
        missing.append(f"Kokoro model {assets['model']}")
    if not assets["voice_exists"]:
        missing.append(f"Kokoro voice {assets['voice']}")

    return missing


def get_fastrtc_voice_health() -> Dict[str, object]:
    missing = _missing_dependencies()
    enabled = _env_bool("ENABLE_FASTRTC_AVATAR", default=False)
    available = not missing
    mounted = _stream is not None
    runtime = _runtime
    assets = _asset_status()

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
            "source": "asiff00/On-Device-Speech-to-Speech-Conversational-AI",
            "transport": "FastRTC WebRTC",
            "vad": _pipeline_setting("VAD_MODEL", DEFAULT_VAD_MODEL),
            "stt": _pipeline_setting("WHISPER_MODEL", DEFAULT_WHISPER_MODEL),
            "llm": _pipeline_setting("LLM_MODEL", DEFAULT_LLM_MODEL),
            "tts": assets["model"],
            "voice": assets["voice"],
            "assets": assets,
        },
        "models": {
            "vad": runtime.vad_loaded if runtime else False,
            "whisper": runtime.whisper_loaded if runtime else False,
            "kokoro": runtime.tts_loaded if runtime else False,
            "warmup_started": runtime.warmup_started if runtime else False,
            "device": runtime.device if runtime else None,
        },
        "install": {
            "requirements": "backend/requirements-voice.txt",
            "command": "pip install -r backend/requirements-voice.txt",
        },
        "error": _mount_error,
    }


def mount_fastrtc_voice(app) -> bool:
    """Mount the browser WebRTC endpoint backed by the on-device S2S pipeline."""
    global _mount_error, _stream

    if not _env_bool("ENABLE_FASTRTC_AVATAR", default=False):
        logger.info("Avatar realtime voice is disabled. Set ENABLE_FASTRTC_AVATAR=true to enable it.")
        return False

    missing = _missing_dependencies()
    if missing:
        _mount_error = f"Missing on-device S2S requirements: {', '.join(missing)}"
        logger.warning("%s. Install backend/requirements-voice.txt and configure ON_DEVICE_S2S_DIR.", _mount_error)
        return False

    try:
        with _lock:
            if _stream is None:
                _stream = _create_stream()
            _stream.mount(app, path=MOUNT_PATH, tags=["Avatar On-Device S2S"])
            _mount_error = None
            _get_runtime().warmup_async()
            logger.info("Mounted on-device avatar voice endpoint at %s", MOUNT_PATH)
            return True
    except Exception as exc:
        _mount_error = str(exc)
        logger.exception("Failed to mount on-device avatar voice endpoint.")
        return False


def _create_stream():
    from fastrtc import Stream

    return Stream(
        _create_on_device_handler(),
        modality="audio",
        mode="send-receive",
    )


def _get_runtime():
    global _runtime

    if _runtime is not None:
        return _runtime

    with _runtime_lock:
        if _runtime is None:
            _runtime = OnDeviceS2SRuntime(_pipeline_dir())
    return _runtime


class OnDeviceS2SRuntime:
    def __init__(self, pipeline_dir: Path):
        self.pipeline_dir = pipeline_dir
        self.session = requests.Session()
        self.settings = None
        self.VoiceGenerator = None
        self.TextChunker = None
        self.AudioGenerationQueue = None
        self.get_ai_response = None
        self.parse_stream_chunk = None
        self.filter_response = None
        self.generator = None
        self.vad_pipeline = None
        self.whisper_processor = None
        self.whisper_model = None
        self.torch = None
        self.device = "cpu"
        self.vad_loaded = False
        self.whisper_loaded = False
        self.tts_loaded = False
        self.warmup_started = False
        self._imports_loaded = False
        self._models_loaded = False
        self._warmup_thread = None
        self._load_lock = threading.RLock()
        self._load_external_imports()

    def _load_external_imports(self) -> None:
        if self._imports_loaded:
            return

        from dotenv import load_dotenv

        load_dotenv(self.pipeline_dir / ".env", override=False)
        os.environ.setdefault("TTS_MODEL", DEFAULT_TTS_MODEL)
        os.environ.setdefault("VOICE_NAME", DEFAULT_VOICE_NAME)
        os.environ.setdefault("HUGGINGFACE_TOKEN", "TOKEN_GOES_HERE")
        os.environ.setdefault("LM_STUDIO_URL", "http://localhost:1234/v1")
        os.environ.setdefault("OLLAMA_URL", DEFAULT_OLLAMA_URL)
        os.environ.setdefault(
            "DEFAULT_SYSTEM_PROMPT",
            "You are a friendly, helpful, and intelligent assistant. Begin your responses with phrases like 'Umm,' or 'So,'.",
        )
        os.environ.setdefault("LLM_MODEL", DEFAULT_LLM_MODEL)
        os.environ.setdefault("MAX_TOKENS", "512")
        os.environ.setdefault("NUM_THREADS", "2")
        os.environ.setdefault("LLM_TEMPERATURE", "0.9")
        os.environ.setdefault("VAD_MODEL", DEFAULT_VAD_MODEL)
        os.environ.setdefault("WHISPER_MODEL", DEFAULT_WHISPER_MODEL)

        pipeline_path = str(self.pipeline_dir)
        if pipeline_path not in sys.path:
            sys.path.insert(0, pipeline_path)

        # The attached repo's Settings class uses env_file=".env".
        # Import it from its own directory so it does not parse this backend's .env.
        current_cwd = os.getcwd()
        os.chdir(self.pipeline_dir)
        try:
            from src.utils.audio_queue import AudioGenerationQueue
            from src.utils.config import settings
            from src.utils.generator import VoiceGenerator
            from src.utils.llm import filter_response, get_ai_response, parse_stream_chunk
            from src.utils.text_chunker import TextChunker
        finally:
            os.chdir(current_cwd)

        self.settings = settings
        self.settings.setup_directories()
        self.VoiceGenerator = VoiceGenerator
        self.TextChunker = TextChunker
        self.AudioGenerationQueue = AudioGenerationQueue
        self.get_ai_response = get_ai_response
        self.parse_stream_chunk = parse_stream_chunk
        self.filter_response = filter_response
        self._imports_loaded = True

    def warmup_async(self) -> None:
        if self.warmup_started or self._models_loaded:
            return
        self.warmup_started = True

        def warmup_runner():
            global _mount_error
            try:
                self.load_models()
            except Exception as exc:
                _mount_error = f"On-device S2S warmup failed: {exc}"
                logger.exception("On-device S2S warmup failed.")

        self._warmup_thread = threading.Thread(target=warmup_runner, daemon=True)
        self._warmup_thread.start()

    def load_models(self) -> None:
        with self._load_lock:
            if self._models_loaded:
                return

            import torch
            from pyannote.audio import Model
            from pyannote.audio.pipelines import VoiceActivityDetection
            from transformers import WhisperForConditionalGeneration, WhisperProcessor

            self.torch = torch
            self.device = "cuda" if torch.cuda.is_available() else "cpu"

            logger.info("Loading Kokoro voice generator from %s", self.pipeline_dir)
            self.generator = self.VoiceGenerator(self.settings.MODELS_DIR, self.settings.VOICES_DIR)
            self.generator.initialize(self.settings.TTS_MODEL, self.settings.VOICE_NAME)
            self.tts_loaded = True

            logger.info("Loading Whisper model %s", self.settings.WHISPER_MODEL)
            self.whisper_processor = WhisperProcessor.from_pretrained(self.settings.WHISPER_MODEL)
            self.whisper_model = WhisperForConditionalGeneration.from_pretrained(self.settings.WHISPER_MODEL)
            self.whisper_loaded = True

            logger.info("Loading Pyannote VAD model %s", self.settings.VAD_MODEL)
            self._patch_speechbrain_lazy_modules()
            model = self._load_pyannote_model(Model)
            if model is None:
                raise RuntimeError("Pyannote VAD model could not be loaded.")
            self.vad_pipeline = VoiceActivityDetection(segmentation=model)
            self.vad_pipeline.instantiate(
                {
                    "min_duration_on": self.settings.VAD_MIN_DURATION_ON,
                    "min_duration_off": self.settings.VAD_MIN_DURATION_OFF,
                }
            )
            self.vad_loaded = True
            self._models_loaded = True

    def _patch_speechbrain_lazy_modules(self) -> None:
        """Avoid a Windows inspect.stack interaction with SpeechBrain lazy modules."""
        try:
            from speechbrain.utils.importutils import LazyModule
        except Exception:
            return

        if not getattr(LazyModule, "_finwise_windows_patch", False):
            original_getattr = LazyModule.__getattr__
            original_init = LazyModule.__init__

            def patched_init(module, *args, **kwargs):
                original_init(module, *args, **kwargs)
                module.__dict__["__file__"] = ""

            def patched_getattr(module, attr):
                if attr == "__file__":
                    return ""
                return original_getattr(module, attr)

            LazyModule.__init__ = patched_init
            LazyModule.__getattr__ = patched_getattr
            LazyModule.__file__ = ""
            LazyModule._finwise_windows_patch = True

        for module in list(sys.modules.values()):
            if isinstance(module, LazyModule):
                module.__dict__["__file__"] = ""

    def _load_pyannote_model(self, Model):
        import inspect

        original_stack = inspect.stack

        def safe_stack(*args, **kwargs):
            try:
                return original_stack(*args, **kwargs)
            except TypeError:
                return []

        inspect.stack = safe_stack
        try:
            return Model.from_pretrained(
                self.settings.VAD_MODEL,
                use_auth_token=self.settings.HUGGINGFACE_TOKEN,
            )
        finally:
            inspect.stack = original_stack

    def detect_speech_segments(self, audio_data, sample_rate: int):
        import numpy as np
        import torch
        from torch.nn.functional import pad

        if len(audio_data.shape) == 1:
            audio_data = audio_data.reshape(1, -1)

        if not isinstance(audio_data, torch.Tensor):
            audio_data = torch.from_numpy(audio_data)

        if audio_data.shape[1] < sample_rate:
            audio_data = pad(audio_data, (0, sample_rate - audio_data.shape[1]))

        vad = self.vad_pipeline({"waveform": audio_data, "sample_rate": sample_rate})
        speech_segments = []
        for speech in vad.get_timeline().support():
            start_sample = int(speech.start * sample_rate)
            end_sample = min(int(speech.end * sample_rate), audio_data.shape[1])
            if start_sample < audio_data.shape[1]:
                speech_segments.append(audio_data[0, start_sample:end_sample])

        if speech_segments:
            return torch.cat(speech_segments)
        return None

    def transcribe(self, audio_data, sample_rate: int) -> str:
        self.load_models()
        speech_segments = self.detect_speech_segments(audio_data, sample_rate)
        if speech_segments is None:
            return ""

        if hasattr(speech_segments, "numpy"):
            speech_segments = speech_segments.numpy()

        input_features = self.whisper_processor(
            speech_segments,
            sampling_rate=sample_rate,
            return_tensors="pt",
        ).input_features
        predicted_ids = self.whisper_model.generate(input_features)
        transcription = self.whisper_processor.batch_decode(predicted_ids, skip_special_tokens=True)
        return clean_spoken_text(transcription[0] if transcription else "")


def _create_on_device_handler():
    import numpy as np
    from fastrtc.tracks import StreamHandler
    from fastrtc.utils import create_message

    class OnDeviceSpeechToSpeechHandler(StreamHandler):
        def __init__(self):
            runtime = _get_runtime()
            super().__init__(
                expected_layout="mono",
                output_sample_rate=runtime.settings.OUTPUT_SAMPLE_RATE,
                input_sample_rate=runtime.settings.RATE,
            )
            self.runtime = runtime
            self.turn_queue = queue.Queue()
            self.output_queue = queue.Queue()
            self.stop_event = threading.Event()
            self.interrupt_event = threading.Event()
            self.worker_thread = None
            self.recording = False
            self.frames = []
            self.buffer_frames = []
            self.silence_duration = 0.0
            self.responding = False
            self.input_lock = threading.Lock()

        def copy(self):
            return OnDeviceSpeechToSpeechHandler()

        def start_up(self):
            self.runtime.warmup_async()
            self.worker_thread = threading.Thread(target=self._process_turns, daemon=True)
            self.worker_thread.start()

        def shutdown(self):
            self.stop_event.set()
            self.interrupt_event.set()
            self._clear_output()
            if self.worker_thread and self.worker_thread.is_alive():
                self.worker_thread.join(timeout=1)

        def receive(self, frame: Tuple[int, object]) -> None:
            sample_rate, array = frame
            audio = np.squeeze(array)
            if audio.size == 0:
                return
            if audio.dtype == np.int16:
                audio = audio.astype(np.float32) / 32768.0
            else:
                audio = audio.astype(np.float32)

            level = float(np.abs(audio).mean())
            chunk_duration = len(audio) / float(sample_rate)
            settings = self.runtime.settings
            buffer_limit = max(1, int(settings.ROLLING_BUFFER_TIME * sample_rate / max(1, len(audio))))

            with self.input_lock:
                self.buffer_frames.append(audio)
                if len(self.buffer_frames) > buffer_limit:
                    self.buffer_frames.pop(0)

                if level > settings.SILENCE_THRESHOLD:
                    if self.responding and settings.ENABLE_INTERRUPTION:
                        self.interrupt_event.set()
                        self._clear_output()

                    if not self.recording:
                        self.send_message_sync(create_message("log", "started_talking"))
                        self.recording = True
                        self.frames = list(self.buffer_frames)

                    self.frames.append(audio)
                    self.silence_duration = 0.0
                    return

                if not self.recording:
                    return

                self.frames.append(audio)
                self.silence_duration += chunk_duration
                if self.silence_duration >= settings.MAX_SILENCE_DURATION:
                    captured = np.concatenate(self.frames).astype(np.float32)
                    self.frames = []
                    self.recording = False
                    self.silence_duration = 0.0
                    if captured.size:
                        self.turn_queue.put((int(sample_rate), captured))

        def emit(self):
            if self.stop_event.is_set():
                return None

            try:
                audio = self.output_queue.get(timeout=0.05)
            except queue.Empty:
                return None

            if audio is None:
                return None

            return self.runtime.settings.OUTPUT_SAMPLE_RATE, audio.astype(np.float32)

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
                    sample_rate, audio_data = self.turn_queue.get(timeout=0.1)
                except queue.Empty:
                    continue

                self.interrupt_event.clear()
                self.send_message_sync(create_message("log", "pause_detected"))
                self.responding = True
                try:
                    transcript = self.runtime.transcribe(audio_data, sample_rate)
                    if self.interrupt_event.is_set():
                        continue
                    if not transcript:
                        self._queue_direct_tts("I did not catch that. Please say it again.")
                        continue

                    self._stream_reply(transcript)
                except Exception:
                    logger.exception("On-device speech-to-speech turn failed.")
                    self._queue_direct_tts("Something went wrong with the voice pipeline.")
                finally:
                    self.responding = False

        def _build_system_prompt(self):
            db = SessionLocal()
            try:
                avatar_context = AIService().build_context(db, section="avatar")
            finally:
                db.close()
            return f"{self.runtime.settings.DEFAULT_SYSTEM_PROMPT}\n\n{avatar_context}"

        def _stream_reply(self, transcript: str):
            messages = [
                {"role": "system", "content": self._build_system_prompt()},
                {"role": "user", "content": transcript},
            ]
            response_stream = self.runtime.get_ai_response(
                session=self.runtime.session,
                messages=messages,
                llm_model=self.runtime.settings.LLM_MODEL,
                llm_url=self.runtime.settings.OLLAMA_URL,
                max_tokens=self.runtime.settings.MAX_TOKENS,
                temperature=self.runtime.settings.LLM_TEMPERATURE,
                stream=True,
            )
            if not response_stream:
                self._queue_direct_tts("I could not reach the local language model.")
                return

            audio_queue = self.runtime.AudioGenerationQueue(
                self.runtime.generator,
                self.runtime.settings.SPEED,
                output_dir=Path("generated_audio"),
            )
            audio_queue.start()
            chunker = self.runtime.TextChunker()
            forward_thread = threading.Thread(
                target=self._forward_generated_audio,
                args=(audio_queue,),
                daemon=True,
            )
            forward_thread.start()

            try:
                for chunk in response_stream:
                    if self.interrupt_event.is_set() or self.stop_event.is_set():
                        break
                    data = self.runtime.parse_stream_chunk(chunk)
                    if not data or "choices" not in data:
                        continue
                    choice = data["choices"][0]
                    if "delta" in choice and "content" in choice["delta"]:
                        content = choice["delta"]["content"]
                        if content:
                            chunker.current_text.append(content)
                            text = "".join(chunker.current_text)
                            if chunker.should_process(text):
                                remaining = chunker.process(text, audio_queue)
                                chunker.current_text = [remaining]
                    if choice.get("finish_reason") == "stop":
                        break

                final_text = "".join(chunker.current_text).strip()
                if final_text and not self.interrupt_event.is_set():
                    chunker.process(final_text, audio_queue)
            finally:
                audio_queue.stop()
                forward_thread.join(timeout=2)

        def _forward_generated_audio(self, audio_queue):
            first_chunk = True
            while not self.stop_event.is_set() and not self.interrupt_event.is_set():
                audio_data, _ = audio_queue.get_next_audio()
                if audio_data is not None:
                    if first_chunk:
                        self.send_message_sync(create_message("log", "response_starting"))
                        first_chunk = False
                    self.output_queue.put(audio_data)
                    continue

                if (
                    not audio_queue.is_running
                    and audio_queue.sentence_queue.empty()
                    and audio_queue.audio_queue.empty()
                ):
                    break
                time.sleep(self.runtime.settings.PLAYBACK_DELAY)

        def _queue_direct_tts(self, text: str):
            try:
                audio, _ = self.runtime.generator.generate(text, speed=self.runtime.settings.SPEED)
                if audio is not None and len(audio):
                    self.send_message_sync(create_message("log", "response_starting"))
                    self.output_queue.put(audio)
            except Exception:
                logger.exception("Failed to synthesize fallback voice response.")

    return OnDeviceSpeechToSpeechHandler()
