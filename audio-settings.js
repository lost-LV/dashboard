/**
 * Audio Settings - Manages settings for audio notifications
 *
 * This module provides a UI for configuring audio notification settings
 * and integrates with the color customizer menu.
 */

class AudioSettings {
    constructor() {
        // Initialize settings with improved parsing and debugging
        const enabledSetting = localStorage.getItem('audioNotificationsEnabled');

        this.settings = {
            enabled: enabledSetting === 'true',
            volume: parseFloat(localStorage.getItem('audioVolume')) || 0.5,
            threshold: parseInt(localStorage.getItem('audioThreshold')) || 1000000,
            soundType: localStorage.getItem('audioSoundType') || 'sine'
        };

        // Debug log for initialization
        console.log(`Audio Settings initialized - enabled setting: "${enabledSetting}", parsed as: ${this.settings.enabled}`);
        console.log(`Audio volume: ${this.settings.volume}, threshold: ${this.settings.threshold}, sound type: ${this.settings.soundType}`);

        // Wait for color customizer to be available
        this.waitForColorCustomizer();

        // Make instance globally accessible
        window.audioSettingsInstance = this;

        // Ensure audio manager has the correct settings if it exists
        if (window.audioManager) {
            console.log('Synchronizing audio manager with settings on initialization');
            window.audioManager.setEnabled(this.settings.enabled);
            window.audioManager.setVolume(this.settings.volume);
            window.audioManager.setThreshold(this.settings.threshold);
            window.audioManager.setSoundType(this.settings.soundType);
        } else {
            console.log('Audio manager not available during settings initialization');
        }

        console.log('Audio Settings initialization complete');
    }

    /**
     * Wait for color customizer to be available
     */
    waitForColorCustomizer() {
        if (window.colorCustomizer) {
            console.log('Color customizer is available');
            // Dispatch an event to notify that audio settings are ready
            document.dispatchEvent(new CustomEvent('audioSettingsReady'));
        } else {
            console.log('Waiting for color customizer to be available...');
            setTimeout(() => this.waitForColorCustomizer(), 500);
        }
    }

    /**
     * Populate the audio settings panel with settings
     * @param {HTMLElement} leftColumn - Left column of the panel
     * @param {HTMLElement} rightColumn - Right column of the panel
     */
    populateAudioSettingsPanel(leftColumn, rightColumn) {
        // Add description to the left column
        const description = document.createElement('div');
        description.style.marginBottom = '20px';
        description.style.color = '#aaa';
        description.style.fontSize = '14px';
        description.style.lineHeight = '1.4';
        description.innerHTML = 'Configure audio notifications for large liquidations. ' +
            'These settings control when and how sounds are played when significant liquidations occur.';
        leftColumn.appendChild(description);

        // Add toggle for enabling/disabling audio notifications
        leftColumn.appendChild(this.createToggleSection());

        // Add sound options to the right column
        rightColumn.appendChild(this.createSoundOptionsSection());

        // Add test buttons to the right column
        rightColumn.appendChild(this.createTestButtonsSection());
    }

    /**
     * Create toggle section for enabling/disabling audio notifications
     * @returns {HTMLElement} - Toggle section container
     */
    createToggleSection() {
        const section = document.createElement('div');
        section.style.marginBottom = '20px';

        const heading = document.createElement('div');
        heading.textContent = 'Audio Notification Options';
        heading.style.color = '#ffffff';
        heading.style.fontWeight = 'bold';
        heading.style.marginBottom = '15px';
        section.appendChild(heading);

        // Create toggle for enabling/disabling audio notifications
        section.appendChild(this.createToggle('enabled', 'Enable Audio Notifications', this.settings.enabled));

        // Add volume slider
        section.appendChild(this.createVolumeSlider());

        return section;
    }

    /**
     * Create a toggle switch
     * @param {string} id - Setting ID
     * @param {string} label - Label text
     * @param {boolean} defaultValue - Default value
     * @returns {HTMLElement} - Toggle container
     */
    createToggle(id, label, defaultValue) {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'space-between';
        container.style.marginBottom = '10px';

        const labelElement = document.createElement('label');
        labelElement.textContent = label;
        labelElement.style.flexGrow = '1';
        labelElement.style.color = '#ffffff';

        // Create toggle switch
        const toggle = document.createElement('div');
        toggle.style.width = '50px';
        toggle.style.height = '24px';
        toggle.style.borderRadius = '12px';
        toggle.style.position = 'relative';
        toggle.style.cursor = 'pointer';
        toggle.style.transition = 'background-color 0.3s';

        const toggleButton = document.createElement('div');
        toggleButton.style.width = '20px';
        toggleButton.style.height = '20px';
        toggleButton.style.backgroundColor = '#fff';
        toggleButton.style.borderRadius = '50%';
        toggleButton.style.position = 'absolute';
        toggleButton.style.top = '2px';
        toggleButton.style.transition = 'left 0.3s';

        toggle.appendChild(toggleButton);

        // Function to update toggle appearance based on current state
        const updateToggleAppearance = () => {
            const isEnabled = this.settings[id];
            toggle.style.backgroundColor = isEnabled ? '#4CAF50' : '#ccc';
            toggleButton.style.left = isEnabled ? '28px' : '2px';
            console.log(`Toggle appearance updated - ${id} is now ${isEnabled}`);
        };

        // Set initial appearance
        updateToggleAppearance();

        // Add click event
        toggle.addEventListener('click', () => {
            // Toggle the value
            this.settings[id] = !this.settings[id];
            console.log(`Toggle clicked - ${id} is now ${this.settings[id]}`);

            // Update the toggle appearance
            updateToggleAppearance();

            // Save to localStorage - use the correct key based on the setting id
            const storageKey = id === 'enabled' ? 'audioNotificationsEnabled' : `audio${id.charAt(0).toUpperCase() + id.slice(1)}`;
            localStorage.setItem(storageKey, this.settings[id].toString());
            console.log(`Audio settings toggle clicked - new value: ${this.settings[id]}`);
            console.log(`Value stored in localStorage: '${localStorage.getItem(storageKey)}' with key: ${storageKey}`);

            // Update audio manager
            if (window.audioManager) {
                console.log('Updating audio manager with new enabled setting');
                window.audioManager.setEnabled(this.settings[id]);
            } else {
                console.error('Audio manager not available when toggling audio notifications');
            }

            console.log(`Audio notifications ${id} set to ${this.settings[id]} from settings`);
        });

        container.appendChild(labelElement);
        container.appendChild(toggle);
        return container;
    }

    /**
     * Create a volume slider
     * @returns {HTMLElement} - Volume slider container
     */
    createVolumeSlider() {
        const container = document.createElement('div');
        container.style.marginTop = '15px';
        container.style.marginBottom = '15px';

        const label = document.createElement('div');
        label.textContent = 'Volume';
        label.style.color = '#ffffff';
        label.style.marginBottom = '10px';
        container.appendChild(label);

        const sliderContainer = document.createElement('div');
        sliderContainer.style.display = 'flex';
        sliderContainer.style.alignItems = 'center';
        sliderContainer.style.gap = '10px';
        container.appendChild(sliderContainer);

        // Create slider
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.value = Math.round(this.settings.volume * 100);
        slider.style.flex = '1';
        slider.style.height = '20px';
        sliderContainer.appendChild(slider);

        // Create value display
        const valueDisplay = document.createElement('div');
        valueDisplay.textContent = `${slider.value}%`;
        valueDisplay.style.minWidth = '40px';
        valueDisplay.style.textAlign = 'right';
        valueDisplay.style.color = '#ffffff';
        sliderContainer.appendChild(valueDisplay);

        // Add event listener
        slider.addEventListener('input', () => {
            const volume = parseInt(slider.value) / 100;
            valueDisplay.textContent = `${slider.value}%`;

            // Update settings
            this.settings.volume = volume;

            // Save to localStorage
            localStorage.setItem('audioVolume', volume.toString());

            // Update audio manager
            if (window.audioManager) {
                window.audioManager.setVolume(volume);
            }
        });

        return container;
    }

    /**
     * Create sound options section
     * @returns {HTMLElement} - Sound options section container
     */
    createSoundOptionsSection() {
        const section = document.createElement('div');
        section.style.marginBottom = '20px';

        const heading = document.createElement('div');
        heading.textContent = 'Sound Options';
        heading.style.color = '#ffffff';
        heading.style.fontWeight = 'bold';
        heading.style.marginBottom = '15px';
        section.appendChild(heading);

        // Add threshold selector
        section.appendChild(this.createThresholdSelector());

        // Add sound type selector
        section.appendChild(this.createSoundTypeSelector());

        return section;
    }

    /**
     * Create threshold selector
     * @returns {HTMLElement} - Threshold selector container
     */
    createThresholdSelector() {
        const container = document.createElement('div');
        container.style.marginBottom = '15px';

        const label = document.createElement('div');
        label.textContent = 'Notification Threshold';
        label.style.color = '#ffffff';
        label.style.marginBottom = '10px';
        container.appendChild(label);

        const description = document.createElement('div');
        description.textContent = 'Only play sounds for liquidations above this value';
        description.style.fontSize = '12px';
        description.style.color = '#999';
        description.style.marginBottom = '10px';
        container.appendChild(description);

        // Create buttons container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.flexWrap = 'wrap';
        buttonsContainer.style.gap = '6px';
        buttonsContainer.style.maxWidth = '100%';
        container.appendChild(buttonsContainer);

        // Define threshold options from 0 to 2M in 250k increments
        const thresholdOptions = [
            { value: 0, label: '$0' },
            { value: 250000, label: '$250K' },
            { value: 500000, label: '$500K' },
            { value: 750000, label: '$750K' },
            { value: 1000000, label: '$1M' },
            { value: 1250000, label: '$1.25M' },
            { value: 1500000, label: '$1.5M' },
            { value: 1750000, label: '$1.75M' },
            { value: 2000000, label: '$2M' }
        ];

        // Create buttons for each threshold option
        thresholdOptions.forEach(option => {
            const button = document.createElement('button');
            button.textContent = option.label;
            button.style.padding = '5px 8px';
            button.style.backgroundColor = this.settings.threshold === option.value ? '#2196F3' : '#333';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '4px';
            button.style.cursor = 'pointer';
            button.style.fontSize = '12px';
            button.style.transition = 'background-color 0.2s';

            button.addEventListener('mouseenter', () => {
                if (this.settings.threshold !== option.value) {
                    button.style.backgroundColor = '#444';
                }
            });

            button.addEventListener('mouseleave', () => {
                button.style.backgroundColor = this.settings.threshold === option.value ? '#2196F3' : '#333';
            });

            button.addEventListener('click', () => {
                // Update all buttons
                buttonsContainer.querySelectorAll('button').forEach(btn => {
                    btn.style.backgroundColor = '#333';
                });

                // Highlight selected button
                button.style.backgroundColor = '#2196F3';

                // Update settings
                this.settings.threshold = option.value;

                // Save to localStorage
                localStorage.setItem('audioThreshold', option.value.toString());

                // Update audio manager
                if (window.audioManager) {
                    window.audioManager.setThreshold(option.value);
                }
            });

            buttonsContainer.appendChild(button);
        });

        return container;
    }

    /**
     * Create sound type selector
     * @returns {HTMLElement} - Sound type selector container
     */
    createSoundTypeSelector() {
        const container = document.createElement('div');
        container.style.marginBottom = '15px';

        const label = document.createElement('div');
        label.textContent = 'Sound Type';
        label.style.color = '#ffffff';
        label.style.marginBottom = '10px';
        container.appendChild(label);

        const description = document.createElement('div');
        description.textContent = 'Select the type of sound to play';
        description.style.fontSize = '12px';
        description.style.color = '#999';
        description.style.marginBottom = '10px';
        container.appendChild(description);

        // Create buttons container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.flexWrap = 'wrap';
        buttonsContainer.style.gap = '8px';
        container.appendChild(buttonsContainer);

        // Define sound type options
        const soundTypeOptions = [
            { value: 'sine', label: 'Sine' },
            { value: 'square', label: 'Square' },
            { value: 'sawtooth', label: 'Sawtooth' },
            { value: 'triangle', label: 'Triangle' }
        ];

        // Create buttons for each sound type option
        soundTypeOptions.forEach(option => {
            const button = document.createElement('button');
            button.textContent = option.label;
            button.style.padding = '6px 10px';
            button.style.backgroundColor = this.settings.soundType === option.value ? '#2196F3' : '#333';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '4px';
            button.style.cursor = 'pointer';
            button.style.fontSize = '13px';
            button.style.transition = 'background-color 0.2s';

            button.addEventListener('mouseenter', () => {
                if (this.settings.soundType !== option.value) {
                    button.style.backgroundColor = '#444';
                }
            });

            button.addEventListener('mouseleave', () => {
                button.style.backgroundColor = this.settings.soundType === option.value ? '#2196F3' : '#333';
            });

            button.addEventListener('click', () => {
                // Update all buttons
                buttonsContainer.querySelectorAll('button').forEach(btn => {
                    btn.style.backgroundColor = '#333';
                });

                // Highlight selected button
                button.style.backgroundColor = '#2196F3';

                // Update settings
                this.settings.soundType = option.value;

                // Save to localStorage
                localStorage.setItem('audioSoundType', option.value);

                // Update audio manager
                if (window.audioManager) {
                    window.audioManager.setSoundType(option.value);
                }
            });

            buttonsContainer.appendChild(button);
        });

        return container;
    }

    /**
     * Create test buttons section
     * @returns {HTMLElement} - Test buttons section container
     */
    createTestButtonsSection() {
        const section = document.createElement('div');
        section.style.marginTop = '20px';

        const heading = document.createElement('div');
        heading.textContent = 'Test Sounds (For Testing Only)';
        heading.style.color = '#ffffff';
        heading.style.fontWeight = 'bold';
        heading.style.marginBottom = '15px';
        section.appendChild(heading);

        // Add description to clarify these are for testing only
        const description = document.createElement('div');
        description.textContent = 'These buttons are for testing only. In normal operation, sounds will only play during actual liquidation events.';
        description.style.fontSize = '12px';
        description.style.color = '#999';
        description.style.marginBottom = '10px';
        section.appendChild(description);

        // Create buttons container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.gap = '10px';
        section.appendChild(buttonsContainer);

        // Create test buttons
        this.createTestButton(buttonsContainer, 'Test Buy Liquidation', 'Buy', 1500000);
        this.createTestButton(buttonsContainer, 'Test Sell Liquidation', 'Sell', 1500000);

        return section;
    }

    /**
     * Create a test button for playing a sample sound
     * @param {HTMLElement} container - The container element
     * @param {string} label - The button label
     * @param {string} side - The liquidation side ('Buy' or 'Sell')
     * @param {number} value - The liquidation value
     */
    createTestButton(container, label, side, value) {
        const button = document.createElement('button');
        button.textContent = label;
        button.style.padding = '8px 12px';
        button.style.backgroundColor = side === 'Buy' ? '#4CAF50' : '#F44336';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';
        button.style.fontSize = '14px';
        button.style.fontWeight = 'bold';
        button.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
        button.style.transition = 'all 0.2s ease';

        button.addEventListener('mouseenter', () => {
            button.style.filter = 'brightness(1.1)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.filter = 'brightness(1)';
        });

        button.addEventListener('click', () => {
            // Temporarily enable audio if it's disabled
            const wasEnabled = window.audioManager ? window.audioManager.enabled : false;

            if (window.audioManager) {
                console.log('TEST BUTTON CLICKED - This is only for testing purposes');
                console.log('In normal operation, sounds will only play during actual liquidation events');

                // Enable audio for the test
                window.audioManager.enabled = true;

                // Play the test sound - pass true to ignore threshold
                window.audioManager.playLiquidationSound(side, value, true);

                // Restore previous state
                setTimeout(() => {
                    window.audioManager.enabled = wasEnabled;
                    console.log(`Test complete, restored audio enabled state to: ${wasEnabled}`);
                }, 1000);
            } else {
                console.error('Audio manager not available for testing');
            }
        });

        container.appendChild(button);
    }

    /**
     * Format a threshold value for display
     * @param {number} value - The threshold value
     * @returns {string} - The formatted value
     */
    formatThreshold(value) {
        if (value >= 1000000) {
            return `$${(value / 1000000).toFixed(1)}M`;
        } else if (value >= 1000) {
            return `$${(value / 1000).toFixed(0)}K`;
        }
        return `$${value}`;
    }
}

// Function to create audio settings instance
function createAudioSettings() {
    if (!window.audioSettingsInstance) {
        console.log('Creating Audio Settings instance...');
        window.audioSettingsInstance = new AudioSettings();
        return true;
    }
    return false;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        createAudioSettings();
    });
} else {
    createAudioSettings();
}

// Also initialize when color customizer is ready
document.addEventListener('colorCustomizerReady', () => {
    if (createAudioSettings()) {
        console.log('Audio Settings created after Color Customizer was ready');
    } else {
        console.log('Audio Settings already exist when Color Customizer became ready');
        // Dispatch the event again in case the color customizer was created after audio settings
        setTimeout(() => {
            document.dispatchEvent(new CustomEvent('audioSettingsReady'));
        }, 100);
    }
});

// Make sure the settings instance is created immediately if not already created
if (!window.audioSettingsInstance) {
    createAudioSettings();
}

// Add event listener for audio manager ready
document.addEventListener('DOMContentLoaded', () => {
    // Check if audio manager exists after a short delay to ensure it's loaded
    setTimeout(() => {
        if (window.audioManager && window.audioSettingsInstance) {
            console.log('Synchronizing audio manager with settings after DOM content loaded');
            // Ensure audio manager has the correct settings
            window.audioManager.setEnabled(window.audioSettingsInstance.settings.enabled);
            window.audioManager.setVolume(window.audioSettingsInstance.settings.volume);
            window.audioManager.setThreshold(window.audioSettingsInstance.settings.threshold);
            window.audioManager.setSoundType(window.audioSettingsInstance.settings.soundType);
        }
    }, 1000);
});

// Add a global function to toggle audio for debugging purposes only
// This function is NOT used during normal operation and is only for manual testing
window.toggleAudioManually = function() {
    if (window.audioSettingsInstance) {
        const currentState = window.audioSettingsInstance.settings.enabled;
        const newState = !currentState;

        console.log(`MANUAL TOGGLE - Changing audio from ${currentState} to ${newState}`);

        // Update settings
        window.audioSettingsInstance.settings.enabled = newState;

        // Save to localStorage
        localStorage.setItem('audioNotificationsEnabled', newState.toString());
        console.log(`Value stored in localStorage: '${localStorage.getItem('audioNotificationsEnabled')}'`);

        // Update audio manager
        if (window.audioManager) {
            window.audioManager.setEnabled(newState);
        }

        return `Audio notifications manually ${newState ? 'enabled' : 'disabled'} - audio will only play during actual liquidations`;
    } else {
        return 'Audio settings not initialized';
    }
};
