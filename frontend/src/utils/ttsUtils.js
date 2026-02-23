/**
 * Text-to-Speech Utilities using Web Speech API
 * Provides local, offline text-to-speech functionality
 */

let availableVoices = [];
let selectedVoice = null;

/**
 * Initialize TTS and load available voices
 * @returns {Promise<Array>} Array of available voices
 */
export const initializeTTS = () => {
    return new Promise((resolve) => {
        const loadVoices = () => {
            availableVoices = speechSynthesis.getVoices();

            if (availableVoices.length > 0) {
                // Try to find a good default voice (English, female preferred)
                selectedVoice = findBestVoice();
                console.log('✅ TTS Initialized with', availableVoices.length, 'voices');
                console.log('🎤 Selected voice:', selectedVoice?.name || 'Default');
                resolve(availableVoices);
            }
        };

        // Load voices immediately if available
        loadVoices();

        // Also listen for voiceschanged event (some browsers need this)
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = loadVoices;
        }
    });
};

/**
 * Find the best default voice (prefer English, female)
 * @returns {SpeechSynthesisVoice|null}
 */
const findBestVoice = () => {
    // Priority 1: English female voices
    let voice = availableVoices.find(v =>
        v.lang.startsWith('en') && v.name.toLowerCase().includes('female')
    );

    if (voice) return voice;

    // Priority 2: Any English voice
    voice = availableVoices.find(v => v.lang.startsWith('en'));

    if (voice) return voice;

    // Priority 3: First available voice
    return availableVoices[0] || null;
};

/**
 * Get all available voices
 * @returns {Array<SpeechSynthesisVoice>}
 */
export const getVoices = () => {
    return availableVoices;
};

/**
 * Get currently selected voice
 * @returns {SpeechSynthesisVoice|null}
 */
export const getSelectedVoice = () => {
    return selectedVoice;
};

/**
 * Set the voice to use for speech
 * @param {SpeechSynthesisVoice} voice
 */
export const setVoice = (voice) => {
    selectedVoice = voice;
    console.log('🎤 Voice changed to:', voice.name);
};

/**
 * Speak text using Web Speech API
 * @param {string} text - Text to speak
 * @param {Object} options - Speech options
 * @param {number} options.rate - Speech rate (0.1 to 10, default 1.0)
 * @param {number} options.pitch - Voice pitch (0 to 2, default 1.0)
 * @param {number} options.volume - Volume (0 to 1, default 1.0)
 * @param {SpeechSynthesisVoice} options.voice - Voice to use
 * @param {Function} options.onBoundary - Callback for word boundaries (charIndex, charLength)
 * @param {Function} options.onStart - Callback when speech starts
 * @returns {Promise} Resolves when speech completes
 */
export const speakText = (text, options = {}) => {
    return new Promise((resolve, reject) => {
        // Stop any ongoing speech
        stopSpeaking();

        if (!text || text.trim() === '') {
            resolve();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(text);

        // Set voice
        utterance.voice = options.voice || selectedVoice;

        // Set speech parameters
        utterance.rate = options.rate || 0.1;    // Speed (0.1 to 10) - slowed down to 0.8
        utterance.pitch = options.pitch || 1.0;  // Pitch (0 to 2)
        utterance.volume = options.volume || 1.0; // Volume (0 to 1)

        // Event handlers
        utterance.onstart = () => {
            console.log('🎤 Audio playback started');
            if (options.onStart) {
                options.onStart();
            }
        };

        // Boundary event - fires at word boundaries
        utterance.onboundary = (event) => {
            if (options.onBoundary) {
                options.onBoundary(event.charIndex, event.charLength, event.elapsedTime);
            }
        };

        utterance.onend = () => {
            console.log('✅ Audio playback complete');
            resolve();
        };

        utterance.onerror = (event) => {
            console.error('❌ TTS Error:', event.error);
            reject(event.error);
        };

        // Speak!
        speechSynthesis.speak(utterance);
    });
};

/**
 * Stop any ongoing speech
 */
export const stopSpeaking = () => {
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
        console.log('⏹️ Speech stopped');
    }
};

/**
 * Pause ongoing speech
 */
export const pauseSpeaking = () => {
    if (speechSynthesis.speaking && !speechSynthesis.paused) {
        speechSynthesis.pause();
        console.log('⏸️ Speech paused');
    }
};

/**
 * Resume paused speech
 */
export const resumeSpeaking = () => {
    if (speechSynthesis.paused) {
        speechSynthesis.resume();
        console.log('▶️ Speech resumed');
    }
};

/**
 * Check if TTS is currently speaking
 * @returns {boolean}
 */
export const isSpeaking = () => {
    return speechSynthesis.speaking;
};

// Initialize on module load
initializeTTS();
