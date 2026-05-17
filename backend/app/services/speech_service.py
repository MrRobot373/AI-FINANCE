import os
import io
import logging
import shutil
import sys
from pathlib import Path
import numpy as np
import torch
import whisper

logger = logging.getLogger(__name__)

class SpeechService:
    """Singleton service for Speech-to-Text using OpenAI Whisper."""
    
    _instance = None
    _model = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        self._ensure_ffmpeg_on_path()
        if SpeechService._model is None:
            model_size = os.getenv("WHISPER_MODEL", "base")
            logger.info(f"[SPEECH] Loading Whisper model: {model_size}")
            SpeechService._model = whisper.load_model(model_size)
            logger.info("[SPEECH] Whisper model loaded successfully")

    def _ensure_ffmpeg_on_path(self):
        """
        Browser MediaRecorder usually sends webm/ogg audio. Whisper needs an
        ffmpeg executable to decode those files; imageio-ffmpeg provides a
        bundled binary when system ffmpeg is not installed.
        """
        try:
            import imageio_ffmpeg

            ffmpeg_path = Path(imageio_ffmpeg.get_ffmpeg_exe()).resolve()
            if os.name == "nt":
                ffmpeg_alias = Path(sys.executable).resolve().parent / "ffmpeg.exe"
                if not ffmpeg_alias.exists():
                    shutil.copyfile(ffmpeg_path, ffmpeg_alias)
                ffmpeg_dir = str(ffmpeg_alias.parent)
            else:
                ffmpeg_dir = str(ffmpeg_path.parent)

            path_parts = os.environ.get("PATH", "").split(os.pathsep)
            if ffmpeg_dir not in path_parts:
                os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
        except Exception as e:
            logger.warning(f"[SPEECH] Could not configure bundled ffmpeg: {e}")

    def transcribe(self, audio_bytes: bytes, sample_rate: int = 16000) -> str:
        """
        Transcribe raw audio bytes to text using Whisper.
        
        Args:
            audio_bytes: Raw audio data (WAV format)
            sample_rate: Sample rate of the audio (default 16000)
            
        Returns:
            Transcribed text string
        """
        try:
            import soundfile as sf
            
            # Read audio from bytes
            audio_data, sr = sf.read(io.BytesIO(audio_bytes))
            
            # Convert to mono if stereo
            if len(audio_data.shape) > 1:
                audio_data = audio_data.mean(axis=1)
            
            # Convert to float32 numpy array
            audio_np = audio_data.astype(np.float32)
            
            # Resample to 16kHz if needed (Whisper expects 16kHz)
            if sr != 16000:
                import librosa
                audio_np = librosa.resample(audio_np, orig_sr=sr, target_sr=16000)
            
            # Transcribe
            result = SpeechService._model.transcribe(
                audio_np,
                fp16=torch.cuda.is_available(),
                language="en"
            )
            
            text = result["text"].strip()
            logger.info(f"[SPEECH] Transcribed: {text[:80]}...")
            return text
            
        except Exception as e:
            logger.error(f"[SPEECH] Transcription failed: {str(e)}")
            raise

    def transcribe_file(self, audio_path: str) -> str:
        """
        Transcribe an audio file using Whisper/ffmpeg. This supports browser
        MediaRecorder formats such as webm/ogg as well as wav/mp3.
        """
        try:
            result = SpeechService._model.transcribe(
                audio_path,
                fp16=torch.cuda.is_available(),
                language="en"
            )
            text = result["text"].strip()
            logger.info(f"[SPEECH] Transcribed file: {text[:80]}...")
            return text
        except Exception as e:
            logger.error(f"[SPEECH] File transcription failed: {str(e)}")
            raise
