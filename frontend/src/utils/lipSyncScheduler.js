
import { PHONEME_TO_VISEME, getShapeKeysForPhoneme, getPhonemeDuration } from './lipSyncMappings';
import { getGroupShapeKeys } from './groupShapeKeys';

/**
 * Flatten backend shape_keys (lips/teeth) into one object for morph targets.
 * @param {Object} shape_keys - Backend frame shape_keys: { lips?: {}, teeth?: {} }
 * @returns {Object} - Flat { key: value } for all shape keys
 */
function flattenShapeKeys(shape_keys) {
    if (!shape_keys) return {};
    const lips = shape_keys.lips || {};
    const teeth = shape_keys.teeth || {};
    return { ...lips, ...teeth };
}

/**
 * Build timeline from backend viseme sequence (uses server timing for accurate lip sync).
 * @param {Array} visemes - From API: [{ viseme, start, duration, shape_keys }, ...]
 * @returns {Array} - Same event shape as createVisemeTimeline for use in useLipSync
 */
export const backendVisemesToTimeline = (visemes) => {
    if (!visemes || visemes.length === 0) return [];

    const timeline = [];
    for (let i = 0; i < visemes.length; i++) {
        const v = visemes[i];
        const startTime = Number(v.start);
        const duration = Number(v.duration);
        const endTime = startTime + duration;

        // Use LOCAL frontend shape keys (from src/utils/phonemeShapeKeys.js) for easier tweaking
        const shapeKeys = getShapeKeysForPhoneme(v.viseme);

        // Debug: Print values used
        console.log(`[${v.viseme}] Frontend Shape Keys:`, shapeKeys);

        // For 'sil' (silence), backend may send Lips_Neutral/TeethTongue_Neutral; we want all standard keys to go to 0
        const isSilence = (v.viseme === 'sil' || v.viseme === 'sp');
        const finalShapeKeys = isSilence ? {} : shapeKeys;

        timeline.push({
            phoneme: v.viseme,
            viseme: v.viseme,
            startTime,
            endTime,
            duration,
            shapeKeys: finalShapeKeys,
            nextPhoneme: i < visemes.length - 1 ? visemes[i + 1].viseme : null
        });
    }
    return timeline;
};

/**
 * Build timeline from backend grouped viseme sequence (NEW grouped phoneme approach).
 * Groups consecutive phonemes with the same mouth shape for improved timing sync.
 * @param {Array} groupedVisemes - From API: [{ group, phonemes, start, end }, ...]
 * @returns {Array} - Timeline events for use in useLipSync
 */
export const groupedVisemesToTimeline = (groupedVisemes) => {
    if (!groupedVisemes || groupedVisemes.length === 0) return [];

    const timeline = [];
    for (let i = 0; i < groupedVisemes.length; i++) {
        const v = groupedVisemes[i];
        const startTime = Number(v.start);
        const endTime = Number(v.end);
        const duration = endTime - startTime;

        // Get shape keys for the group (e.g., 'g1_OPEN', 'g2_WIDE')
        const shapeKeys = getGroupShapeKeys(v.group);

        // Debug: Print group info
        console.log(`[${v.group}] Phonemes: ${v.phonemes.join(', ')} | Duration: ${duration.toFixed(3)}s | Shape Keys:`, shapeKeys);

        // For silence groups, use empty shape keys
        const isSilence = (v.group === 'sil' || v.group === 'sp');
        const finalShapeKeys = isSilence ? {} : (shapeKeys || {});

        timeline.push({
            phoneme: v.group,           // Use group as phoneme identifier
            viseme: v.group,            // Use group as viseme identifier
            group: v.group,             // Store group name
            phonemes: v.phonemes,       // Store original phonemes in this group
            startTime,
            endTime,
            duration,
            shapeKeys: finalShapeKeys,
            nextPhoneme: i < groupedVisemes.length - 1 ? groupedVisemes[i + 1].group : null
        });
    }
    return timeline;
};


/**
 * Creates a timed sequence of visemes from a list of phonemes (fallback when backend visemes not used).
 * @param {string[]} phonemes - List of ARPABET phonemes (e.g. ["HH", "AE", "L", "OW"])
 * @returns {Array} - Array of timeline events { startTime, endTime, duration, viseme, shapeKeys, nextPhoneme }
 */
export const createVisemeTimeline = (phonemes) => {
    if (!phonemes || phonemes.length === 0) return [];

    // Eagerly clean all phonemes to remove stress markers (digits) AND punctuation
    // "AA1" -> "AA", "EH0" -> "EH", "," -> ""
    const cleanPhonemes = phonemes
        .map(p => p ? p.replace(/[^A-Z]/g, '') : '') // Remove anything that is NOT A-Z
        .filter(p => p.length > 0); // Remove empty strings (former punctuation)

    const timeline = [];
    let currentTime = 0;

    for (let i = 0; i < cleanPhonemes.length; i++) {
        const phoneme = cleanPhonemes[i];
        if (!phoneme) continue; // Skip empty if any

        // Get Viseme Category (e.g. "Open", "Round", "Bite")
        // Default to NEUTRAL if not found
        const visemeCategory = PHONEME_TO_VISEME[phoneme] || 'NEUTRAL';

        // Determine Duration
        // 1. Try helper function
        let duration = getPhonemeDuration ? getPhonemeDuration(phoneme) : 0.060;

        // 2. Adjust based on Category 
        // Vowels/Open shapes need slightly more time but kept snappy
        if (['Open', 'Open_wide', 'Round'].includes(visemeCategory)) {
            // Ensure vowels have minimum presence but respect faster mapping
            duration = Math.max(duration, 0.080);
        } else {
            // Consonants can be very fast
            duration = Math.max(duration, 0.040);
        }

        // Apply
        const startTime = currentTime;
        const endTime = startTime + duration;

        // Per-phoneme shape keys (specific viseme) or fallback to category
        const shapeKeys = getShapeKeysForPhoneme(phoneme);

        // Lookahead for Coarticulation (using cleaned phonemes)
        let nextPhoneme = null;
        if (i < cleanPhonemes.length - 1) {
            nextPhoneme = cleanPhonemes[i + 1];
        }

        timeline.push({
            phoneme,               // The cleaned phoneme (e.g. "AA")
            viseme: visemeCategory,// The category (e.g. "Open")
            startTime,
            endTime,
            duration,
            shapeKeys,
            nextPhoneme            // The cleaned next phoneme
        });

        currentTime = endTime;
    }

    return timeline;
};
