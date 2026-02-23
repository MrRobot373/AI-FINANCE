# Lip Sync & Audio Flow – How Mouth Shapes and Words Are Matched

This document describes how the lip-sync and audio logic work end-to-end, and **why mouth shapes and spoken words/timing can mismatch**.

---

## 1. End-to-end pipeline

```
User text
    → Backend: TTS (edge-tts) + phonemes (g2p_en)
    → API returns: { audio_url, phonemes[], visemes[] }
    → Frontend: builds its own timeline from phonemes only
    → Audio plays; each frame: syncTime from audio → pick viseme → blend shape keys
```

---

## 2. Backend (audio + phonemes + visemes)

**File:** `backend/app/api/v1/routes/phoneme.py`  
**Endpoint:** `POST /api/v1/phoneme/tts-to-visemes`

1. **TTS:** `generate_speech(text)` → generates MP3, returns file path → frontend gets `audio_url`.
2. **Phonemes:** `text_to_phonemes(text)` → g2p_en → ARPABET list (e.g. `["HH", "AH0", "L", "OW1"]`) → returned as **array** (e.g. `phonemes: ["HH","AH","L","OW"]` after split).
3. **Viseme sequence (with timing):** `text_to_viseme_sequence(text)` in `backend/app/services/phoneme_service.py`:
   - Uses same g2p_en phonemes.
   - For each phoneme: `start`, `duration` (from `ARPABET_DURATIONS`), and `shape_keys` from `phoneme_shapes.get_shape_keys_for_phoneme()`.
   - So backend **does** produce a timed sequence: each item has `viseme`, `start`, `duration`, `shape_keys` (nested `lips` / `teeth`).

**Important:** The API response includes **both**:
- `phonemes`: list of symbols (used by frontend).
- `visemes`: list of `{ viseme, start, duration, shape_keys }` (currently **not** used by frontend for timing or shapes).

**Backend timing source:** `backend/app/services/phoneme_service.py` – `ARPABET_DURATIONS` (vowels ~0.12s, consonants ~0.06–0.08s, punctuation 0.2–0.4s). So backend timing is **estimated from text**, not from the actual TTS audio waveform.

---

## 3. Frontend – fetching and using the API

**File:** `frontend/src/utils/visemeUtils.js`  
**Function:** `textToAudioVisemesAPI(text)`

- Calls `POST .../tts-to-visemes` with `{ text }`.
- Returns `{ audio_url, phonemes, visemes }` (full response).

**File:** `frontend/src/hooks/useLipSync.js`

- Uses only `audio_url` and **`phonemes`** from that response.
- **Does not use** `visemes` (so backend `start` / `duration` / `shape_keys` are ignored).
- Builds its own timeline with **frontend** durations and **frontend** shape keys.

---

## 4. Frontend – timeline (when each mouth shape is shown)

**File:** `frontend/src/utils/lipSyncScheduler.js`  
**Function:** `createVisemeTimeline(phonemes)`

- **Input:** array of phoneme symbols (e.g. `["HH","AH","L","OW"]`).
- Cleans phonemes (strip digits and non-A–Z → e.g. `AH0` → `AH`).
- For each cleaned phoneme:
  - **Viseme category:** `PHONEME_TO_VISEME[phoneme]` from `lipSyncMappings.js` (e.g. `AH` → `"Open"`).
  - **Duration:** `getPhonemeDuration(phoneme)` from `lipSyncMappings.js` (vowels ~100 ms, consonants ~50 ms, with min 40–80 ms).
  - **Time:** `startTime = currentTime`, `endTime = startTime + duration`, then `currentTime = endTime`.
  - **Shape keys:** `VISEME_TO_SHAPES[visemeCategory]` from `lipSyncMappings.js` (flat object, e.g. `Lips_Open_Wide: 1`).
- **Output:** array of events: `{ phoneme, viseme, startTime, endTime, duration, shapeKeys, nextPhoneme }`.

So:
- **When** each shape is shown = frontend `startTime` / `endTime` from **frontend** `getPhonemeDuration()`.
- **What** shape is shown = frontend `VISEME_TO_SHAPES` (viseme categories), **not** backend `shape_keys`.

---

## 5. Matching timeline to audio (sync time)

**File:** `frontend/src/hooks/useLipSync.js`

- **Audio:** `new Audio(audio_url)`, then `audio.play()`. Playback position = `audio.currentTime`; total length = `audio.duration`.
- **Ratio (once metadata loaded):**
  - `durationRatio.current = lastEvent.endTime / audio.duration`
  - So: **total timeline duration** is scaled to match **actual audio length**.
- **Sync time each frame:**
  - `syncTime = audioRef.current.currentTime * durationRatio.current`
  - So when the audio is at 50%, we are at 50% of the **frontend** timeline.

So:
- **Overall length** of mouth animation matches the audio (stretch/compress of the whole timeline).
- **Distribution** of which phoneme is active at which moment is still the **frontend’s** fixed per-phoneme durations. Real TTS might say “hello” with a long “o” and short “hel”; the frontend still uses its own fixed 100 ms / 50 ms style timing, so mouth and words can drift.

---

## 6. Per-frame animation (which mouth shape is applied)

**File:** `frontend/src/hooks/useLipSync.js` (inside `useFrame`)

1. **Current event:**  
   Find event in `timelineRef.current` where `syncTime >= e.startTime && syncTime <= e.endTime`. Cache index in `currentEventIndex.current`.
2. **Target weights:**  
   From that event’s `shapeKeys` (from `VISEME_TO_SHAPES`).
3. **Coarticulation (lookahead):**  
   If the **next** event is one of `B, M, P, UW, OW, AO, AW` and starts within 0.15 s, blend in that next event’s round/close shapes (e.g. `Lips_Round`, `Lips_Protude`, `Lips_Purse_Narrow`) with a ramp so the mouth starts moving a bit early.
4. **Apply to mesh:**  
   For each key in `ALL_SHAPE_KEYS`, `target = targetWeights[key] || 0`, then:
   - `headMeshRef.morphTargetInfluences[hDict[key]] = lerp(current, target, LERP_SPEED)`
   - Same for teeth mesh if present.  
   `LERP_SPEED = min(delta * 15, 1)` so shapes blend smoothly.

Morph targets are driven only by the **frontend** timeline and **frontend** shape keys; backend `visemes[].shape_keys` are never used.

---

## 7. Shape key sources (mouth “look”)

- **Backend:** `backend/app/services/phoneme_shapes.py` – `get_shape_keys_for_phoneme(arpabet)` returns per-phoneme values in the form `{ lips: { ... }, teeth: { ... } }` (detailed, per phoneme).
- **Frontend:** `frontend/src/utils/lipSyncMappings.js`:
  - `PHONEME_TO_VISEME`: phoneme → viseme **category** (e.g. Open, Round, Close).
  - `VISEME_TO_SHAPES`: viseme category → **flat** shape key object (e.g. `Lips_Open_Wide`, `TeethTongue_Open`).

So the **actual** mouth look is entirely from `lipSyncMappings.js` (categories + flat shapes). Backend `shape_keys` are not used.

---

## 8. Why mouth and words/timing can mismatch

| Cause | Explanation |
|-------|-------------|
| **Timing is estimated twice** | Backend has its own durations (`ARPABET_DURATIONS`); frontend has different ones (`PHONEME_DURATIONS` / `getPhonemeDuration`). Frontend ignores backend `visemes[].start`/`duration`. |
| **Only total length is synced** | `durationRatio` only scales the **whole** frontend timeline to `audio.duration`. **When** each phoneme happens inside that timeline is still the frontend’s fixed estimates, not real TTS timing. |
| **Different phoneme lists** | Backend may emit spaces/punctuation as separate tokens (or `sil`); frontend strips non-A–Z and can drop or merge tokens. So phoneme count and boundaries can differ. |
| **No audio-derived timing** | Neither backend nor frontend uses the actual TTS waveform. So we never align to “when the word actually starts/ends” in the audio. |

So: **mouth shapes and audio words/timing are matched only at the global level (same total length); per-phoneme timing and per-phoneme shapes are frontend-only and estimate-based.**

---

## 9. File reference

| Role | File |
|------|------|
| API: TTS + phonemes + visemes | `backend/app/api/v1/routes/phoneme.py` |
| Backend phoneme → timed viseme sequence | `backend/app/services/phoneme_service.py` |
| Backend per-phoneme shape keys | `backend/app/services/phoneme_shapes.py` |
| Frontend: fetch audio + data | `frontend/src/utils/visemeUtils.js` (`textToAudioVisemesAPI`) |
| Frontend: build timeline from phonemes | `frontend/src/utils/lipSyncScheduler.js` (`createVisemeTimeline`) |
| Frontend: phoneme→viseme, viseme→shapes, durations | `frontend/src/utils/lipSyncMappings.js` |
| Frontend: play audio, drive morphs each frame | `frontend/src/hooks/useLipSync.js` |
| Avatar: trigger speak, refs for head/teeth | `frontend/src/components/Avatar.jsx` |

---

## 10. Ways to improve mouth–word/timing match

1. **Use backend viseme timing on the frontend**  
   In `useLipSync.js`, if the API returns `visemes` with `start` and `duration`, build the timeline from **those** instead of from `createVisemeTimeline(phonemes)`. That at least aligns frontend to the same estimated timing as the backend (and one less source of mismatch).

2. **Use backend shape keys**  
   Backend `shape_keys` are nested (`lips` / `teeth`); frontend expects flat keys (e.g. `Lips_Open_Wide`). Add a small adapter that flattens backend `shape_keys` (e.g. merge `lips` and `teeth` into one object with the same key names as `ALL_SHAPE_KEYS`) and use that in the animation loop instead of `VISEME_TO_SHAPES[visemeCategory]`. Then mouth “look” is driven by backend phoneme-level shapes.

3. **Audio-derived timing (future)**  
   For true word/phoneme-accurate sync, you’d need phoneme (or word) timestamps from the **audio** (e.g. forced alignment or ASR with timestamps), then drive the timeline from those instead of from text-based estimates.

4. **Single source of durations**  
   If you keep text-based timing, use **one** set of durations (either backend or frontend) and one phoneme list (including how spaces/punctuation are handled) everywhere, so timing is at least consistent.

---

## Summary

- **Lip sync:** Text → backend (TTS + g2p_en phonemes + timed visemes with shape_keys) → frontend uses only `audio_url` and `phonemes` → builds its own timeline (frontend durations + frontend viseme→shape mapping) → each frame syncs to `audio.currentTime * durationRatio` and applies current event’s shape keys with lerp and coarticulation.
- **Mouth vs words/timing:** Total animation length matches audio; exact moment each mouth shape appears is based on frontend estimates, not backend timings or real audio, so mouth and words can be off. To match them better, use the backend’s `visemes` (and optionally `shape_keys`) on the frontend and consider moving toward audio-derived timing later.
