/**
 * Viseme Lip Sync Utility
 * Converts text to viseme sequences for realistic avatar lip-syncing
 * Based on Oculus/Meta viseme standard (compatible with Ready Player Me models)
 * 
 * Now supports both local conversion and API-based Phonemizer service
 */

// API Configuration
const PHONEME_API_URL = 'http://localhost:8000/api/v1/phoneme/text-to-visemes';
const USE_API = true; // Set to false to always use local conversion


// Oculus/Meta Viseme Standard - 15 viseme shapes
export const VISEME_TYPES = {
    sil: 'sil',      // Silence
    PP: 'PP',        // p, b, m
    FF: 'FF',        // f, v
    TH: 'TH',        // th
    DD: 'DD',        // t, d
    kk: 'kk',        // k, g
    CH: 'CH',        // ch, j, sh
    SS: 'SS',        // s, z
    nn: 'nn',        // n, l
    RR: 'RR',        // r
    aa: 'aa',        // a (as in "father")
    E: 'E',          // e (as in "bed")
    I: 'I',          // i (as in "sit")
    O: 'O',          // o (as in "hot")
    U: 'U'           // u (as in "book")
};

// Phoneme to Viseme mapping
const PHONEME_TO_VISEME = {
    // Consonants
    'p': 'PP', 'b': 'PP', 'm': 'PP',
    'f': 'FF', 'v': 'FF',
    'th': 'TH', 'dh': 'TH',
    't': 'DD', 'd': 'DD',
    'k': 'kk', 'g': 'kk', 'ng': 'kk',
    'ch': 'CH', 'j': 'CH', 'sh': 'CH', 'zh': 'CH',
    's': 'SS', 'z': 'SS',
    'n': 'nn', 'l': 'nn',
    'r': 'RR',
    'w': 'U', 'y': 'I', 'h': 'sil',

    // Vowels
    'a': 'aa', 'ah': 'aa', 'aa': 'aa',
    'e': 'E', 'eh': 'E', 'ae': 'E',
    'i': 'I', 'ih': 'I', 'ee': 'I',
    'o': 'O', 'oh': 'O', 'aw': 'O',
    'u': 'U', 'uh': 'U', 'oo': 'U',

    // Diphthongs (two-vowel sounds)
    'ow': 'O',  // as in "wow", "out", "down"
    'ay': 'E',  // as in "day", "name", "amazing"
    'er': 'RR', // as in "her", "person", "over"
    'oy': 'O',  // as in "boy", "coin"
    'ai': 'E',  // as in "rain", "main"

    // Special
    ' ': 'sil',
    '': 'sil'
};

// Simple letter-to-phoneme approximation for English
// This is a simplified version - for production, consider using a proper TTS library
const LETTER_TO_PHONEME = {
    'a': 'aa', 'b': 'b', 'c': 'k', 'd': 'd', 'e': 'e',
    'f': 'f', 'g': 'g', 'h': 'h', 'i': 'i', 'j': 'j',
    'k': 'k', 'l': 'l', 'm': 'm', 'n': 'n', 'o': 'o',
    'p': 'p', 'q': 'k', 'r': 'r', 's': 's', 't': 't',
    'u': 'u', 'v': 'v', 'w': 'w', 'x': 'k', 'y': 'y',
    'z': 'z'
};

// Common word patterns for better phoneme mapping
const WORD_PATTERNS = {
    // Articles & Pronouns
    'the': ['dh', 'uh'],
    'a': ['uh'],
    'an': ['ae', 'n'],
    'i': ['aa', 'ee'],
    'you': ['y', 'oo'],
    'he': ['h', 'ee'],
    'she': ['sh', 'ee'],
    'we': ['w', 'ee'],
    'they': ['dh', 'ay'],
    'it': ['ih', 't'],
    'me': ['m', 'ee'],
    'my': ['m', 'aa', 'ee'],
    'your': ['y', 'oo', 'r'],

    // Common verbs
    'are': ['aa', 'r'],
    'is': ['ih', 'z'],
    'was': ['w', 'ah', 'z'],
    'were': ['w', 'er'],
    'have': ['h', 'ae', 'v'],
    'has': ['h', 'ae', 'z'],
    'had': ['h', 'ae', 'd'],
    'do': ['d', 'oo'],
    'does': ['d', 'uh', 'z'],
    'did': ['d', 'ih', 'd'],
    'can': ['k', 'ae', 'n'],
    'will': ['w', 'ih', 'l'],
    'would': ['w', 'uh', 'd'],
    'should': ['sh', 'uh', 'd'],
    'could': ['k', 'uh', 'd'],
    'get': ['g', 'eh', 't'],
    'got': ['g', 'ah', 't'],
    'make': ['m', 'ay', 'k'],
    'made': ['m', 'ay', 'd'],
    'go': ['g', 'oh'],
    'going': ['g', 'oh', 'ih', 'ng'],
    'say': ['s', 'ay'],
    'said': ['s', 'eh', 'd'],

    // Prepositions & Conjunctions
    'and': ['ae', 'n', 'd'],
    'or': ['o', 'r'],
    'but': ['b', 'uh', 't'],
    'for': ['f', 'o', 'r'],
    'with': ['w', 'ih', 'th'],
    'from': ['f', 'r', 'o', 'm'],
    'to': ['t', 'oo'],
    'in': ['ih', 'n'],
    'on': ['ah', 'n'],
    'at': ['ae', 't'],
    'by': ['b', 'aa', 'ee'],
    'of': ['ah', 'v'],

    // Question words
    'this': ['dh', 'ih', 's'],
    'that': ['dh', 'ae', 't'],
    'what': ['w', 'ah', 't'],
    'when': ['w', 'eh', 'n'],
    'where': ['w', 'eh', 'r'],
    'why': ['w', 'aa', 'ee'],
    'how': ['h', 'ow'],
    'who': ['h', 'oo'],

    // Common words
    'hello': ['h', 'eh', 'l', 'oh'],
    'hi': ['h', 'aa', 'ee'],
    'yes': ['y', 'eh', 's'],
    'no': ['n', 'oh'],
    'okay': ['oh', 'k', 'ay'],
    'ok': ['oh', 'k'],
    'please': ['p', 'l', 'ee', 'z'],
    'thank': ['th', 'ae', 'ng', 'k'],
    'thanks': ['th', 'ae', 'ng', 'k', 's'],
    'sorry': ['s', 'ah', 'r', 'ee'],
    'good': ['g', 'uh', 'd'],
    'great': ['g', 'r', 'ay', 't'],
    'nice': ['n', 'aa', 'ee', 's'],
    'well': ['w', 'eh', 'l'],
    'very': ['v', 'eh', 'r', 'ee'],
    'much': ['m', 'uh', 'ch'],
    'more': ['m', 'o', 'r'],
    'most': ['m', 'oh', 's', 't'],
    'some': ['s', 'uh', 'm'],
    'any': ['eh', 'n', 'ee'],
    'all': ['ah', 'l'],
    'know': ['n', 'oh'],
    'think': ['th', 'ih', 'ng', 'k'],
    'see': ['s', 'ee'],
    'look': ['l', 'uh', 'k'],
    'want': ['w', 'ah', 'n', 't'],
    'need': ['n', 'ee', 'd'],
    'like': ['l', 'aa', 'ee', 'k'],
    'love': ['l', 'uh', 'v'],
    'help': ['h', 'eh', 'l', 'p'],
    'tell': ['t', 'eh', 'l'],
    'ask': ['ae', 's', 'k'],
    'work': ['w', 'er', 'k'],
    'time': ['t', 'aa', 'ee', 'm'],
    'day': ['d', 'ay'],
    'year': ['y', 'ee', 'r'],
    'way': ['w', 'ay'],
    'back': ['b', 'ae', 'k'],
    'out': ['ow', 't'],
    'up': ['uh', 'p'],
    'down': ['d', 'ow', 'n'],
    'over': ['oh', 'v', 'er'],
    'after': ['ae', 'f', 't', 'er'],
    'before': ['b', 'ih', 'f', 'o', 'r'],
    'between': ['b', 'ih', 't', 'w', 'ee', 'n'],
    'through': ['th', 'r', 'oo'],
    'about': ['uh', 'b', 'ow', 't'],
    'into': ['ih', 'n', 't', 'oo'],
    'because': ['b', 'ih', 'k', 'ah', 'z'],

    // Exclamations & reactions
    'wow': ['w', 'ow'],
    'amazing': ['uh', 'm', 'ay', 'z', 'ih', 'ng'],
    'awesome': ['ah', 'w', 's', 'uh', 'm'],
    'cool': ['k', 'oo', 'l'],
    'nice': ['n', 'aa', 'ee', 's'],

    // Common names & words
    'name': ['n', 'ay', 'm'],
    'yash': ['y', 'ae', 'sh'],
    'opportunity': ['ah', 'p', 'er', 't', 'oo', 'n', 'ih', 't', 'ee'],
    'important': ['ih', 'm', 'p', 'o', 'r', 't', 'uh', 'n', 't'],
    'different': ['d', 'ih', 'f', 'er', 'uh', 'n', 't'],
    'people': ['p', 'ee', 'p', 'uh', 'l'],
    'person': ['p', 'er', 's', 'uh', 'n'],
    'thing': ['th', 'ih', 'ng'],
    'things': ['th', 'ih', 'ng', 'z'],
    'something': ['s', 'uh', 'm', 'th', 'ih', 'ng'],
    'nothing': ['n', 'uh', 'th', 'ih', 'ng'],
    'everything': ['eh', 'v', 'r', 'ee', 'th', 'ih', 'ng']
};

/**
 * Normalize text for better phoneme conversion
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
function normalizeText(text) {
    // Convert to lowercase
    let normalized = text.toLowerCase();

    // Remove punctuation but keep spaces
    normalized = normalized.replace(/[.,!?;:'"()[\]{}]/g, '');

    // Convert numbers to words (basic)
    const numberWords = {
        '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
        '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
        '10': 'ten'
    };
    normalized = normalized.replace(/\b\d+\b/g, match => numberWords[match] || match);

    // Normalize multiple spaces
    normalized = normalized.replace(/\s+/g, ' ').trim();

    return normalized;
}

/**
 * Check if a character is a vowel
 * @param {string} char - Character to check
 * @returns {boolean}
 */
function isVowel(char) {
    return 'aeiou'.includes(char.toLowerCase());
}

/**
 * Convert a word to phonemes with improved accuracy
 * @param {string} word - Single word to convert
 * @returns {string[]} Array of phonemes
 */
function wordToPhonemes(word) {
    const lowerWord = word.toLowerCase();

    // Check if we have a pattern for this word
    if (WORD_PATTERNS[lowerWord]) {
        return WORD_PATTERNS[lowerWord];
    }

    // Simple letter-by-letter conversion with better rules
    const phonemes = [];
    for (let i = 0; i < lowerWord.length; i++) {
        const char = lowerWord[i];
        const nextChar = lowerWord[i + 1];
        const prevChar = lowerWord[i - 1];

        // Handle digraphs and special combinations
        if (char === 't' && nextChar === 'h') {
            phonemes.push('th');
            i++; // Skip next character
        } else if (char === 's' && nextChar === 'h') {
            phonemes.push('sh');
            i++;
        } else if (char === 'c' && nextChar === 'h') {
            phonemes.push('ch');
            i++;
        } else if (char === 'n' && nextChar === 'g') {
            phonemes.push('ng');
            i++;
        } else if (char === 'p' && nextChar === 'h') {
            phonemes.push('f'); // 'ph' sounds like 'f'
            i++;
        } else if (char === 'c' && nextChar === 'k') {
            phonemes.push('k'); // 'ck' sounds like 'k'
            i++;
        } else if (char === 'o' && nextChar === 'o') {
            phonemes.push('oo'); // 'oo' as in 'book'
            i++;
        } else if (char === 'e' && nextChar === 'e') {
            phonemes.push('ee'); // 'ee' as in 'see'
            i++;
        } else if (char === 'a' && nextChar === 'i') {
            phonemes.push('ae'); // 'ai' as in 'rain'
            i++;
        } else if (char === 'o' && nextChar === 'u') {
            phonemes.push('ow'); // 'ou' as in 'out'
            i++;
        } else if (char === 'e' && nextChar === 'a') {
            phonemes.push('ee'); // 'ea' as in 'eat'
            i++;
        } else if (char === 'e' && i === lowerWord.length - 1 && prevChar && !isVowel(prevChar)) {
            // Silent 'e' at the end - skip it
            continue;
        } else if (LETTER_TO_PHONEME[char]) {
            phonemes.push(LETTER_TO_PHONEME[char]);
        }
    }

    return phonemes;
}

/**
 * Convert phoneme to viseme type
 * @param {string} phoneme - Phoneme to convert
 * @returns {string} Viseme type
 */
export function getVisemeForPhoneme(phoneme) {
    return PHONEME_TO_VISEME[phoneme] || 'sil';
}

/**
 * Estimate duration for a single viseme (in seconds)
 * @param {string} viseme - Viseme type
 * @returns {number} Duration in seconds
 */
function getVisemeDuration(viseme) {
    // Consonants are typically shorter than vowels
    const consonants = ['PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR'];
    const vowels = ['aa', 'E', 'I', 'O', 'U'];

    if (consonants.includes(viseme)) {
        return 0.08; // 100ms for consonants (was 0.08 - increased for slower speech)
    } else if (vowels.includes(viseme)) {
        return 0.12; // 150ms for vowels (was 0.12 - increased for slower speech)
    } else {
        return 0.05; // 70ms for silence (was 0.05)
    }
}

/**
 * Convert text to timed viseme sequence
 * @param {string} text - Text to convert
 * @returns {Array<{viseme: string, start: number, duration: number}>}
 */
export function textToVisemes(text) {
    if (!text || text.trim() === '') {
        return [{ viseme: 'sil', start: 0, duration: 0.5 }];
    }

    // Normalize the text first
    const normalizedText = normalizeText(text);

    // Split text into words
    const words = normalizedText.split(/\s+/).filter(w => w.length > 0);
    const visemeSequence = [];
    let currentTime = 0;

    words.forEach((word, wordIndex) => {
        // Convert word to phonemes
        const phonemes = wordToPhonemes(word);

        // Convert phonemes to visemes
        phonemes.forEach((phoneme, phonemeIndex) => {
            const viseme = getVisemeForPhoneme(phoneme);
            let duration = getVisemeDuration(viseme);

            // Add slight variation to make it more natural
            // Vowels at the end of words are slightly longer
            if (phonemeIndex === phonemes.length - 1 && isVowel(phoneme)) {
                duration *= 1.2;
            }

            visemeSequence.push({
                viseme,
                start: currentTime,
                duration
            });

            currentTime += duration;
        });

        // Add small pause between words (except after last word)
        if (wordIndex < words.length - 1) {
            visemeSequence.push({
                viseme: 'sil',
                start: currentTime,
                duration: 0.08 // Slightly longer pause between words
            });
            currentTime += 0.08;
        }
    });

    // Add final silence
    visemeSequence.push({
        viseme: 'sil',
        start: currentTime,
        duration: 0.3
    });

    return visemeSequence;
}

/**
 * Get morph target values for a specific viseme
 * Maps viseme types to morph target influences
 * Now supports optional shapeKeys object from backend for precise control
 * @param {string} viseme - Viseme type
 * @param {Object} [shapeKeys] - Optional precise shape keys from backend
 * @returns {Object} Morph target values
 */
export function getVisemeMorphTargets(viseme, shapeKeys = null) {
    const morphTargets = {
        mouthOpen: 0,
        mouthSmile: 0,
        mouthFunnel: 0,
        mouthPucker: 0,
        jawOpen: 0
    };

    // PLAN A: Use precise shape keys from backend if available
    if (shapeKeys && shapeKeys.lips) {
        // Map custom refined shape keys to Standard RPM/ARKit Morph Targets

        // 1. Mouth Opening
        if (shapeKeys.lips.Lips_Open_Wide) {
            morphTargets.mouthOpen = shapeKeys.lips.Lips_Open_Wide;
            morphTargets.jawOpen = shapeKeys.lips.Lips_Open_Wide * 0.8;
        }

        // 2. Wide / Smile
        if (shapeKeys.lips.Lips_Wide) {
            // Lips_Wide corresponds to mouthSmile or mouthUpperUp type movement
            morphTargets.mouthSmile = shapeKeys.lips.Lips_Wide;
        }

        // 3. Round / Pucker
        if (shapeKeys.lips.Lips_Round) {
            morphTargets.mouthPucker = shapeKeys.lips.Lips_Round;
        }
        if (shapeKeys.lips.Lips_Purse_Narrow) {
            morphTargets.mouthPucker = Math.max(morphTargets.mouthPucker, shapeKeys.lips.Lips_Purse_Narrow);
        }

        // 4. Funnel / Protrude
        if (shapeKeys.lips.Lips_Protude) {
            morphTargets.mouthFunnel = shapeKeys.lips.Lips_Protude;
        }

        // 5. FV (Labiodental) - approximations
        if (shapeKeys.lips.Lips_FV) {
            // Approximation for F/V sound
            morphTargets.mouthOpen = 0.2;
            morphTargets.jawOpen = 0.1;
            // Ideally we'd use viseme_FF if available, but restricting to 5 core shapes
        }

        // 6. Corner Up (Simulate with smile)
        if (shapeKeys.lips.Lips_Corner_Up) {
            morphTargets.mouthSmile = Math.max(morphTargets.mouthSmile, shapeKeys.lips.Lips_Corner_Up);
        }

        return morphTargets;
    }

    // PLAN B: Fallback to Standard Oculus Viseme Logic
    switch (viseme) {
        case 'sil':
            // Neutral/closed mouth
            morphTargets.mouthOpen = 0;
            break;

        case 'PP':
            // Lips pressed together (p, b, m) - Intensely closed/puckered
            morphTargets.mouthOpen = 0;
            morphTargets.mouthPucker = 0.8;
            break;

        case 'FF':
            // Lower lip to upper teeth (f, v)
            morphTargets.mouthOpen = 0.5;
            break;

        case 'TH':
            // Tongue between teeth (th)
            morphTargets.mouthOpen = 0.6;
            break;

        case 'DD':
            // Tongue to roof of mouth (t, d)
            morphTargets.mouthOpen = 0.6;
            break;

        case 'kk':
            // Back of tongue to soft palate (k, g)
            morphTargets.mouthOpen = 0.7;
            break;

        case 'CH':
            // Lips pushed forward (ch, j, sh)
            morphTargets.mouthOpen = 0.6;
            morphTargets.mouthPucker = 0.9;
            break;

        case 'SS':
            // Teeth together, slight smile (s, z)
            morphTargets.mouthOpen = 0.4;
            morphTargets.mouthSmile = 0.8;
            break;

        case 'nn':
            // Tongue to roof, mouth slightly open (n, l)
            morphTargets.mouthOpen = 0.6;
            break;

        case 'RR':
            // Lips rounded (r)
            morphTargets.mouthOpen = 0.6;
            morphTargets.mouthPucker = 0.8;
            break;

        case 'aa':
            // Wide open mouth (a, ah)
            morphTargets.mouthOpen = 1.0;
            morphTargets.jawOpen = 1.0;
            break;

        case 'E':
            // Mouth open, slight smile (e, eh)
            morphTargets.mouthOpen = 0.7;
            morphTargets.mouthSmile = 0.7;
            break;

        case 'I':
            // Mouth slightly open, wide smile (i, ee)
            morphTargets.mouthOpen = 0.5;
            morphTargets.mouthSmile = 0.9;
            break;

        case 'O':
            // Mouth open, rounded (o)
            morphTargets.mouthOpen = 1.0;
            morphTargets.mouthFunnel = 1.0;
            morphTargets.jawOpen = 0.8;
            break;

        case 'U':
            // Lips rounded, puckered (u, oo)
            morphTargets.mouthOpen = 0.5;
            morphTargets.mouthPucker = 1.0;
            morphTargets.mouthFunnel = 0.7;
            break;

        default:
            // Fallback for unknown visemes (e.g. ARPABET codes effectively fall through here if no shape keys)
            // But usually we should have shape keys if we have ARPABET
            morphTargets.mouthOpen = 0.3;
    }

    return morphTargets;
}

/**
 * Estimate total speech duration for text
 * @param {string} text - Text to analyze
 * @returns {number} Duration in seconds
 */
export function estimateDuration(text) {
    const visemes = textToVisemes(text);
    if (visemes.length === 0) return 0;

    const lastViseme = visemes[visemes.length - 1];
    return lastViseme.start + lastViseme.duration;
}

/**
 * Get visemes from backend Phonemizer API service
 * Uses professional-grade IPA phoneme conversion for maximum accuracy
 * Automatically falls back to local conversion if API is unavailable
 * 
 * @param {string} text - Text to convert
 * @param {string} language - Language code (default: 'en-us')
 * @returns {Promise<Array>} Viseme sequence from backend or local fallback
 */
export async function textToVisemesAPI(text, language = 'en-us') {
    // If API is disabled, use local conversion
    if (!USE_API) {
        console.log('API disabled, using local conversion');
        return textToVisemes(text);
    }

    try {
        const response = await fetch(PHONEME_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text, language })
        });

        if (!response.ok) {
            throw new Error(`API returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        console.log('✅ Using Phonemizer API for accurate phonemes');
        console.log('IPA Phonemes:', data.phonemes);
        console.log('Viseme count:', data.visemes.length);

        return data.visemes;
    } catch (error) {
        console.warn('⚠️ Phonemizer API error, falling back to local conversion:', error.message);
        // Fallback to existing local textToVisemes function
        return textToVisemes(text);
    }
}




/**
 * Get visemes AND audio URL from backend TTS service
 * 
 * @param {string} text - Text to convert
 * @returns {Promise<{audio_url: string, visemes: Array}>} 
 */
export async function textToAudioVisemesAPI(text) {
    const TTS_API_URL = 'http://localhost:8000/api/v1/phoneme/tts-to-visemes';

    try {
        console.log('📤 Sending text to backend for TTS & lip sync...');

        const response = await fetch(TTS_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }

        const data = await response.json();

        console.log('✅ TTS & Visemes received');
        console.log('Audio URL:', data.audio_url);

        return data;
    } catch (error) {
        console.error('❌ TTS lip sync error:', error.message);
        throw error;
    }
}

