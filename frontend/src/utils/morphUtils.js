/**
 * Helpers for morph target (shape key) values to avoid WebGL shader warnings:
 * - X4122: "sum of 1 and -1.49e-017 cannot be represented accurately" (precision)
 * - X4008: floating point division by zero (invalid/NaN values)
 */

/**
 * Clamp morph influence to [0, 1] and snap near 0/1 to avoid GPU precision issues.
 * @param {number} v - Raw influence value
 * @returns {number} Value in [0, 1], or 0 if NaN/undefined
 */
export function clampMorphInfluence(v) {
    if (v !== v || typeof v !== 'number') return 0;
    const c = Math.max(0, Math.min(1, v));
    if (c < 1e-5) return 0;
    if (c > 1 - 1e-5) return 1;
    return c;
}
