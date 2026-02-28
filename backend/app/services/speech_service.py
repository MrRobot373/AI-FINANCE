import os
import io
import logging
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
        if SpeechService._model is None:
            model_size = os.getenv("WHISPER_MODEL", "base")
            logger.info(f"[SPEECH] Loading Whisper model: {model_size}")
            SpeechService._model = whisper.load_model(model_size)
            logger.info("[SPEECH] Whisper model loaded successfully")

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
