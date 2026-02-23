
"""
Phoneme Service - Converts text to ARPABET phonemes and visemes using g2p-arpabet
Now with custom 39-phoneme shape key mappings for precise lip-sync control
"""
import os
import sys
import re
from typing import List, Dict, Optional
import tempfile
from app.services.phoneme_shapes import get_shape_keys_for_phoneme
from app.services.viseme_mapper import phonemes_to_grouped_timeline

# Prefer g2p-arpabet; fallback to g2p_en for backward compatibility
g2p = None
_g2p_backend = "none"
try:
    from g2p_arpabet import G2p
    g2p = G2p()
    _g2p_backend = "g2p-arpabet"
except ImportError:
    try:
        from g2p_en import G2p
        g2p = G2p()
        _g2p_backend = "g2p_en"
    except Exception as e:
        print(f"⚠️ Failed to initialize g2p-arpabet / g2p_en: {e}")

# Allosaurus removed - audio upload feature deprecated


# ARPABET Durations (in seconds)
# Vowels generally last longer (~0.09s) than consonants (~0.06-0.08s)
ARPABET_DURATIONS = {
    # Vowels
    'AA': 0.09, 'AE': 0.09, 'AH': 0.09, 'AO': 0.09, 'AW': 0.09,
    'AY': 0.09, 'EH': 0.09, 'ER': 0.09, 'EY': 0.09, 'IH': 0.09,
    'IY': 0.09, 'OW': 0.09, 'OY': 0.09, 'UH': 0.09, 'UW': 0.09,
    'AX': 0.09, 'AXR': 0.09, 'IX': 0.09,  # reduced/schwa (g2p_en)
    # Consonants
    'B': 0.06, 'CH': 0.08, 'D': 0.06, 'DH': 0.06, 'F': 0.08,
    'G': 0.06, 'HH': 0.06, 'JH': 0.08, 'K': 0.06, 'L': 0.08,
    'M': 0.08, 'N': 0.06, 'NG': 0.08, 'P': 0.06, 'R': 0.08,
    'S': 0.08, 'SH': 0.08, 'T': 0.06, 'TH': 0.08, 'V': 0.06,
    'W': 0.08, 'Y': 0.06, 'Z': 0.08, 'ZH': 0.08,
}

# Punctuation Pause Durations (in seconds)
# These create natural pauses in speech for better pacing and clarity
PUNCTUATION_PAUSES = {
    # Short pauses
    ' ': 0.05,      # Space between words (very brief)
    ',': 0.45,      # Comma (short pause)
    ';': 0.30,      # Semicolon (medium-short pause)
    ':': 0.30,      # Colon (medium-short pause)
    '-': 0.20,      # Dash/hyphen (brief pause)
    '–': 0.25,      # En dash (short pause)
    '—': 0.30,      # Em dash (medium pause)
    
    # Medium pauses
    '...': 0.50,    # Ellipsis (thinking/trailing off)
    '…': 0.50,      # Ellipsis character
    
    # Long pauses (end of sentence)
    '.': 1,      # Period (full stop)
    '?': 1,      # Question mark
    '!': 1,      # Exclamation mark
    
    # Grouping pauses
    '(': 0.15,      # Opening parenthesis (brief)
    ')': 0.20,      # Closing parenthesis (short)
    '[': 0.15,      # Opening bracket
    ']': 0.20,      # Closing bracket
    '"': 0.10,      # Quote mark (minimal)
    "'": 0.10,      # Apostrophe/single quote (minimal)
}

def remove_stress(phone: str) -> str:
    """Remove stress numbers from ARPABET phonemes (e.g. AA1 -> AA)"""
    return re.sub(r'\d+', '', phone)

def text_to_phonemes(text: str, language: str = 'en-us') -> str:
    """
    Convert text to ARPABET phonemes string
    Args:
        text: Input text
    Returns:
        Space-separated ARPABET string
    """
    if not g2p:
        raise RuntimeError("g2p-arpabet / g2p_en not initialized")
    
    if not text or text.strip() == '':
        return ''
        
    try:
        # g2p returns a list of phonemes/symbols
        phonemes = g2p(text)
        
        # Clean and join
        # Keep spaces as separators if needed, but standardizing to space-separated string
        processed = []
        for p in phonemes:
            if p == ' ':
                continue
            processed.append(p)
            
        return ' '.join(processed)
    except Exception as e:
        print(f"❌ G2P error: {e}")
        raise RuntimeError(f"G2P conversion failed: {str(e)}")


def text_to_viseme_sequence(text: str, language: str = 'en-us') -> List[Dict]:
    """
    Convert text to a timed sequence of visemes with custom shape keys
    
    Args:
        text: Input text
        language: Language code (default: 'en-us')
    
    Returns:
        List of viseme frames with timing information and shape keys
        Each frame contains: viseme, start, duration, shape_keys
    """
    if not g2p:
        raise RuntimeError("g2p-arpabet / g2p_en not initialized")
        
    # Get phoneme list from g2p
    # Example: ['HH', 'AH0', 'L', 'OW1', ' ', 'W', 'ER1', 'L', 'D']
    raw_phonemes = g2p(text)
    
    viseme_sequence = []
    current_time = 0.0
    
    i = 0
    while i < len(raw_phonemes):
        phone = raw_phonemes[i]
        
        # Check for ellipsis (3 dots in sequence)
        if phone == '.' and i + 2 < len(raw_phonemes) and raw_phonemes[i+1] == '.' and raw_phonemes[i+2] == '.':
            # Ellipsis pause
            duration = PUNCTUATION_PAUSES.get('...', 0.50)
            shape_keys = get_shape_keys_for_phoneme('sil')
            viseme_sequence.append({
                'viseme': 'sil',
                'start': current_time,
                'duration': duration,
                'shape_keys': shape_keys
            })
            current_time += duration
            i += 3  # Skip the three dots
            continue
        
        # Handle spaces and punctuation
        if phone in PUNCTUATION_PAUSES:
            duration = PUNCTUATION_PAUSES[phone]
            shape_keys = get_shape_keys_for_phoneme('sil')
            viseme_sequence.append({
                'viseme': 'sil',
                'start': current_time,
                'duration': duration,
                'shape_keys': shape_keys
            })
            current_time += duration
            i += 1
            continue
            
        # Standard Phoneme
        # clear stress (AA1 -> AA)
        base_phone = remove_stress(phone)
        
        # Get duration
        duration = ARPABET_DURATIONS.get(base_phone, 0.08)
        
        # Get shape keys for this phoneme
        shape_keys = get_shape_keys_for_phoneme(base_phone)
        
        viseme_sequence.append({
            'viseme': base_phone,  # e.g. "AA", "EH"
            'start': current_time,
            'duration': duration,
            'shape_keys': shape_keys  # NEW: Custom shape key values
        })
        
        current_time += duration
        i += 1  # Increment counter
        
    # Add final silence to ensure animation resets
    shape_keys = get_shape_keys_for_phoneme('sil')
    viseme_sequence.append({
        'viseme': 'sil',
        'start': current_time,
        'duration': 0.2,
        'shape_keys': shape_keys
    })
    
    return viseme_sequence


def text_to_grouped_viseme_sequence(text: str, language: str = 'en-us') -> List[Dict]:
    """
    Convert text to a grouped viseme sequence (NEW phoneme grouping approach)
    
    Groups consecutive phonemes with the same mouth shape and merges them
    for improved lip sync timing accuracy.
    
    Args:
        text: Input text
        language: Language code (default: 'en-us')
    
    Returns:
        List of grouped viseme segments with timing information
        Each segment contains: group, phonemes, start, end
    """
    if not g2p:
        raise RuntimeError("g2p-arpabet / g2p_en not initialized")
        
    # Get phoneme list from g2p
    raw_phonemes = g2p(text)
    
    # Clean phonemes: remove stress markers and handle spaces/punctuation
    phonemes = []
    phoneme_durations = []
    
    i = 0
    while i < len(raw_phonemes):
        phone = raw_phonemes[i]
        
        # Check for ellipsis (3 dots in sequence)
        if phone == '.' and i + 2 < len(raw_phonemes) and raw_phonemes[i+1] == '.' and raw_phonemes[i+2] == '.':
            phonemes.append('sil')
            phoneme_durations.append(PUNCTUATION_PAUSES.get('...', 0.50))
            i += 3  # Skip the three dots
            continue
        
        # Handle spaces and punctuation as pauses
        if phone in PUNCTUATION_PAUSES:
            phonemes.append('sil')
            phoneme_durations.append(PUNCTUATION_PAUSES[phone])
            i += 1
            continue
            
        # Standard phoneme
        base_phone = remove_stress(phone)
        phonemes.append(base_phone)
        phoneme_durations.append(ARPABET_DURATIONS.get(base_phone, 0.08))
        i += 1
    
    # Use the new grouping function from viseme_mapper
    grouped_timeline = phonemes_to_grouped_timeline(phonemes, phoneme_durations)
    
    # Add final silence to ensure animation resets
    if grouped_timeline:
        last_end = grouped_timeline[-1]['end']
        grouped_timeline.append({
            'group': 'sil',
            'phonemes': ['sil'],
            'start': last_end,
            'end': last_end + 0.2
        })
    
    return grouped_timeline



def estimate_duration(text: str, language: str = 'en-us') -> float:
    """Estimate total duration from text"""
    visemes = text_to_viseme_sequence(text)
    if not visemes:
        return 0.0
    last = visemes[-1]
    return last['start'] + last['duration']
