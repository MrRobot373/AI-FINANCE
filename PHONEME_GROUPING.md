# Phoneme Grouping for Improved Lip Sync Animation

## Overview
This implementation improves lip sync animation blending by grouping phonemes that require the same mouth shape and merging consecutive occurrences. This approach increases timing sync with audio by sustaining mouth shapes across similar phonemes instead of rapidly changing between them.

## Phoneme Groups

### Group Definitions
Phonemes are organized into 10 groups based on mouth shape requirements:

1. **g1_OPEN** (AA, AH, AO, HH)
   - Shape: Wide open mouth with visible teeth/tongue
   - Keys: `TeethTongue_Open`

2. **g2_WIDE** (AE, EH, AY, EY, IH, IY, Y)
   - Shape: Wide lips with open mouth
   - Keys: `Lips_Wide + Lips_Open_Wide`

3. **g3_R** (ER, R)
   - Shape: Open with slight round
   - Keys: `OPEN + slight ROUND`

4. **g4_ROUND** (AW, OW, OY, UH, UW, W)
   - Shape: Rounded and protruded lips
   - Keys: `Lips_Round + Lips_Protude`

5. **g5_CLOSED** (B, M, P)
   - Shape: Lips completely closed
   - Keys: `Lips_Open: 0`

6. **g6_FV** (F, V)
   - Shape: Lower lip to upper teeth contact
   - Keys: `Lips_FV + TeethTongue_Bite`

7. **g7_SIBILANT** (S, Z, SH, ZH, JH)
   - Shape: Lips open, teeth/tongue closed
   - Keys: `Lips_open + TeethTongue_open: 0`

8. **g8_DENTAL** (TH, DH)
   - Shape: Tongue between teeth
   - Keys: `TeethTongue_Bite`

9. **g9_ALVEOLAR** (T, D, L, N)
   - Shape: Tongue tip up
   - Keys: `Lips_open + TeethTongue_TipUp`

10. **g10_BACK** (K, NG, G)
    - Shape: Open fallback for back consonants
    - Keys: `OPEN fallback`

## Implementation Details

### Backend (Python)

#### `viseme_mapper.py`
- **`PHONEME_GROUPS`**: Dictionary mapping group names to phoneme lists
- **`PHONEME_TO_GROUP`**: Reverse mapping for quick lookup
- **`map_phoneme_to_group()`**: Maps individual phonemes to their group
- **`group_and_merge_phonemes()`**: Core function that merges consecutive same-group phonemes
- **`phonemes_to_grouped_timeline()`**: Main pipeline function that:
  1. Groups phonemes by mouth shape
  2. Merges consecutive same-group phonemes
  3. Filters out very short segments (< 40ms)
  4. Applies visual anticipation (40ms shift)
  5. Compresses timeline (0.92x scale)

#### `phoneme_service.py`
- **`text_to_grouped_viseme_sequence()`**: Converts text to grouped viseme timeline
  - Uses g2p-arpabet for phoneme extraction
  - Handles spaces and punctuation as silence
  - Returns grouped segments with timing info

#### `phoneme.py` (API Route)
- **`/tts-to-visemes`** endpoint now returns:
  - `visemes`: Regular viseme sequence (backward compatible)
  - `grouped_visemes`: NEW grouped phoneme sequence
  - `phonemes`: Raw phoneme list
  - `audio_url`: Generated audio file URL

### Frontend (JavaScript)

#### `groupShapeKeys.js`
- **`GROUP_TO_SHAPE_KEYS`**: Maps group names to shape key values
- **`getGroupShapeKeys()`**: Retrieves shape keys for a group
- Defines all 10 group shape configurations

#### `lipSyncScheduler.js`
- **`groupedVisemesToTimeline()`**: Converts backend grouped visemes to timeline events
  - Processes group data with phoneme lists
  - Calculates duration from start/end times
  - Logs detailed group information for debugging

#### `useLipSync.js`
- Updated to prioritize grouped visemes:
  1. **grouped_visemes** (NEW - preferred)
  2. **visemes** (backward compatible)
  3. **phonemes** (fallback)
- Automatically uses the best available data source
- **Anticipatory Blending**: Implements early transition logic
  - Calculates progress through current phoneme
  - When 70% complete, starts blending to next phoneme
  - Uses smoothstep easing for natural transitions

## Visual Comparison

### Old Approach (Without Anticipatory Blending)
```
Phoneme A ████████████ → [NEUTRAL] → Phoneme B ████████████ → [NEUTRAL] → Phoneme C
           100% shape A    ↓ reset     100% shape B    ↓ reset     100% shape C
                          mouth drops                 mouth drops
```

### New Approach (With Anticipatory Blending)
```
Phoneme A ████████▓▓▓▓ → Phoneme B ████████▓▓▓▓ → Phoneme C ████████▓▓▓▓
           70% A | 30% blend    70% B | 30% blend    70% C | 30% blend
                    to B                to C                to next
           
           ↑ Continuous flow - no neutral state! ↑
```


## Benefits

### 1. Improved Timing Accuracy
- Consecutive phonemes with the same mouth shape are merged
- Reduces rapid, unnatural mouth movements
- Better synchronization with audio playback

### 2. More Natural Animation
- Sustained mouth shapes across similar phonemes
- Smoother transitions between different shapes
- Less "possessed" or jittery appearance

### 3. Performance Optimization
- Fewer animation events to process
- Reduced computational overhead
- More efficient timeline processing

### 4. Better Audio Sync
- Groups maintain timing until phoneme sequence completes
- Visual anticipation helps with perceived sync
- Timeline compression (0.92x) accounts for visual lag

### 5. Anticipatory Blending & Ultra-Smooth Transitions
- **Early Transition**: Starts blending at 55% progress (45% of phoneme duration for blending)
- **No Neutral State**: Prevents mouth from returning to neutral between phoneme groups
- **Quintic Smoothstep**: Uses 6t⁵ - 15t⁴ + 10t³ easing (smoother than cubic)
- **Gentle Lerp**: Reduced frame-to-frame speed (18x instead of 30x) for fluid motion
- **Natural Movement**: Mimics how real speech flows without hard stops between sounds
- **Configurable**: `ANTICIPATION_THRESHOLD` can be adjusted (current: 0.45 = 45%)

## Example

### Input Text: "Hello World"
**Raw Phonemes**: `HH`, `AH0`, `L`, `OW1`, `W`, `ER1`, `L`, `D`

### Without Grouping (Old Approach)
8 separate viseme events, one per phoneme

### With Grouping (New Approach)
Merged into fewer events:
1. `g1_OPEN` (HH, AH) - merged
2. `g9_ALVEOLAR` (L) - single
3. `g4_ROUND` (OW, W) - merged
4. `g3_R` (ER) - single
5. `g9_ALVEOLAR` (L) - single
6. `g9_ALVEOLAR` (D) - merged with previous

Result: 6 events instead of 8, with more sustained shapes

### Anticipatory Blending in Action

**Timeline**: When playing the grouped phonemes above, here's how the blending works:

1. **Event 1 (g1_OPEN)**: 0.0s - 0.24s
   - 0.0s - 0.132s: Full g1_OPEN shape (55%)
   - 0.132s - 0.24s: Blend from g1_OPEN → g9_ALVEOLAR (45% - ULTRA SMOOTH)

2. **Event 2 (g9_ALVEOLAR)**: 0.24s - 0.32s
   - Starts already partially blended from previous
   - 0.24s - 0.284s: Full g9_ALVEOLAR shape (55%)
   - 0.284s - 0.32s: Blend from g9_ALVEOLAR → g4_ROUND (45%)

3. **And so on...**

This creates a **continuous, buttery-smooth flow** where the mouth never returns to neutral!
The quintic easing makes transitions feel very natural and organic.

## Configuration

### Timing Parameters
- **MIN_DURATION**: 40ms (minimum segment duration)
- **ANTICIPATION_SHIFT**: 40ms (visual anticipation)
- **COMPRESSION_SCALE**: 0.92 (8% faster for better sync)
- **ANTICIPATION_THRESHOLD**: 0.45 (start blending to next phoneme at 55% progress)
  - Lower values (e.g., 0.35): Even earlier blending, maximum smoothness
  - Higher values (e.g., 0.55): Later blending, more distinct shapes
  - Current (0.45): Ultra-smooth balanced approach
- **LERP_SPEED_MULTIPLIER**: 18 (reduced from 30 for gentler frame-to-frame transitions)
  - Lower values (e.g., 12): Slower, more gradual changes
  - Higher values (e.g., 25): Faster, more responsive changes
  - Current (18): Smooth and fluid motion

### Easing Function
- **Quintic Smoothstep**: `6t⁵ - 15t⁴ + 10t³`
  - Smoother than cubic smoothstep (3t² - 2t³)
  - Creates very gradual acceleration and deceleration
  - Results in organic, natural-looking transitions

### Audio Playback
- **playbackRate**: 0.80 (80% speed in `useLipSync.js`)
- Adjust this value to fine-tune sync (0.1-2.0 range)

## Testing

To test the new grouped phoneme system:

1. **Backend**: The API automatically returns `grouped_visemes` in the response
2. **Frontend**: The hook automatically uses grouped visemes when available
3. **Console Logs**: Check browser console for:
   - "📅 Using NEW grouped viseme timeline"
   - Group details with phoneme lists and durations

## Backward Compatibility

The implementation maintains full backward compatibility:
- Old `visemes` format still generated and returned
- Frontend falls back to old format if `grouped_visemes` not available
- No breaking changes to existing code

## Future Enhancements

Potential improvements:
1. Adjust group definitions based on specific avatar model
2. Fine-tune shape key values per group
3. Add dynamic duration scaling based on speech rate
4. Implement custom blending curves between groups
5. Add user-configurable grouping rules
