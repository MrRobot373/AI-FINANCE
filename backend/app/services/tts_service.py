import os
import uuid
import time
import asyncio
from pathlib import Path

# Directory for generated audio
AUDIO_DIR = Path("generated_audio")
AUDIO_DIR.mkdir(exist_ok=True)

# Cleanup configuration
MAX_FILE_AGE_SECONDS = 300  # 5 minutes

async def generate_speech(text: str, voice: str = "en-US-ChristopherNeural") -> str:
    """
    Generate speech from text using edge-tts (high quality) with gTTS fallback.
    
    Args:
        text (str): The text to speak
        voice (str): The edge-tts voice to use
        
    Returns:
        str: Relative path to the generated audio file (e.g., "generated_audio/xyz.mp3")
    """
    filename = f"{uuid.uuid4()}.mp3"
    file_path = AUDIO_DIR / filename
    
    try:
        # 1. Try Edge TTS (High Quality)
        import edge_tts
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(str(file_path))
        
    except Exception as e:
        print(f"⚠️ Edge TTS failed, falling back to Google TTS: {e}")
        try:
            # 2. Fallback to gTTS (Standard Quality)
            from gtts import gTTS
            
            # gTTS is synchronous, run in executor to avoid blocking event loop
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, lambda: gTTS(text=text, lang='en').save(str(file_path)))
            
        except Exception as e2:
            print(f"❌ Both TTS services failed: {e2}")
            raise RuntimeError(f"TTS generation failed: {e2}")

    return str(file_path)

def cleanup_old_files():
    """
    Remove audio files older than MAX_FILE_AGE_SECONDS to prevent disk fill-up.
    Should be called periodically or before generating new files.
    """
    current_time = time.time()
    
    try:
        if not AUDIO_DIR.exists():
            return

        for file_path in AUDIO_DIR.glob("*.mp3"):
            try:
                # Check file modification time
                if current_time - file_path.stat().st_mtime > MAX_FILE_AGE_SECONDS:
                    file_path.unlink()
                    # print(f"Deleted old audio file: {file_path.name}")
            except Exception as e:
                print(f"Error deleting file {file_path}: {e}")
                
    except Exception as e:
        print(f"Error during cleanup: {e}")
