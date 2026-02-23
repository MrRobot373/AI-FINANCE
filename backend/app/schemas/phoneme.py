from pydantic import BaseModel
from typing import List


class PhonemeRequest(BaseModel):
    """Request model for text-to-phoneme conversion"""
    text: str
    language: str = 'en-us'



class VisemeFrame(BaseModel):
    """Single viseme frame with timing information and shape keys"""
    viseme: str
    start: float
    duration: float
    shape_keys: dict = {}  # Optional shape keys for this viseme


class PhonemeResponse(BaseModel):
    """Response model containing phonemes and viseme sequence"""
    text: str
    phonemes: str  # IPA representation
    visemes: List[VisemeFrame]
    total_duration: float
