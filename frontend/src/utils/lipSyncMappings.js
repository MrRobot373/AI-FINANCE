import { PHONEME_TO_SHAPE_KEYS, getPhonemeShapeKeys } from './phonemeShapeKeys';

// Phoneme to Viseme Mapping (used when no per-phoneme shape is available)
export const PHONEME_TO_VISEME = {
    // Vowels (Monophthongs)
    "AH": "Open", "AA": "Open", "AO": "Open", "HH": "Open", "NG": "Open", "OY": "Open",

    "AE": "Open_wide", "AY": "Open_wide", "EH": "Open_wide", "EY": "Open_wide", "IH": "Open_wide", "G": "Open_wide", "Y": "Open_wide", "K": "Open_wide",

    "B": "Close", "P": "Close", "M": "Close",

    "CH": "TeethShow", "JH": "TeethShow", "S": "TeethShow", "SH": "TeethShow", "Z": "TeethShow", "ZH": "TeethShow",

    "AW": "Round", "OW": "Round", "UH": "Round", "UW": "Round",

    "D": "TongueUP", "T": "TongueUP", "L": "TongueUP", "N": "TongueUP", "R": "TongueUP", "ER": "TongueUP",

    "DH": "Bite", "TH": "Bite",

    "F": "TeethOnLips", "V": "TeethOnLips", "W": "TeethOnLips",



    // Fallback/Silence
    'sil': 'NEUTRAL',
    'sp': 'NEUTRAL',
    'NEUTRAL': 'NEUTRAL'
};

// Viseme to Shape Key Mapping (fallback when backend visemes not used)
// Refined for clearer mouth shapes: bilabials closed, sibilants narrow, vowels distinct
export const VISEME_TO_SHAPES = {
    "Open": {
        Lips_Open_Wide: 0.85,
        Lips_Wide: 0.45,
        Lips_Round: 0.0,
        TeethTongue_Open: 1.0
    },

    "Open_wide": {
        Lips_Open_Wide: 0.75,
        Lips_Wide: 0.8,
        Lips_Corner_Up: 0.3,
        TeethTongue_Open: 0.8
    },

    "Close": {
        Lips_Open_Wide: 0.0,
        Lips_Wide: 0.0,
        Lips_Purse_Narrow: 0.95,
        Lips_Protude: 0.25,
        Lips_FV: 0.0,
        TeethTongue_Open: 0.0
    },

    "TeethShow": {
        Lips_Wide: 0.9,
        Lips_Open_Wide: 0.32,
        Lips_Purse_Narrow: 0.2,
        TeethTongue_TipUp: 0.7
    },

    "Round": {
        Lips_Round: 0.95,
        Lips_Purse_Narrow: 0.6,
        Lips_Open_Wide: 0.2,
        Lips_Protude: 0.4,
        TeethTongue_Open: 0.2
    },

    "TongueUP": {
        TeethTongue_TipUp: 0.8,
        TeethTongue_Bite: 0.35,
        Lips_Wide: 0.4,
        Lips_Open_Wide: 0.3
    },

    "Bite": {
        TeethTongue_TipUp: 1.0,
        Lips_Wide: 0.5,
        TeethTongue_Bite: 10,
        Lips_Open_Wide: 0.28,
        Lips_Corner_Up: 0.2
    },

    "TeethOnLips": {
        Lips_FV: 1.0,
        Lips_Protude: 0.4,
        Lips_Open_Wide: 0.2,
        TeethTongue_Open: 0.25
    },

    "NEUTRAL": {
        Lips_Open_Wide: 0.0,
        Lips_Wide: 0.0,
        TeethTongue_Open: 0.0,
        Lips_Round: 0.0,
        Lips_Protude: 0.0,
        TeethTongue_TipUp: 0.0,
        TeethTongue_Bite: 0.0,
        Lips_FV: 0.0,
        Lips_Corner_Up: 0.0,
        Lips_Purse_Narrow: 0.0
    }
};

// Timing Constants (ms)
export const PHONEME_DURATIONS = {
    // Vowels - Shorter for snappier speech
    'AA': 100, 'AE': 100, 'AH': 80, 'EH': 80, 'ER': 80,
    'IH': 80, 'IY': 80, 'UH': 80, 'UW': 80, 'AO': 100,
    'OW': 100, 'AW': 100, 'OY': 100, 'EY': 100, 'AY': 100,

    // Consonants - Keep tight
    'default': 50,
    'consonant': 40
};

export const getPhonemeDuration = (phoneme) => {
    // Check if it's a known vowel or specific duration
    if (PHONEME_DURATIONS[phoneme]) return PHONEME_DURATIONS[phoneme] / 1000;

    // Check if it's a vowel (in the vowels list roughly)
    const vowels = ['AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW'];
    if (vowels.includes(phoneme)) {
        return 0.20; // 100ms default for vowels
    }

    return 0.10; // 50ms default for consonants
};

/** Get shape keys for a phoneme: per-phoneme first, then viseme category, then NEUTRAL */
export function getShapeKeysForPhoneme(phoneme) {
    const specific = getPhonemeShapeKeys(phoneme);
    if (specific) return { ...specific };
    const category = PHONEME_TO_VISEME[phoneme] || 'NEUTRAL';
    return { ...(VISEME_TO_SHAPES[category] || VISEME_TO_SHAPES.NEUTRAL) };
}

// All unique shape keys from both per-phoneme and category mappings
export const ALL_SHAPE_KEYS = Array.from(
    new Set([
        ...Object.values(VISEME_TO_SHAPES).flatMap((g) => Object.keys(g)),
        ...Object.values(PHONEME_TO_SHAPE_KEYS).flatMap((g) => Object.keys(g))
    ])
);
