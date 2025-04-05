// Color Customization Menu
class ColorCustomizer {
    constructor() {
        this.colors = {
            background: '#131722',
            // Original candle colors (kept for backward compatibility)
            bullishCandle: '#26a69a',
            bearishCandle: '#ef5350',
            // New separate candle component colors
            bullishCandleBody: '#26a69a',
            bullishCandleBorder: '#26a69a',
            bullishCandleWick: '#26a69a',
            bearishCandleBody: '#ef5350',
            bearishCandleBorder: '#ef5350',
            bearishCandleWick: '#ef5350',
            vwapLine: '#ff9800',
            vwapTags: '#ff9800',
            vwapBands: 'rgba(255, 152, 0, 0.2)',
            crosshair: 'rgba(150, 150, 150, 0.5)',
            sidebarBackground: 'rgb(19, 23, 34)',
            longsColor: '#26a69a',
            shortsColor: '#ef5350',
            // Bid/Ask strength colors
            bidStrengthColor: 'rgba(38, 166, 154, 0.7)', // Green for bid strength
            askStrengthColor: 'rgba(239, 83, 80, 0.7)', // Red for ask strength
            // Liquidation colors
            sellLiquidationColor: 'rgba(220, 50, 50, 1.0)', // Red for sell liquidations
            buyLiquidationColor: 'rgba(0, 200, 200, 1.0)' // Aqua for buy liquidations
        };

        // Store opacity values separately
        this.opacitySettings = {
            vwapBandsOpacity: 0.2, // Default opacity for VWAP bands
            liquidationArrowsOpacity: 1.0, // Default opacity for liquidation arrows
            sellLiquidationOpacity: 1.0, // Default opacity for sell liquidation arrows
            buyLiquidationOpacity: 1.0 // Default opacity for buy liquidation arrows
        };

        // Store size and dimension settings
        this.sizeSettings = {
            liquidationArrowWidth: 0.5, // Width multiplier for liquidation arrows
            liquidationArrowHeight: 1.2, // Height multiplier for liquidation arrows
            liquidationArrowHeadSize: 0.6 // Size multiplier for liquidation arrow heads
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
                    if (parsedColors[key] !== undefined) {
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

            // Load size settings
            const savedSizeSettings = localStorage.getItem('chartSizeSettings');
            if (savedSizeSettings) {
                const parsedSizeSettings = JSON.parse(savedSizeSettings);

                // Validate and merge with defaults
                for (const key in this.sizeSettings) {
                    if (parsedSizeSettings[key] !== undefined) {
                        this.sizeSettings[key] = parsedSizeSettings[key];
                    }
                }

                console.log('Size settings loaded from localStorage:', this.sizeSettings);
            } else {
                console.log('No saved size settings found, using defaults');
            }

            // Dispatch an event to notify other components that settings have been loaded
            document.dispatchEvent(new CustomEvent('colorsUpdated', {
                detail: {
                    colors: this.colors,
                    opacity: this.opacitySettings,
                    size: this.sizeSettings
                }
            }));

            return true;
        } catch (error) {
            console.error('Error loading colors from localStorage:', error);
            return false;
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

            // Save size settings
            localStorage.setItem('chartSizeSettings', JSON.stringify(this.sizeSettings));
            console.log('Size settings saved to localStorage');

            // Dispatch an event to notify other components that settings have been updated
            document.dispatchEvent(new CustomEvent('colorsUpdated', {
                detail: {
                    colors: this.colors,
                    opacity: this.opacitySettings,
                    size: this.sizeSettings
                }
            }));

            return true;
        } catch (error) {
            console.error('Error saving colors to localStorage:', error);
            return false;
        }
    }

    updateColorInputs() {
        // Update all color inputs to reflect the current colors
        const colorInputs = document.querySelectorAll('.color-input');
        colorInputs.forEach(input => {
            const colorId = input.getAttribute('data-color-id');
            if (colorId && this.colors[colorId]) {
                input.value = this.colors[colorId];
                // Also update the color preview
                const preview = input.parentElement.querySelector('.color-preview');
                if (preview) {
                    preview.style.backgroundColor = this.colors[colorId];
                }
            }
        });
    }

    showNotification(message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.right = '20px';
        notification.style.backgroundColor = 'rgba(33, 150, 243, 0.9)';
        notification.style.color = 'white';
        notification.style.padding = '10px 20px';
        notification.style.borderRadius = '5px';
        notification.style.zIndex = '10000';
        notification.style.fontFamily = 'Arial, sans-serif';
        notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
        notification.style.transition = 'opacity 0.3s ease';

        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    createMenu() {
        // Create overlay for the popup
        const overlay = document.createElement('div');
        overlay.className = 'color-menu-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        overlay.style.zIndex = '9999';
        overlay.style.display = 'none';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';

        // Store overlay reference for access from other methods
        this.overlay = overlay;

        // Create menu container
        const menu = document.createElement('div');
        menu.className = 'color-menu';
        menu.style.position = 'absolute'; // Changed from 'relative' to 'absolute' for better dragging
        menu.style.backgroundColor = '#000000'; // Solid black background
        menu.style.padding = '20px';
        menu.style.borderRadius = '8px';
        menu.style.zIndex = '10000';
        menu.style.width = '800px'; // Increased width from 600px to 800px to ensure all content fits
        menu.style.maxHeight = '80vh'; // Taller to allow scrolling if needed
        menu.style.overflowY = 'auto'; // Enable vertical scrolling
        menu.style.overflowX = 'hidden'; // Prevent horizontal scrolling
        menu.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.5)';
        menu.style.border = '1px solid rgba(255, 255, 255, 0.15)';
        menu.style.color = '#ffffff';
        menu.style.fontFamily = 'Arial, sans-serif';
        menu.style.display = 'flex';
        menu.style.flexDirection = 'column';
        menu.style.cursor = 'move'; // Indicate it's draggable
        menu.style.top = '50%'; // Center vertically
        menu.style.left = '50%'; // Center horizontally
        menu.style.transform = 'translate(-50%, -50%)'; // Center the menu

        // Create close button (X) in the top right
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.position = 'absolute';
        closeButton.style.top = '10px';
        closeButton.style.right = '10px';
        closeButton.style.backgroundColor = 'transparent';
        closeButton.style.border = 'none';
        closeButton.style.color = '#ffffff';
        closeButton.style.fontSize = '24px';
        closeButton.style.cursor = 'pointer';
        closeButton.style.width = '30px';
        closeButton.style.height = '30px';
        closeButton.style.lineHeight = '30px';
        closeButton.style.textAlign = 'center';
        closeButton.style.padding = '0';
        closeButton.style.borderRadius = '50%';
        closeButton.style.transition = 'background-color 0.2s';
        closeButton.style.zIndex = '10001'; // Higher z-index to ensure it's clickable

        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        });

        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.backgroundColor = 'transparent';
        });

        closeButton.addEventListener('click', () => {
            this.hideMenu();
        });

        menu.appendChild(closeButton);

        // Create title for the menu
        const title = document.createElement('h2');
        title.textContent = 'Customize Chart';
        title.style.margin = '0 0 20px 0';
        title.style.fontSize = '18px';
        title.style.fontWeight = 'bold';
        title.style.textAlign = 'center';
        title.style.color = '#ffffff';
        title.style.paddingRight = '30px'; // Make room for the close button

        menu.appendChild(title);

        // Create toggle button with sidebar-button class
        const toggleButton = document.createElement('button');
        toggleButton.className = 'sidebar-button';
        toggleButton.id = 'color-customizer-button';

        // Add feature icon span (same as other buttons)
        const featureIcon = document.createElement('span');
        featureIcon.className = 'feature-icon';
        toggleButton.appendChild(featureIcon);

        // Add text for the button - will be positioned after the icon by CSS
        const textNode = document.createTextNode('Settings');
        toggleButton.appendChild(textNode);

        // Also create a fallback button that will be visible if sidebar is hidden
        const fallbackButton = document.createElement('button');
        fallbackButton.textContent = 'Settings';
        fallbackButton.style.position = 'fixed';
        fallbackButton.style.bottom = '10px';
        fallbackButton.style.left = '10px';
        fallbackButton.style.padding = '5px 10px';
        fallbackButton.style.backgroundColor = '#FF9800';
        fallbackButton.style.color = '#ffffff';
        fallbackButton.style.border = 'none';
        fallbackButton.style.borderRadius = '5px';
        fallbackButton.style.fontSize = '12px';
        fallbackButton.style.cursor = 'pointer';
        fallbackButton.style.zIndex = '9999';
        fallbackButton.style.display = 'none'; // Hidden by default

        // Add click event to fallback button
        fallbackButton.addEventListener('click', () => {
            if (this.showMenu) this.showMenu();
        });

        // Store the button references for access from other scripts
        this.toggleButton = toggleButton;
        this.fallbackButton = fallbackButton;

        // Add the fallback button to the document body
        document.body.appendChild(fallbackButton);

        // Add color pickers
        const colorOptions = [
            { id: 'background', label: 'Background' },
            { id: 'vwapLine', label: 'VWAP Line' },
            { id: 'vwapTags', label: 'VWAP Tags' },
            { id: 'vwapBands', label: 'VWAP Bands' },
            { id: 'crosshair', label: 'Crosshair' },
            { id: 'sidebarBackground', label: 'Sidebar Background' },
            { id: 'longsColor', label: 'Longs Color (sidebar)' },
            { id: 'shortsColor', label: 'Shorts Color (sidebar)' },
            { id: 'bidStrengthColor', label: 'Bid Strength Color' },
            { id: 'askStrengthColor', label: 'Ask Strength Color' },
            { id: 'sellLiquidationColor', label: 'Sell Liquidation Color' },
            { id: 'buyLiquidationColor', label: 'Buy Liquidation Color' }
        ];

        // Create a container for tabs
        const tabsContainer = document.createElement('div');
        tabsContainer.style.display = 'flex';
        tabsContainer.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)';
        tabsContainer.style.marginBottom = '20px';

        // Create a container for the content
        const contentContainer = document.createElement('div');
        contentContainer.style.flex = '1';
        contentContainer.style.overflow = 'visible'; // Changed from 'hidden' to 'visible' to ensure all content is accessible
        contentContainer.style.width = '100%';

        // Create tab panels
        const tabPanels = [];

        // Function to create a tab and its content panel
        const createTab = (title, icon, isActive = false) => {
            // Create tab button
            const tab = document.createElement('button');
            tab.style.padding = '10px 15px';
            tab.style.backgroundColor = isActive ? '#333' : 'transparent';
            tab.style.color = '#fff';
            tab.style.border = 'none';
            tab.style.borderBottom = isActive ? '2px solid #2196F3' : '2px solid transparent';
            tab.style.cursor = 'pointer';
            tab.style.fontSize = '14px';
            tab.style.fontWeight = 'bold';
            tab.style.transition = 'background-color 0.2s, border-color 0.2s';
            tab.style.display = 'flex';
            tab.style.alignItems = 'center';
            tab.style.gap = '8px';

            // Create icon
            const iconElement = document.createElement('span');
            iconElement.innerHTML = icon;
            iconElement.style.fontSize = '16px';

            // Create text
            const textElement = document.createElement('span');
            textElement.textContent = title;

            tab.appendChild(iconElement);
            tab.appendChild(textElement);

            // Create content panel
            const panel = document.createElement('div');
            panel.style.display = isActive ? 'flex' : 'none';
            panel.style.flexDirection = 'row';
            panel.style.gap = '30px'; // Increased from 20px to 30px for better spacing
            panel.style.minHeight = '100%';
            panel.style.width = '100%';
            panel.style.overflow = 'visible';

            // Create columns for the panel
            const leftColumn = document.createElement('div');
            leftColumn.style.flex = '1';
            leftColumn.style.display = 'flex';
            leftColumn.style.flexDirection = 'column';
            leftColumn.style.minWidth = '48%'; // Increased from 45% to 48%
            leftColumn.style.maxWidth = '48%'; // Added max-width to prevent overflow
            leftColumn.style.overflow = 'visible';

            const rightColumn = document.createElement('div');
            rightColumn.style.flex = '1';
            rightColumn.style.display = 'flex';
            rightColumn.style.flexDirection = 'column';
            rightColumn.style.minWidth = '48%'; // Increased from 45% to 48%
            rightColumn.style.maxWidth = '48%'; // Added max-width to prevent overflow
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

            // Add click handler
            tab.addEventListener('click', () => {
                // Deactivate all tabs
                tabsContainer.querySelectorAll('button').forEach(t => {
                    t.style.backgroundColor = 'transparent';
                    t.style.borderBottom = '2px solid transparent';
                });

                // Hide all panels
                tabPanels.forEach(p => {
                    p.style.display = 'none';
                });

                // Activate this tab
                tab.style.backgroundColor = '#333';
                tab.style.borderBottom = '2px solid #2196F3';

                // Show this panel
                panel.style.display = 'flex';
            });

            tabsContainer.appendChild(tab);
            contentContainer.appendChild(panel);
            tabPanels.push(panel);

            return { tab, panel, leftColumn, rightColumn };
        };

        // Create tabs with icons
        const chartTab = createTab('Chart Colors', '🎨', true); // Make Chart Colors the default active tab
        const liquidationsTab = createTab('Liquidations', '💧', false);
        const vwapTab = createTab('VWAP', '📊', false);
        const strengthTab = createTab('Bid/Ask', '📈', false);
        const presetsTab = createTab('Presets', '🎭', false); // Add Presets tab between Bid/Ask and Other
        const otherTab = createTab('Other', '⚙️', false);

        // Filter color options for each tab
        const chartColorOptions = colorOptions.filter(option =>
            ['background', 'crosshair'].includes(option.id));

        const liquidationColorOptions = colorOptions.filter(option =>
            ['sellLiquidationColor', 'buyLiquidationColor'].includes(option.id));

        const vwapColorOptions = colorOptions.filter(option =>
            ['vwapLine', 'vwapTags', 'vwapBands'].includes(option.id));

        const strengthColorOptions = colorOptions.filter(option =>
            ['bidStrengthColor', 'askStrengthColor'].includes(option.id));

        const otherColorOptions = colorOptions.filter(option =>
            ['sidebarBackground', 'longsColor', 'shortsColor'].includes(option.id));

        // Function to create a color section
        const createColorSection = (title, options, column) => {
            const section = document.createElement('div');
            section.style.marginBottom = '20px';

            const heading = document.createElement('div');
            heading.textContent = title;
            heading.style.color = '#ffffff';
            heading.style.fontWeight = 'bold';
            heading.style.marginBottom = '15px';
            heading.style.textAlign = 'center';
            section.appendChild(heading);

            options.forEach(option => {
                const container = document.createElement('div');
                container.style.display = 'flex';
                container.style.justifyContent = 'space-between';
                container.style.alignItems = 'center';
                container.style.marginBottom = '10px';

                const label = document.createElement('label');
                label.textContent = option.label;
                label.style.color = '#ffffff';
                label.style.flexGrow = '1';

                const colorPicker = document.createElement('input');
                colorPicker.type = 'color';
                colorPicker.value = this.colors[option.id];
                colorPicker.setAttribute('data-option-id', option.id); // Add data attribute for reset
                colorPicker.style.width = '30px';
                colorPicker.style.height = '30px';
                colorPicker.style.border = 'none';
                colorPicker.style.borderRadius = '3px';
                colorPicker.style.cursor = 'pointer';
                colorPicker.style.backgroundColor = 'transparent';

                colorPicker.addEventListener('input', (e) => {
                    this.colors[option.id] = e.target.value;

                    // For VWAP bands, preserve opacity
                    if (option.id === 'vwapBands') {
                        const opacity = this.opacitySettings.vwapBandsOpacity;
                        const hex = e.target.value;
                        const r = parseInt(hex.slice(1, 3), 16);
                        const g = parseInt(hex.slice(3, 5), 16);
                        const b = parseInt(hex.slice(5, 7), 16);
                        this.colors[option.id] = `rgba(${r}, ${g}, ${b}, ${opacity})`;
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
                section.appendChild(container);
            });

            column.appendChild(section);
            return section;
        };

        // Create candle color options
        const candleColorOptions = [
            { id: 'bullishCandleBody', label: 'Bullish Candle Body' },
            { id: 'bullishCandleBorder', label: 'Bullish Candle Border' },
            { id: 'bullishCandleWick', label: 'Bullish Candle Wick' },
            { id: 'bearishCandleBody', label: 'Bearish Candle Body' },
            { id: 'bearishCandleBorder', label: 'Bearish Candle Border' },
            { id: 'bearishCandleWick', label: 'Bearish Candle Wick' }
        ];

        // Create presets section in the Presets tab
        const createPresetsSection = () => {
            const section = document.createElement('div');
            section.className = 'color-section';
            section.style.width = '100%';
            section.style.marginBottom = '20px';

            const header = document.createElement('h3');
            header.textContent = 'Available Presets';
            header.style.marginBottom = '15px';
            header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)';
            header.style.paddingBottom = '5px';
            header.style.fontSize = '16px';
            header.style.fontWeight = 'bold';
            header.style.color = '#ffffff';
            section.appendChild(header);

            const presetContainer = document.createElement('div');
            presetContainer.style.display = 'flex';
            presetContainer.style.flexDirection = 'column';
            presetContainer.style.gap = '10px';

            // Green & Red preset (default)
            const greenRedPreset = document.createElement('button');
            greenRedPreset.className = 'preset-button';
            greenRedPreset.innerHTML = '<span style="color: #26a69a;">Green</span> & <span style="color: #ef5350;">Red</span> (Default)';
            greenRedPreset.style.padding = '15px'; // Increased from 10px to 15px
            greenRedPreset.style.background = 'linear-gradient(135deg, #131722, #1c2230)';
            greenRedPreset.style.border = '1px solid #444';
            greenRedPreset.style.borderRadius = '6px'; // Increased from 4px to 6px
            greenRedPreset.style.color = 'white';
            greenRedPreset.style.cursor = 'pointer';
            greenRedPreset.style.fontSize = '16px'; // Increased from 14px to 16px
            greenRedPreset.style.textAlign = 'center';
            greenRedPreset.style.transition = 'all 0.2s ease';
            greenRedPreset.style.marginBottom = '15px'; // Added margin for spacing

            // Add hover effect
            greenRedPreset.addEventListener('mouseenter', () => {
                greenRedPreset.style.backgroundColor = '#444';
                greenRedPreset.style.transform = 'scale(1.02)';
            });

            greenRedPreset.addEventListener('mouseleave', () => {
                greenRedPreset.style.backgroundColor = '#333';
                greenRedPreset.style.transform = 'scale(1)';
            });

            greenRedPreset.addEventListener('click', () => {
                // Apply Green & Red preset
                this.colors = {
                    ...this.colors, // Keep background and other colors
                    // Candle colors
                    bullishCandle: '#26a69a',
                    bearishCandle: '#ef5350',
                    bullishCandleBody: '#26a69a',
                    bullishCandleBorder: '#26a69a',
                    bullishCandleWick: '#26a69a',
                    bearishCandleBody: '#ef5350',
                    bearishCandleBorder: '#ef5350',
                    bearishCandleWick: '#ef5350',
                    // Sidebar colors
                    longsColor: '#26a69a',
                    shortsColor: '#ef5350',
                    // Bid/Ask strength colors
                    bidStrengthColor: 'rgba(38, 166, 154, 0.7)',
                    askStrengthColor: 'rgba(239, 83, 80, 0.7)',
                    // Liquidation colors
                    sellLiquidationColor: 'rgba(220, 50, 50, 1.0)',
                    buyLiquidationColor: 'rgba(0, 200, 200, 1.0)',
                    // VWAP colors
                    vwapLine: '#26a69a',
                    vwapTags: '#26a69a',
                    vwapBands: 'rgba(38, 166, 154, 0.3)'
                };
                this.saveColors();
                this.updateColorInputs();
                drawChart(); // Redraw chart with new colors
            });
            presetContainer.appendChild(greenRedPreset);

            // Black & White preset
            const blackWhitePreset = document.createElement('button');
            blackWhitePreset.className = 'preset-button';
            blackWhitePreset.innerHTML = '<span style="color: white;">Black</span> & <span style="color: #dddddd;">White</span>';
            blackWhitePreset.style.padding = '15px'; // Increased from 10px to 15px
            blackWhitePreset.style.background = 'linear-gradient(135deg, #0a0a0a, #1a1a1a)';
            blackWhitePreset.style.border = '1px solid #444';
            blackWhitePreset.style.borderRadius = '6px'; // Increased from 4px to 6px
            blackWhitePreset.style.color = 'white';
            blackWhitePreset.style.cursor = 'pointer';
            blackWhitePreset.style.fontSize = '16px'; // Increased from 14px to 16px
            blackWhitePreset.style.textAlign = 'center';
            blackWhitePreset.style.transition = 'all 0.2s ease';

            // Add hover effect
            blackWhitePreset.addEventListener('mouseenter', () => {
                blackWhitePreset.style.backgroundColor = '#444';
                blackWhitePreset.style.transform = 'scale(1.02)';
            });

            blackWhitePreset.addEventListener('mouseleave', () => {
                blackWhitePreset.style.backgroundColor = '#333';
                blackWhitePreset.style.transform = 'scale(1)';
            });

            blackWhitePreset.addEventListener('click', () => {
                // Apply Black & White preset
                this.colors = {
                    ...this.colors, // Keep background and other colors
                    // Candle colors
                    bullishCandle: '#ffffff',
                    bearishCandle: '#888888',
                    bullishCandleBody: '#ffffff',
                    bullishCandleBorder: '#ffffff',
                    bullishCandleWick: '#ffffff',
                    bearishCandleBody: '#888888',
                    bearishCandleBorder: '#888888',
                    bearishCandleWick: '#888888',
                    // Sidebar colors
                    longsColor: '#ffffff',
                    shortsColor: '#888888',
                    // Bid/Ask strength colors
                    bidStrengthColor: 'rgba(255, 255, 255, 0.7)',
                    askStrengthColor: 'rgba(136, 136, 136, 0.7)',
                    // Liquidation colors
                    sellLiquidationColor: 'rgba(136, 136, 136, 1.0)',
                    buyLiquidationColor: 'rgba(255, 255, 255, 1.0)',
                    // VWAP colors
                    vwapLine: '#ffffff',
                    vwapTags: '#ffffff',
                    vwapBands: 'rgba(255, 255, 255, 0.3)'
                };
                this.saveColors();
                this.updateColorInputs();
                drawChart(); // Redraw chart with new colors
            });
            presetContainer.appendChild(blackWhitePreset);

            // Purple & White preset
            const purpleWhitePreset = document.createElement('button');
            purpleWhitePreset.className = 'preset-button';
            purpleWhitePreset.innerHTML = '<span style="color: #9c27b0;">Purple</span> & <span style="color: #ffffff;">White</span>';
            purpleWhitePreset.style.padding = '15px';
            purpleWhitePreset.style.background = 'linear-gradient(135deg, #1a0e1f, #2c1a33)';
            purpleWhitePreset.style.border = '1px solid #444';
            purpleWhitePreset.style.borderRadius = '6px';
            purpleWhitePreset.style.color = 'white';
            purpleWhitePreset.style.cursor = 'pointer';
            purpleWhitePreset.style.fontSize = '16px';
            purpleWhitePreset.style.textAlign = 'center';
            purpleWhitePreset.style.transition = 'all 0.2s ease';
            purpleWhitePreset.style.marginBottom = '15px';

            // Add hover effect
            purpleWhitePreset.addEventListener('mouseenter', () => {
                purpleWhitePreset.style.backgroundColor = '#444';
                purpleWhitePreset.style.transform = 'scale(1.02)';
            });

            purpleWhitePreset.addEventListener('mouseleave', () => {
                purpleWhitePreset.style.backgroundColor = '#333';
                purpleWhitePreset.style.transform = 'scale(1)';
            });

            purpleWhitePreset.addEventListener('click', () => {
                // Apply Purple & White preset
                this.colors = {
                    ...this.colors, // Keep background and other colors
                    // Candle colors
                    bullishCandle: '#9c27b0',
                    bearishCandle: '#ffffff',
                    bullishCandleBody: '#9c27b0',
                    bullishCandleBorder: '#9c27b0',
                    bullishCandleWick: '#9c27b0',
                    bearishCandleBody: '#ffffff',
                    bearishCandleBorder: '#ffffff',
                    bearishCandleWick: '#ffffff',
                    // Sidebar colors
                    longsColor: '#9c27b0',
                    shortsColor: '#ffffff',
                    // Bid/Ask strength colors
                    bidStrengthColor: 'rgba(156, 39, 176, 0.7)',
                    askStrengthColor: 'rgba(255, 255, 255, 0.7)',
                    // Liquidation colors
                    sellLiquidationColor: 'rgba(255, 255, 255, 1.0)',
                    buyLiquidationColor: 'rgba(156, 39, 176, 1.0)',
                    // VWAP colors
                    vwapLine: '#9c27b0',
                    vwapTags: '#9c27b0',
                    vwapBands: 'rgba(156, 39, 176, 0.3)'
                };
                this.saveColors();
                this.updateColorInputs();
                drawChart(); // Redraw chart with new colors
            });
            presetContainer.appendChild(purpleWhitePreset);

            // Dark Blue & White preset
            const blueWhitePreset = document.createElement('button');
            blueWhitePreset.className = 'preset-button';
            blueWhitePreset.innerHTML = '<span style="color: #1976d2;">Blue</span> & <span style="color: #ffffff;">White</span>';
            blueWhitePreset.style.padding = '15px';
            blueWhitePreset.style.background = 'linear-gradient(135deg, #0d1a2d, #162c4c)';
            blueWhitePreset.style.border = '1px solid #444';
            blueWhitePreset.style.borderRadius = '6px';
            blueWhitePreset.style.color = 'white';
            blueWhitePreset.style.cursor = 'pointer';
            blueWhitePreset.style.fontSize = '16px';
            blueWhitePreset.style.textAlign = 'center';
            blueWhitePreset.style.transition = 'all 0.2s ease';

            // Add hover effect
            blueWhitePreset.addEventListener('mouseenter', () => {
                blueWhitePreset.style.backgroundColor = '#444';
                blueWhitePreset.style.transform = 'scale(1.02)';
            });

            blueWhitePreset.addEventListener('mouseleave', () => {
                blueWhitePreset.style.backgroundColor = '#333';
                blueWhitePreset.style.transform = 'scale(1)';
            });

            blueWhitePreset.addEventListener('click', () => {
                // Apply Dark Blue & White preset
                this.colors = {
                    ...this.colors, // Keep background and other colors
                    // Candle colors
                    bullishCandle: '#1976d2',
                    bearishCandle: '#ffffff',
                    bullishCandleBody: '#1976d2',
                    bullishCandleBorder: '#1976d2',
                    bullishCandleWick: '#1976d2',
                    bearishCandleBody: '#ffffff',
                    bearishCandleBorder: '#ffffff',
                    bearishCandleWick: '#ffffff',
                    // Sidebar colors
                    longsColor: '#1976d2',
                    shortsColor: '#ffffff',
                    // Bid/Ask strength colors
                    bidStrengthColor: 'rgba(25, 118, 210, 0.7)',
                    askStrengthColor: 'rgba(255, 255, 255, 0.7)',
                    // Liquidation colors
                    sellLiquidationColor: 'rgba(255, 255, 255, 1.0)',
                    buyLiquidationColor: 'rgba(25, 118, 210, 1.0)',
                    // VWAP colors
                    vwapLine: '#1976d2',
                    vwapTags: '#1976d2',
                    vwapBands: 'rgba(25, 118, 210, 0.3)'
                };
                this.saveColors();
                this.updateColorInputs();
                drawChart(); // Redraw chart with new colors
            });
            presetContainer.appendChild(blueWhitePreset);

            section.appendChild(presetContainer);
            return section;
        };

        // Add chart color options to the Chart tab
        createColorSection('Chart Colors', chartColorOptions, chartTab.leftColumn);

        // Add description to the Presets tab
        const presetsDescription = document.createElement('div');
        presetsDescription.style.marginBottom = '20px';
        presetsDescription.style.color = '#aaa';
        presetsDescription.style.fontSize = '14px';
        presetsDescription.style.lineHeight = '1.4';
        presetsDescription.innerHTML = 'These presets will change the colors of chart elements while keeping your background color unchanged. Click on a preset to apply it.';
        presetsTab.leftColumn.appendChild(presetsDescription);

        // Add presets section to the Presets tab
        presetsTab.leftColumn.appendChild(createPresetsSection());

        // Add candle color options to the Chart tab
        createColorSection('Candle Colors', candleColorOptions, chartTab.rightColumn);

        // Add liquidation color options to the Liquidations tab
        createColorSection('Liquidation Colors', liquidationColorOptions, liquidationsTab.leftColumn);

        // Add VWAP color options to the VWAP tab
        createColorSection('VWAP Colors', vwapColorOptions, vwapTab.leftColumn);

        // Add bid/ask strength color options to the Strength tab
        createColorSection('Bid/Ask Strength Colors', strengthColorOptions, strengthTab.leftColumn);

        // Add other color options to the Other tab
        createColorSection('Other Colors', otherColorOptions, otherTab.leftColumn);

        // Organize opacity options by tab
        const vwapOpacityOptions = [
            { id: 'vwapBandsOpacity', label: 'VWAP Bands Opacity', min: 0, max: 1, step: 0.05 }
        ];

        const liquidationOpacityOptions = [
            { id: 'sellLiquidationOpacity', label: 'Sell Liquidation Opacity', min: 0, max: 1, step: 0.05 },
            { id: 'buyLiquidationOpacity', label: 'Buy Liquidation Opacity', min: 0, max: 1, step: 0.05 }
        ];

        // Function to create sliders
        const createSlider = (option, settingsObj, container) => {
            const sliderContainer = document.createElement('div');
            sliderContainer.style.marginBottom = '15px';

            const labelContainer = document.createElement('div');
            labelContainer.style.display = 'flex';
            labelContainer.style.justifyContent = 'space-between';
            labelContainer.style.marginBottom = '5px';

            const label = document.createElement('label');
            label.textContent = option.label;
            label.style.color = '#ffffff';

            const valueDisplay = document.createElement('span');
            valueDisplay.textContent = settingsObj[option.id].toFixed(2);
            valueDisplay.style.color = '#ffffff';

            labelContainer.appendChild(label);
            labelContainer.appendChild(valueDisplay);

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = option.min;
            slider.max = option.max;
            slider.step = option.step;
            slider.value = settingsObj[option.id];
            slider.setAttribute('data-option-id', option.id); // Add data attribute for reset
            slider.setAttribute('data-settings-type',
                settingsObj === this.opacitySettings ? 'opacity' : 'size'); // Add settings type
            slider.style.width = '100%';
            slider.style.cursor = 'pointer';
            slider.style.accentColor = '#2196F3';

            slider.addEventListener('input', (e) => {
                const newValue = parseFloat(e.target.value);
                settingsObj[option.id] = newValue;
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

            sliderContainer.appendChild(labelContainer);
            sliderContainer.appendChild(slider);
            container.appendChild(sliderContainer);
        };

        // Function to create a slider section
        const createSliderSection = (title, options, settingsObj, column) => {
            const section = document.createElement('div');
            section.style.marginBottom = '20px';

            const heading = document.createElement('div');
            heading.textContent = title;
            heading.style.color = '#ffffff';
            heading.style.fontWeight = 'bold';
            heading.style.marginBottom = '15px';
            heading.style.textAlign = 'center';
            section.appendChild(heading);

            options.forEach(option => {
                createSlider(option, settingsObj, section);
            });

            column.appendChild(section);
            return section;
        };

        // Add size sliders for liquidations
        const liquidationSizeOptions = [
            { id: 'liquidationArrowWidth', label: 'Arrow Width', min: 0.1, max: 2, step: 0.1 },
            { id: 'liquidationArrowHeight', label: 'Arrow Length', min: 0.5, max: 3, step: 0.1 },
            { id: 'liquidationArrowHeadSize', label: 'Arrow Head Size', min: 0.2, max: 1.5, step: 0.1 }
        ];



        // Add opacity sliders to VWAP tab
        createSliderSection('VWAP Opacity', vwapOpacityOptions, this.opacitySettings, vwapTab.rightColumn);

        // Add opacity sliders to Liquidations tab
        createSliderSection('Liquidation Opacity', liquidationOpacityOptions, this.opacitySettings, liquidationsTab.rightColumn);

        // Add size sliders to Liquidations tab
        createSliderSection('Liquidation Arrow Size', liquidationSizeOptions, this.sizeSettings, liquidationsTab.rightColumn);



        // Add tabs container and content container to the menu
        menu.appendChild(tabsContainer);
        menu.appendChild(contentContainer);

        // Make the menu draggable
        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;

        // Add a draggable header area
        const dragHandle = document.createElement('div');
        dragHandle.style.position = 'absolute';
        dragHandle.style.top = '0';
        dragHandle.style.left = '0';
        dragHandle.style.width = '100%';
        dragHandle.style.height = '40px';
        dragHandle.style.cursor = 'move';
        dragHandle.style.zIndex = '1'; // Lower z-index than the close button

        // Mouse down event to start dragging
        dragHandle.addEventListener('mousedown', (e) => {
            // Only allow dragging from the header area, not from buttons or inputs
            // Explicitly exclude the close button from dragging
            if ((e.target === dragHandle || e.target === title) && e.target !== closeButton) {
                isDragging = true;

                // Calculate the offset from the mouse position to the menu position
                const menuRect = menu.getBoundingClientRect();
                dragOffsetX = e.clientX - menuRect.left;
                dragOffsetY = e.clientY - menuRect.top;

                // Prevent text selection during drag
                e.preventDefault();
            }
        });

        // Mouse move event to drag the menu
        document.addEventListener('mousemove', (e) => {
            if (isDragging && overlay.style.display !== 'none') {
                // Calculate new position
                const x = e.clientX - dragOffsetX;
                const y = e.clientY - dragOffsetY;

                // Apply new position
                menu.style.position = 'fixed';
                menu.style.left = `${x}px`;
                menu.style.top = `${y}px`;
                menu.style.transform = 'none';

                // Change overlay to allow positioning anywhere
                overlay.style.justifyContent = 'flex-start';
                overlay.style.alignItems = 'flex-start';

                // Prevent the menu from being dragged off-screen
                const menuRect = menu.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                // Keep at least 100px of the menu visible on each side
                if (menuRect.right < 100) menu.style.left = `${100 - menuRect.width}px`;
                if (menuRect.bottom < 100) menu.style.top = `${100 - menuRect.height}px`;
                if (menuRect.left > viewportWidth - 100) menu.style.left = `${viewportWidth - 100}px`;
                if (menuRect.top > viewportHeight - 100) menu.style.top = `${viewportHeight - 100}px`;
            }
        });

        // Mouse up event to stop dragging
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // Insert the drag handle at the beginning of the menu
        menu.insertBefore(dragHandle, menu.firstChild);

        // Add reset button
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Reset to Defaults';
        resetButton.style.width = '100%';
        resetButton.style.padding = '10px';
        resetButton.style.backgroundColor = '#ef5350';
        resetButton.style.color = '#ffffff';
        resetButton.style.border = 'none';
        resetButton.style.borderRadius = '5px';
        resetButton.style.cursor = 'pointer';
        resetButton.style.marginTop = '10px';
        resetButton.style.fontSize = '14px';
        resetButton.style.fontWeight = 'bold';
        resetButton.style.transition = 'background-color 0.2s';

        resetButton.addEventListener('mouseenter', () => {
            resetButton.style.backgroundColor = '#d32f2f';
        });

        resetButton.addEventListener('mouseleave', () => {
            resetButton.style.backgroundColor = '#ef5350';
        });

        resetButton.addEventListener('click', () => {
            // Reset to defaults
            this.reset();

            // Update all color pickers
            const colorPickers = menu.querySelectorAll('input[type="color"]');
            colorPickers.forEach(picker => {
                const optionId = picker.getAttribute('data-option-id');
                if (optionId) {
                    // For VWAP bands, extract the color without opacity
                    if (optionId === 'vwapBands') {
                        const rgbaMatch = this.colors.vwapBands.match(/rgba\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\)/);
                        if (rgbaMatch) {
                            const r = parseInt(rgbaMatch[1]);
                            const g = parseInt(rgbaMatch[2]);
                            const b = parseInt(rgbaMatch[3]);
                            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                            picker.value = hex;
                        }
                    } else {
                        picker.value = this.colors[optionId];
                    }
                }
            });

            // Update all sliders
            const sliders = menu.querySelectorAll('input[type="range"]');
            sliders.forEach(slider => {
                const optionId = slider.getAttribute('data-option-id');
                const settingsType = slider.getAttribute('data-settings-type');

                if (optionId && settingsType) {
                    if (settingsType === 'opacity') {
                        slider.value = this.opacitySettings[optionId];
                    } else if (settingsType === 'size') {
                        slider.value = this.sizeSettings[optionId];
                    }

                    // Update the value display
                    const container = slider.closest('div');
                    if (container) {
                        const valueDisplay = container.querySelector('span:last-child');
                        if (valueDisplay) {
                            if (settingsType === 'opacity') {
                                valueDisplay.textContent = this.opacitySettings[optionId].toFixed(2);
                            } else if (settingsType === 'size') {
                                valueDisplay.textContent = this.sizeSettings[optionId].toFixed(2);
                            }
                        }
                    }
                }
            });

            // Save to localStorage
            if (this.saveColors()) {
                this.showNotification('Settings reset to defaults and saved');
            }

            // Trigger chart redraw
            if (window.drawChart) {
                window.drawChart();
            }
        });

        menu.appendChild(resetButton);

        // Add a method to show the menu
        this.showMenu = () => {
            overlay.style.display = 'flex';
            toggleButton.classList.add('active');
            console.log('Color menu shown');
        };

        // Add a method to hide the menu
        this.hideMenu = () => {
            overlay.style.display = 'none';
            toggleButton.classList.remove('active');
            console.log('Color menu hidden');
        };

        // Toggle menu visibility
        toggleButton.addEventListener('click', () => {
            // Force display to flex to ensure it's visible
            if (overlay.style.display === 'none' || overlay.style.display === '') {
                this.showMenu();
            } else {
                this.hideMenu();
            }
            console.log('Color menu visibility toggled:', overlay.style.display);
        });

        // Close menu when clicking outside of it
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.hideMenu();
            }
        });

        // Close menu when pressing ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.style.display !== 'none') {
                this.hideMenu();
            }
        });

        // Add to document
        const buttonsContainer = document.getElementById('sidebar-buttons');
        if (buttonsContainer) {
            buttonsContainer.appendChild(toggleButton);
        } else {
            console.error('Sidebar buttons container not found when adding color customizer button');
            // We'll use the fallback button instead, which is already added to the document
            fallbackButton.style.display = 'block';
        }

        // Add event listener to check sidebar visibility and show/hide fallback button accordingly
        const checkSidebarVisibility = () => {
            const sidebar = document.getElementById('sidebar');
            // Only show fallback button if sidebar is hidden AND the arrow button is not visible
            // This ensures we don't have two ways to show the sidebar at the same time
            if (sidebar && (sidebar.style.display === 'none' || !buttonsContainer)) {
                // Check if the arrow button exists
                if (window.sidebarArrowButton && window.sidebarArrowButton.style.display !== 'none') {
                    // Arrow button is visible, hide our fallback
                    fallbackButton.style.display = 'none';
                } else {
                    // Arrow button is not visible, show our fallback
                    fallbackButton.style.display = 'block';
                }
            } else {
                fallbackButton.style.display = 'none';
            }
        };

        // Check initially
        checkSidebarVisibility();

        // Set up a MutationObserver to watch for changes to the sidebar's display property
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            const observer = new MutationObserver(checkSidebarVisibility);
            observer.observe(sidebar, { attributes: true, attributeFilter: ['style'] });
        }

        // Also check when the DOM is fully loaded
        document.addEventListener('DOMContentLoaded', () => {
            const sidebarButtons = document.getElementById('sidebar-buttons');
            if (sidebarButtons && !sidebarButtons.contains(toggleButton)) {
                sidebarButtons.appendChild(toggleButton);
            }
            checkSidebarVisibility();
        });

        overlay.appendChild(menu);
        document.body.appendChild(overlay);

        // Store references
        this.menu = menu;
        this.toggleButton = toggleButton;
        this.fallbackButton = fallbackButton;
        this.overlay = overlay;
    }

    reset() {
        // Default colors
        this.colors = {
            background: '#131722',
            // Original candle colors (kept for backward compatibility)
            bullishCandle: '#26a69a',
            bearishCandle: '#ef5350',
            // New separate candle component colors
            bullishCandleBody: '#26a69a',
            bullishCandleBorder: '#26a69a',
            bullishCandleWick: '#26a69a',
            bearishCandleBody: '#ef5350',
            bearishCandleBorder: '#ef5350',
            bearishCandleWick: '#ef5350',
            vwapLine: '#ff9800',
            vwapTags: '#ff9800',
            vwapBands: 'rgba(255, 152, 0, 0.2)',
            crosshair: 'rgba(150, 150, 150, 0.5)',
            sidebarBackground: 'rgb(19, 23, 34)',
            longsColor: '#26a69a',
            shortsColor: '#ef5350',
            // Liquidation colors
            sellLiquidationColor: 'rgba(220, 50, 50, 1.0)', // Red for sell liquidations
            buyLiquidationColor: 'rgba(0, 200, 200, 1.0)' // Aqua for buy liquidations
        };

        // Reset opacity settings
        this.opacitySettings = {
            vwapBandsOpacity: 0.2, // Default opacity for VWAP bands
            liquidationArrowsOpacity: 1.0, // Default opacity for liquidation arrows
            sellLiquidationOpacity: 1.0, // Default opacity for sell liquidation arrows
            buyLiquidationOpacity: 1.0 // Default opacity for buy liquidation arrows
        };

        // Reset size settings
        this.sizeSettings = {
            liquidationArrowWidth: 0.5, // Width multiplier for liquidation arrows
            liquidationArrowHeight: 1.2, // Height multiplier for liquidation arrows
            liquidationArrowHeadSize: 0.6 // Size multiplier for liquidation arrow heads
        };
    }

    getColor(id) {
        return this.colors[id] || null;
    }
}

// Create global instance
window.colorCustomizer = new ColorCustomizer();

// Add global method to show the color customization menu
window.showColorCustomizer = function() {
    if (window.colorCustomizer) {
        window.colorCustomizer.showMenu();
    }
};

// Make sure toggleButton is accessible globally
if (window.colorCustomizer && window.colorCustomizer.toggleButton) {
    window.colorCustomizer.toggleButton = window.colorCustomizer.toggleButton;
}
