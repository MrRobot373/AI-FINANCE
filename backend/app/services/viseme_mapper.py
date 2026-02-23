"""
Viseme Mapper Service
Groups consecutive phonemes into visual groups (visemes) to reduce jitter and improve lip sync.
Mappings are aligned with frontend `lipSyncMappings.js`.
"""

from typing import List, Dict

# Map ARPABET phonemes to Viseme Groups
# Must match keys in frontend/src/utils/lipSyncMappings.js
PHONEME_TO_VISEME_GROUP = {
    # Vowels (Monophthongs)
    "AH": "Open", "AA": "Open", "AO": "Open", "HH": "Open", "NG": "Open", "OY": "Open",
    
    "AE": "Open_wide", "AY": "Open_wide", "EH": "Open_wide", "EY": "Open_wide", 
    "IH": "Open_wide", "G": "Open_wide", "Y": "Open_wide", "K": "Open_wide",

    "B": "Close", "P": "Close", "M": "Close",

    "CH": "TeethShow", "JH": "TeethShow", "S": "TeethShow", "SH": "TeethShow", "Z": "TeethShow", "ZH": "TeethShow",

    "AW": "Round", "OW": "Round", "UH": "Round", "UW": "Round",

    "D": "TongueUP", "T": "TongueUP", "L": "TongueUP", "N": "TongueUP", "R": "TongueUP", "ER": "TongueUP",

    "DH": "Bite", "TH": "Bite",

    "F": "TeethOnLips", "V": "TeethOnLips", "W": "TeethOnLips",

    # Silence
    'sil': 'sil',
    'sp': 'sil',
    'MESSAGE_START': 'sil',
    'MESSAGE_END': 'sil'
}

def get_viseme_group(phoneme: str) -> str:
    """Get the visual group for a phoneme"""
    return PHONEME_TO_VISEME_GROUP.get(phoneme, 'NEUTRAL')

def phonemes_to_grouped_timeline(phonemes: List[str], durations: List[float]) -> List[Dict]:
    """
    Convert a list of phonemes and their durations into a grouped viseme timeline.
    Merges consecutive phonemes that share the same visual group.
    
    Args:
        phonemes: List of ARPABET phonemes
        durations: List of durations in seconds
        
    Returns:
        List of grouped viseme objects:
        {
            'group': 'Open',
            'phonemes': ['AH', 'AA'],
            'start': 0.0,
            'end': 0.15
        }
    """
    if not phonemes or not durations or len(phonemes) != len(durations):
        return []

    grouped_timeline = []
    current_group = None
    current_entry = None
    current_time = 0.0

    for i, phoneme in enumerate(phonemes):
        duration = durations[i]
        viseme_group = get_viseme_group(phoneme)
        
        # If standard logic: merge identical consecutive GROUPS
        if current_entry and current_group == viseme_group:
            # Extend existing group
            current_entry['phonemes'].append(phoneme)
            current_entry['end'] += duration
            current_time += duration
        else:
            # Finalize previous group if exists
            if current_entry:
                grouped_timeline.append(current_entry)
            
            # Start new group
            current_group = viseme_group
            current_entry = {
                'group': viseme_group,
                'phonemes': [phoneme],
                'start': current_time,
                'end': current_time + duration
            }
            current_time += duration
            
    # Add final entry
    if current_entry:
        grouped_timeline.append(current_entry)
        
    return grouped_timeline
