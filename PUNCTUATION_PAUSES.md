# Punctuation Pauses

## Overview
The lip sync system has been enhanced to include natural pauses for punctuation marks. This improves speech pacing and makes the avatar's delivery feel more human and less robotic.

## Supported Punctuation

Different punctuation marks trigger different pause durations:

### Short Pauses
- **Space** (` `): 0.05s (Very brief word separation)
- **Quote** (`"` `'`): 0.10s (Minimal pause)
- **Parentheses/Brackets** (`(` `)` `[` `]`): 0.15s - 0.20s (Grouping pause)
- **Dash/Hyphen** (`-` `–`): 0.20s - 0.25s (Brief interjection)
- **Comma** (`,`): 0.25s (Natural clause break)

### Medium Pauses
- **Semicolon** (`;`): 0.30s (Stronger than comma)
- **Colon** (`:`): 0.30s (Anticipatory pause)
- **Em Dash** (`—`): 0.30s (Thought break)

### Long Pauses (Sentence End)
- **Period** (`.`): 0.45s (Full stop)
- **Question Mark** (`?`): 0.45s (Inquiry pause)
- **Exclamation Mark** (`!`): 0.45s (Emphatic pause)

### Special Pauses
- **Ellipsis** (`...`): 0.50s (Thinking/Trailing off)
  - The system automatically detects `...` sequences and merges them into a single 0.50s pause instead of three 0.45s pauses.

## Configuration

You can adjust these values in `backend/app/services/phoneme_service.py`:

```python
PUNCTUATION_PAUSES = {
    # Short pauses
    ' ': 0.05,
    ',': 0.25,
    # ...
    
    # Long pauses
    '.': 0.45,
    # ...
}
```

## How It Works

1. **Text Processing**: The text input is processed character by character (or by `g2p`).
2. **Detection**: When a punctuation mark is encountered, it's identified as a pause.
3. **Ellipsis Handling**: Sequences of three dots `...` are specially detected and converted to a single long pause.
4. **Viseme Generation**: 
   - A `sil` (silence) phoneme is inserted into the timeline.
   - The appropriate duration is assigned based on the punctuation type.
   - The mouth shape is set to closed/neutral (`ZERO` shape keys).

## Animation Behavior during Pauses

During a punctuation pause:
- **Audio**: Silence (or natural gaps in TTS audio).
- **Mouth**: Closes to a neutral position (`g5_CLOSED` / `sil` group).
- **Timing**: The animation holds the neutral pose for the specified duration.

## Usage Example

Input Text:
> "Hello, world... I am ready! (Are you?)"

Timeline Generation:
1. `Hello` phonemes
2. `,` → **0.25s Silence**
3. `world` phonemes
4. `...` → **0.50s Silence**
5. `I am ready` phonemes
6. `!` → **0.45s Silence**
7. `(` → **0.15s Silence**
8. `Are you` phonemes
9. `?` → **0.45s Silence**
10. `)` → **0.20s Silence**

This creates a natural rhythm matching human speech patterns.
