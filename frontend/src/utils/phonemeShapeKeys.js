/**
 * Per-phoneme shape key values (flat: lips + teeth merged).
 * Each phoneme has its own viseme for finer mouth shapes.
 * Values aligned with backend phoneme_shapes.py.
 */

const ZERO = {
    Lips_Open_Wide: 0, Lips_Wide: 0, Lips_Round: 0, Lips_Protude: 0,
    Lips_Purse_Narrow: 0, Lips_FV: 0, Lips_Corner_Up: 0,
    TeethTongue_Open: 0, TeethTongue_TipUp: 0, TeethTongue_Bite: 0
};

/** Flat shape key map: one viseme per ARPABET phoneme */
export const PHONEME_TO_SHAPE_KEYS = {
    // --- VOWELS (The "A-E-I-O-U" Core) ---
    AA: { Lips_Open_Wide: 0.9, Lips_Wide: 0.1, TeethTongue_Open: 0.9,  Lips_Round: 0.4, Lips_Protude: 0.4 }, // "Hot" - Max vertical drop
    AE: { Lips_Wide: 0.7, Lips_Open_Wide: 0.5, Lips_Corner_Up: 0.2, TeethTongue_Open: 0.6 }, // "Bat" - Wide and open
    AH: { Lips_Open_Wide: 0.6, Lips_Round: 0.1, TeethTongue_Open: 0.7 }, // "But" - Neutral open
    AO: { Lips_Round: 0.8, Lips_Protude: 0.6, Lips_Open_Wide: 0.4, TeethTongue_Open: 0.5 }, // "Off" - Rounded & deep
    AW: { Lips_Round: 0.7, Lips_Protude: 0.4, Lips_Open_Wide: 0.5, TeethTongue_Open: 0.6 }, // "Now" - Starts open, moves to round
    AY: { Lips_Wide: 0.8, Lips_Corner_Up: 0.3, Lips_Open_Wide: 0.4, TeethTongue_Open: 0.4 }, // "Say" - Wide smile-like
    EH: { Lips_Wide: 0.7, Lips_Open_Wide: 0.4, Lips_Corner_Up: 0.2, TeethTongue_Open: 0.5 }, // "Bet"
    ER: { Lips_Round: 0.4, Lips_Protude: 0.3, Lips_Open_Wide: 0.3, TeethTongue_Open: 0.4 }, // "Bird" - Slightly puckered
    EY: { Lips_Wide: 0.9, Lips_Corner_Up: 0.4, Lips_Open_Wide: 0.3, TeethTongue_Open: 0.3 }, // "Ate"
    IH: { Lips_Wide: 0.8, Lips_Corner_Up: 0.3, Lips_Open_Wide: 0.3, TeethTongue_Open: 0.3 }, // "Bit"
    IY: { Lips_Wide: 1.0, Lips_Corner_Up: 0.5, Lips_Open_Wide: 0.1, TeethTongue_Open: 0.2 }, // "Eat" - Max horizontal stretch
    OW: { Lips_Round: 0.5, Lips_Protude: 0.6, Lips_Open_Wide: 0.2, TeethTongue_Open: 0.2 }, // "Go" - Very round
    OY: { Lips_Round: 0.6, Lips_Protude: 0.5, Lips_Wide: 0.2, TeethTongue_Open: 0.4 }, // "Boy"
    UH: { Lips_Round: 0.7, Lips_Purse_Narrow: 0.5, Lips_Open_Wide: 0.2, TeethTongue_Open: 0.2 }, // "Book"
    UW: { Lips_Round: 0.7, Lips_Protude: 0.9, Lips_Purse_Narrow: 0.6, TeethTongue_Open: 0.1 }, // "Boot" - The tightest 'O'
    AX: { Lips_Open_Wide: 0.4, Lips_Round: 0.1, TeethTongue_Open: 0.5 }, // Schwa (Neutral)

    // --- CONSONANTS (Plosives & Labials) ---
    B:  { Lips_Purse_Narrow: 0.1, Lips_Protude: 0.1, TeethTongue_Open: 0 }, // Closed
    P:  { Lips_Purse_Narrow: 0.1, Lips_Protude: 0.2, TeethTongue_Open: 0 }, // Closed with slight pressure
    M:  { Lips_Purse_Narrow: 0.1, Lips_Protude: 0.1, TeethTongue_Open: 0 }, // Closed
    F:  { Lips_FV: 1.0, Lips_Open_Wide: 0.1, TeethTongue_Open: 0.1 }, // Lower lip to upper teeth
    V:  { Lips_FV: 1.0, Lips_Open_Wide: 0.1, TeethTongue_Open: 0.1 }, 

    // --- CONSONANTS (Sibilants & Dental) ---
    S:  { Lips_Wide: 0.8, Lips_Open_Wide: 0.1, TeethTongue_TipUp: 0.4, TeethTongue_Open: 0.05 }, // Clenched teeth
    Z:  { Lips_Wide: 0.8, Lips_Open_Wide: 0.1, TeethTongue_TipUp: 0.4, TeethTongue_Open: 0.05 },
    SH: { Lips_Protude: 0.8, Lips_Open_Wide: 0.3, Lips_Round: 0.3, TeethTongue_Open: 0.2 }, // "Square" mouth
    ZH: { Lips_Protude: 0.8, Lips_Open_Wide: 0.3, Lips_Round: 0.3, TeethTongue_Open: 0.2 },
    CH: { Lips_Protude: 0.7, Lips_Open_Wide: 0.4, TeethTongue_TipUp: 0.5, TeethTongue_Open: 0.3 },
    JH: { Lips_Protude: 0.7, Lips_Open_Wide: 0.4, TeethTongue_TipUp: 0.5, TeethTongue_Open: 0.3 },

    // --- CONSONANTS (Lingual - Tongue Based) ---
    TH: { Lips_Open_Wide: 10, Lips_Wide: 0.3, TeethTongue_Bite: 0.9, TeethTongue_Open: 0.2 }, // Tongue forward
    DH: { Lips_Open_Wide: 0.2, Lips_Wide: 0.3, TeethTongue_Bite: 0.9, TeethTongue_Open: 0.2 },
    T:  { Lips_Wide: 0.3, Lips_Open_Wide: 0.2, TeethTongue_TipUp: 0.9, TeethTongue_Open: 0.2 },
    D:  { Lips_Wide: 0.3, Lips_Open_Wide: 0.2, TeethTongue_TipUp: 0.8, TeethTongue_Open: 0.2 },
    L:  { Lips_Open_Wide: 0.3, TeethTongue_TipUp: 1.0, TeethTongue_Open: 0.4 },
    N:  { Lips_Open_Wide: 0.2, TeethTongue_TipUp: 0.9, TeethTongue_Open: 0.2 },

    // --- SEMI-VOWELS & OTHERS ---
    R:  { Lips_Round: 0.5, Lips_Protude: 0.4, Lips_Open_Wide: 0.3, TeethTongue_Open: 0.4 },
    W:  { Lips_Round: 1.0, Lips_Protude: 0.8, TeethTongue_Open: 0.1 },
    Y:  { Lips_Wide: 0.8, Lips_Corner_Up: 0.3, TeethTongue_Open: 0.2 },
    HH: { Lips_Open_Wide: 0.4, TeethTongue_Open: 0.5 }, // Breath
    K:  { Lips_Open_Wide: 0.4, TeethTongue_Open: 0.6 }, 
    G:  { Lips_Open_Wide: 0.4, TeethTongue_Open: 0.6 },
    NG: { Lips_Open_Wide: 0.3, TeethTongue_Open: 0.4 },

    sil: ZERO,
    sp: ZERO,
};
/** Get shape keys for a phoneme (cleaned, no stress digits). Returns null if unknown. */
export function getPhonemeShapeKeys(phoneme) {
    if (!phoneme || typeof phoneme !== 'string') return null;
    const clean = phoneme.replace(/[^A-Z]/g, '');
    if (!clean) return PHONEME_TO_SHAPE_KEYS.sil;
    return PHONEME_TO_SHAPE_KEYS[clean] || null;
}
