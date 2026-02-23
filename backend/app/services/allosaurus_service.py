"""
Allosaurus service - Load model on startup, provide phoneme extraction
"""
from allosaurus.app import read_recognizer

# Global model instance
_allosaurus_model = None

def load_allosaurus_model():
    """Load Allosaurus model on server startup"""
    global _allosaurus_model
    if _allosaurus_model is None:
        print("🔄 Loading Allosaurus model...")
        try:
            # Try to load existing model
            _allosaurus_model = read_recognizer("eng2102")
            print("✅ Allosaurus model loaded")
        except (AssertionError, FileNotFoundError):
            # Model doesn't exist, need to download
            print("📥 Downloading Allosaurus model (first time only)...")
            from allosaurus.bin.download_model import download_model
            download_model("eng2102")
            _allosaurus_model = read_recognizer("eng2102")
            print("✅ Allosaurus model downloaded and loaded")
    return _allosaurus_model

def get_phonemes_from_audio(audio_path: str) -> list:
    """
    Extract phonemes from audio file using Allosaurus
    
    Args:
        audio_path: Path to audio file
        
    Returns:
        List of phoneme strings
    """
    if _allosaurus_model is None:
        raise RuntimeError("Allosaurus model not loaded. Call load_allosaurus_model() first.")
    
    # Get phoneme string from Allosaurus
    phoneme_str = _allosaurus_model.recognize(audio_path)
    
    # Split into list
    phonemes = phoneme_str.strip().split()
    
    return phonemes

# IPA to ARPABET mapping (Allosaurus outputs IPA)
IPA_TO_ARPABET = {
    # Vowels
    'ɑ': 'AA', 'a': 'AA',
    'æ': 'AE',
    'ʌ': 'AH', 'ə': 'AH',
    'ɔ': 'AO',
    'aʊ': 'AW',
    'aɪ': 'AY',
    'ɛ': 'EH', 'e': 'EH',
    'ɝ': 'ER', 'ɚ': 'ER',
    'eɪ': 'EY',
    'ɪ': 'IH',
    'i': 'IY',
    'oʊ': 'OW', 'o': 'OW',
    'ɔɪ': 'OY',
    'ʊ': 'UH',
    'u': 'UW',
    
    # Consonants
    'b': 'B',
    'tʃ': 'CH',
    'd': 'D',
    'ð': 'DH',
    'f': 'F',
    'ɡ': 'G', 'g': 'G',
    'h': 'HH',
    'dʒ': 'JH',
    'k': 'K',
    'l': 'L',
    'm': 'M',
    'n': 'N',
    'ŋ': 'NG',
    'p': 'P',
    'ɹ': 'R', 'r': 'R',
    's': 'S',
    'ʃ': 'SH',
    't': 'T',
    'θ': 'TH',
    'v': 'V',
    'w': 'W',
    'j': 'Y',
    'z': 'Z',
    'ʒ': 'ZH',
}

def ipa_to_arpabet(ipa_phonemes: list) -> list:
    """
    Convert IPA phonemes (from Allosaurus) to ARPABET
    
    Args:
        ipa_phonemes: List of IPA phoneme strings
        
    Returns:
        List of ARPABET phoneme strings
    """
    arpabet = []
    for ipa in ipa_phonemes:
        # Clean IPA (remove stress markers, length markers)
        clean_ipa = ipa.replace('ː', '').replace('ˈ', '').replace('ˌ', '').strip()
        
        # Map to ARPABET
        arpa = IPA_TO_ARPABET.get(clean_ipa, 'AH')  # Default to AH (schwa)
        arpabet.append(arpa)
    
    return arpabet

