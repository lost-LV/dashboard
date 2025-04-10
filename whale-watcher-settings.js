/**
 * Whale Watcher Settings - Integration with the settings menu
 *
 * This module adds a new tab to the settings menu for whale watcher configuration.
 */

class WhaleWatcherSettings {
    constructor() {
        // Initialize settings
        this.settings = {
            enabled: localStorage.getItem('whaleWatcherEnabled') === 'true',
            threshold: parseFloat(localStorage.getItem('whaleWatcherThreshold')) || 1000000
        };

        // Wait for color customizer to be available
        this.waitForColorCustomizer();
    }

    /**
     * Wait for color customizer to be available before adding the whale watcher tab
     */
    waitForColorCustomizer() {
        if (window.colorCustomizer) {
            this.addWhaleWatcherTab();
        } else {
            console.log('Waiting for color customizer to be available...');
            setTimeout(() => this.waitForColorCustomizer(), 500);
        }
    }

    /**
     * Add whale watcher tab to the settings menu
     */
    addWhaleWatcherTab() {
        console.log('Adding Whale Watcher tab to settings menu');

        // Get the color customizer menu elements
        const colorCustomizer = window.colorCustomizer;
        if (!colorCustomizer) {
            console.error('Color customizer not available');
            return;
        }

        // We'll use a different approach - modify the original createMenu method
        // to add our tab alongside the other tabs
        const originalCreateMenu = colorCustomizer.createMenu;

        colorCustomizer.createMenu = function() {
            // Call the original method first
            originalCreateMenu.call(this);

            // Wait a short time to ensure the menu is fully created
            setTimeout(() => {
                // Get the menu elements
                const menu = document.querySelector('.color-menu');
                if (!menu) {
                    console.error('Color menu not found');
                    return;
                }

                const tabsContainer = menu.querySelector('div:first-child');
                const contentContainer = menu.querySelector('div:nth-child(2)');

                if (!tabsContainer || !contentContainer) {
                    console.error('Could not find menu elements');
                    return;
                }

                // Check if our tab already exists
                if (document.getElementById('whale-watcher-tab')) {
                    console.log('Whale watcher tab already exists');
                    return;
                }

                console.log('Adding whale watcher tab to menu');

                // Create the whale watcher tab
                const whaleWatcherSettings = window.whaleWatcherSettingsInstance;
                if (whaleWatcherSettings) {
                    whaleWatcherSettings.createWhaleWatcherTab(tabsContainer, contentContainer);
                } else {
                    console.error('Whale watcher settings instance not available');
                }
            }, 50);
        };

        // Add a click event listener to the settings button
        const settingsButton = document.getElementById('color-customizer-button');
        if (settingsButton) {
            const originalClick = settingsButton.onclick;
            settingsButton.onclick = (e) => {
                if (originalClick) originalClick.call(settingsButton, e);

                // Wait a bit for the menu to be created
                setTimeout(() => {
                    colorCustomizer.addWhaleWatcherTab();
                }, 100);
            };
        }

        // If the menu is already created, inject our tab now
        if (document.querySelector('.color-menu')) {
            colorCustomizer.addWhaleWatcherTab();
        }

        // Also add our tab when the menu is shown
        const originalShowMenu = colorCustomizer.showMenu;
        if (originalShowMenu) {
            colorCustomizer.showMenu = function() {
                originalShowMenu.call(this);

                // Wait a bit for the menu to be fully visible
                setTimeout(() => {
                    colorCustomizer.addWhaleWatcherTab();
                }, 100);
            };
        }
    }

    /**
     * Create the whale watcher tab and add it to the menu
     * @param {HTMLElement} tabsContainer - Container for tabs
     * @param {HTMLElement} contentContainer - Container for tab content
     */
    createWhaleWatcherTab(tabsContainer, contentContainer) {
        // Get all existing tabs and panels
        const existingTabs = Array.from(tabsContainer.querySelectorAll('button'));
        const existingPanels = Array.from(contentContainer.querySelectorAll('div')).filter(div =>
            div.style.display === 'flex' || div.style.display === 'none');

        console.log(`Found ${existingTabs.length} existing tabs and ${existingPanels.length} panels`);

        // Create the tab button
        const tab = document.createElement('button');
        tab.id = 'whale-watcher-tab';
        tab.style.padding = '8px 10px'; // Reduced padding to match color-customizer-new.js
        tab.style.backgroundColor = 'transparent';
        tab.style.color = '#fff';
        tab.style.border = 'none';
        tab.style.borderBottom = '2px solid transparent';
        tab.style.cursor = 'pointer';
        tab.style.fontSize = '14px';
        tab.style.fontWeight = 'bold';
        tab.style.transition = 'background-color 0.2s, border-color 0.2s';
        tab.style.display = 'flex';
        tab.style.alignItems = 'center';
        tab.style.gap = '8px';

        // Create icon
        const iconElement = document.createElement('span');
        iconElement.innerHTML = '🐋';
        iconElement.style.fontSize = '16px';

        // Create text
        const textElement = document.createElement('span');
        textElement.textContent = 'Whale Watcher';

        tab.appendChild(iconElement);
        tab.appendChild(textElement);

        // Create content panel
        const panel = document.createElement('div');
        panel.id = 'whale-watcher-panel';
        panel.style.display = 'none';
        panel.style.flexDirection = 'row';
        panel.style.gap = '80px'; // Increased to match color-customizer-new.js
        panel.style.minHeight = '100%';
        panel.style.width = '100%';
        panel.style.overflow = 'visible';

        // Create left and right columns
        const leftColumn = document.createElement('div');
        leftColumn.style.flex = '1';
        leftColumn.style.display = 'flex';
        leftColumn.style.flexDirection = 'column';
        leftColumn.style.minWidth = '40%'; // Adjusted to match color-customizer-new.js
        leftColumn.style.maxWidth = '40%'; // Adjusted to match color-customizer-new.js
        leftColumn.style.overflow = 'visible';

        const rightColumn = document.createElement('div');
        rightColumn.style.flex = '1';
        rightColumn.style.display = 'flex';
        rightColumn.style.flexDirection = 'column';
        rightColumn.style.minWidth = '40%'; // Adjusted to match color-customizer-new.js
        rightColumn.style.maxWidth = '40%'; // Adjusted to match color-customizer-new.js
        rightColumn.style.overflow = 'visible';

        panel.appendChild(leftColumn);
        panel.appendChild(rightColumn);

        // Add hover effect
        tab.addEventListener('mouseenter', () => {
            if (tab.style.backgroundColor !== '#333') {
                tab.style.backgroundColor = '#222';
            }
        });

        tab.addEventListener('mouseleave', () => {
            if (tab.style.backgroundColor !== '#333') {
                tab.style.backgroundColor = 'transparent';
            }
        });

        // Add click handler to tab
        tab.addEventListener('click', () => {
            // Deactivate all tabs
            existingTabs.forEach(t => {
                t.style.backgroundColor = 'transparent';
                t.style.borderBottom = '2px solid transparent';
            });
            tab.style.backgroundColor = 'transparent';
            tab.style.borderBottom = '2px solid transparent';

            // Hide all panels
            existingPanels.forEach(p => {
                p.style.display = 'none';
            });

            // Activate this tab
            tab.style.backgroundColor = '#333';
            tab.style.borderBottom = '2px solid #2196F3';

            // Show this panel
            panel.style.display = 'flex';

            // Populate the panel content when it's first shown
            if (!panel.dataset.populated) {
                this.populateWhaleWatcherPanel(leftColumn, rightColumn);
                panel.dataset.populated = 'true';
            }
        });

        // Add tab and panel to containers
        tabsContainer.appendChild(tab);
        contentContainer.appendChild(panel);
    }

    /**
     * Populate the whale watcher panel with settings
     * @param {HTMLElement} leftColumn - Left column of the panel
     * @param {HTMLElement} rightColumn - Right column of the panel
     */
    populateWhaleWatcherPanel(leftColumn, rightColumn) {
        // Add description to the left column
        const description = document.createElement('div');
        description.style.marginBottom = '20px';
        description.style.color = '#aaa';
        description.style.fontSize = '14px';
        description.style.lineHeight = '1.4';
        description.innerHTML = 'The Whale Watcher feature detects large orders in the spot orderbook and displays them as bubbles on the chart. ' +
            'Configure the settings below to customize the whale watcher behavior.';
        leftColumn.appendChild(description);

        // Add toggle for enabling/disabling whale watcher
        leftColumn.appendChild(this.createToggleSection());

        // Add threshold slider to the right column
        rightColumn.appendChild(this.createThresholdSlider());
    }

    /**
     * Create toggle section for enabling/disabling whale watcher
     * @returns {HTMLElement} - Toggle section container
     */
    createToggleSection() {
        const section = document.createElement('div');
        section.style.marginBottom = '20px';

        const heading = document.createElement('div');
        heading.textContent = 'Whale Watcher Options';
        heading.style.color = '#ffffff';
        heading.style.fontWeight = 'bold';
        heading.style.marginBottom = '15px';
        section.appendChild(heading);

        // Create toggle for enabling/disabling whale watcher
        section.appendChild(this.createToggle('enabled', 'Enable Whale Watcher', this.settings.enabled));

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

        // Get current value
        const currentValue = this.settings[id] !== undefined ? this.settings[id] : defaultValue;

        // Create toggle switch
        const toggle = document.createElement('div');
        toggle.style.width = '50px';
        toggle.style.height = '24px';
        toggle.style.backgroundColor = currentValue ? '#4CAF50' : '#ccc';
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
        toggleButton.style.left = currentValue ? '28px' : '2px';
        toggleButton.style.transition = 'left 0.3s';

        toggle.appendChild(toggleButton);

        // Add click event
        toggle.addEventListener('click', () => {
            // Toggle the value
            const newValue = !currentValue;

            // Update local reference to current value
            currentValue = newValue;

            // Update the toggle appearance
            toggle.style.backgroundColor = newValue ? '#4CAF50' : '#ccc';
            toggleButton.style.left = newValue ? '28px' : '2px';

            // Update the settings
            this.settings[id] = newValue;

            // Save to localStorage
            localStorage.setItem('whaleWatcherEnabled', newValue.toString());

            // Update whale watcher
            if (window.whaleWatcher) {
                window.whaleWatcher.setEnabled(newValue);
            }

            console.log(`Whale watcher ${id} set to ${newValue} from settings`);
        });

        container.appendChild(labelElement);
        container.appendChild(toggle);
        return container;
    }

    /**
     * Create threshold buttons section
     * @returns {HTMLElement} - Buttons section container
     */
    createThresholdSlider() {
        const section = document.createElement('div');
        section.style.marginBottom = '20px';

        const heading = document.createElement('div');
        heading.textContent = 'Whale Detection Threshold';
        heading.style.color = '#ffffff';
        heading.style.fontWeight = 'bold';
        heading.style.marginBottom = '15px';
        heading.style.textAlign = 'center';
        section.appendChild(heading);

        // Add description
        const description = document.createElement('div');
        description.textContent = 'Minimum USD value for an order to be considered a whale';
        description.style.color = '#aaa';
        description.style.fontSize = '12px';
        description.style.marginBottom = '15px';
        description.style.textAlign = 'center';
        section.appendChild(description);

        // Create current value display
        const valueContainer = document.createElement('div');
        valueContainer.className = 'whale-watcher-value-container';

        const valueLabel = document.createElement('div');
        valueLabel.textContent = 'Current Threshold: ';
        valueLabel.className = 'whale-watcher-value-label';

        const valueDisplay = document.createElement('div');
        valueDisplay.textContent = this.formatThreshold(this.settings.threshold);
        valueDisplay.className = 'whale-watcher-value-display';

        valueContainer.appendChild(valueLabel);
        valueContainer.appendChild(valueDisplay);
        section.appendChild(valueContainer);

        // Create buttons container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'whale-watcher-buttons-container';

        // Create buttons for threshold values from 100K to 5M in 50K increments
        const min = 100000; // 100K
        const max = 5000000; // 5M
        const step = 50000; // 50K

        // Function to update the threshold
        const updateThreshold = (value) => {
            // Update value display
            valueDisplay.textContent = this.formatThreshold(value);

            // Update settings
            this.settings.threshold = value;

            // Save to localStorage
            localStorage.setItem('whaleWatcherThreshold', value.toString());

            // Update whale watcher
            if (window.whaleWatcher) {
                window.whaleWatcher.setThreshold(value);
            }

            // Update button highlighting
            Array.from(buttonsContainer.children).forEach(button => {
                const buttonValue = parseInt(button.dataset.value);
                if (buttonValue === value) {
                    button.classList.add('active');
                } else {
                    button.classList.remove('active');
                }
            });
        };

        // Create buttons for common values
        const commonValues = [
            { label: '$100K', value: 100000 },
            { label: '$250K', value: 250000 },
            { label: '$500K', value: 500000 },
            { label: '$750K', value: 750000 },
            { label: '$1M', value: 1000000 },
            { label: '$2M', value: 2000000 },
            { label: '$3M', value: 3000000 },
            { label: '$4M', value: 4000000 },
            { label: '$5M', value: 5000000 }
        ];

        // Add common value buttons
        commonValues.forEach(item => {
            const button = document.createElement('button');
            button.textContent = item.label;
            button.dataset.value = item.value;
            button.className = 'whale-watcher-button';
            if (this.settings.threshold === item.value) {
                button.classList.add('active');
            }

            // We don't need hover effects here as they're handled by CSS

            // Add click handler
            button.addEventListener('click', () => {
                updateThreshold(item.value);
            });

            buttonsContainer.appendChild(button);
        });

        section.appendChild(buttonsContainer);

        // Create fine-tuning buttons container
        const fineTuningContainer = document.createElement('div');
        fineTuningContainer.className = 'whale-watcher-fine-tuning-container';

        // Create decrease button (-50K)
        const decreaseButton = document.createElement('button');
        decreaseButton.textContent = '-50K';
        decreaseButton.className = 'whale-watcher-button';

        // Add click handler
        decreaseButton.addEventListener('click', () => {
            // Always get the current threshold value from settings
            const currentValue = this.settings.threshold;
            const newValue = Math.max(min, currentValue - step);
            updateThreshold(newValue);
        });

        // Create increase button (+50K)
        const increaseButton = document.createElement('button');
        increaseButton.textContent = '+50K';
        increaseButton.className = 'whale-watcher-button';

        // Add click handler
        increaseButton.addEventListener('click', () => {
            // Always get the current threshold value from settings
            const currentValue = this.settings.threshold;
            const newValue = Math.min(max, currentValue + step);
            updateThreshold(newValue);
        });

        fineTuningContainer.appendChild(decreaseButton);
        fineTuningContainer.appendChild(increaseButton);
        section.appendChild(fineTuningContainer);

        return section;
    }

    /**
     * Format threshold value for display
     * @param {number} value - Threshold value
     * @returns {string} - Formatted threshold
     */
    formatThreshold(value) {
        if (value >= 1000000) {
            // For values over 1M, show 2 decimal places to display thousands
            return '$' + (value / 1000000).toFixed(2) + 'M';
        } else if (value >= 1000) {
            return '$' + (value / 1000).toFixed(0) + 'K';
        } else {
            return '$' + value;
        }
    }
}

// Initialize whale watcher settings
function initWhaleWatcherSettings() {
    console.log('Initializing Whale Watcher Settings...');
    if (!window.whaleWatcherSettingsInstance) {
        window.whaleWatcherSettingsInstance = new WhaleWatcherSettings();
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWhaleWatcherSettings);
} else {
    initWhaleWatcherSettings();
}

// Also initialize when color customizer is ready
document.addEventListener('colorCustomizerReady', initWhaleWatcherSettings);

// Make sure the settings instance is created immediately
initWhaleWatcherSettings();
