from fastapi import APIRouter
from pydantic import BaseModel

from app.services.fastrtc_voice_service import get_fastrtc_voice_health, set_fastrtc_avatar_voice

router = APIRouter()


class AvatarVoiceRequest(BaseModel):
    webrtc_id: str
    gender: str
    voice: str | None = None


@router.get("/rtc/health")
def fastrtc_voice_health():
    return get_fastrtc_voice_health()


@router.post("/rtc/voice")
def fastrtc_avatar_voice(request: AvatarVoiceRequest):
    return set_fastrtc_avatar_voice(
        webrtc_id=request.webrtc_id,
        gender=request.gender,
        voice=request.voice,
    )
