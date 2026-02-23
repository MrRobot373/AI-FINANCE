from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from app.schemas.phoneme import PhonemeRequest, PhonemeResponse, VisemeFrame
from typing import List
from app.services.phoneme_service import (
    text_to_phonemes,
    text_to_viseme_sequence,
    text_to_grouped_viseme_sequence,
    estimate_duration,
    _g2p_backend,
)

router = APIRouter()


@router.post("/text-to-visemes", response_model=PhonemeResponse)
async def convert_text_to_visemes(request: PhonemeRequest):
    """
    Convert text to timed viseme sequence using Phonemizer
    
    Args:
        request: PhonemeRequest containing text and optional language
    
    Returns:
        PhonemeResponse with IPA phonemes and viseme sequence
    
    Example:
        POST /api/v1/phoneme/text-to-visemes
        {
            "text": "hello world",
            "language": "en-us"
        }
    """
    try:
        # Validate input
        if not request.text or request.text.strip() == '':
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        
        # Get IPA phonemes
        phonemes = text_to_phonemes(request.text, request.language)
        
        # Convert to viseme sequence
        viseme_data = text_to_viseme_sequence(request.text, request.language)
        
        # Convert to Pydantic models
        visemes = [VisemeFrame(**v) for v in viseme_data]
        
        # Calculate total duration
        total_duration = estimate_duration(request.text, request.language)
        
        return PhonemeResponse(
            text=request.text,
            phonemes=phonemes,
            visemes=visemes,
            total_duration=total_duration
        )
    
    except Exception as e:
        # Log error and return meaningful message
        print(f"Error in text-to-visemes: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to convert text to visemes: {str(e)}"
        )



# Audio upload endpoint removed - user requested text-only support



@router.get("/health")
async def phoneme_health_check():
    """
    Health check endpoint for phoneme service
    
    Returns:
        Status of the phoneme service
    """
    try:
        # Test phonemizer with a simple word
        test_phonemes = text_to_phonemes("test", "en-us")
        
        return {
            "status": "healthy",
            "backend": _g2p_backend,
            "test_output": test_phonemes
        }

    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }


@router.post("/tts-to-visemes", response_model=dict)
async def convert_tts_to_visemes(request: PhonemeRequest, req: Request = None):
    """
    Generate audio from text using edge-tts and return visemes + audio URL.
    Uses direct text → ARPABET → shape keys conversion (LOGIOS + Custom Mappings).
    
    Args:
        request: PhonemeRequest with text
        
    Returns:
        JSON with:
        - audio_url: URL to generated MP3
        - visemes: List of viseme frames
    """
    import os
    from app.services.tts_service import generate_speech, cleanup_old_files
    from app.services.phoneme_service import text_to_viseme_sequence
    from fastapi import Request
    
    try:
        if not request.text or not request.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")

        # Cleanup old files occasionally
        cleanup_old_files()

        # Generate audio (mp3)
        audio_path = await generate_speech(request.text)
        
        # Process TEXT to visemes (Direct LOGIOS approach)
        # Generate both regular visemes (for backward compatibility) and grouped visemes (NEW)
        viseme_data = text_to_viseme_sequence(request.text, request.language)
        grouped_viseme_data = text_to_grouped_viseme_sequence(request.text, request.language)
        
        # Construct public URL
        # If behind proxy (ngrok etc) this might need adjustment, but for localhost it's fine
        base_url = str(req.base_url).rstrip('/')
        audio_url = f"{base_url}/{audio_path.replace(os.path.sep, '/')}"
        
        return {
            "audio_url": audio_url,
            "visemes": [VisemeFrame(**v) for v in viseme_data],
            "grouped_visemes": grouped_viseme_data,  # NEW: Grouped phoneme approach
            "phonemes": text_to_phonemes(request.text, request.language).split(" ")
        }
        
    except Exception as e:
        print(f"❌ Error in tts-to-visemes: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process TTS: {str(e)}"
        )


@router.post("/phonemes")
async def extract_phonemes_from_audio(file: UploadFile = File(...)):
    """
    Extract phonemes from uploaded audio file using Allosaurus
    Returns merged viseme timeline
    
    Pipeline:
    1. Audio -> IPA phonemes (Allosaurus)
    2. IPA -> ARPABET conversion
    3. ARPABET -> Viseme mapping
    4. Viseme merging (consecutive + micro-segment removal + anticipation)
    
    Args:
        file: Audio file (wav, mp3, etc.)
        
    Returns:
        {
            "ipa_phonemes": [...],
            "arpabet_phonemes": [...],
            "visemes": [{"viseme": "OPEN", "start": 0.12, "end": 0.34}, ...]
        }
    """
    import tempfile
    import os
    from app.services.allosaurus_service import get_phonemes_from_audio, ipa_to_arpabet
    from app.services.viseme_mapper import phonemes_to_viseme_timeline
    
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        try:
            # Step 1: Extract IPA phonemes using Allosaurus
            ipa_phonemes = get_phonemes_from_audio(tmp_path)
            
            # Step 2: Convert IPA to ARPABET
            arpabet_phonemes = ipa_to_arpabet(ipa_phonemes)
            
            # Step 3: Convert ARPABET to merged viseme timeline
            viseme_timeline = phonemes_to_viseme_timeline(
                arpabet_phonemes,
                apply_anticipation=True
            )
            
            return {
                "ipa_phonemes": ipa_phonemes,
                "arpabet_phonemes": arpabet_phonemes,
                "visemes": viseme_timeline
            }
        finally:
            # Cleanup temp file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
                
    except Exception as e:
        print(f"❌ Error in phoneme extraction: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract phonemes: {str(e)}"
        )
