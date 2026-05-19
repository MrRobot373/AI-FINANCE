from fastapi import APIRouter

from app.services.fastrtc_voice_service import get_fastrtc_voice_health

router = APIRouter()


@router.get("/rtc/health")
def fastrtc_voice_health():
    return get_fastrtc_voice_health()
