import { VISEME_TO_SHAPES } from './lipSyncMappings';
import { getPhonemeShapeKeys } from './phonemeShapeKeys';

/**
 * Maps logical viseme groups to specific shape key values.
 * Groups are higher-level constructs than phonemes (e.g., 'A_OPEN', 'B_CLOSED').
 */
export const GROUP_TO_SHAPE_KEYS = {
    // Basic silence/pause groups
    'sil': { Lips_Open_Wide: 0, Lips_Wide: 0, Lips_Round: 0, TeethTongue_Open: 0 },
    'sp': { Lips_Open_Wide: 0, Lips_Wide: 0, Lips_Round: 0, TeethTongue_Open: 0 },
    'NEUTRAL': { Lips_Open_Wide: 0, Lips_Wide: 0, Lips_Round: 0, TeethTongue_Open: 0 },
};

/**
 * Get shape keys for a viseme group.
 * @param {string} group - Group name from backend (e.g. 'Open', 'Close', 'sil')
 * @returns {Object|null} - Shape key object or null if not found
 */
export function getGroupShapeKeys(group) {
    if (!group) return null;

    // 1. Check if group is a known high-level Viseme Group (Open, Close, Round, etc.)
    if (VISEME_TO_SHAPES[group]) {
        return { ...VISEME_TO_SHAPES[group] };
    }

    // 2. Check direct internal definition (sil, sp)
    if (GROUP_TO_SHAPE_KEYS[group]) {
        return { ...GROUP_TO_SHAPE_KEYS[group] };
    }

    // 3. Fallback: Check if group name corresponds to a phoneme
    // (e.g. if backend sends 'AA' as a group name)
    const phonemeKeys = getPhonemeShapeKeys(group);
    if (phonemeKeys) {
        return phonemeKeys;
    }

    // 4. Fallback: Return empty object for safety if unknown
    console.warn(`[getGroupShapeKeys] Unknown group: ${group}`);
    return {};
}
