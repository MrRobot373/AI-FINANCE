import asyncio
import os
import shutil
import sys
import time
import uuid
from pathlib import Path

import requests
from dotenv import load_dotenv


load_dotenv()

AUDIO_DIR = Path("generated_audio")
AUDIO_DIR.mkdir(exist_ok=True)

PIPER_MODEL_DIR = Path(os.getenv("PIPER_MODEL_DIR", "models/piper"))
PIPER_MODEL_DIR.mkdir(parents=True, exist_ok=True)

PIPER_VOICES = {
    "male": os.getenv("PIPER_MALE_VOICE", "en_US-ryan-medium"),
    "female": os.getenv("PIPER_FEMALE_VOICE", "en_US-lessac-medium"),
}

OPENAI_TTS_API_ENDPOINT = (
    os.getenv("OPENAI_TTS_API_ENDPOINT")
    or os.getenv("TTS_API_ENDPOINT")
    or os.getenv("VOCALIS_TTS_API_ENDPOINT")
)
OPENAI_TTS_MODEL = os.getenv("OPENAI_TTS_MODEL", os.getenv("TTS_MODEL", "tts-1"))
OPENAI_TTS_FORMAT = os.getenv("OPENAI_TTS_FORMAT", os.getenv("TTS_FORMAT", "wav"))
OPENAI_TTS_SPEED = float(os.getenv("OPENAI_TTS_SPEED", os.getenv("TTS_SPEED", "1.0")))
OPENAI_TTS_TIMEOUT = int(os.getenv("OPENAI_TTS_TIMEOUT", os.getenv("TTS_TIMEOUT", "60")))

MAX_FILE_AGE_SECONDS = 300


def _piper_executable() -> str:
    scripts_dir = Path(sys.executable).resolve().parent
    local_piper = scripts_dir / ("piper.exe" if os.name == "nt" else "piper")
    if local_piper.exists():
        return str(local_piper)

    piper = shutil.which("piper")
    if piper:
        return piper

    raise RuntimeError("piper executable was not found. Install piper-tts in the backend venv.")


async def _ensure_piper_voice(voice_name: str) -> Path:
    model_path = PIPER_MODEL_DIR / f"{voice_name}.onnx"
    config_path = PIPER_MODEL_DIR / f"{voice_name}.onnx.json"

    if model_path.exists() and config_path.exists():
        return model_path

    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "piper.download_voices",
        "--download-dir",
        str(PIPER_MODEL_DIR),
        voice_name,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    if process.returncode != 0:
        raise RuntimeError(
            f"Failed to download Piper voice {voice_name}: "
            f"{stderr.decode(errors='ignore') or stdout.decode(errors='ignore')}"
        )

    if not model_path.exists():
        raise RuntimeError(f"Piper voice downloaded but model is missing: {model_path}")

    return model_path


async def _generate_with_piper(text: str, gender: str = "male") -> str:
    voice_name = PIPER_VOICES.get(gender, PIPER_VOICES["male"])
    model_path = await _ensure_piper_voice(voice_name)
    file_path = AUDIO_DIR / f"{uuid.uuid4()}.wav"

    process = await asyncio.create_subprocess_exec(
        _piper_executable(),
        "-m",
        str(model_path),
        "-f",
        str(file_path),
        "--length-scale",
        os.getenv("PIPER_LENGTH_SCALE", "0.95"),
        "--sentence-silence",
        os.getenv("PIPER_SENTENCE_SILENCE", "0.18"),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate(text.encode("utf-8"))

    if process.returncode != 0:
        raise RuntimeError(
            f"Piper synthesis failed: {stderr.decode(errors='ignore') or stdout.decode(errors='ignore')}"
        )

    if not file_path.exists() or file_path.stat().st_size == 0:
        raise RuntimeError("Piper synthesis did not produce an audio file.")

    return str(file_path)


def _openai_compatible_voice(gender: str = "male") -> str:
    gender_key = "FEMALE" if gender == "female" else "MALE"
    return (
        os.getenv(f"OPENAI_TTS_{gender_key}_VOICE")
        or os.getenv(f"TTS_{gender_key}_VOICE")
        or os.getenv("OPENAI_TTS_VOICE")
        or os.getenv("TTS_VOICE")
        or "tara"
    )


async def _generate_with_openai_compatible_tts(text: str, gender: str = "male") -> str:
    if not OPENAI_TTS_API_ENDPOINT:
        raise RuntimeError("OpenAI-compatible TTS endpoint is not configured.")

    output_format = OPENAI_TTS_FORMAT.lstrip(".").lower()
    file_path = AUDIO_DIR / f"{uuid.uuid4()}.{output_format}"
    payload = {
        "model": OPENAI_TTS_MODEL,
        "input": text,
        "voice": _openai_compatible_voice(gender),
        "response_format": output_format,
        "speed": OPENAI_TTS_SPEED,
    }

    def request_audio() -> bytes:
        response = requests.post(
            OPENAI_TTS_API_ENDPOINT,
            json=payload,
            timeout=OPENAI_TTS_TIMEOUT,
        )
        response.raise_for_status()
        return response.content

    audio = await asyncio.to_thread(request_audio)
    if not audio:
        raise RuntimeError("OpenAI-compatible TTS endpoint returned empty audio.")

    file_path.write_bytes(audio)
    return str(file_path)


async def _generate_with_edge_or_gtts(text: str, voice: str) -> str:
    file_path = AUDIO_DIR / f"{uuid.uuid4()}.mp3"

    try:
        import edge_tts

        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(str(file_path))
    except Exception as e:
        print(f"Edge TTS failed, falling back to Google TTS: {e}")
        try:
            from gtts import gTTS

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, lambda: gTTS(text=text, lang="en").save(str(file_path)))
        except Exception as e2:
            print(f"Both fallback TTS services failed: {e2}")
            raise RuntimeError(f"TTS generation failed: {e2}")

    return str(file_path)


async def generate_speech(
    text: str,
    voice: str = "en-US-ChristopherNeural",
    gender: str = "male",
) -> str:
    """
    Generate speech from text. Piper is the primary local open-source engine.
    Edge/gTTS are kept as a fallback only so the avatar can still speak if a
    local Piper voice is missing or corrupted.
    """
    if not text or not text.strip():
        raise RuntimeError("No text supplied for TTS generation.")

    if OPENAI_TTS_API_ENDPOINT:
        try:
            return await _generate_with_openai_compatible_tts(text, gender=gender)
        except Exception as e:
            print(f"OpenAI-compatible TTS failed, falling back to Piper: {e}")

    try:
        return await _generate_with_piper(text, gender=gender)
    except Exception as e:
        print(f"Piper TTS failed, falling back to network TTS: {e}")
        return await _generate_with_edge_or_gtts(text, voice)


async def generate_piper_speech(text: str, gender: str = "male") -> str:
    """Generate local Piper speech without trying remote/OpenAI-compatible TTS first."""
    if not text or not text.strip():
        raise RuntimeError("No text supplied for TTS generation.")

    return await _generate_with_piper(text, gender=gender)


def cleanup_old_files():
    current_time = time.time()

    try:
        if not AUDIO_DIR.exists():
            return

        audio_files = []
        for pattern in ("*.mp3", "*.wav", "*.opus", "*.aac", "*.flac"):
            audio_files.extend(AUDIO_DIR.glob(pattern))

        for file_path in audio_files:
            try:
                if current_time - file_path.stat().st_mtime > MAX_FILE_AGE_SECONDS:
                    file_path.unlink()
            except Exception as e:
                print(f"Error deleting file {file_path}: {e}")
    except Exception as e:
        print(f"Error during cleanup: {e}")
