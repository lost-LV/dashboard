/**
 * Audio Manager - Handles sound generation and playback using Web Audio API
 *
 * This module provides functionality to play audio notifications for various events
 * like large liquidations. It uses the Web Audio API to generate sounds without
 * requiring external audio files.
 */

class AudioManager {
    constructor() {
        // Initialize Web Audio API
        this.audioContext = null;
        this.masterGain = null;

        // Load settings from localStorage with improved parsing and debugging
        const enabledSetting = localStorage.getItem('audioNotificationsEnabled');
        this.enabled = enabledSetting === 'true';
        this.volume = parseFloat(localStorage.getItem('audioVolume')) || 0.5; // Default to 50%
        this.threshold = parseInt(localStorage.getItem('audioThreshold')) || 1000000; // Default to $1M
        this.soundType = localStorage.getItem('audioSoundType') || 'sine'; // Default to sine wave

        // Debug log for initialization
        console.log(`Audio Manager loading settings - enabled setting: "${enabledSetting}", parsed as: ${this.enabled}`);
        console.log(`Audio volume: ${this.volume}, threshold: ${this.threshold}, sound type: ${this.soundType}`);

        // Initialize audio context on first user interaction
        this.initOnUserInteraction();

        // Make instance globally accessible
        window.audioManager = this;

        console.log(`Audio Manager initialized, notifications ${this.enabled ? 'enabled' : 'disabled'}, volume: ${this.volume}, threshold: ${this.threshold}`);
    }

    /**
     * Initialize audio context on first user interaction to comply with autoplay policies
     */
    initOnUserInteraction() {
        const initAudio = () => {
            if (this.audioContext) return; // Already initialized

            try {
                // Create audio context
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

                // Create master gain node for volume control
                this.masterGain = this.audioContext.createGain();
                this.masterGain.gain.value = this.volume; // Use stored volume setting
                this.masterGain.connect(this.audioContext.destination);

                console.log('Audio context initialized successfully');
            } catch (error) {
                console.error('Failed to initialize audio context:', error);
            }

            // Remove event listeners once initialized
            document.removeEventListener('click', initAudio);
            document.removeEventListener('touchstart', initAudio);
            document.removeEventListener('keydown', initAudio);
        };

        // Add event listeners for user interaction
        document.addEventListener('click', initAudio);
        document.addEventListener('touchstart', initAudio);
        document.addEventListener('keydown', initAudio);
    }

    /**
     * Enable or disable audio notifications
     * @param {boolean} enabled - Whether audio notifications should be enabled
     */
    setEnabled(enabled) {
        // Convert to boolean if it's not already
        const enabledBool = !!enabled;
        this.enabled = enabledBool;

        // Store as string 'true' or 'false'
        localStorage.setItem('audioNotificationsEnabled', enabledBool.toString());

        // Debug logging
        console.log(`Audio notifications ${enabledBool ? 'enabled' : 'disabled'}`);
        console.log(`Value stored in localStorage: '${localStorage.getItem('audioNotificationsEnabled')}' (${typeof localStorage.getItem('audioNotificationsEnabled')})`);
    }

    /**
     * Set the volume for audio notifications
     * @param {number} volume - Volume level between 0 and 1
     */
    setVolume(volume) {
        // Ensure volume is between 0 and 1
        this.volume = Math.max(0, Math.min(1, volume));
        localStorage.setItem('audioVolume', this.volume.toString());

        // Update master gain if audio context is initialized
        if (this.masterGain) {
            this.masterGain.gain.value = this.volume;
        }

        console.log(`Audio volume set to ${this.volume}`);
    }

    /**
     * Set the threshold for audio notifications
     * @param {number} threshold - Dollar value threshold (e.g., 1000000 for $1M)
     */
    setThreshold(threshold) {
        this.threshold = threshold;
        localStorage.setItem('audioThreshold', threshold.toString());
        console.log(`Audio notification threshold set to $${threshold.toLocaleString()}`);
    }

    /**
     * Set the sound type for audio notifications
     * @param {string} type - Oscillator type ('sine', 'square', 'sawtooth', 'triangle')
     */
    setSoundType(type) {
        const validTypes = ['sine', 'square', 'sawtooth', 'triangle'];
        if (validTypes.includes(type)) {
            this.soundType = type;
            localStorage.setItem('audioSoundType', type);
            console.log(`Audio sound type set to ${type}`);
        } else {
            console.error(`Invalid sound type: ${type}. Must be one of: ${validTypes.join(', ')}`);
        }
    }

    /**
     * Play a notification sound for a large liquidation
     * @param {string} side - 'Buy' or 'Sell' liquidation
     * @param {number} value - Dollar value of the liquidation
     * @param {boolean} ignoreThreshold - Whether to ignore the threshold check (for test sounds)
     */
    playLiquidationSound(side, value, ignoreThreshold = false) {
        // Debug log for audio state
        console.log(`Attempting to play sound - Audio enabled: ${this.enabled}, Audio context initialized: ${!!this.audioContext}`);

        // Check if audio is enabled and context is initialized
        if (!this.enabled) {
            console.log('Audio notifications are disabled, not playing sound');
            return;
        }

        if (!this.audioContext) {
            console.log('Audio context not initialized, not playing sound');
            return;
        }

        // Check if the liquidation value meets the threshold (unless ignoreThreshold is true)
        if (!ignoreThreshold && value < this.threshold) {
            console.log(`Liquidation value ${value} below threshold ${this.threshold}, not playing sound`);
            return;
        }

        // Format value for logging
        const formattedValue = value >= 1000000
            ? `$${(value / 1000000).toFixed(2)}M`
            : `$${(value / 1000).toFixed(0)}K`;

        console.log(`Playing liquidation sound for ${side} ${formattedValue}`);

        // Create oscillator
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        // Set oscillator type based on settings
        oscillator.type = this.soundType;

        // Set frequency based on liquidation side
        if (side === 'Buy') {
            // Higher pitch for buy liquidations (shorts getting liquidated)
            oscillator.frequency.value = 880; // A5
        } else {
            // Lower pitch for sell liquidations (longs getting liquidated)
            oscillator.frequency.value = 440; // A4
        }

        // Scale volume based on liquidation size (larger = louder, but with a cap)
        // This is a relative scale that will be multiplied by the master volume
        const volumeScale = Math.min(0.8, 0.3 + (value / 10000000) * 0.5);

        // Connect nodes
        oscillator.connect(gainNode);
        gainNode.connect(this.masterGain);

        // Set envelope
        const now = this.audioContext.currentTime;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volumeScale, now + 0.02);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.5);

        // Start and stop
        oscillator.start(now);
        oscillator.stop(now + 0.5);
    }
}

// Create audio manager instance immediately
console.log('Creating Audio Manager instance...');
const audioManager = new AudioManager();

// Expose audio manager instance globally
window.audioManager = audioManager;

// Add a global test function for debugging purposes only
// This function is NOT used during normal operation and is only for manual testing
window.testAudioManually = function() {
    console.log('MANUAL AUDIO TEST - This is only for debugging purposes');
    console.log(`Audio enabled: ${audioManager.enabled}`);
    console.log(`Audio context initialized: ${!!audioManager.audioContext}`);
    console.log(`localStorage value: ${localStorage.getItem('audioNotificationsEnabled')}`);

    // Force initialize audio context if needed
    if (!audioManager.audioContext) {
        try {
            audioManager.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioManager.masterGain = audioManager.audioContext.createGain();
            audioManager.masterGain.gain.value = audioManager.volume;
            audioManager.masterGain.connect(audioManager.audioContext.destination);
            console.log('Audio context initialized during manual test');
        } catch (error) {
            console.error('Failed to initialize audio context during manual test:', error);
        }
    }

    // Temporarily enable audio for the test
    const wasEnabled = audioManager.enabled;
    audioManager.enabled = true;

    // Play test sound
    console.log('Playing manual test sound - this would normally only happen during liquidations');
    audioManager.playLiquidationSound('Buy', 1500000, true);

    // Restore previous state
    setTimeout(() => {
        audioManager.enabled = wasEnabled;
        console.log(`Manual audio test complete, restored enabled state to: ${wasEnabled}`);
    }, 1000);

    return 'Manual audio test complete - audio will only play during actual liquidations';
};
