from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.db.database import SessionLocal
from app.services.avatar_realtime_service import AvatarRealtimeService
from app.services.stt_service import STTService

router = APIRouter()


@router.get("/health")
def realtime_voice_health():
    return {
        "status": "ready",
        "stt": STTService().health(),
        "websocket": "/api/v1/avatar/realtime",
    }


@router.websocket("/realtime")
async def avatar_realtime(websocket: WebSocket):
    await websocket.accept()
    db = SessionLocal()
    service = AvatarRealtimeService(websocket, db)

    try:
        await service.send({"type": "state", "value": "connected"})
        while True:
            message = await websocket.receive_json()
            event_type = message.get("type")

            if event_type == "start_session":
                await service.start_turn(gender=message.get("gender", "male"))
            elif event_type == "audio_chunk":
                await service.add_audio_chunk(
                    message.get("data", ""),
                    mime_type=message.get("mime_type"),
                )
            elif event_type == "end_utterance":
                await service.finish_utterance(respond=message.get("respond", True))
            elif event_type == "user_text":
                await service.start_turn(gender=message.get("gender", "male"))
                text = (message.get("text") or "").strip()
                if text:
                    await service.send({"type": "final_transcript", "text": text})
                    await service.stream_assistant_response(text, service.turn_id)
                else:
                    await service.send({"type": "no_speech", "message": "No text supplied."})
            elif event_type == "interrupt":
                await service.interrupt()
            elif event_type == "stop_session":
                await service.send({"type": "state", "value": "closed"})
                await websocket.close()
                break
            else:
                await service.send({"type": "error", "message": f"Unknown event type: {event_type}"})
    except WebSocketDisconnect:
        pass
    finally:
        db.close()
