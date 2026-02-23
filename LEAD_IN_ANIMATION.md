# Animation Lead-Time Feature (Offset Animation)

## Overview
The lip sync system now includes a **1-second animation offset** where the animation runs continuously ahead of the audio throughout the entire speech. This fixes sync issues where audio appears ahead of the mouth movements, creating perfect lip sync.

## How It Works

### Timeline
```
Animation: ─────[Phoneme 1]─────[Phoneme 2]─────[Phoneme 3]─────►
Audio:     [1s delay]───────[Phoneme 1]─────[Phoneme 2]─────[Phoneme 3]►
           │                │
           │                Audio starts
           Animation starts
           
           ◄─── 1s offset maintained throughout ───►
```

### Behavior

1. **Animation Starts Immediately** (t=0s):
   - Avatar begins animating from the beginning of the timeline
   - Progresses through phonemes naturally
   - Runs at normal speed

2. **Audio Starts After Delay** (t=1.0s):
   - Audio begins playing
   - Animation is already 1 second into the timeline
   - Offset is maintained throughout the entire speech

3. **Continuous Offset**:
   - Animation always plays 1 second ahead of audio
   - When audio is at phoneme 1, animation is at phoneme 2
   - Perfect sync because animation anticipates the sound

4. **Why This Works**:
   - Fixes the issue where audio was ahead of animation
   - Mouth movements now appear perfectly timed with sound
   - Natural anticipatory movement throughout speech

## Configuration

### Animation Offset Duration
**Location**: `frontend/src/hooks/useLipSync.js`, line ~27

```javascript
const LEAD_IN_TIME = 1.0; // Animation runs 1 second ahead of audio
```

**Recommended Values**:
- `0.5` - Animation 0.5s ahead (subtle offset)
- `0.75` - Animation 0.75s ahead (moderate)
- `1.0` - Current (1 second ahead) ✅
- `1.5` - Animation 1.5s ahead (aggressive)
- `0.0` - No offset (animation syncs directly to audio)

**How to Choose**:
- If audio sounds **ahead** of animation: **Increase** this value
- If animation looks **ahead** of audio: **Decrease** this value
- Start at 1.0 and adjust based on your specific setup

**To Disable**: Set to `0.0` for direct audio sync

## Implementation Details

### Key Components

1. **Animation Start Time Tracking**:
   ```javascript
   const animationStartTime = useRef(0);
   animationStartTime.current = performance.now() / 1000;
   ```

2. **Delayed Audio Playback**:
   ```javascript
   setTimeout(async () => {
       await audio.play();
   }, LEAD_IN_TIME * 1000);
   ```

3. **Offset Sync Calculation** (The Key Change):
   ```javascript
   if (audioRef.current && audioRef.current.currentTime > 0) {
       // Audio is playing - animation runs LEAD_IN_TIME ahead
       const audioTime = audioRef.current.currentTime * durationRatio.current;
       const animationTime = audioTime + LEAD_IN_TIME; // Offset applied here!
       syncTime = Math.max(0, Math.min(animationTime, maxTime));
   } else {
       // Before audio starts - animate from beginning
       const elapsedSinceStart = currentRealTime - animationStartTime.current;
       syncTime = Math.max(0, Math.min(elapsedSinceStart, LEAD_IN_TIME));
   }
   ```

### Animation States

| State | Time Range | Behavior |
|-------|------------|----------|
| **Lead-In** | 0s - 1.0s | Slowly animate first phoneme |
| **Waiting** | 1.0s - audio start | Hold at first phoneme |
| **Synced** | Audio playing | Normal audio-synced animation |
| **Ended** | Audio ended | Cleanup and reset |

## Benefits

### 1. Natural Anticipation
- Mimics real human speech preparation
- Mouth moves before sound (like real life)
- Creates more believable avatar behavior

### 2. Smooth Start
- No sudden "snap" to first phoneme
- Gradual opening of mouth
- Professional, polished appearance

### 3. Visual Engagement
- Draws attention before speech
- Signals that avatar is about to speak
- Improves user experience

### 4. Realistic Timing
- Matches how humans prepare to speak
- Breath intake, mouth positioning
- Natural flow into speech

## Examples

### Short Lead-In (0.5s)
```javascript
const LEAD_IN_TIME = 0.5;
```
- Quick preparation
- Minimal anticipation
- Good for rapid-fire dialogue

### Standard Lead-In (1.0s) - Current
```javascript
const LEAD_IN_TIME = 1.0;
```
- Noticeable anticipation
- Natural preparation time
- Balanced for most use cases

### Long Lead-In (1.5s)
```javascript
const LEAD_IN_TIME = 1.5;
```
- Dramatic effect
- Emphasizes preparation
- Good for important announcements

## Technical Notes

### Performance Impact
- **Minimal**: Only adds setTimeout delay
- **No additional rendering**: Uses existing animation loop
- **Efficient**: Single performance.now() call per frame

### Compatibility
- Works with all timeline formats (grouped, regular, phoneme-based)
- Compatible with anticipatory blending
- Maintains smoothness with quintic easing

### Edge Cases Handled
- **Speech interruption**: Properly cancels lead-in if new speech starts
- **Fast switching**: speechId prevents race conditions
- **Audio errors**: Cleanup called if audio fails to play
- **Timeline empty**: Gracefully handles missing timeline data

## Debugging

### Console Logs
When audio starts playing, you'll see:
```
🎬 Audio started playing (after 1s lead-in)
```

### Visual Verification
1. Watch the avatar's mouth
2. It should start moving immediately
3. Audio should start 1 second later
4. Movement should be continuous (no reset)

### Timing Check
```javascript
// Add this to the animation loop for debugging
console.log(`Elapsed: ${elapsedSinceStart.toFixed(2)}s, SyncTime: ${syncTime.toFixed(3)}s`);
```

## Customization Examples

### Variable Lead-In Based on Text Length
```javascript
// Longer text = longer lead-in
const textLength = text.length;
const LEAD_IN_TIME = textLength > 100 ? 1.5 : textLength > 50 ? 1.0 : 0.5;
```

### Emotion-Based Lead-In
```javascript
// Different lead-in for different emotions
const LEAD_IN_TIME = emotion === 'excited' ? 0.5 : emotion === 'thoughtful' ? 1.5 : 1.0;
```

### Random Variation
```javascript
// Add natural variation
const LEAD_IN_TIME = 0.8 + Math.random() * 0.4; // 0.8s - 1.2s
```

## Combining with Other Features

### With Phoneme Grouping
- Lead-in animates first **group** (not individual phoneme)
- Smoother start with merged phonemes
- More natural opening movement

### With Anticipatory Blending
- Lead-in → First group → Blend to second group
- Continuous flow from start to finish
- No neutral states anywhere

### With Speed Tuning
- Lead-in duration independent of playback speed
- Consistent preparation time regardless of audio speed
- Maintains natural feel at all speeds

## Summary

The lead-in animation feature adds a professional touch by:
- ✅ Starting mouth movement 1 second before audio
- ✅ Creating natural speech anticipation
- ✅ Improving perceived realism
- ✅ Maintaining smooth transitions
- ✅ Being fully configurable

This makes the avatar feel more alive and responsive, as if it's truly preparing to speak rather than mechanically reacting to audio!
