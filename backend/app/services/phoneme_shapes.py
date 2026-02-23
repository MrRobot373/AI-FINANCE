"""
ARPABET to Shape Key Mapping
Based on research from Phonemes-Visemes-research.md (lines 238-278)
39 ARPABET phonemes mapped to lips, teeth, and tongue shape keys

This module provides precise shape key values for each ARPABET phoneme
to drive realistic lip-sync animation on 3D avatars.
"""

# Complete mapping of 39 ARPABET phonemes to shape keys
# Refined for clearer mouth shapes: bilabials closed, sibilants narrow, vowels distinct
PHONEME_SHAPE_KEYS = {
    # Vowels - open jaw, distinct lip shapes
    'AA': {
        'lips': {'Lips_Open_Wide': 0.85, 'Lips_Wide': 0.45, 'Lips_Round': 0.0},
        'teeth': {'TeethTongue_Open': 1.0}
    },
    'AE': {
        'lips': {'Lips_Wide': 0.75, 'Lips_Open_Wide': 0.7, 'Lips_Corner_Up': 0.15},
        'teeth': {'TeethTongue_Open': 0.85, 'TeethTongue_Bite': 0.2}
    },
    'AH': {
        'lips': {'Lips_Open_Wide': 0.55, 'Lips_Round': 0.15, 'Lips_Wide': 0.2},
        'teeth': {'TeethTongue_Open': 0.85}
    },
    'AO': {
        'lips': {'Lips_Round': 0.7, 'Lips_Protude': 0.5, 'Lips_Open_Wide': 0.5},
        'teeth': {'TeethTongue_Open': 0.65}
    },
    'AW': {
        'lips': {'Lips_Round': 0.75, 'Lips_Open_Wide': 0.6, 'Lips_Protude': 0.35},
        'teeth': {'TeethTongue_Open': 0.7}
    },
    'AY': {
        'lips': {'Lips_Wide': 0.65, 'Lips_Corner_Up': 0.35, 'Lips_Open_Wide': 0.45},
        'teeth': {'TeethTongue_Open': 0.5}
    },
    'EH': {
        'lips': {'Lips_Wide': 0.75, 'Lips_Open_Wide': 0.55, 'Lips_Corner_Up': 0.25},
        'teeth': {'TeethTongue_Open': 0.6, 'TeethTongue_Bite': 0.2}
    },
    'ER': {
        'lips': {'Lips_Round': 0.35, 'Lips_Open_Wide': 0.5, 'Lips_Wide': 0.2},
        'teeth': {'TeethTongue_Open': 0.85}
    },
    'EY': {
        'lips': {'Lips_Wide': 0.8, 'Lips_Corner_Up': 0.4, 'Lips_Open_Wide': 0.4},
        'teeth': {'TeethTongue_Open': 0.45}
    },
    'IH': {
        'lips': {'Lips_Wide': 0.9, 'Lips_Corner_Up': 0.35, 'Lips_Open_Wide': 0.4},
        'teeth': {'TeethTongue_Open': 0.5}
    },
    'IY': {
        'lips': {'Lips_Wide': 1.0, 'Lips_Corner_Up': 0.5, 'Lips_Open_Wide': 0.35},
        'teeth': {'TeethTongue_Open': 0.4}
    },
    'OW': {
        'lips': {'Lips_Round': 0.9, 'Lips_Purse_Narrow': 0.55, 'Lips_Open_Wide': 0.25},
        'teeth': {'TeethTongue_Open': 0.25}
    },
    'OY': {
        'lips': {'Lips_Round': 0.7, 'Lips_Protude': 0.45, 'Lips_Wide': 0.25, 'Lips_Open_Wide': 0.4},
        'teeth': {'TeethTongue_Open': 0.5}
    },
    'UH': {
        'lips': {'Lips_Round': 0.8, 'Lips_Purse_Narrow': 0.65, 'Lips_Open_Wide': 0.2},
        'teeth': {'TeethTongue_Open': 0.15}
    },
    'UW': {
        'lips': {'Lips_Round': 1.0, 'Lips_Purse_Narrow': 0.85, 'Lips_Open_Wide': 0.1},
        'teeth': {'TeethTongue_Open': 0.08}
    },
    # Reduced/schwa vowels (g2p_en may output these)
    'AX': {
        'lips': {'Lips_Open_Wide': 0.5, 'Lips_Round': 0.1, 'Lips_Wide': 0.2},
        'teeth': {'TeethTongue_Open': 0.8}
    },
    'AXR': {
        'lips': {'Lips_Round': 0.35, 'Lips_Open_Wide': 0.5, 'Lips_Wide': 0.2},
        'teeth': {'TeethTongue_Open': 0.85}
    },
    'IX': {
        'lips': {'Lips_Wide': 0.85, 'Lips_Corner_Up': 0.3, 'Lips_Open_Wide': 0.38},
        'teeth': {'TeethTongue_Open': 0.5}
    },

    # Consonants - bilabials fully closed, fricatives distinct
    'B': {
        'lips': {'Lips_Open_Wide': 0.0, 'Lips_Wide': 0.0, 'Lips_Purse_Narrow': 0.95, 'Lips_Protude': 0.25, 'Lips_FV': 0.0},
        'teeth': {'TeethTongue_Open': 0.0}
    },
    'P': {
        'lips': {'Lips_Open_Wide': 0.0, 'Lips_Wide': 0.0, 'Lips_Purse_Narrow': 0.95, 'Lips_Protude': 0.3, 'Lips_FV': 0.0},
        'teeth': {'TeethTongue_Open': 0.0}
    },
    'M': {
        'lips': {'Lips_Open_Wide': 0.0, 'Lips_Wide': 0.0, 'Lips_Purse_Narrow': 0.9, 'Lips_Protude': 0.25, 'Lips_FV': 0.0},
        'teeth': {'TeethTongue_Open': 0.0}
    },
    'F': {
        'lips': {'Lips_FV': 1.0, 'Lips_Protude': 0.4, 'Lips_Open_Wide': 0.2},
        'teeth': {'TeethTongue_Open': 0.25}
    },
    'V': {
        'lips': {'Lips_FV': 1.0, 'Lips_Protude': 0.4, 'Lips_Open_Wide': 0.2},
        'teeth': {'TeethTongue_Open': 0.25}
    },
    'TH': {
        'lips': {'Lips_Wide': 0.5, 'Lips_Corner_Up': 0.2, 'Lips_Open_Wide': 0.28},
        'teeth': {'TeethTongue_TipUp': 1.0, 'TeethTongue_Open': 0.2}
    },
    'DH': {
        'lips': {'Lips_Wide': 0.5, 'Lips_Corner_Up': 0.2, 'Lips_Open_Wide': 0.28},
        'teeth': {'TeethTongue_TipUp': 1.0, 'TeethTongue_Open': 0.2}
    },
    'S': {
        'lips': {'Lips_Wide': 0.95, 'Lips_Open_Wide': 0.32, 'Lips_Purse_Narrow': 0.2},
        'teeth': {'TeethTongue_TipUp': 0.75}
    },
    'Z': {
        'lips': {'Lips_Wide': 0.9, 'Lips_Open_Wide': 0.32, 'Lips_Purse_Narrow': 0.18},
        'teeth': {'TeethTongue_TipUp': 0.7}
    },
    'SH': {
        'lips': {'Lips_Wide': 0.85, 'Lips_Open_Wide': 0.35, 'Lips_Purse_Narrow': 0.25},
        'teeth': {'TeethTongue_TipUp': 0.65}
    },
    'ZH': {
        'lips': {'Lips_Wide': 0.8, 'Lips_Open_Wide': 0.35, 'Lips_Purse_Narrow': 0.2},
        'teeth': {'TeethTongue_TipUp': 0.65}
    },
    'CH': {
        'lips': {'Lips_Wide': 0.5, 'Lips_Open_Wide': 0.35},
        'teeth': {'TeethTongue_TipUp': 0.8, 'TeethTongue_Bite': 0.45}
    },
    'JH': {
        'lips': {'Lips_Wide': 0.5, 'Lips_Open_Wide': 0.35},
        'teeth': {'TeethTongue_TipUp': 0.8, 'TeethTongue_Bite': 0.45}
    },
    'D': {
        'lips': {'Lips_Wide': 0.4, 'Lips_Open_Wide': 0.28},
        'teeth': {'TeethTongue_TipUp': 0.75, 'TeethTongue_Bite': 0.35}
    },
    'T': {
        'lips': {'Lips_Wide': 0.4, 'Lips_Open_Wide': 0.28},
        'teeth': {'TeethTongue_TipUp': 0.8, 'TeethTongue_Bite': 0.45}
    },
    'L': {
        'lips': {'Lips_Wide': 0.45, 'Lips_Open_Wide': 0.3},
        'teeth': {'TeethTongue_TipUp': 0.65, 'TeethTongue_Bite': 0.25}
    },
    'N': {
        'lips': {'Lips_Wide': 0.4, 'Lips_Open_Wide': 0.28},
        'teeth': {'TeethTongue_TipUp': 0.75}
    },
    'R': {
        'lips': {'Lips_Round': 0.3, 'Lips_Open_Wide': 0.45, 'Lips_Wide': 0.15},
        'teeth': {'TeethTongue_Open': 0.85}
    },
    'G': {
        'lips': {'Lips_Round': 0.25, 'Lips_Open_Wide': 0.55},
        'teeth': {'TeethTongue_Open': 0.8}
    },
    'K': {
        'lips': {'Lips_Round': 0.25, 'Lips_Open_Wide': 0.65},
        'teeth': {'TeethTongue_Open': 0.85}
    },
    'NG': {
        'lips': {'Lips_Round': 0.35, 'Lips_Open_Wide': 0.5},
        'teeth': {'TeethTongue_Open': 0.75}
    },
    'HH': {
        'lips': {'Lips_Open_Wide': 0.35, 'Lips_Wide': 0.4},
        'teeth': {'TeethTongue_Open': 0.65}
    },
    'W': {
        'lips': {'Lips_Round': 0.9, 'Lips_Protude': 0.6, 'Lips_Open_Wide': 0.15},
        'teeth': {'TeethTongue_Open': 0.15}
    },
    'Y': {
        'lips': {'Lips_Wide': 0.65, 'Lips_Corner_Up': 0.4, 'Lips_Open_Wide': 0.4},
        'teeth': {'TeethTongue_Open': 0.5}
    },

    # Silence - explicit zeros so any model resets cleanly (no Neutral keys required)
    'sil': {
        'lips': {
            'Lips_Open_Wide': 0.0, 'Lips_Wide': 0.0, 'Lips_Round': 0.0, 'Lips_Protude': 0.0,
            'Lips_Purse_Narrow': 0.0, 'Lips_FV': 0.0, 'Lips_Corner_Up': 0.0
        },
        'teeth': {'TeethTongue_Open': 0.0, 'TeethTongue_TipUp': 0.0, 'TeethTongue_Bite': 0.0}
    }
}


# IPA to ARPABET mapping from research doc (lines 180-222)
# Used for converting IPA phonemes (from audio processing) to ARPABET
IPA_TO_ARPABET = {
    'ɑ': 'AA',
    'æ': 'AE',
    'ʌ': 'AH',
    'ɔ': 'AO',
    'aʊ': 'AW',
    'aɪ': 'AY',
    'ɛ': 'EH',
    'ɝ': 'ER',
    'eɪ': 'EY',
    'ɪ': 'IH',
    'i': 'IY',
    'oʊ': 'OW',
    'ɔɪ': 'OY',
    'ʊ': 'UH',
    'u': 'UW',
    'b': 'B',
    'tʃ': 'CH',
    'd': 'D',
    'ð': 'DH',
    'f': 'F',
    'ɡ': 'G',
    'h': 'HH',
    'dʒ': 'JH',
    'k': 'K',
    'l': 'L',
    'm': 'M',
    'n': 'N',
    'ŋ': 'NG',
    'p': 'P',
    'ɹ': 'R',
    's': 'S',
    'ʃ': 'SH',
    't': 'T',
    'θ': 'TH',
    'v': 'V',
    'w': 'W',
    'j': 'Y',
    'z': 'Z',
    'ʒ': 'ZH'
}


def get_shape_keys_for_phoneme(arpabet: str) -> dict:
    """
    Get shape key values for a given ARPABET phoneme
    
    Args:
        arpabet: ARPABET phoneme (e.g., 'AA', 'B', 'CH')
                Can include stress markers (e.g., 'AA0', 'AA1') - they will be stripped
    
    Returns:
        Dictionary with 'lips' and 'teeth' shape key values
        Example: {'lips': {'Lips_Open_Wide': 0.8}, 'teeth': {'TeethTongue_Open': 1.0}}
    """
    # Remove stress markers (0, 1, 2) if present
    import re
    clean_phoneme = re.sub(r'\d+', '', arpabet)
    
    # Return shape keys or neutral default (explicit zeros)
    return PHONEME_SHAPE_KEYS.get(clean_phoneme, PHONEME_SHAPE_KEYS['sil'])


def ipa_to_arpabet(ipa: str) -> str:
    """
    Convert IPA phoneme to ARPABET
    
    Args:
        ipa: IPA phoneme symbol
    
    Returns:
        ARPABET phoneme string, or 'sil' if not found
    """
    # Clean up IPA (remove length markers, stress markers)
    cleaned = ipa.replace('ː', '').replace('ˈ', '').replace('ˌ', '')
    return IPA_TO_ARPABET.get(cleaned, 'sil')
