import asyncio
import base64
import os
import re
import tempfile
import time
from typing import Dict, List, Tuple

from app.services.ai_service import AIService
from app.services.phoneme_service import (
    text_to_grouped_viseme_sequence,
    text_to_phonemes,
    text_to_viseme_sequence,
)
from app.services.stt_service import STTService
from app.services.tts_service import cleanup_old_files, generate_speech


def clean_spoken_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def split_speakable_segments(buffer: str, force: bool = False) -> Tuple[List[str], str]:
    """Return completed speech segments and unconsumed remainder."""
    buffer = buffer or ""
    if not buffer.strip():
        return [], ""

    segments: List[str] = []
    consumed = 0

    for match in re.finditer(r"[.!?](?=\s|$)", buffer):
        end = match.end()
        while end < len(buffer) and buffer[end].isspace():
            end += 1
        segment = clean_spoken_text(buffer[consumed:end])
        if segment:
            segments.extend(split_long_segment(segment))
        consumed = end

    if force and consumed < len(buffer):
        segment = clean_spoken_text(buffer[consumed:])
        if segment:
            segments.extend(split_long_segment(segment))
        consumed = len(buffer)

    return segments, buffer[consumed:]


def split_long_segment(segment: str, max_length: int = 260) -> List[str]:
    if len(segment) <= max_length:
        return [segment]

    result: List[str] = []
    remaining = segment
    while len(remaining) > max_length:
        split_at = max(
            remaining.rfind(",", 0, max_length),
            remaining.rfind(";", 0, max_length),
            remaining.rfind(" ", 0, max_length),
        )
        if split_at < 80:
            split_at = max_length
        result.append(remaining[:split_at].strip())
        remaining = remaining[split_at:].strip()
    if remaining:
        result.append(remaining)
    return result


class AvatarRealtimeService:
    def __init__(self, websocket, db):
        self.websocket = websocket
        self.db = db
        self.stt = STTService()
        self.ai = AIService()
        self.audio_chunks: List[bytes] = []
        self.mime_type = "audio/webm"
        self.turn_id = 0
        self.gender = "male"
        self.timings: Dict[str, float] = {}

    async def send(self, payload: dict):
        payload.setdefault("turn_id", self.turn_id)
        await self.websocket.send_json(payload)

    async def start_turn(self, gender: str = "male"):
        self.turn_id += 1
        self.gender = gender or "male"
        self.audio_chunks = []
        self.timings = {"turn_started": time.perf_counter()}
        await self.send({"type": "state", "value": "listening"})

    async def add_audio_chunk(self, data_b64: str, mime_type: str = None):
        if mime_type:
            self.mime_type = mime_type
        if not data_b64:
            return
        self.audio_chunks.append(base64.b64decode(data_b64))

    async def interrupt(self):
        self.turn_id += 1
        self.audio_chunks = []
        await self.send({"type": "state", "value": "interrupted"})

    async def finish_utterance(self, respond: bool = True):
        current_turn = self.turn_id
        if not self.audio_chunks:
            await self.send({"type": "no_speech", "message": "No audio was received."})
            return

        await self.send({"type": "state", "value": "transcribing"})
        suffix = self._suffix_for_mime(self.mime_type)

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            for chunk in self.audio_chunks:
                temp_file.write(chunk)
            temp_path = temp_file.name

        try:
            result = await asyncio.to_thread(self.stt.transcribe_file, temp_path)
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

        text = clean_spoken_text(result.text)
        await self.send({
            "type": "final_transcript",
            "text": text,
            "stt": {
                "engine": result.engine,
                "model": result.model,
                "device": result.device,
                "compute_type": result.compute_type,
                "duration_ms": result.duration_ms,
            },
        })

        if not text:
            await self.send({"type": "no_speech", "message": "No speech detected."})
            return

        if respond and current_turn == self.turn_id:
            await self.stream_assistant_response(text, current_turn)

    async def stream_assistant_response(self, prompt: str, turn_id: int):
        await self.send({"type": "state", "value": "thinking"})
        await self.send({"type": "assistant_start"})

        buffer = ""
        full_text = ""
        first_delta_sent = False

        try:
            for delta in self.ai.generate_stream(prompt, self.db, section="avatar", history=[]):
                if turn_id != self.turn_id:
                    return

                if delta:
                    if not first_delta_sent:
                        first_delta_sent = True
                        await self.send({"type": "metric", "name": "llm_first_delta"})

                    full_text += delta
                    buffer += delta
                    await self.send({"type": "assistant_text_delta", "text": delta})

                    segments, buffer = split_speakable_segments(buffer, force=False)
                    for segment in segments:
                        if turn_id != self.turn_id:
                            return
                        await self.send_speech_chunk(segment, turn_id)

            segments, buffer = split_speakable_segments(buffer, force=True)
            for segment in segments:
                if turn_id != self.turn_id:
                    return
                await self.send_speech_chunk(segment, turn_id)

            await self.send({"type": "assistant_done", "text": clean_spoken_text(full_text)})
            await self.send({"type": "state", "value": "idle"})
        except Exception as e:
            await self.send({"type": "error", "message": str(e)})
            await self.send({"type": "state", "value": "error"})

    async def send_speech_chunk(self, text: str, turn_id: int):
        if not text:
            return

        await self.send({"type": "state", "value": "synthesizing"})
        cleanup_old_files()
        started = time.perf_counter()
        voice_id = "en-US-ChristopherNeural" if self.gender == "male" else "en-US-JennyNeural"
        audio_path = await generate_speech(text, voice=voice_id, gender=self.gender)
        tts_duration_ms = int((time.perf_counter() - started) * 1000)

        if turn_id != self.turn_id:
            return

        audio_url = self._audio_url(audio_path)
        viseme_data = text_to_viseme_sequence(text, "en-us")
        grouped_viseme_data = text_to_grouped_viseme_sequence(text, "en-us")

        await self.send({
            "type": "speech_chunk",
            "text": text,
            "audio_url": audio_url,
            "visemes": viseme_data,
            "grouped_visemes": grouped_viseme_data,
            "phonemes": text_to_phonemes(text, "en-us").split(" "),
            "metrics": {
                "tts_duration_ms": tts_duration_ms,
            },
        })

    def _audio_url(self, audio_path: str) -> str:
        scheme = "https" if self.websocket.url.scheme == "wss" else "http"
        host = self.websocket.headers.get("host", "127.0.0.1:8000")
        normalized = audio_path.replace(os.path.sep, "/")
        return f"{scheme}://{host}/{normalized}"

    def _suffix_for_mime(self, mime_type: str) -> str:
        mime = (mime_type or "").lower()
        if "ogg" in mime:
            return ".ogg"
        if "mp4" in mime or "m4a" in mime:
            return ".m4a"
        if "wav" in mime:
            return ".wav"
        return ".webm"
