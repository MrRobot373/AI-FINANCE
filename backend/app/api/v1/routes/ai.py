from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
import json
import uuid
import sys
import os

from app.db.database import get_db
from app.services.ai_service import AIService
from app.models.chat import (
    RAGChatSession, RAGChatMessage,
    AvatarChatSession, AvatarChatMessage,
    DashboardChatSession, DashboardChatMessage
)
from app.schemas.chat import ChatSession as ChatSessionSchema, ChatMessage as ChatMessageSchema, ChatSessionCreate, ChatSessionUpdate

router = APIRouter()
ai_service = AIService()

class ChatRequest(BaseModel):
    message: str
    mode: str = "chat" # This is for AI behavior (e.g. chat vs implementation)

def get_chat_models(section: str):
    section = section.lower()
    if section == "avatar":
        return AvatarChatSession, AvatarChatMessage
    elif section == "dashboard":
        return DashboardChatSession, DashboardChatMessage
    else: # Default to RAG
        return RAGChatSession, RAGChatMessage

# --- Sessions ---

@router.get("/sessions", response_model=List[ChatSessionSchema])
def get_sessions(section: str = Query("rag"), db: Session = Depends(get_db)):
    SessionModel, _ = get_chat_models(section)
    return db.query(SessionModel).order_by(SessionModel.updated_at.desc()).all()

@router.post("/sessions", response_model=ChatSessionSchema)
def create_session(session: ChatSessionCreate, section: str = Query("rag"), db: Session = Depends(get_db)):
    SessionModel, _ = get_chat_models(section)
    db_session = SessionModel(title=session.title)
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session

@router.patch("/sessions/{session_id}", response_model=ChatSessionSchema)
def update_session(session_id: str, session: ChatSessionUpdate, section: str = Query("rag"), db: Session = Depends(get_db)):
    SessionModel, _ = get_chat_models(section)
    db_session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    db_session.title = session.title
    db.commit()
    db.refresh(db_session)
    return db_session

@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, section: str = Query("rag"), db: Session = Depends(get_db)):
    SessionModel, _ = get_chat_models(section)
    db_session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    db.delete(db_session)
    db.commit()
    return

@router.get("/sessions/{session_id}/messages", response_model=List[ChatMessageSchema])
def get_messages(session_id: str, section: str = Query("rag"), db: Session = Depends(get_db)):
    SessionModel, MessageModel = get_chat_models(section)
    # Verify session exists in this section
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
         raise HTTPException(status_code=404, detail="Session not found")

    return db.query(MessageModel).filter(MessageModel.session_id == session_id).order_by(MessageModel.created_at).all()

# --- Chat ---

@router.post("/chat/{session_id}")
async def chat(session_id: str, request: ChatRequest, section: str = Query("rag"), db: Session = Depends(get_db)):
    SessionModel, MessageModel = get_chat_models(section)

    # Verify session exists
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Save User Message
    user_msg = MessageModel(session_id=session_id, role="user", content=request.message)
    db.add(user_msg)
    db.commit()

    # Fetch recent history for context (last 10 messages, excluding current user msg)
    history = db.query(MessageModel).filter(
        MessageModel.session_id == session_id,
        MessageModel.id != user_msg.id
    ).order_by(MessageModel.created_at.desc()).limit(10).all()
    history = history[::-1] # Reverse to chronological order

    def event_generator():
        full_response = ""
        try:
            # Pass section and history to AI service
            for chunk in ai_service.generate_stream(request.message, db, section, history):
                full_response += chunk
                payload = json.dumps({"content": chunk})
                yield f"data: {payload}\n\n"
            
            # Save Assistant Message after stream completes
            assistant_msg = MessageModel(session_id=session_id, role="assistant", content=full_response)
            db.add(assistant_msg)
            db.commit()
            
            # Update session timestamp
            session.updated_at = assistant_msg.created_at
            db.commit()

            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {{\"error\": \"{str(e)}\"}}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# --- Knowledge Base / RAG Admin ---

from fastapi import UploadFile, File
import os
import tempfile
from app.services.rag_service import RagService

rag_service = RagService()

@router.post("/knowledge/upload")
async def upload_knowledge_file(file: UploadFile = File(...)):
    """Upload a PDF or TXT file to the Chroma vector store."""
    try:
        # Validate file type
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext not in ['.pdf', '.txt']:
            raise HTTPException(
                status_code=400,
                detail="Invalid file format. Supported: .pdf, .txt"
            )
        
        # Save temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name
            
        try:
            # Extract text
            extracted_text = rag_service.extract_text_from_file(temp_path, file_ext)
            
            if not extracted_text.strip():
                raise HTTPException(status_code=400, detail="Could not extract text from the file.")
                
            # Embed and store
            result = rag_service.ingest_document(extracted_text, file.filename)
            
            if result.get("status") == "skipped":
                return {"message": f"File '{file.filename}' already exists in knowledge base.", "skipped": True}
                
            return {"message": "File embedded successfully", "details": result}
            
        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                os.remove(temp_path)
                
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/knowledge/files")
def get_knowledge_files():
    """Get a list of all files embedded in the Chroma vector store."""
    try:
        files = rag_service.get_stored_files()
        # Formatted specifically to match TrainingMonitor frontend needs:
        formatted = [{"id": f, "name": f, "status": "embedded", "progress": 100} for f in files]
        return formatted
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/knowledge/files/{file_id}")
def delete_knowledge_file(file_id: str):
    """Delete a file's embeddings from the database. Here file_id is the filename"""
    try:
        success = rag_service.delete_embedding_by_file_name(file_id)
        if success:
            return {"message": f"Embeddings for {file_id} deleted successfully."}
        else:
            raise HTTPException(status_code=404, detail="File not found or deletion failed.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Voice / Speech-to-Text ---

@router.post("/voice")
async def voice_to_text(audio: UploadFile = File(...)):
    """
    Accept an audio file, transcribe it using Whisper, and return the text.
    Used by the Avatar page for speech-to-speech conversations.
    """
    try:
        from app.services.stt_service import STTService
        stt_service = STTService()
        
        audio_bytes = await audio.read()
        
        if len(audio_bytes) < 100:
            raise HTTPException(status_code=400, detail="Audio file is too small or empty.")

        suffix = os.path.splitext(audio.filename or "")[1] or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(audio_bytes)
            temp_path = temp_file.name

        try:
            result = stt_service.transcribe_file(temp_path)
            text = result.text
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        
        if not text or not text.strip():
            return {"text": "", "message": "No speech detected in the audio."}
        
        return {
            "text": text.strip(),
            "stt": {
                "engine": result.engine,
                "model": result.model,
                "device": result.device,
                "compute_type": result.compute_type,
                "duration_ms": result.duration_ms,
            },
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

# Add speech_to_speech to path so we can import vad_record
try:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    finwise_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(current_dir)))))
    speech_dir = os.path.join(finwise_dir, "speech_to_speech")
    if os.path.exists(speech_dir) and speech_dir not in sys.path:
        sys.path.append(speech_dir)
except Exception:
    pass

@router.post("/voice/record_vad")
async def record_voice_with_vad():
    """
    Triggers the backend microphone to listen via Silero VAD until silence, 
    then transcribes the resulting audio file.
    """
    try:
        from app.services.speech_service import SpeechService
        try:
            from vad_record import record_with_vad
        except ImportError:
            raise HTTPException(status_code=500, detail="Could not import vad_record from speech_to_speech folder.")
        
        # 1. Record audio using the backend Silero VAD script
        print("🎙️ Starting VAD recording from backend...")
        audio_file_path = record_with_vad()
        
        if not audio_file_path or not os.path.exists(audio_file_path):
            return {"text": "", "message": "Recording failed or no audio."}
            
        # 2. Transcribe using our existing Whisper service
        with open(audio_file_path, "rb") as f:
            audio_bytes = f.read()
            
        speech_service = SpeechService()
        text = speech_service.transcribe(audio_bytes)
        print(f"Transcribed: {text}")
        
        if not text or not text.strip():
            return {"text": "", "message": "No speech detected in the audio."}
        
        return {"text": text.strip()}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"VAD Recording failed: {str(e)}")

