# FinWise Avatar Realtime Improvement Plan

## Purpose

The current avatar is usable, but it is not yet a clean realtime speech-to-speech avatar. It works as a turn-based flow:

1. Browser records audio.
2. Backend transcribes after recording stops.
3. LLM generates an answer.
4. Backend generates audio.
5. Frontend plays audio and drives estimated lip sync.

This plan describes what should be done to make the avatar feel realtime, stable, and production-quality while keeping the stack local and open-source.

## Current State

Frontend files involved:

- `frontend/src/pages/AvatarPage.jsx`
- `frontend/src/components/Avatar.jsx`
- `frontend/src/hooks/useLipSync.js`
- `frontend/src/utils/visemeUtils.js`
- `frontend/src/utils/lipSyncScheduler.js`
- `frontend/src/utils/phonemeShapeKeys.js`
- `frontend/src/utils/lipSyncMappings.js`

Backend files involved:

- `backend/app/api/v1/routes/ai.py`
- `backend/app/api/v1/routes/phoneme.py`
- `backend/app/services/speech_service.py`
- `backend/app/services/tts_service.py`
- `backend/app/services/phoneme_service.py`
- `backend/app/services/viseme_mapper.py`
- `backend/app/services/phoneme_shapes.py`

Current local models/tools:

- STT: `faster-whisper` through `STTService` with `openai-whisper` fallback
- TTS: Piper local voices, with optional OpenAI-compatible local TTS endpoint support
- LLM: Ollama
- Lip sync: text-to-phoneme timeline plus shape-key mapping

Detected hardware on this machine:

- GPU: `NVIDIA GeForce RTX 5050 Laptop GPU`
- VRAM: `8151 MiB`
- NVIDIA driver: `577.03`
- Driver-reported CUDA runtime support: `12.9`
- Current avatar STT runtime: `faster-whisper` on CUDA when available

This means GPU acceleration is available at the system level and the realtime STT path can use it.

## Vocalis Evaluation

Reference repo: https://github.com/Lex-au/Vocalis

Vocalis is useful as an implementation reference, but it should not replace the FinWise avatar page wholesale.

Reusable ideas:

- Browser-side continuous audio capture and RMS-based VAD.
- Barge-in behavior when the user starts talking during assistant playback.
- WebSocket event flow for `audio`, `transcription`, `llm_response`, `tts_chunk`, `interrupt`, and state updates.
- OpenAI-compatible local TTS endpoint support, which lets us use Orpheus-FastAPI or Kokoro-FastAPI when voice quality is more important than Piper speed.

Not reusable as-is:

- Vocalis renders an animated orb, not a 3D avatar.
- It does not include phoneme/viseme lip-sync for GLB shape keys.
- Its backend is a standalone app with its own conversation memory, prompts, vision flow, and LM Studio assumptions.
- Its TTS path requires a separate local TTS server.

Implementation decision:

- Keep the FinWise avatar, chat store, RAG/LLM path, and lip-sync code.
- Adapt Vocalis-style continuous microphone capture, frontend VAD, and barge-in control.
- Add optional OpenAI-compatible TTS support behind environment variables instead of making it mandatory.
- Continue sending FinWise-specific `speech_chunk` payloads with `audio_url`, `visemes`, `grouped_visemes`, and `phonemes`.

## Local Voice AI Agent Integration

Reference repo: https://github.com/jesuscopado/local-voice-ai-agent

This repo is a better fit for a low-latency speech-to-speech experiment than Vocalis because its core loop is small and direct: FastRTC handles realtime browser audio, `ReplyOnPause` handles turn detection, Moonshine handles STT, Ollama handles the LLM call, and a local TTS model streams audio back over WebRTC.

Implementation decision:

- Use the FinWise voice transport at `/api/v1/avatar/rtc`.
- Make `/api/v1/avatar/rtc` the only avatar voice transport exposed by the UI.
- Remove the old `/api/v1/avatar/realtime` WebSocket route from the mounted API to avoid two competing voice paths.
- Use FastRTC only when `ENABLE_FASTRTC_AVATAR=true` and the optional voice dependencies are installed.
- Keep the FinWise `AIService` prompt and database context instead of using the demo repo prompt directly.
- Stream Piper audio back through FastRTC by default so the main backend can keep the existing LangChain/Chroma `numpy<2` dependency set.
- Keep Kokoro as an optional separate-environment experiment, not the default project install.
- Add amplitude-based lip sync for the FastRTC audio stream because FastRTC returns audio chunks, not FinWise phoneme payloads.

Install notes:

- Base app dependencies stay in `backend/requirements.txt`.
- FastRTC/Moonshine dependencies live in `backend/requirements-voice.txt`.
- Kokoro currently requires `numpy>=2.0.2`, which conflicts with this project's Python 3.11 LangChain/Chroma pins. Use Kokoro only in a separate voice environment if we decide the voice quality is worth the extra service boundary.
- GPU can be tested later with `onnxruntime-gpu`, but it should be installed only after confirming the local CUDA/cuDNN compatibility.

## Main Problems To Solve

1. **Turn-taking still feels delayed**
   - The user speaks, then waits for transcription, LLM, TTS, and playback.
   - The avatar should feel like it is listening, thinking, and responding immediately.

2. **No true streaming audio pipeline**
   - Browser audio is sent after recording ends.
   - Better realtime behavior needs WebSocket streaming from browser to backend.

3. **No proper interruption/barge-in**
   - If the avatar is speaking and the user starts talking, the avatar should stop and listen.
   - This requires audio output state, input VAD, and cancellation of current LLM/TTS jobs.

4. **Lip sync is still estimated**
   - The current timeline is based mostly on generated phoneme durations.
   - It should be tied more directly to generated audio chunks and actual playback timing.

5. **No latency instrumentation**
   - We need timing metrics for each step before claiming “flawless”.
   - Without metrics, improvements are subjective.

6. **UI does not clearly show voice state**
   - The user needs to know whether the avatar is listening, transcribing, thinking, speaking, or muted.

## Target Experience

The target avatar behavior:

1. User clicks the mic once.
2. Avatar enters continuous voice mode.
3. Avatar listens until speech ends.
4. Partial transcription appears while the user speaks.
5. Avatar starts thinking immediately after end-of-speech.
6. Avatar starts speaking as soon as the first answer sentence is ready.
7. Lip sync starts with the audio and stays within about `80ms` of mouth-relevant sounds.
8. If the user speaks while the avatar is speaking, playback stops and the avatar listens.
9. The avatar recovers gracefully from mic permission errors, model errors, TTS failures, and network disconnects.

## Recommended Architecture

### Browser

Use a single `RealtimeVoiceController` layer in the frontend.

Responsibilities:

- Capture microphone audio using `AudioWorklet` instead of only `MediaRecorder`.
- Downsample or encode audio chunks for backend streaming.
- Maintain local state:
  - `idle`
  - `listening`
  - `speech_detected`
  - `transcribing`
  - `thinking`
  - `speaking`
  - `interrupted`
  - `error`
- Send audio chunks over WebSocket.
- Receive partial transcripts, final transcripts, answer text chunks, audio chunks, and viseme cues.
- Stop avatar speech if user speech is detected during playback.

### Backend

Add a dedicated realtime voice route:

- `backend/app/api/v1/routes/realtime_voice.py`
- WebSocket path: `/api/v1/avatar/realtime`

Responsibilities:

- Accept browser audio chunks.
- Run server-side VAD.
- Emit partial and final transcript events.
- Stream prompt to the LLM.
- Chunk the LLM response by sentence.
- Generate TTS per sentence or short phrase.
- Return audio URL or binary audio chunks.
- Return viseme cues for each audio chunk.
- Support cancellation when the user interrupts.

### Event Protocol

Use typed JSON events over WebSocket.

Client to server:

```json
{ "type": "start_session", "session_id": "..." }
```

```json
{ "type": "audio_chunk", "sample_rate": 16000, "format": "pcm16", "data": "base64..." }
```

```json
{ "type": "interrupt" }
```

```json
{ "type": "stop_session" }
```

Server to client:

```json
{ "type": "state", "value": "listening" }
```

```json
{ "type": "partial_transcript", "text": "what is my" }
```

```json
{ "type": "final_transcript", "text": "What is my monthly budget?" }
```

```json
{ "type": "assistant_text_delta", "text": "Your current budget" }
```

```json
{
  "type": "speech_chunk",
  "chunk_id": "uuid",
  "audio_url": "http://127.0.0.1:8000/generated_audio/chunk.wav",
  "duration": 1.35,
  "visemes": []
}
```

```json
{ "type": "done" }
```

## Open-Source Model Choices

## GPU Acceleration Strategy

GPU can materially improve the avatar, but it should be applied selectively. The critical path is:

1. STT latency
2. LLM first-token latency
3. TTS sentence generation latency
4. Rendering smoothness

Recommended GPU usage:

| Component | Use GPU? | Reason |
| --- | --- | --- |
| STT | Yes | Biggest latency win for voice input. |
| LLM | Yes, via Ollama | Reduces first-token and streaming latency. |
| TTS | Optional | Piper CPU is already fast; GPU TTS is useful only if we move to heavier TTS models. |
| VAD | Usually no | VAD is lightweight; CPU is fine. |
| 3D avatar rendering | Already GPU | Browser/WebGL uses GPU through the graphics stack. |
| Lip-sync math | No | Morph target updates are lightweight. |

### Backend GPU Setup

Current backend issue:

- The venv has CPU-only PyTorch.
- Whisper therefore cannot use CUDA.

Tasks:

- Install a CUDA-enabled PyTorch build compatible with the installed NVIDIA driver.
- Verify:

```powershell
.\backend\.venv311\Scripts\python.exe -c "import torch; print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0))"
```

- Add a startup log showing whether STT is running on CPU or CUDA.
- Add `.env` settings:

```env
STT_DEVICE=cuda
STT_COMPUTE_TYPE=float16
STT_MODEL=base.en
```

### Faster STT With GPU

Best next implementation:

- Replace `openai-whisper` with `faster-whisper`.
- Use CTranslate2 GPU acceleration.
- Default to `base.en` or `small.en` depending on latency.

Suggested config:

```env
FASTER_WHISPER_MODEL=base.en
FASTER_WHISPER_DEVICE=cuda
FASTER_WHISPER_COMPUTE_TYPE=float16
```

Fallback config:

```env
FASTER_WHISPER_DEVICE=cpu
FASTER_WHISPER_COMPUTE_TYPE=int8
```

Acceptance criteria:

- 3-second utterance transcribes in under `400ms - 700ms` on GPU.
- If GPU is unavailable, backend falls back to CPU without crashing.

### Ollama GPU Usage

Ollama should use the NVIDIA GPU automatically when possible. We still need to verify it under load.

Tasks:

- Run a chat prompt while watching:

```powershell
nvidia-smi
```

- Confirm VRAM usage increases during generation.
- Keep model choice realistic for 8 GB VRAM.

Recommended local models for avatar latency:

- `gemma3:4b` for fast responses.
- A small Q4 model if first-token latency is still too high.
- Avoid very large models for realtime voice unless latency is acceptable.

### TTS GPU Option

Piper is currently a good CPU choice because it generates short sentence audio quickly.

GPU TTS should only be considered if:

- voice quality is not acceptable,
- sentence TTS latency is too high,
- or we adopt a heavier neural voice model.

Options to evaluate later:

- sherpa-onnx TTS with ONNX Runtime GPU
- Kokoro-style local TTS if licensing and latency fit
- Coqui-style TTS only if latency is acceptable

Do not replace Piper until measured TTS latency proves it is the bottleneck.

### VRAM Budget

The GPU has about `8 GB` VRAM, so do not load every model onto GPU at once without measuring.

Suggested budget:

| Workload | Target VRAM |
| --- | ---: |
| Ollama small LLM | `3 GB - 5 GB` |
| faster-whisper `base.en` | `< 1.5 GB` |
| Browser rendering | variable |
| Safety margin | `1 GB - 2 GB` |

If VRAM pressure causes slowdowns:

- keep LLM on GPU and STT on CPU int8,
- or use a smaller LLM,
- or unload inactive models between turns.

### Speech To Text

Short-term:

- Keep `openai-whisper` for correctness.
- Use `imageio-ffmpeg` for reliable browser audio decoding on Windows.

Better realtime path:

- Use `faster-whisper` for lower latency Python transcription.
- Use `whisper.cpp` if we want a native realtime microphone pipeline.
- Use `sherpa-onnx` if we want one local toolkit for streaming ASR, VAD, and TTS.

Recommended next step:

- Replace `openai-whisper` with `faster-whisper` first.
- It is the least disruptive backend change and can reduce latency without rewriting everything.

### Voice Activity Detection

Short-term:

- Browser RMS-based silence detection is acceptable for development.

Better path:

- Add Silero VAD on the backend.
- This improves noisy-room handling and prevents accidental turn endings.

Recommended next step:

- Run browser VAD for quick UI feedback.
- Run server VAD as the authoritative end-of-turn detector.

### Text To Speech

Current:

- Piper local TTS is a good baseline because it is fast and offline.

Better path:

- Keep Piper for low-latency mode.
- Add a voice-quality setting later if a heavier model is acceptable.
- Evaluate sherpa-onnx TTS if we want one ONNX-based speech stack.

Recommended next step:

- Keep Piper.
- Optimize chunking, caching, and sentence queueing before changing voices again.

### Lip Sync

Current:

- Text-to-phoneme conversion produces estimated phoneme timings.
- Timings are scaled against the audio duration in the frontend.

Better path:

- Generate viseme cues per TTS chunk.
- Scale each chunk to the exact audio duration.
- Add a calibration table per voice.
- Add optional forced alignment for non-realtime/high-quality mode.

Possible tools:

- Rhubarb Lip Sync for audio-driven mouth cues in offline/high-quality mode.
- Existing custom ARPABET shape-key maps for realtime mode.

Recommended next step:

- Use current ARPABET mapping for realtime.
- Add per-chunk timing calibration and visual debug overlay.
- Add Rhubarb only for non-realtime export/demo mode, because it adds processing latency.

## Implementation Phases

## Phase 0: Instrumentation And Baseline

Goal:

Measure where the avatar is slow or unstable before deeper changes.

Tasks:

- Add timing logs for:
  - mic start
  - speech detected
  - speech ended
  - audio uploaded
  - transcription started
  - transcription completed
  - LLM first token
  - LLM first sentence
  - TTS request started
  - TTS audio ready
  - audio playback started
  - audio playback ended
- Add frontend debug panel hidden behind `?debugVoice=1`.
- Log lip-sync drift:
  - audio current time
  - active viseme
  - next viseme
  - morph target values

Acceptance criteria:

- We can see exact timings for every voice turn.
- No vague “feels slow” debugging.

## Phase 1: Stabilize Current Turn-Based Voice

Goal:

Make the existing flow reliable before WebSockets.

Tasks:

- Extract voice logic from `AvatarPage.jsx` into:
  - `frontend/src/hooks/useRealtimeVoice.js`
  - `frontend/src/utils/audioCapture.js`
  - `frontend/src/utils/speechQueue.js`
- Add clear UI states:
  - Listening
  - Processing
  - Thinking
  - Speaking
  - Muted
  - Error
- Add a visible cancel/stop control.
- Add microphone permission error UI.
- Add retry if TTS fails.
- Add user-facing message if no speech is detected.
- Prevent the avatar from recording itself while speaker output is active.
- Add cleanup for dangling audio URLs and stopped streams.

Acceptance criteria:

- Click mic once, speak, stop speaking, get response.
- No duplicate audio.
- No stuck “Listening...” state.
- No console errors after 10 turns.

## Phase 2: Faster STT

Goal:

Reduce transcription latency, using GPU acceleration when available.

Tasks:

- Add `faster-whisper` backend service:
  - `backend/app/services/stt_service.py`
  - model config via `.env`
  - CPU/GPU compute type config
- Install and verify CUDA-enabled dependencies in the backend venv.
- Add automatic device selection:
  - use `cuda` if available and configured
  - otherwise use CPU `int8`
- Keep old Whisper service as fallback.
- Add model selector:
  - `tiny.en` for fastest development
  - `base.en` as default
  - `small.en` if accuracy is needed
- Add benchmark endpoint:
  - `/api/v1/avatar/stt/benchmark`
- Measure transcription time for:
  - 1 second speech
  - 3 second speech
  - 8 second speech

Acceptance criteria:

- 3-second user utterance transcribes in under `400ms - 700ms` on this machine with GPU enabled, or the benchmark shows the actual ceiling.
- CPU fallback still works when CUDA is unavailable.

## Phase 3: Server-Side VAD

Goal:

Reliable end-of-turn detection.

Tasks:

- Add Silero VAD or sherpa-onnx VAD backend service.
- Process audio chunks at `16kHz PCM`.
- Detect:
  - speech start
  - speech end
  - silence timeout
  - max utterance timeout
- Keep browser VAD only for responsive UI indication.
- Add VAD configuration:
  - start threshold
  - end silence duration
  - max utterance duration
  - min speech duration

Acceptance criteria:

- Normal speech ends automatically.
- Short pauses inside a sentence do not end the turn.
- Background noise does not trigger constant recording.

## Phase 4: WebSocket Realtime Pipeline

Goal:

Move from file-upload voice turns to streaming voice turns.

Tasks:

- Add backend WebSocket route:
  - `backend/app/api/v1/routes/realtime_voice.py`
- Add frontend client:
  - `frontend/src/services/realtimeVoiceClient.js`
- Stream microphone chunks from browser to backend.
- Send partial transcript events back to browser.
- On final transcript, call existing chat service.
- Send LLM text deltas to frontend.
- Generate speech chunks sentence-by-sentence.
- Send speech chunks and visemes to frontend as soon as ready.

Acceptance criteria:

- User sees partial transcript while speaking.
- Avatar starts speaking after first completed answer sentence.
- The page does not wait for the entire LLM response before voice playback starts.

## Phase 5: Barge-In / Interruption

Goal:

Let the user interrupt the avatar naturally.

Tasks:

- Add playback interruption in frontend:
  - stop current audio
  - clear speech queue
  - reset mouth morphs
  - send `interrupt` event to backend
- Add backend cancellation:
  - cancel current LLM stream
  - cancel pending TTS jobs
  - ignore late events from cancelled turn
- Add echo control:
  - do not treat avatar audio as user speech
  - use browser echo cancellation
  - optionally mute mic input while speaker audio is loud

Acceptance criteria:

- While avatar is speaking, user starts talking.
- Avatar stops within `300ms`.
- New user transcript starts cleanly.
- No old audio resumes afterward.

## Phase 6: Lip Sync Upgrade

Goal:

Make mouth movement look intentional and synchronized.

Tasks:

- Add per-audio-chunk viseme timelines.
- Scale each timeline to exact audio duration.
- Add lead/lag calibration:
  - male Piper voice
  - female Piper voice
- Add debug visualizer:
  - current phoneme
  - current viseme group
  - active morph targets
  - audio time
  - timeline time
- Smooth morph transitions with:
  - attack time
  - release time
  - coarticulation lookahead
  - silence reset
- Add model-specific shape-key validation:
  - male GLB available morphs
  - female GLB available morphs
  - missing morph target report

Acceptance criteria:

- Plosives close lips clearly for P/B/M.
- F/V visibly uses teeth/lip shape.
- O/U round the mouth.
- A/E/I vowels are visually distinct.
- Mouth does not chatter during silence.
- Sync drift is less than about `80ms` on short responses.

## Phase 7: Avatar Acting Layer

Goal:

Make the avatar feel alive without hurting usability.

Tasks:

- Add idle breathing.
- Add subtle listening pose.
- Add thinking pose while LLM is generating.
- Add speaking gestures based on sentence length and emotion.
- Use emotion tags internally, not visible markdown.
- Add gaze behavior:
  - look at user while listening
  - slight glance during thinking
  - return to camera while speaking

Acceptance criteria:

- Avatar does not freeze while backend is working.
- Gestures do not distract from speech.
- Emotion changes do not break lip sync.

## Phase 8: Reliability And Error Recovery

Goal:

Make long sessions stable.

Tasks:

- Add WebSocket reconnect.
- Add model-not-loaded messages.
- Add TTS timeout handling.
- Add STT timeout handling.
- Add backend health endpoint for avatar dependencies:
  - STT model status
  - VAD status
  - TTS voice status
  - Ollama status
- Add frontend fallback modes:
  - text-only
  - listen-only
  - speak-only
  - muted
- Add cleanup job for generated audio.

Acceptance criteria:

- 30-minute session does not leak audio objects or mic streams.
- Backend restart shows recoverable state instead of a broken UI.

## Phase 9: Automated Tests

Goal:

Prevent regressions.

Backend tests:

- STT accepts WAV.
- STT accepts WebM/Opus.
- TTS returns audio and visemes.
- Realtime WebSocket accepts audio chunks.
- Cancellation prevents late TTS events.

Frontend tests:

- Mic permission denied state.
- Voice state machine transitions.
- Speech queue plays chunks in order.
- Mute stops audio and clears queue.
- Interruption clears active playback.

Browser tests:

- `/avatar` loads without console errors.
- Text prompt causes avatar audio generation.
- Mic button changes state correctly.
- Generated audio URL plays.

## Latency Budget

Target timings on local development machine with GPU acceleration enabled where useful:

| Step | Target |
| --- | ---: |
| Speech start detection | `< 150ms` |
| End-of-turn after user stops | `500ms - 900ms` |
| Final transcript after end-of-turn | `< 400ms - 700ms` |
| LLM first token | `< 600ms - 1200ms` |
| First speakable sentence | `< 1500ms - 2200ms` |
| TTS for one short sentence | `< 300ms - 700ms` |
| Audio playback start after TTS ready | `< 150ms` |
| Barge-in stop time | `< 300ms` |
| Lip-sync drift | `< 80ms` |

## Development Order

Recommended order:

1. Add instrumentation.
2. Extract frontend voice state machine.
3. Replace STT with `faster-whisper`.
4. Add server-side VAD.
5. Add WebSocket streaming audio.
6. Add sentence-level TTS streaming.
7. Add barge-in cancellation.
8. Improve lip sync calibration.
9. Add avatar acting layer.
10. Add automated browser tests.

Do not start with better 3D gestures or model redesign. The first priority is audio pipeline stability and latency.

## Files To Add

Frontend:

- `frontend/src/hooks/useRealtimeVoice.js`
- `frontend/src/services/realtimeVoiceClient.js`
- `frontend/src/utils/audioCapture.js`
- `frontend/src/utils/speechQueue.js`
- `frontend/src/components/Avatar/VoiceStatusBar.jsx`
- `frontend/src/components/Avatar/VoiceDebugPanel.jsx`

Backend:

- `backend/app/api/v1/routes/realtime_voice.py`
- `backend/app/services/stt_service.py`
- `backend/app/services/vad_service.py`
- `backend/app/services/avatar_realtime_service.py`
- `backend/app/services/audio_chunk_service.py`
- `backend/app/schemas/realtime_voice.py`

Tests:

- `backend/tests/test_avatar_voice.py`
- `frontend/src/pages/AvatarPage.test.jsx`
- `frontend/e2e/avatar.spec.js`

## Risks

1. **Windows audio/browser differences**
   - Browser MIME type support differs.
   - Keep WebM/Opus and WAV paths tested.

2. **CPU limits**
   - Fully local STT + LLM + TTS can compete for CPU.
   - Use GPU for STT and LLM when available.
   - Use smaller STT models and sentence-level TTS.

3. **GPU memory pressure**
   - The detected GPU has about `8 GB` VRAM.
   - Loading a larger Ollama model plus GPU STT can exceed practical headroom.
   - Keep model choices small and measure VRAM during real conversations.

4. **CUDA package mismatch**
   - The NVIDIA driver supports CUDA and the realtime STT health check currently reports CUDA.
   - Future package upgrades can still break CUDA imports.
   - Keep CPU fallback and verify with a startup health check.

5. **Echo and feedback**
   - The mic may capture avatar audio.
   - Use echo cancellation and barge-in thresholds carefully.

6. **Lip-sync accuracy**
   - Text-derived phoneme timing will never be perfect.
   - Use chunk duration scaling and calibration for realtime mode.
   - Use forced alignment only for high-quality/non-realtime mode.

7. **Model licensing**
   - Verify licenses before bundling models in a distributable build.

## External References

- Piper local TTS: https://github.com/rhasspy/piper
- Vocalis speech-to-speech assistant reference: https://github.com/Lex-au/Vocalis
- faster-whisper: https://github.com/SYSTRAN/faster-whisper
- whisper.cpp: https://github.com/ggml-org/whisper.cpp
- sherpa-onnx: https://github.com/k2-fsa/sherpa-onnx
- Silero VAD: https://github.com/snakers4/silero-vad
- Rhubarb Lip Sync: https://github.com/DanielSWolf/rhubarb-lip-sync

## Definition Of Done

The avatar can be considered “realtime and neat” only when all of these are true:

- User can hold a natural back-and-forth voice conversation for at least 10 turns.
- The avatar starts responding with audio before the full assistant text is complete.
- The user can interrupt the avatar while it speaks.
- The avatar does not listen to itself.
- Mic, speaker, and mute states are obvious.
- Lip sync is stable, visually distinct, and aligned with playback.
- No console errors occur during a normal voice session.
- Backend logs show timing metrics for every stage.
- The app degrades gracefully if STT, TTS, or Ollama is unavailable.
