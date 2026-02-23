# How to Speed Up Lip Sync Animation (While Keeping Smoothness)

## Quick Answer

To speed up the animation while maintaining smoothness, you have **3 main options**:

### Option 1: Increase Audio Playback Speed (EASIEST)
**File**: `frontend/src/hooks/useLipSync.js` (line ~143)

```javascript
audio.playbackRate = 1.0;  // Change from 0.80 to 1.0 (normal speed)
// or
audio.playbackRate = 1.2;  // 20% faster
```

**Effect**: Speeds up both audio and animation proportionally
**Smoothness**: ✅ Maintained (no change to blending)

---

### Option 2: Increase Timeline Compression (RECOMMENDED)
**File**: `backend/app/services/viseme_mapper.py` (line ~153)

```python
return compress_timeline(filtered, scale=0.85)  # Change from 0.92 to 0.85
```

**Effect**: Makes mouth movements 15% faster than audio
**Smoothness**: ✅ Maintained (blending unchanged)
**Best for**: Making lip movements snappier while audio stays clear

---

### Option 3: Increase Lerp Speed (ADVANCED)
**File**: `frontend/src/hooks/useLipSync.js` (line ~296)

```javascript
const rawLerpSpeed = Math.min(Math.max(Number(delta) * 25 || 0, 0), 1);  // Change from 18 to 25
```

**Effect**: Faster frame-to-frame transitions
**Smoothness**: ⚠️ Slightly reduced (but still smooth with quintic easing)
**Best for**: More responsive, snappy movements

---

## Detailed Configuration Guide

### 1. Audio Playback Speed
**Location**: `frontend/src/hooks/useLipSync.js`, line ~143

```javascript
audio.playbackRate = 0.80;  // Current: 80% speed (slower)
```

**Recommended Values**:
- `0.80` - Current (slow, very clear)
- `0.90` - Slightly faster, still clear
- `1.0` - Normal speed (RECOMMENDED for speed)
- `1.1` - 10% faster
- `1.2` - 20% faster (fast but understandable)

**Pros**: 
- Easiest to change
- Affects both audio and animation together
- No sync issues

**Cons**: 
- Changes audio pitch slightly
- Affects speech clarity at higher speeds

---

### 2. Timeline Compression Scale
**Location**: `backend/app/services/viseme_mapper.py`, line ~153

```python
filtered = compress_timeline(filtered, scale=0.92)  # Current: 8% faster
```

**Recommended Values**:
- `0.92` - Current (8% faster than audio)
- `0.88` - 12% faster (good balance)
- `0.85` - 15% faster (RECOMMENDED for speed)
- `0.80` - 20% faster (very snappy)
- `0.75` - 25% faster (aggressive)

**Pros**: 
- Mouth moves faster than audio (anticipatory)
- Audio stays at normal speed/pitch
- Maintains smoothness

**Cons**: 
- Requires backend restart to take effect
- May look slightly ahead of audio

---

### 3. Lerp Speed Multiplier
**Location**: `frontend/src/hooks/useLipSync.js`, line ~296

```javascript
const rawLerpSpeed = Math.min(Math.max(Number(delta) * 18 || 0, 0), 1);  // Current: 18
```

**Recommended Values**:
- `18` - Current (smooth and gentle)
- `22` - Slightly faster (good balance)
- `25` - Faster (RECOMMENDED for speed)
- `30` - Original value (snappy)
- `35` - Very responsive (may lose some smoothness)

**Pros**: 
- Immediate effect (no restart needed)
- Makes transitions more responsive
- Still smooth with quintic easing

**Cons**: 
- Too high values can make it jittery
- May reduce the "buttery smooth" feel

---

### 4. Anticipation Threshold (DON'T CHANGE FOR SPEED)
**Location**: `frontend/src/hooks/useLipSync.js`, line ~264

```javascript
const ANTICIPATION_THRESHOLD = 0.45;  // Keep this for smoothness!
```

**Note**: This controls smoothness, not speed. Keep at 0.45 for ultra-smooth transitions.

---

## Recommended Combinations

### For Moderate Speed Increase (Balanced)
```javascript
// frontend/src/hooks/useLipSync.js
audio.playbackRate = 1.0;  // Normal speed (from 0.80)
const rawLerpSpeed = Math.min(Math.max(Number(delta) * 22 || 0, 0), 1);  // From 18
```
```python
# backend/app/services/viseme_mapper.py
return compress_timeline(filtered, scale=0.88)  # From 0.92
```
**Result**: ~20% faster overall, still very smooth

---

### For Maximum Speed (Still Smooth)
```javascript
// frontend/src/hooks/useLipSync.js
audio.playbackRate = 1.2;  // 20% faster audio
const rawLerpSpeed = Math.min(Math.max(Number(delta) * 25 || 0, 0), 1);  // From 18
```
```python
# backend/app/services/viseme_mapper.py
return compress_timeline(filtered, scale=0.85)  # From 0.92
```
**Result**: ~35% faster overall, smooth with quintic easing

---

### For Snappy/Responsive Feel
```javascript
// frontend/src/hooks/useLipSync.js
audio.playbackRate = 1.0;  // Normal speed
const rawLerpSpeed = Math.min(Math.max(Number(delta) * 30 || 0, 0), 1);  // From 18
const ANTICIPATION_THRESHOLD = 0.35;  // From 0.45 (less blending time)
```
```python
# backend/app/services/viseme_mapper.py
return compress_timeline(filtered, scale=0.85)  # From 0.92
```
**Result**: Very responsive, distinct phonemes, still smooth

---

## Step-by-Step: Quick Speed Boost

### Easiest Method (No Backend Changes)
1. Open `frontend/src/hooks/useLipSync.js`
2. Find line ~143: `audio.playbackRate = 0.80;`
3. Change to: `audio.playbackRate = 1.0;`
4. Find line ~296: `const rawLerpSpeed = Math.min(Math.max(Number(delta) * 18 || 0, 0), 1);`
5. Change to: `const rawLerpSpeed = Math.min(Math.max(Number(delta) * 25 || 0, 0), 1);`
6. Save and test!

**Result**: ~30% faster, still smooth ✅

---

### Best Method (With Backend Changes)
1. **Backend**: Open `backend/app/services/viseme_mapper.py`
   - Line ~153: Change `scale=0.92` to `scale=0.85`
   - Restart backend server

2. **Frontend**: Open `frontend/src/hooks/useLipSync.js`
   - Line ~143: Change `audio.playbackRate = 0.80` to `1.0`
   - Line ~296: Change `* 18` to `* 25`
   - Save (auto-reloads)

**Result**: ~40% faster, maintains smoothness with quintic easing ✅

---

## Testing Your Changes

After making changes:

1. **Speak some text** through the avatar
2. **Check for**:
   - ✅ Smooth transitions (no jitter)
   - ✅ Good sync with audio
   - ✅ Natural-looking movements
   - ✅ Faster overall speed

3. **If too fast**: Reduce values slightly
4. **If not smooth enough**: Keep lerp speed at 18-22 range

---

## Summary Table

| Parameter | Location | Current | For Speed | Effect |
|-----------|----------|---------|-----------|--------|
| Audio Playback | `useLipSync.js:143` | 0.80 | 1.0-1.2 | Audio + animation speed |
| Timeline Compression | `viseme_mapper.py:153` | 0.92 | 0.85 | Mouth movement speed |
| Lerp Speed | `useLipSync.js:296` | 18 | 25 | Transition responsiveness |
| Anticipation | `useLipSync.js:264` | 0.45 | **Keep 0.45** | Smoothness (don't change) |

---

## Pro Tips

1. **Start with audio playback speed** - easiest to test and revert
2. **Keep quintic smoothstep** - it maintains smoothness even at higher speeds
3. **Don't go below 0.75 on timeline compression** - may look too ahead of audio
4. **Test with different text lengths** - short vs long sentences
5. **Keep anticipation threshold at 0.45** - this is what makes it smooth!

---

## Reverting to Current Settings

If you want to go back to the current ultra-smooth settings:

```javascript
// frontend/src/hooks/useLipSync.js
audio.playbackRate = 0.80;
const rawLerpSpeed = Math.min(Math.max(Number(delta) * 18 || 0, 0), 1);
const ANTICIPATION_THRESHOLD = 0.45;
```

```python
# backend/app/services/viseme_mapper.py
return compress_timeline(filtered, scale=0.92)
```
