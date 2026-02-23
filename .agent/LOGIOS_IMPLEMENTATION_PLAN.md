# LOGIOS Phoneme Generation Implementation Plan

## Overview
This plan outlines the transition from the current viseme generation system to a LOGIOS-based phoneme generation system using the `gp2-arpabet` library. The implementation will use your custom 39-phoneme ARPABET list with shape key mappings from the research document.

---

## Current System Analysis

### What We Have Now:
1. **Frontend (edge-tts - DEPRECATED)**
   - Edge-TTS is installed in frontend but deprecated
   - Not being used currently

2. **Backend TTS**
   - ✅ Edge-TTS already installed and working in backend (`tts_service.py`)
   - Generates audio files in `generated_audio/` directory
   - Used by `/api/v1/phoneme/tts-to-visemes` endpoint

3. **Phoneme Generation**
   - Currently using `g2p_en` library (Grapheme-to-Phoneme)
   - Converts text → ARPABET phonemes
   - Then uses Allosaurus for audio → IPA → ARPABET conversion

4. **Viseme Generation**
   - Generated from audio files using Allosaurus
   - IPA phonemes mapped to ARPABET
   - ARPABET mapped to viseme shapes

### Your Research Tables:
1. **39 ARPABET Phonemes** (Lines 238-278 in research doc)
   - Complete mapping of ARPABET → Lips/Teeth/Tongue shape keys
   - Each phoneme has specific shape key values (0.0-1.0)

2. **IPA to ARPABET Mapping** (Lines 180-222 in research doc)
   - Direct conversion table from IPA symbols to ARPABET

---

## Proposed Changes

### ✅ Your Considerations (Analysis):

1. **"Use IPA to ARPABET conversion logic"**
   - ✅ CORRECT: We'll use your mapping table (lines 180-222)
   - This ensures consistency with your 39-phoneme list

2. **"Use LOGIOS gp2-arpabet for text → phoneme conversion"**
   - ✅ CORRECT: Replace `g2p_en` with `gp2-arpabet`
   - LOGIOS provides more accurate ARPABET conversion
   - Better alignment with CMU pronunciation dictionary

3. **"Use the 39-phoneme list for shape keys"**
   - ✅ CORRECT: Your table (lines 238-278) has precise shape key values
   - Much more detailed than current generic viseme mapping

4. **"Move edge-tts from frontend to backend"**
   - ✅ ALREADY DONE: Edge-TTS is already in backend
   - Frontend just calls the API endpoint
   - No changes needed here

5. **"We shouldn't need audio-to-visemes anymore"**
   - ✅ CORRECT: Removing audio file upload feature entirely
   - Only text → LOGIOS → ARPABET → shape keys pipeline
   - Simpler, cleaner architecture
   - **Action**: Remove Allosaurus dependency and audio upload endpoints

---

## Implementation Plan

### Phase 1: Install LOGIOS Library
**File**: `backend/requirements.txt`

**Action**:
```txt
# Add to requirements.txt
gp2-arpabet
```

**Verification**:
```bash
pip install gp2-arpabet
```

---

### Phase 2: Create ARPABET Shape Key Mapping
**File**: `backend/app/services/phoneme_shapes.py` (NEW FILE)

**Action**: Create a new service file with your 39-phoneme shape key mappings

**Content**:
```python
"""
ARPABET to Shape Key Mapping
Based on research from Phonemes-Visemes-research.md
39 ARPABET phonemes mapped to lips, teeth, and tongue shape keys
"""

# Complete mapping from lines 238-278 of research doc
PHONEME_SHAPE_KEYS = {
    'AA': {
        'lips': {'Lips_Open_Wide': 0.8, 'Lips_Wide': 0.5},
        'teeth': {'TeethTongue_Open': 1.0}
    },
    'AE': {
        'lips': {'Lips_Wide': 0.7, 'Lips_Open_Wide': 0.7},
        'teeth': {'TeethTongue_Bite': 0.3}
    },
    # ... (all 39 phonemes from your table)
}

# IPA to ARPABET mapping from lines 180-222
IPA_TO_ARPABET = {
    'ɑ': 'AA',
    'æ': 'AE',
    'ʌ': 'AH',
    # ... (complete mapping)
}

def get_shape_keys_for_phoneme(arpabet: str) -> dict:
    """
    Get shape key values for a given ARPABET phoneme
    
    Args:
        arpabet: ARPABET phoneme (e.g., 'AA', 'B', 'CH')
    
    Returns:
        Dictionary with 'lips' and 'teeth' shape key values
    """
    return PHONEME_SHAPE_KEYS.get(arpabet, {
        'lips': {'Lips_Neutral': 1.0},
        'teeth': {'TeethTongue_Neutral': 1.0}
    })
```

---

### Phase 3: Update Phoneme Service
**File**: `backend/app/services/phoneme_service.py`

**Changes**:
1. Replace `g2p_en` with `gp2-arpabet`
2. Update `text_to_phonemes()` to use LOGIOS
3. Update `text_to_viseme_sequence()` to use new shape key mappings
4. **REMOVE** `audio_to_visemes()` function (no longer needed)
5. **REMOVE** Allosaurus imports and dependencies

**Key Changes**:
```python
# OLD (Line 10):
from g2p_en import G2p
g2p = G2p()

# NEW:
from gp2_arpabet import G2PArpabet
g2p = G2PArpabet()

# REMOVE these lines (20-24):
# try:
#     from allosaurus.app import read_recognizer
#     ALLOSAURUS_AVAILABLE = True
# except ImportError:
#     ALLOSAURUS_AVAILABLE = False

# Update text_to_phonemes (lines 52-81):
def text_to_phonemes(text: str, language: str = 'en-us') -> str:
    """Convert text to ARPABET phonemes using LOGIOS"""
    if not g2p:
        raise RuntimeError("gp2-arpabet library not initialized")
    
    # LOGIOS returns ARPABET directly
    phonemes = g2p(text)  # Returns list of ARPABET strings
    
    # Clean stress markers (AA1 → AA)
    cleaned = [remove_stress(p) for p in phonemes if p.strip()]
    
    return ' '.join(cleaned)

# Update text_to_viseme_sequence (lines 84-150):
def text_to_viseme_sequence(text: str, language: str = 'en-us') -> List[Dict]:
    """Convert text to viseme sequence using LOGIOS + shape keys"""
    from app.services.phoneme_shapes import get_shape_keys_for_phoneme
    
    phonemes = g2p(text)
    viseme_sequence = []
    current_time = 0.0
    
    for phone in phonemes:
        base_phone = remove_stress(phone)
        
        # Get shape keys from your mapping
        shape_keys = get_shape_keys_for_phoneme(base_phone)
        
        duration = ARPABET_DURATIONS.get(base_phone, 0.08)
        
        viseme_sequence.append({
            'viseme': base_phone,  # ARPABET phoneme
            'start': current_time,
            'duration': duration,
            'shape_keys': shape_keys  # NEW: Include shape key data
        })
        
        current_time += duration
    
    return viseme_sequence

# REMOVE audio_to_visemes() function (lines 205-252)
# REMOVE get_recognizer() function (lines 169-180)
# REMOVE IPA_TO_ARPABET mapping (lines 188-197) - moved to phoneme_shapes.py
```


---

### Phase 3.5: Remove Audio Upload Endpoints
**File**: `backend/app/api/v1/routes/phoneme.py`

**Actions**:
1. **REMOVE** `/audio-to-visemes` endpoint (lines 64-110)
2. **UPDATE** `/tts-to-visemes` endpoint to use text-only pipeline
3. Keep `/text-to-visemes` endpoint (updated to use LOGIOS)
4. Keep `/health` endpoint

**Changes**:
```python
# REMOVE this entire endpoint:
# @router.post("/audio-to-visemes", response_model=List[VisemeFrame])
# async def convert_audio_to_visemes(file: UploadFile = File(...)):
#     ...

# UPDATE /tts-to-visemes to remove audio processing:
@router.post("/tts-to-visemes", response_model=dict)
async def convert_tts_to_visemes(request: PhonemeRequest, req: Request = None):
    """
    Generate audio from text using edge-tts and return visemes.
    Uses LOGIOS for direct text → ARPABET → shape keys conversion.
    """
    from app.services.tts_service import generate_speech
    from app.services.phoneme_service import text_to_viseme_sequence
    
    try:
        if not request.text or not request.text.strip():
            raise HTTPException(status_code=400, detail="Text cannot be empty")

        # Generate audio (mp3)
        audio_path = await generate_speech(request.text)
        
        # Get visemes directly from text using LOGIOS
        visemes = text_to_viseme_sequence(request.text, request.language)
        
        # Construct public URL
        base_url = str(req.base_url).rstrip('/')
        audio_url = f"{base_url}/{audio_path.replace(os.path.sep, '/')}"
        
        return {
            "audio_url": audio_url,
            "visemes": [VisemeFrame(**v) for v in visemes]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

### Phase 4: Update Frontend Viseme Utils
**File**: `frontend/src/utils/visemeUtils.js`

**Changes**:
1. Create new `phonemePoses` dictionary with your 39-phoneme shape keys
2. Update `getVisemeMorphTargets()` to use ARPABET-based shape keys
3. Keep API integration unchanged (it already works)

**Key Changes**:
```javascript
// NEW: ARPABET to Shape Key mapping (based on your research)
export const phonemePoses = {
    'AA': {
        Lips_Open_Wide: 0.8,
        Lips_Wide: 0.5,
        TeethTongue_Open: 1.0
    },
    'AE': {
        Lips_Wide: 0.7,
        Lips_Open_Wide: 0.7,
        TeethTongue_Bite: 0.3
    },
    // ... all 39 phonemes
};

// Update getVisemeMorphTargets to use phonemePoses
export function getVisemeMorphTargets(viseme) {
    // viseme is now an ARPABET phoneme (e.g., 'AA', 'B', 'CH')
    const shapeKeys = phonemePoses[viseme] || phonemePoses['sil'];
    
    // Map to Ready Player Me morph targets
    return {
        mouthOpen: shapeKeys.TeethTongue_Open || 0,
        mouthSmile: shapeKeys.Lips_Wide || 0,
        mouthFunnel: shapeKeys.Lips_Round || 0,
        mouthPucker: shapeKeys.Lips_Close || 0,
        jawOpen: shapeKeys.TeethTongue_Open || 0
    };
}
```

---

### Phase 5: Update Avatar Component
**File**: `frontend/src/components/Avatar.jsx`

**Changes**:
- Minimal changes needed
- The component already uses `getVisemeMorphTargets(currentViseme.viseme)`
- It will automatically use the new ARPABET-based mappings

**Verification Points**:
- Line 681: `getVisemeMorphTargets(currentViseme.viseme)` will now receive ARPABET
- Lines 700-740: Morph target application remains the same

---

### Phase 6: Remove Deprecated Code & Audio Upload UI

**Backend Cleanup**:
1. `backend/requirements.txt` - Remove `allosaurus` dependency
2. `backend/app/services/phoneme_service.py` - Remove Allosaurus code
3. `backend/app/api/v1/routes/phoneme.py` - Remove audio upload endpoint

**Frontend Cleanup**:
1. `frontend/package.json` - Remove edge-tts if present
2. `frontend/src/utils/visemeUtils.js`:
   - Remove `audioToVisemesAPI()` function (lines 580-610)
   - Remove old local phoneme conversion (lines 66-314)
   - Keep API integration for text-to-speech
3. `frontend/src/components/Avatar.jsx`:
   - Remove audio file upload handling (lines 470-501)
   - Remove `audioFile` prop
   - Simplify to text-only input
4. **Remove audio upload UI components** (if any exist in AvatarPage or similar)

**Files to Check for Audio Upload UI**:
- Search for file input elements accepting audio files
- Search for `audioFile` state variables
- Search for "upload audio" buttons or forms

---

## Testing Plan

### Test 1: LOGIOS Installation
```bash
cd backend
pip install gp2-arpabet
python -c "from gp2_arpabet import G2PArpabet; g = G2PArpabet(); print(g('hello world'))"
```
**Expected**: `['HH', 'AH0', 'L', 'OW1', ' ', 'W', 'ER1', 'L', 'D']`

### Test 2: Backend API
```bash
curl -X POST http://localhost:8000/api/v1/phoneme/text-to-visemes \
  -H "Content-Type: application/json" \
  -d '{"text": "hello"}'
```
**Expected**: JSON with ARPABET phonemes and shape keys

### Test 3: Frontend Integration
1. Start frontend dev server
2. Navigate to Avatar page
3. Type "hello world" and click Speak
4. Verify:
   - Audio plays correctly
   - Lips move with proper shape keys
   - Console shows ARPABET phonemes (not IPA)
   - No audio upload UI visible


---

## Migration Checklist

- [ ] **Phase 1**: Install `gp2-arpabet` in backend
- [ ] **Phase 2**: Create `phoneme_shapes.py` with 39-phoneme mappings
- [ ] **Phase 3**: Update `phoneme_service.py` to use LOGIOS (remove Allosaurus)
- [ ] **Phase 3.5**: Remove audio upload endpoints from `phoneme.py`
- [ ] **Phase 4**: Update `visemeUtils.js` with ARPABET shape keys
- [ ] **Phase 5**: Update Avatar.jsx to remove audio upload handling
- [ ] **Phase 6**: Remove deprecated code and audio upload UI
- [ ] **Test 1**: Verify LOGIOS installation
- [ ] **Test 2**: Test backend API endpoints
- [ ] **Test 3**: Test frontend text-to-speech (no audio upload)

---

## Potential Issues & Solutions

### Issue 1: LOGIOS Returns Different Format
**Solution**: Add adapter function to normalize output to match expected format

### Issue 2: Shape Keys Don't Match Model
**Solution**: Create mapping layer between your shape keys and Ready Player Me morph targets

### Issue 3: Timing Mismatch
**Solution**: Keep duration scaling logic (already implemented in Avatar.jsx lines 516-527)

### Issue 4: Missing Phonemes
**Solution**: Add fallback to neutral shape for unknown phonemes

---

## Summary

### What Changes:
1. ✅ Backend: `g2p_en` → `gp2-arpabet` (LOGIOS)
2. ✅ Backend: New shape key mapping service
3. ✅ Backend: Remove Allosaurus and audio upload endpoints
4. ✅ Frontend: ARPABET-based `phonemePoses` dictionary
5. ✅ Frontend: Remove audio upload UI and handling
6. ✅ Remove deprecated frontend edge-tts

### What Stays:
1. ✅ Backend edge-TTS (already working)
2. ✅ Avatar.jsx lip sync animation logic
3. ✅ API endpoints structure (text-to-visemes, tts-to-visemes)

### What's Removed:
1. ❌ Audio file upload feature
2. ❌ Allosaurus dependency
3. ❌ `/audio-to-visemes` endpoint
4. ❌ Audio upload UI components

### Benefits:
1. 🎯 More accurate phoneme generation (LOGIOS vs g2p_en)
2. 🎯 Precise shape key control (39 phonemes vs generic visemes)
3. 🎯 Better lip sync quality
4. 🎯 Cleaner architecture (text-only pipeline)
5. 🎯 Simpler codebase (no audio upload complexity)
6. 🎯 Faster processing (no audio file handling)


---

## Audio Upload UI Analysis

**Finding**: No visible audio upload UI exists in the frontend!

**Evidence**:
- `AvatarPage.jsx` has `audioFile` state (line 101) and `fileInputRef` (line 102)
- BUT no actual file input element in the JSX
- No upload button or drag-drop zone
- The feature was planned but never implemented in the UI

**Cleanup Required**:
1. Remove `audioFile` state from AvatarPage.jsx
2. Remove `fileInputRef` from AvatarPage.jsx
3. Remove `audioFile` prop from Avatar component
4. Remove audio file handling logic from Avatar.jsx (lines 470-501)
5. Remove `audioToVisemesAPI()` from visemeUtils.js

---

## Next Steps

**Awaiting your approval to proceed with implementation.**

Once you give the green light, I will:
1. Install dependencies
2. Create the new files
3. Update existing files
4. Run tests
5. Verify everything works

**Estimated Time**: 30-45 minutes for full implementation and testing

**Just say "proceed" or "green light" to start! 🚀**
