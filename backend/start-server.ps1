# Start the FinWise backend.
#
# Tells Phonemizer where eSpeak-ng lives (needed by Kokoro TTS), activates the
# project virtual environment, and launches uvicorn.
#
# NOTE: --reload is intentionally OFF. The realtime avatar warms up heavy
# models (Faster-Whisper + Kokoro) and runs background worker threads; the
# reloader tears those down on every file change and makes the voice pipeline
# flaky. Use start-server-dev.ps1 / add --reload manually if you need it.

$ErrorActionPreference = "Stop"

# --- eSpeak-ng (Kokoro TTS dependency) ---
$env:ESPEAK_LIBRARY = "C:\Program Files\eSpeak NG\libespeak-ng.dll"
$env:PATH = "C:\Program Files\eSpeak NG;" + $env:PATH
Write-Host "eSpeak-ng environment configured."

# --- Locate the virtual environment ---
$venvActivate = ".\.venv\Scripts\Activate.ps1"
if (-not (Test-Path $venvActivate)) {
    Write-Host ""
    Write-Host "Virtual environment not found at .venv" -ForegroundColor Yellow
    Write-Host "Create it and install dependencies first:" -ForegroundColor Yellow
    Write-Host "  py -3.12 -m venv .venv"
    Write-Host "  .\.venv\Scripts\Activate.ps1"
    Write-Host "  pip install -r requirements.txt"
    Write-Host "  pip install -r requirements-voice.txt   # realtime avatar (GPU)"
    exit 1
}

. $venvActivate
Write-Host "Activated .venv"
Write-Host "Starting backend server on http://127.0.0.1:8000 ..."
Write-Host ""

uvicorn app.main:app --host 127.0.0.1 --port 8000
