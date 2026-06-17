# FinWise AI — Detailed PC Setup Guide

This is the complete, step-by-step guide to run **FinWise AI** (FastAPI backend + React/Vite frontend) on a Windows PC, including the **real-time speech-to-speech avatar** (FastRTC → Faster-Whisper → Ollama → Kokoro) and the **RAG finance chat**.

> If you only want the basic finance dashboard + text chat, you can skip the GPU/voice sections and use the CPU path — it still works, just slower for the avatar.

---

## 0. Architecture at a glance

```
Browser (React + Vite, http://localhost:5173)
        │  REST + SSE + WebRTC
        ▼
FastAPI backend (http://127.0.0.1:8000)
        ├── RAG chat        → Ollama (gemma3:4b) + ChromaDB + yfinance + web search
        ├── Realtime avatar → FastRTC ⇄ Faster-Whisper (STT) → Ollama (qwen2.5:1.5b) → Kokoro (TTS)
        └── Text avatar     → edge-tts / Kokoro + phoneme→viseme lip-sync
        ▼
Ollama (local LLM server, http://localhost:11434)
```

Three processes run together: **Ollama**, the **backend**, and the **frontend**.

---

## 1. Hardware & OS

| | Minimum | Recommended (real-time avatar) |
|---|---|---|
| OS | Windows 10/11 64-bit | Windows 11 64-bit |
| RAM | 8 GB | 16 GB+ |
| GPU | none (CPU fallback) | **NVIDIA GPU, 6 GB+ VRAM, CUDA 12.x driver** |
| Disk | ~10 GB free | ~15 GB free (CUDA PyTorch is large) |

The avatar auto-detects the GPU. With no/unsupported GPU it **falls back to CPU automatically** (slower, but functional).

> **Blackwell GPUs (RTX 50-series, e.g. RTX 5050/5060/5090)** require the **CUDA 12.8** PyTorch build (`cu128`). This is covered below.

---

## 2. Prerequisites (install these first)

### 2.1 Git
<https://git-scm.com/download/win>

### 2.2 Python 3.11 — **use 3.11, not 3.12/3.13 on Windows**
Download **Python 3.11.x** from <https://www.python.org/downloads/release/python-3119/> and tick **“Add python.exe to PATH”**.

> ⚠️ **Why 3.11 specifically?** `chromadb 0.6.0` (used by the RAG engine) depends on `chroma-hnswlib 0.7.6`, which ships a prebuilt wheel **only for Python 3.11** on Windows. On Python 3.12+ pip tries to compile it from source and fails unless you install the full Microsoft C++ Build Tools. Python 3.11 installs everything from prebuilt wheels — no compiler needed.

Verify:
```powershell
py -3.11 --version    # should print Python 3.11.x
```

### 2.3 Node.js 18+ (LTS recommended)
<https://nodejs.org/> — verify with `node --version` and `npm --version`.

### 2.4 Ollama (local LLM runtime)
Install from <https://ollama.com/download>. After install it runs as a background service; verify:
```powershell
ollama --version
```

### 2.5 eSpeak NG (required by Kokoro TTS for the avatar)
Download the Windows installer (`espeak-ng-*.msi`) from
<https://github.com/espeak-ng/espeak-ng/releases> and install it to the default location:
```
C:\Program Files\eSpeak NG\
```
The backend looks for `C:\Program Files\eSpeak NG\libespeak-ng.dll`. (A copy is also bundled via the `espeakng-loader` pip package as a fallback.)

### 2.6 FFmpeg (audio processing)
```powershell
winget install Gyan.FFmpeg
```
Then restart the terminal so `ffmpeg` is on PATH.

### 2.7 (GPU only) NVIDIA driver
Install the latest **NVIDIA Game Ready / Studio driver**. CUDA Toolkit is **not** required — the PyTorch `cu128` wheels bundle the CUDA runtime. Verify the GPU is visible:
```powershell
nvidia-smi
```

---

## 3. Clone the repository

```powershell
git clone https://github.com/MrRobot373/AI-FINANCE.git
cd AI-FINANCE
```

The repo layout:
```
AI-FINANCE/
├── backend/      # FastAPI app, AI services, requirements
├── frontend/     # React + Vite app
├── README.md
└── SETUP.md      # (this file)
```

---

## 4. Pull the Ollama models

These are downloaded once and cached locally. Keep Ollama running.

```powershell
ollama pull gemma3:4b            # RAG / text chat model
ollama pull qwen2.5:1.5b         # realtime voice avatar LLM (fast)
ollama pull mxbai-embed-large    # embeddings for the RAG vector store
```

> Want richer (but slower) voice answers? You can later set `BOB_LLM_MODEL=llama3.2:3b` in `backend/.env` and `ollama pull llama3.2:3b`.

Confirm:
```powershell
ollama list
```

---

## 5. Backend setup

```powershell
cd backend
```

### 5.1 Create the Python 3.11 virtual environment
```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip setuptools wheel
```
You should now see `(.venv)` at the start of your prompt.

> If PowerShell blocks the activation script, run once:
> `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

### 5.2 Install PyTorch FIRST (so the right build wins)

**GPU path (NVIDIA, recommended):**
```powershell
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128
```
This is a large (~3 GB) download — it includes the CUDA 12.8 runtime and works on Blackwell (RTX 50-series).

**CPU-only path (no NVIDIA GPU):**
```powershell
pip install torch torchaudio
```

> Install torch **before** `requirements.txt`, otherwise `openai-whisper` pulls a CPU-only torch that you'd then have to replace.

### 5.3 Install the rest of the dependencies
```powershell
pip install -r requirements.txt
pip install -r requirements-voice.txt
```
`requirements-voice.txt` adds the real-time avatar stack: `fastrtc`, `faster-whisper`, `kokoro`, `aiortc`, etc. On Python 3.11 these all install from prebuilt wheels.

Sanity check the install:
```powershell
python -m pip check          # should say: No broken requirements found
python -c "import torch; print('CUDA:', torch.cuda.is_available())"
```

### 5.4 Initialize the database
```powershell
python init_db.py
```

### 5.5 Create `backend/.env`
Create a file named `.env` inside `backend/` with the following content.

**GPU configuration (recommended):**
```dotenv
# --- Core ---
DATABASE_URL=sqlite:///./finance.db

# --- Real-time avatar (FastRTC -> Whisper -> Ollama -> Kokoro) ---
ENABLE_FASTRTC_AVATAR=true

# Capture / voice-activity detection
BOB_PREF_SAMPLE_RATE=16000
BOB_FRAME_MS=30
BOB_SILENCE_THRESHOLD=120
BOB_END_SILENCE_MS=600
BOB_MIN_SPEECH_MS=300
BOB_MAX_RECORDING_MS=15000

# Speech-to-text (auto-falls back to CPU if CUDA is unavailable)
BOB_WHISPER_MODEL=small.en
BOB_WHISPER_DEVICE=cuda
BOB_WHISPER_COMPUTE_TYPE=float16
BOB_WHISPER_CPU_THREADS=4
BOB_WHISPER_BEAM_SIZE=3
BOB_WHISPER_BEST_OF=3
BOB_WHISPER_NO_SPEECH_THRESHOLD=0.45
BOB_WHISPER_VAD_FILTER=true

# LLM (Ollama)
BOB_LLM_MODEL=qwen2.5:1.5b
BOB_LLM_TEMPERATURE=0.7
BOB_LLM_NUM_PREDICT=90
BOB_LLM_TOP_P=0.9

# Text-to-speech (Kokoro)
BOB_TTS_VOICE=af_heart
BOB_TTS_FEMALE_VOICE=af_heart
BOB_TTS_MALE_VOICE=am_adam
BOB_TTS_SPEED=1.1
BOB_TTS_LANG_CODE=a
BOB_TTS_DEVICE=cuda
BOB_OUTPUT_SAMPLE_RATE=24000
```

**CPU-only:** change `BOB_WHISPER_DEVICE=cpu`, `BOB_WHISPER_COMPUTE_TYPE=int8`, `BOB_TTS_DEVICE=cpu`, and (for speed) `BOB_WHISPER_MODEL=base.en` and `BOB_WHISPER_BEAM_SIZE=1`. The backend also auto-detects a missing GPU and falls back to these.

> To run **without** the real-time avatar (text chat only), set `ENABLE_FASTRTC_AVATAR=false`. You can then skip `requirements-voice.txt`.

---

## 6. Frontend setup

```powershell
cd ..\frontend
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` is required: `@google/model-viewer` peer-requests an older `three` than `@react-three/fiber` uses. model-viewer bundles its own three internally, so the mismatch is cosmetic and safe.

### 6.1 Create `frontend/.env`
The frontend reads these `VITE_` variables. Create `frontend/.env`:
```dotenv
VITE_API_URL=http://127.0.0.1:8000/api/v1
VITE_API_TOKEN=local-dev-token
VITE_LOGIN_PASSWORD=finwise2026
```
`VITE_API_URL` already defaults to `http://127.0.0.1:8000/api/v1`, so this file is optional unless you change ports or the login password.

---

## 7. Run the application

Open **three terminals**.

**Terminal 1 — Ollama** (skip if it already runs as a service):
```powershell
ollama serve
```

**Terminal 2 — Backend:**
```powershell
cd AI-FINANCE\backend
.\start-server.ps1
```
`start-server.ps1` sets the eSpeak path, activates `.venv`, and launches uvicorn on `http://127.0.0.1:8000`. (Manual equivalent: `.\.venv\Scripts\Activate.ps1; uvicorn app.main:app --host 127.0.0.1 --port 8000`.)

**Terminal 3 — Frontend:**
```powershell
cd AI-FINANCE\frontend
npm run dev
```
Open **http://localhost:5173**.

> First avatar use is slower while the Whisper + Kokoro models warm into VRAM; subsequent turns are real-time.

---

## 8. Verify the real-time avatar

With the backend running, open:
```
http://127.0.0.1:8000/api/v1/avatar/rtc/health
```
A healthy GPU setup reports:
```json
{
  "status": "ready",
  "models": { "device": "cuda", "compute_type": "float16", "cpu_fallback": false,
              "whisper": true, "kokoro": true, "ollama": true }
}
```
- `status: ready` → avatar is mounted and models loaded.
- `cpu_fallback: true` → CUDA wasn’t usable, it’s running on CPU (still works, slower).
- `missing_dependencies` non-empty → install `requirements-voice.txt`.

Then on the **Avatar** page, click the **mic** button and speak.

---

## 9. Configuration reference (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `ENABLE_FASTRTC_AVATAR` | `false` | Master switch for the real-time voice avatar |
| `BOB_WHISPER_MODEL` | `small.en` | Faster-Whisper model (`tiny.en`/`base.en`/`small.en`) |
| `BOB_WHISPER_DEVICE` | `cpu` | `cuda` or `cpu` (auto-falls back to cpu if CUDA missing) |
| `BOB_WHISPER_COMPUTE_TYPE` | `int8` | `float16` (GPU) or `int8` (CPU) |
| `BOB_END_SILENCE_MS` | `800` | Silence (ms) before a turn is considered finished |
| `BOB_LLM_MODEL` | `qwen2.5:0.5b` | Ollama model for voice replies |
| `BOB_LLM_NUM_PREDICT` | `60` | Max tokens per voice reply |
| `BOB_TTS_VOICE` / `_FEMALE_` / `_MALE_` | `af_heart` / `am_adam` | Kokoro voices |
| `BOB_TTS_SPEED` | `1.1` | Speech rate |
| `BOB_TTS_DEVICE` | follows whisper device | `cuda` or `cpu` |

(The values in the `.env` template in §5.5 are the recommended ones, which differ from these code defaults.)

---

## 10. Troubleshooting

**`error: Microsoft Visual C++ 14.0 or greater is required` when installing `chroma-hnswlib`/`chromadb`**
→ You're on Python 3.12+. Recreate the venv with **Python 3.11** (see §5.1). 3.11 has prebuilt wheels.

**`torch.cuda.is_available()` is `False` on an NVIDIA GPU**
→ You installed the CPU torch. Reinstall: `pip uninstall -y torch torchaudio` then `pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu128`. Also update your NVIDIA driver and confirm `nvidia-smi` works.

**Avatar mic button is disabled / health shows `enabled: false`**
→ `ENABLE_FASTRTC_AVATAR` isn't `true`. Set it in `backend/.env` and restart the backend.

**`Missing Bob voice requirements: ...` in health**
→ Run `pip install -r requirements-voice.txt` in the activated `.venv`.

**Kokoro/phonemizer error about eSpeak**
→ Install eSpeak NG (§2.5). The `start-server.ps1` script sets `ESPEAK_LIBRARY`; if you launch uvicorn manually, set it yourself:
`$env:ESPEAK_LIBRARY = "C:\Program Files\eSpeak NG\libespeak-ng.dll"`.

**Chat says model not found**
→ `ollama pull gemma3:4b` (and `qwen2.5:1.5b`, `mxbai-embed-large`) and make sure `ollama serve` is running.

**`npm install` fails with `ERESOLVE` peer dependency conflict**
→ Use `npm install --legacy-peer-deps` (§6).

**Port already in use (8000 or 5173)**
→ Find and stop the process: `netstat -ano | findstr :8000` then `taskkill /PID <pid> /F`.

**Stock prices / market data wrong or missing**
→ Requires internet (Yahoo Finance). The RAG engine resolves tickers via Yahoo symbol search and supports Indian (`.NS`), US, and global stocks, plus currency conversion (e.g. “nvidia price in inr”).

**Database errors**
→ Delete `backend/finance.db` and re-run `python init_db.py`.

---

## 11. Quick reference (returning users)

```powershell
# Terminal 1
ollama serve

# Terminal 2
cd AI-FINANCE\backend; .\start-server.ps1

# Terminal 3
cd AI-FINANCE\frontend; npm run dev
# open http://localhost:5173
```
