// Color Customization Menu
class ColorCustomizer {
    constructor() {
        this.colors = {
            background: '#131722',
            bullishCandle: '#26a69a',
            bearishCandle: '#ef5350',
            vwapLine: '#ff9800',
            vwapTags: '#ff9800',
            vwapBands: 'rgba(255, 152, 0, 0.2)',
            crosshair: 'rgba(150, 150, 150, 0.5)',
            sidebarBackground: 'rgba(31, 41, 55, 0.95)',
            longsColor: '#26a69a',
            shortsColor: '#ef5350'
        };

        // Store opacity values separately
        this.opacitySettings = {
            vwapBandsOpacity: 0.2 // Default opacity for VWAP bands
        };

        // Load saved colors if available
        this.loadColors();

        // Create the customization menu
        this.createMenu();
    }

    loadColors() {
        try {
            // Load colors
            const savedColors = localStorage.getItem('chartColors');
            if (savedColors) {
                const parsedColors = JSON.parse(savedColors);

                // Validate the loaded colors and merge with defaults
                for (const key in this.colors) {
                    if (parsedColors[key]) {
                        this.colors[key] = parsedColors[key];
                    }
                }

                console.log('Colors loaded from localStorage:', this.colors);
            } else {
                console.log('No saved colors found, using defaults');
            }

            // Load opacity settings
            const savedOpacity = localStorage.getItem('chartOpacity');
            if (savedOpacity) {
                const parsedOpacity = JSON.parse(savedOpacity);

                // Validate and merge with defaults
                for (const key in this.opacitySettings) {
                    if (parsedOpacity[key] !== undefined) {
                        this.opacitySettings[key] = parsedOpacity[key];
                    }
                }

                console.log('Opacity settings loaded from localStorage:', this.opacitySettings);
            } else {
                console.log('No saved opacity settings found, using defaults');
            }

            // Dispatch an event to notify other components that settings have been loaded
            document.dispatchEvent(new CustomEvent('colorsUpdated', {
                detail: { colors: this.colors, opacity: this.opacitySettings }
            }));
        } catch (e) {
            console.error('Error loading saved settings:', e);
            // If there's an error, we'll just use the default colors
        }
    }

    saveColors() {
        try {
            // Save colors
            localStorage.setItem('chartColors', JSON.stringify(this.colors));
            console.log('Colors saved to localStorage');

            // Save opacity settings
            localStorage.setItem('chartOpacity', JSON.stringify(this.opacitySettings));
            console.log('Opacity settings saved to localStorage');

            // Dispatch an event to notify other components that settings have been updated
            document.dispatchEvent(new CustomEvent('colorsUpdated', {
                detail: { colors: this.colors, opacity: this.opacitySettings }
            }));

            return true;
        } catch (e) {
            console.error('Error saving settings:', e);
            // Show a notification to the user that their settings couldn't be saved
            this.showNotification('Could not save color settings. Your browser may have localStorage disabled or full.', true);
            return false;
        }
    }

    showNotification(message, isError = false) {
        // Create a simple notification element
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.position = 'fixed';
        notification.style.top = '20px';
        notification.style.left = '50%';
        notification.style.transform = 'translateX(-50%)';
        notification.style.backgroundColor = isError ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 128, 0, 0.8)';
        notification.style.color = 'white';
        notification.style.padding = '10px 20px';
        notification.style.borderRadius = '5px';
        notification.style.zIndex = '10000';
        notification.style.fontFamily = 'Arial, sans-serif';

        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 3000);
    }

    createMenu() {
        // Create menu container
        const menu = document.createElement('div');
        menu.className = 'color-menu';
        menu.style.position = 'absolute';
        menu.style.bottom = '60px';
        menu.style.left = '50%';
        menu.style.transform = 'translateX(-50%)';
        menu.style.backgroundColor = 'rgba(31, 41, 55, 0.9)';
        menu.style.padding = '10px';
        menu.style.borderRadius = '5px';
        menu.style.zIndex = '1000';
        menu.style.display = 'none';
        menu.style.width = '250px';
        menu.style.maxHeight = '80vh';
        menu.style.overflowY = 'auto';
        menu.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
        menu.style.border = '1px solid rgba(255, 255, 255, 0.1)';

        // Create toggle button
        const toggleButton = document.createElement('button');
        toggleButton.textContent = 'Colors';
        toggleButton.style.position = 'absolute';
        toggleButton.style.bottom = '35px'; // Move up to avoid timescale
        toggleButton.style.left = '50%';
        toggleButton.style.transform = 'translateX(-50%)';
        toggleButton.style.width = '60px'; // Fixed width for better positioning
        toggleButton.style.padding = '5px'; // Fixed padding
        toggleButton.style.fontSize = '10px'; // Fixed text size
        toggleButton.style.backgroundColor = '#2196F3';
        toggleButton.style.color = '#ffffff';
        toggleButton.style.border = 'none';
        toggleButton.style.borderRadius = '5px';
        toggleButton.style.cursor = 'pointer';
        toggleButton.style.zIndex = '1001';
        toggleButton.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
        toggleButton.style.transition = 'background-color 0.2s, transform 0.1s';

        // Add hover effect
        toggleButton.addEventListener('mouseover', () => {
            toggleButton.style.backgroundColor = '#1976D2';
        });

        toggleButton.addEventListener('mouseout', () => {
            toggleButton.style.backgroundColor = '#2196F3';
        });

        // Add active effect
        toggleButton.addEventListener('mousedown', () => {
            toggleButton.style.transform = 'translateX(-50%) scale(0.95)';
        });

        toggleButton.addEventListener('mouseup', () => {
            toggleButton.style.transform = 'translateX(-50%) scale(1)';
        });

        // Add color pickers
        const colorOptions = [
            { id: 'background', label: 'Background' },
            { id: 'bullishCandle', label: 'Bullish Candles' },
            { id: 'bearishCandle', label: 'Bearish Candles' },
            { id: 'vwapLine', label: 'VWAP Line' },
            { id: 'vwapTags', label: 'VWAP Tags' },
            { id: 'vwapBands', label: 'VWAP Bands' },
            { id: 'crosshair', label: 'Crosshair' },
            { id: 'sidebarBackground', label: 'Sidebar Background' },
            { id: 'longsColor', label: 'Longs Color (sidebar)' },
            { id: 'shortsColor', label: 'Shorts Color (sidebar)' }
        ];

        colorOptions.forEach(option => {
            const container = document.createElement('div');
            container.style.marginBottom = '10px';
            container.style.display = 'flex';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'space-between';

            const label = document.createElement('label');
            label.textContent = option.label;
            label.style.color = '#ffffff';
            label.style.marginRight = '10px';

            const colorPicker = document.createElement('input');
            colorPicker.type = 'color';

            // Handle both hex and rgba colors
            let colorValue = this.colors[option.id];
            if (colorValue.startsWith('rgba')) {
                // For rgba colors, we need to convert to hex for the color picker
                const rgbaMatch = colorValue.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
                if (rgbaMatch) {
                    const r = parseInt(rgbaMatch[1]);
                    const g = parseInt(rgbaMatch[2]);
                    const b = parseInt(rgbaMatch[3]);
                    // Convert RGB to hex
                    colorValue = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                }
            }

            colorPicker.value = colorValue;
            colorPicker.style.cursor = 'pointer';
            colorPicker.dataset.colorId = option.id; // Store the color ID for reference

            colorPicker.addEventListener('change', (e) => {
                const newColor = e.target.value;
                const colorId = option.id;

                // Preserve alpha value for rgba colors
                if (this.colors[colorId].startsWith('rgba')) {
                    const rgbaMatch = this.colors[colorId].match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
                    if (rgbaMatch) {
                        const alpha = parseFloat(rgbaMatch[4]);
                        // Convert hex to rgba
                        const r = parseInt(newColor.slice(1, 3), 16);
                        const g = parseInt(newColor.slice(3, 5), 16);
                        const b = parseInt(newColor.slice(5, 7), 16);
                        this.colors[colorId] = `rgba(${r}, ${g}, ${b}, ${alpha})`;
                    } else {
                        this.colors[colorId] = newColor;
                    }
                } else {
                    this.colors[colorId] = newColor;
                }

                if (this.saveColors()) {
                    // Show a subtle notification that colors were saved
                    this.showNotification(`${option.label} color updated and saved`);
                }

                // Trigger chart redraw
                if (window.drawChart) {
                    window.drawChart();
                }
            });

            container.appendChild(label);
            container.appendChild(colorPicker);
            menu.appendChild(container);
        });

        // Add opacity sliders
        const opacityOptions = [
            { id: 'vwapBandsOpacity', label: 'VWAP Bands Opacity', min: 0, max: 1, step: 0.05 }
        ];

        // Add a separator
        const separator = document.createElement('div');
        separator.style.borderTop = '1px solid rgba(255, 255, 255, 0.2)';
        separator.style.margin = '15px 0';
        menu.appendChild(separator);

        // Add a heading for opacity settings
        const opacityHeading = document.createElement('div');
        opacityHeading.textContent = 'Opacity Settings';
        opacityHeading.style.color = '#ffffff';
        opacityHeading.style.fontWeight = 'bold';
        opacityHeading.style.marginBottom = '10px';
        opacityHeading.style.textAlign = 'center';
        menu.appendChild(opacityHeading);

        opacityOptions.forEach(option => {
            const container = document.createElement('div');
            container.style.marginBottom = '15px';

            const labelContainer = document.createElement('div');
            labelContainer.style.display = 'flex';
            labelContainer.style.justifyContent = 'space-between';
            labelContainer.style.marginBottom = '5px';

            const label = document.createElement('label');
            label.textContent = option.label;
            label.style.color = '#ffffff';

            const valueDisplay = document.createElement('span');
            valueDisplay.textContent = this.opacitySettings[option.id].toFixed(2);
            valueDisplay.style.color = '#ffffff';

            labelContainer.appendChild(label);
            labelContainer.appendChild(valueDisplay);

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = option.min;
            slider.max = option.max;
            slider.step = option.step;
            slider.value = this.opacitySettings[option.id];
            slider.style.width = '100%';
            slider.style.cursor = 'pointer';

            slider.addEventListener('input', (e) => {
                const newValue = parseFloat(e.target.value);
                this.opacitySettings[option.id] = newValue;
                valueDisplay.textContent = newValue.toFixed(2);

                // Update the VWAP bands color with the new opacity
                if (option.id === 'vwapBandsOpacity') {
                    // Extract the RGB components from the current color
                    const rgbaMatch = this.colors.vwapBands.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
                    if (rgbaMatch) {
                        const r = parseInt(rgbaMatch[1]);
                        const g = parseInt(rgbaMatch[2]);
                        const b = parseInt(rgbaMatch[3]);
                        // Update with new opacity
                        this.colors.vwapBands = `rgba(${r}, ${g}, ${b}, ${newValue})`;
                    }
                }

                if (this.saveColors()) {
                    // Show a subtle notification that settings were saved
                    this.showNotification(`${option.label} updated and saved`);
                }

                // Trigger chart redraw
                if (window.drawChart) {
                    window.drawChart();
                }
            });

            container.appendChild(labelContainer);
            container.appendChild(slider);
            menu.appendChild(container);
        });

        // Add a separator
        const separator2 = document.createElement('div');
        separator2.style.borderTop = '1px solid rgba(255, 255, 255, 0.2)';
        separator2.style.margin = '15px 0';
        menu.appendChild(separator2);

        // Add reset button
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Reset to Defaults';
        resetButton.style.width = '100%';
        resetButton.style.padding = '8px';
        resetButton.style.backgroundColor = '#ef5350';
        resetButton.style.color = '#ffffff';
        resetButton.style.border = 'none';
        resetButton.style.borderRadius = '3px';
        resetButton.style.cursor = 'pointer';
        resetButton.style.marginTop = '10px';

        resetButton.addEventListener('click', () => {
            // Default colors
            this.colors = {
                background: '#131722',
                bullishCandle: '#26a69a',
                bearishCandle: '#ef5350',
                vwapLine: '#ff9800',
                vwapTags: '#ff9800',
                vwapBands: 'rgba(255, 152, 0, 0.2)',
                crosshair: 'rgba(150, 150, 150, 0.5)',
                sidebarBackground: 'rgba(31, 41, 55, 0.95)',
                longsColor: '#26a69a',
                shortsColor: '#ef5350'
            };

            // Reset opacity settings
            this.opacitySettings = {
                vwapBandsOpacity: 0.2 // Default opacity for VWAP bands
            };

            // Update color picker values
            const colorPickers = menu.querySelectorAll('input[type="color"]');
            colorPickers.forEach((picker) => {
                const colorId = picker.dataset.colorId;
                if (!colorId) return;

                let colorValue = this.colors[colorId];
                // Convert rgba to hex for the color picker
                if (colorValue && colorValue.startsWith('rgba')) {
                    const rgbaMatch = colorValue.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
                    if (rgbaMatch) {
                        const r = parseInt(rgbaMatch[1]);
                        const g = parseInt(rgbaMatch[2]);
                        const b = parseInt(rgbaMatch[3]);
                        colorValue = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                    }
                }
                picker.value = colorValue;
            });

            // Update opacity sliders
            const opacitySliders = menu.querySelectorAll('input[type="range"]');
            const opacityDisplays = menu.querySelectorAll('span');

            opacityOptions.forEach((option, index) => {
                if (opacitySliders[index]) {
                    opacitySliders[index].value = this.opacitySettings[option.id];
                }
                if (opacityDisplays[index]) {
                    opacityDisplays[index].textContent = this.opacitySettings[option.id].toFixed(2);
                }
            });

            // Save to localStorage
            if (this.saveColors()) {
                this.showNotification('Colors reset to defaults and saved');
            }

            // Trigger chart redraw
            if (window.drawChart) {
                window.drawChart();
            }
        });

        menu.appendChild(resetButton);

        // Toggle menu visibility
        toggleButton.addEventListener('click', () => {
            const isMenuVisible = menu.style.display !== 'none';

            if (isMenuVisible) {
                menu.style.display = 'none';
                toggleButton.style.backgroundColor = '#2196F3';
            } else {
                menu.style.display = 'block';
                toggleButton.style.backgroundColor = '#1976D2';

                // Update color pickers to match current colors
                const colorPickers = menu.querySelectorAll('input[type="color"]');
                colorPickers.forEach((picker) => {
                    const colorId = picker.dataset.colorId;
                    if (!colorId) return;

                    let colorValue = this.colors[colorId];
                    // Convert rgba to hex for the color picker
                    if (colorValue && colorValue.startsWith('rgba')) {
                        const rgbaMatch = colorValue.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
                        if (rgbaMatch) {
                            const r = parseInt(rgbaMatch[1]);
                            const g = parseInt(rgbaMatch[2]);
                            const b = parseInt(rgbaMatch[3]);
                            colorValue = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                        }
                    }
                    picker.value = colorValue;
                });
            }
        });

        // Add to document
        document.body.appendChild(toggleButton);
        document.body.appendChild(menu);

        // Store references
        this.menu = menu;
        this.toggleButton = toggleButton;
    }

    getColor(id) {
        return this.colors[id] || null;
    }
}

// Create global instance
window.colorCustomizer = new ColorCustomizer();
