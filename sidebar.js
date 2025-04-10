// Sidebar for Shorts vs Longs Ratio
class ShortsLongsRatio {
    constructor() {
        // DOM elements
        this.sidebar = document.getElementById('sidebar');
        this.imbalance = document.getElementById('imbalance');
        this.imbalanceUsd = document.getElementById('imbalance-usd');
        this.imbalanceBtc = document.getElementById('imbalance-btc');
        this.longsBar = document.getElementById('longs-bar');
        this.shortsBar = document.getElementById('shorts-bar');
        this.totalVolume = document.getElementById('total-volume');
        this.totalUsd = document.getElementById('total-usd');
        this.longsVolume = document.getElementById('longs-volume');
        this.longsUsd = document.getElementById('longs-usd');
        this.longsPercentage = document.getElementById('longs-percentage');
        this.shortsVolume = document.getElementById('shorts-volume');
        this.shortsUsd = document.getElementById('shorts-usd');
        this.shortsPercentage = document.getElementById('shorts-percentage');
        this.longsLabel = document.querySelector('.longs-label');
        this.shortsLabel = document.querySelector('.shorts-label');

        // Data
        this.data = {
            bids: [], // Longs
            asks: []  // Shorts
        };

        // Smoothing data for imbalance values
        this.smoothingData = {
            imbalanceValue: null,
            imbalanceUSD: null,
            imbalanceVolume: null,
            lastUpdateTime: 0
        };

        // Current coin symbol
        this.currentCoin = window.coinManager ? window.coinManager.getCurrentCoin() : { symbol: 'BTC', bitstampSymbol: 'btcusd' };

        // Initialize
        this.init();

        // Add coin selector
        this.addCoinSelector();

        // Add version display
        this.addVersionDisplay();

        // Apply initial colors
        this.applyColors();

        // Listen for color changes
        document.addEventListener('colorsUpdated', () => {
            this.applyColors();
        });

        // Listen for coin changes
        document.addEventListener('coinChanged', (e) => {
            this.handleCoinChange(e.detail.coin);
        });
    }

    init() {
        // Wait for WebSocket manager to be available
        const checkAndSubscribe = () => {
            if (window.bitstampWsManager) {
                const channel = `order_book_${this.currentCoin.bitstampSymbol}`;
                console.log(`Subscribing to Bitstamp channel from sidebar: ${channel}`);
                window.bitstampWsManager.subscribe(channel, this.handleOrderbookUpdate.bind(this));
            } else {
                console.log('Waiting for Bitstamp WebSocket manager to be available...');
                // Retry after a delay
                setTimeout(checkAndSubscribe, 1000);
            }
        };

        // Start checking for WebSocket manager
        checkAndSubscribe();
    }

    // Throttle function to limit how often a function can be called
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    handleOrderbookUpdate(data) {
        if (data.event === 'data' && data.data && data.data.bids && data.data.asks) {
            try {
                // We don't need the current price here as the price is already in USD in the orderbook data

                // Clear existing data
                this.data.bids = [];
                this.data.asks = [];

                // Process raw orderbook data
                const rawBids = data.data.bids;
                const rawAsks = data.data.asks;

                // Process bids
                for (let i = 0; i < rawBids.length; i++) {
                    const order = rawBids[i];
                    const price = parseFloat(order[0]);
                    const size = parseFloat(order[1]);
                    // Calculate USD value correctly - price is already in USD
                    this.data.bids.push([price, size, price * size]); // Include USD value
                }

                // Process asks
                for (let i = 0; i < rawAsks.length; i++) {
                    const order = rawAsks[i];
                    const price = parseFloat(order[0]);
                    const size = parseFloat(order[1]);
                    // Calculate USD value correctly - price is already in USD
                    this.data.asks.push([price, size, price * size]); // Include USD value
                }

                // Update the sidebar with throttling for XRP and SOL
                if (this.currentCoin.symbol === 'XRP' || this.currentCoin.symbol === 'SOL') {
                    // Use a longer throttle time for XRP and SOL to reduce twitching
                    const now = Date.now();
                    // Only update every 500ms for XRP and SOL
                    if (now - this.smoothingData.lastUpdateTime > 500) {
                        this.updateSidebar();
                        this.smoothingData.lastUpdateTime = now;
                    }
                } else {
                    // For other coins, update normally
                    this.updateSidebar();
                }
            } catch (error) {
                console.error('Error processing orderbook data in sidebar:', error);
            }
        }
    }

    // Apply smoothing to a value
    smoothValue(newValue, oldValue, smoothingFactor = 0.3) {
        if (oldValue === null) return newValue;
        return oldValue + smoothingFactor * (newValue - oldValue);
    }

    updateSidebar() {
        // Get current coin symbol
        const coinSymbol = this.currentCoin.symbol;

        console.log(`Updating sidebar for ${coinSymbol} with ${this.data.bids.length} bids and ${this.data.asks.length} asks`);

        // Calculate total volume for bids (longs) and asks (shorts)
        const totalBidVolume = this.data.bids.reduce((sum, [, volume]) => sum + volume, 0);
        const totalAskVolume = this.data.asks.reduce((sum, [, volume]) => sum + volume, 0);
        const totalVolume = totalBidVolume + totalAskVolume;

        // Calculate total USD values (already calculated in handleOrderbookUpdate)
        const totalBidUSD = this.data.bids.reduce((sum, [, , usdValue]) => sum + (usdValue || 0), 0);
        const totalAskUSD = this.data.asks.reduce((sum, [, , usdValue]) => sum + (usdValue || 0), 0);
        const totalUSD = totalBidUSD + totalAskUSD;

        // Check if we have valid data
        if (this.data.bids.length === 0 && this.data.asks.length === 0) {
            console.log('No orderbook data available yet, showing placeholder values');
            // Don't update the UI with zeros, keep the previous values
            return;
        }

        // Calculate ratio as a percentage (longs as % of total)
        const longsPercentage = totalVolume > 0 ? (totalBidVolume / totalVolume) * 100 : 50;
        const shortsPercentage = totalVolume > 0 ? (totalAskVolume / totalVolume) * 100 : 50;

        // Calculate which side has more volume for color determination
        const longsGreaterThanShorts = totalBidVolume > totalAskVolume;

        // Calculate imbalance (difference between longs and shorts)
        let imbalanceValue = longsPercentage - shortsPercentage;

        // Calculate imbalance in USD and coin volume
        let imbalanceUSD = totalBidUSD - totalAskUSD;
        let imbalanceVolume = totalBidVolume - totalAskVolume;

        // Apply smoothing for XRP and SOL to reduce twitching
        if (coinSymbol === 'XRP' || coinSymbol === 'SOL') {
            // Apply smoothing to imbalance values
            imbalanceValue = this.smoothValue(imbalanceValue, this.smoothingData.imbalanceValue);
            imbalanceUSD = this.smoothValue(imbalanceUSD, this.smoothingData.imbalanceUSD);
            imbalanceVolume = this.smoothValue(imbalanceVolume, this.smoothingData.imbalanceVolume);

            // Store the smoothed values for next update
            this.smoothingData.imbalanceValue = imbalanceValue;
            this.smoothingData.imbalanceUSD = imbalanceUSD;
            this.smoothingData.imbalanceVolume = imbalanceVolume;
        } else {
            // For other coins, reset smoothing data
            this.smoothingData.imbalanceValue = null;
            this.smoothingData.imbalanceUSD = null;
            this.smoothingData.imbalanceVolume = null;
        }

        // Update DOM elements
        this.longsBar.style.width = `${longsPercentage}%`;
        this.shortsBar.style.width = `${shortsPercentage}%`;
        this.totalVolume.textContent = totalVolume.toFixed(2);
        this.totalUsd.textContent = `$${this.formatNumberWithCommas(totalUSD.toFixed(0))}`;
        this.longsVolume.textContent = totalBidVolume.toFixed(2);
        this.longsUsd.textContent = `$${this.formatNumberWithCommas(totalBidUSD.toFixed(0))}`;
        this.longsPercentage.textContent = `${longsPercentage.toFixed(2)}%`;
        this.shortsVolume.textContent = totalAskVolume.toFixed(2);
        this.shortsUsd.textContent = `$${this.formatNumberWithCommas(totalAskUSD.toFixed(0))}`;
        this.shortsPercentage.textContent = `${shortsPercentage.toFixed(2)}%`;

        // Update imbalance text with sign
        const sign = imbalanceValue > 0 ? '+' : '';
        this.imbalance.textContent = `${sign}${imbalanceValue.toFixed(2)}%`;

        // Update imbalance USD with sign and formatting
        const usdSign = imbalanceUSD > 0 ? '+' : '';
        this.imbalanceUsd.textContent = `${usdSign}$${this.formatNumberWithCommas(Math.abs(imbalanceUSD).toFixed(0))}`;

        // Update imbalance volume with sign and formatting
        const volumeSign = imbalanceVolume > 0 ? '+' : '';
        this.imbalanceBtc.textContent = `${volumeSign}${Math.abs(imbalanceVolume).toFixed(2)}`;

        // Update all coin-specific labels
        const imbalanceCoinLabel = document.getElementById('imbalance-coin-label');
        if (imbalanceCoinLabel) {
            imbalanceCoinLabel.textContent = `Imbalance ${this.currentCoin.symbol}:`;
        }

        const totalCoinLabel = document.getElementById('total-coin-label');
        if (totalCoinLabel) {
            totalCoinLabel.textContent = `Total ${this.currentCoin.symbol}:`;
        }

        const longsCoinLabel = document.getElementById('longs-coin-label');
        if (longsCoinLabel) {
            longsCoinLabel.textContent = `Longs ${this.currentCoin.symbol}:`;
        }

        const shortsCoinLabel = document.getElementById('shorts-coin-label');
        if (shortsCoinLabel) {
            shortsCoinLabel.textContent = `Shorts ${this.currentCoin.symbol}:`;
        }

        // Get colors from color customizer if available
        const longsColor = window.colorCustomizer ? window.colorCustomizer.colors.longsColor : '#26a69a';
        const shortsColor = window.colorCustomizer ? window.colorCustomizer.colors.shortsColor : '#ef5350';

        // Set imbalance color based on value
        if (longsGreaterThanShorts) {
            this.imbalance.style.color = longsColor; // Longs color for positive imbalance (more longs)
            this.imbalanceUsd.style.color = longsColor;
            this.imbalanceBtc.style.color = longsColor;
        } else {
            this.imbalance.style.color = shortsColor; // Shorts color for negative imbalance (more shorts)
            this.imbalanceUsd.style.color = shortsColor;
            this.imbalanceBtc.style.color = shortsColor;
        }
    }

    // Helper method to format numbers with commas
    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    // Helper method to format numbers with commas for USD values
    formatNumberWithCommas(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    // Apply custom colors from the color customizer
    applyColors() {
        if (!window.colorCustomizer) return;

        const colors = window.colorCustomizer.colors;

        // Apply sidebar background color
        if (colors.sidebarBackground && this.sidebar) {
            this.sidebar.style.backgroundColor = colors.sidebarBackground;
        }

        // Apply longs color
        if (colors.longsColor) {
            if (this.longsBar) this.longsBar.style.backgroundColor = colors.longsColor;
            if (this.longsLabel) this.longsLabel.style.color = colors.longsColor;
            if (this.longsPercentage) this.longsPercentage.style.color = colors.longsColor;
        }

        // Apply shorts color
        if (colors.shortsColor) {
            if (this.shortsBar) this.shortsBar.style.backgroundColor = colors.shortsColor;
            if (this.shortsLabel) this.shortsLabel.style.color = colors.shortsColor;
            if (this.shortsPercentage) this.shortsPercentage.style.color = colors.shortsColor;
        }

        // Apply colors to the imbalance elements
        if (this.imbalanceUsd || this.imbalanceBtc) {
            // The colors will be set in updateSidebar based on the imbalance values
        }

        // Refresh the display with new colors
        this.updateSidebar();
    }

    addCoinSelector() {
        // Check if coin manager is available
        if (!window.coinManager) {
            console.warn('Coin manager not available');
            return;
        }

        // Remove any existing coin selectors
        const existingSelectors = document.querySelectorAll('.coin-selector-container');
        existingSelectors.forEach(selector => {
            selector.parentNode.removeChild(selector);
        });

        // Create coin selector container
        const selectorContainer = document.createElement('div');
        selectorContainer.className = 'coin-selector-container';
        selectorContainer.style.position = 'absolute';
        selectorContainer.style.bottom = '15px'; // Position above version display
        selectorContainer.style.left = '0';
        selectorContainer.style.width = '100%';
        selectorContainer.style.height = '50px'; // Increased from 45px for larger icons
        selectorContainer.style.minHeight = '50px'; // Increased from 45px for larger icons
        selectorContainer.style.display = 'flex';
        selectorContainer.style.justifyContent = 'center'; // Changed to center for better alignment
        selectorContainer.style.alignItems = 'center';
        selectorContainer.style.padding = '8px 2px'; // Reduced horizontal padding to maximize space for buttons
        selectorContainer.style.backgroundColor = '#131722';
        selectorContainer.style.borderTop = '1px solid rgba(150, 150, 150, 0.4)'; // Restored with updated color
        selectorContainer.style.zIndex = '9';

        // Create button group for coin selection
        const buttonGroup = document.createElement('div');
        buttonGroup.style.display = 'flex';
        buttonGroup.style.justifyContent = 'center'; // Center the buttons
        buttonGroup.style.width = '100%'; // Use full width
        buttonGroup.style.flexWrap = 'nowrap'; // Prevent wrapping
        buttonGroup.style.gap = '1px'; // Reduced gap between buttons for better fit

        // Get available coins
        const coins = Object.keys(window.coinManager.coins);

        // Create a button for each coin
        coins.forEach(coinSymbol => {
            const coin = window.coinManager.coins[coinSymbol];
            const button = document.createElement('button');

            // Create image element for the logo
            const logoImg = document.createElement('img');

            // Special case for Bitcoin to ensure it works and is visible
            if (coinSymbol === 'BTC') {
                logoImg.src = 'images/crypto-logos/btc.svg';

                // No special styling for Bitcoin logo - using original darker style
            } else {
                logoImg.src = `images/crypto-logos/${coinSymbol.toLowerCase()}.svg`;
            }

            logoImg.alt = `${coin.name} Logo`;
            logoImg.style.width = '20px';
            logoImg.style.height = '20px';
            logoImg.style.display = 'block';
            logoImg.style.margin = '0 auto';

            // Add background for better visibility of light-colored icons like XRP
            if (coinSymbol === 'XRP') {
                logoImg.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                logoImg.style.borderRadius = '50%';
                logoImg.style.padding = '1px'; // Reduced padding
                logoImg.style.width = '16px'; // Smaller to ensure it fits properly
                logoImg.style.height = '16px'; // Smaller to ensure it fits properly
            }

            // Clear text content and add the logo image
            button.appendChild(logoImg);

            // Add title attribute for tooltip on hover
            button.title = coin.name;

            button.style.flex = '10px 10px auto';
            button.style.margin = '10px 1px'; // Reduced margin for better fit
            button.style.width = '28px'; // Adjusted size to ensure all buttons fit
            button.style.height = '28px'; // Adjusted size to ensure all buttons fit
            button.style.padding = '2px'; // Adjusted padding to ensure all buttons fit
            button.style.backgroundColor = this.currentCoin.symbol === coinSymbol ? '#333' : 'transparent';
            button.style.border = `2px solid ${coin.color}`;
            button.style.borderRadius = '8px';

            // Add hover effect
            button.addEventListener('mouseenter', () => {
                if (this.currentCoin.symbol !== coinSymbol) {
                    button.style.backgroundColor = '#222';
                    button.style.borderWidth = '2px';
                }
            });

            button.addEventListener('mouseleave', () => {
                if (this.currentCoin.symbol !== coinSymbol) {
                    button.style.backgroundColor = 'transparent';
                    button.style.borderWidth = '1px';
                }
            });

            // Add click handler
            button.addEventListener('click', () => {
                if (window.coinManager && this.currentCoin.symbol !== coinSymbol) {
                    window.coinManager.switchCoin(coinSymbol);
                }
            });

            buttonGroup.appendChild(button);
        });

        selectorContainer.appendChild(buttonGroup);
        this.sidebar.appendChild(selectorContainer);

        // Store reference
        this.coinSelectorContainer = selectorContainer;
    }

    handleCoinChange(coin) {
        console.log(`Sidebar handling coin change to ${coin.symbol}`);

        // Update current coin reference
        this.currentCoin = coin;

        // Force a sidebar update with a delay to ensure WebSocket data has arrived
        setTimeout(() => {
            // Check if we have data
            if (this.data.bids.length === 0 && this.data.asks.length === 0) {
                console.log('No orderbook data yet after coin change, requesting data...');

                // Try to request orderbook data again
                if (window.bitstampWsManager) {
                    const channel = `order_book_${coin.bitstampSymbol}`;
                    console.log(`Re-subscribing to Bitstamp channel from sidebar: ${channel}`);
                    window.bitstampWsManager.unsubscribe(channel);
                    window.bitstampWsManager.subscribe(channel, this.handleOrderbookUpdate.bind(this));
                }

                // Try again after another delay
                setTimeout(() => {
                    if (this.data.bids.length > 0 || this.data.asks.length > 0) {
                        console.log('Orderbook data now available, updating sidebar');
                        this.updateSidebar();
                    } else {
                        console.warn('Still no orderbook data available after retry');
                    }
                }, 2000);
            } else {
                console.log('Orderbook data available, updating sidebar');
                this.updateSidebar();
            }
        }, 1000);

        // Update coin selector buttons
        if (this.coinSelectorContainer) {
            const buttons = this.coinSelectorContainer.querySelectorAll('button');
            buttons.forEach(button => {
                // Get the coin symbol from the image src attribute
                const img = button.querySelector('img');
                if (!img) return;

                const imgSrc = img.src;
                const coinSymbol = imgSrc.split('/').pop().split('.')[0].toUpperCase();
                const coinColor = window.coinManager.coins[coinSymbol].color;

                // Create a completely different approach for active/inactive buttons
                if (coinSymbol === coin.symbol) {
                    // For active buttons
                    button.style.backgroundColor = '#333'; // Dark background for all active buttons
                    button.style.borderColor = coinColor;
                    button.style.borderWidth = '2px';

                    // No special styling for Bitcoin logo - using original darker style
                } else {
                    // For inactive buttons
                    button.style.backgroundColor = 'transparent';
                    button.style.borderWidth = '1px';

                    // Reset most logo styles but keep XRP styling
                    if (coinSymbol !== 'XRP') {
                        img.style.backgroundColor = '';
                        img.style.borderRadius = '';
                        img.style.padding = '';
                        img.style.boxShadow = '';
                    } else {
                        // Maintain XRP styling for visibility
                        img.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                        img.style.borderRadius = '50%';
                        img.style.padding = '1px';
                        img.style.width = '16px'; // Smaller to ensure it fits properly
                        img.style.height = '16px'; // Smaller to ensure it fits properly
                    }
                }
            });
        }

        // Update the sidebar title to match the current coin
        if (this.title) {
            this.title.textContent = `${coin.symbol} Orderbook`;
        }

        // Unsubscribe from old orderbook channel
        if (window.bitstampWsManager) {
            // Unsubscribe from all orderbook channels
            Object.values(window.coinManager.coins).forEach(c => {
                const channel = `order_book_${c.bitstampSymbol}`;
                window.bitstampWsManager.unsubscribe(channel);
            });

            // Subscribe to new orderbook channel
            const newChannel = `order_book_${coin.bitstampSymbol}`;
            console.log(`Subscribing to new Bitstamp channel from sidebar: ${newChannel}`);
            window.bitstampWsManager.subscribe(newChannel, this.handleOrderbookUpdate.bind(this));

            // Reset data to clear old orderbook
            this.data = {
                bids: [],
                asks: []
            };

            // Reset smoothing data when changing coins
            this.smoothingData = {
                imbalanceValue: null,
                imbalanceUSD: null,
                imbalanceVolume: null,
                lastUpdateTime: 0
            };

            // Force an immediate update of the sidebar
            this.updateSidebar();
        }

        // Update sidebar labels
        this.updateSidebar();
    }

    addVersionDisplay() {
        // Check if version information is available
        if (window.appVersion) {
            // Remove any existing version containers first
            const existingVersionContainers = document.querySelectorAll('.version-container');
            existingVersionContainers.forEach(container => {
                container.parentNode.removeChild(container);
            });

            // Create version container
            const versionContainer = document.createElement('div');
            versionContainer.className = 'version-container';
            versionContainer.id = 'version-display'; // Add ID for easier reference
            versionContainer.style.display = 'flex'; // Use flexbox for layout
            versionContainer.style.alignItems = 'center'; // Center items vertically
            versionContainer.style.justifyContent = 'center'; // Center items horizontally

            // Create version text with enhanced styling
            const versionText = document.createElement('div');
            versionText.textContent = `${window.appVersion.version}`; // Removed 'v' prefix
            versionText.style.fontFamily = 'Arial, sans-serif';
            versionText.style.fontWeight = 'bold';
            versionText.style.letterSpacing = '0.5px';
            versionText.style.marginRight = '-4px'; // Move version text slightly to the left

            // Create separator
            const separator = document.createElement('div');
            separator.style.margin = '0 8px';
            separator.style.opacity = '0.5';
            separator.style.paddingLeft = '4px'; // Add padding to offset the version text margin
            separator.textContent = '|';

            // Create made by text
            const madeByText = document.createElement('div');
            madeByText.id = 'made-by-text-version';
            // Use plain text instead of HTML to ensure proper spacing
            const madeBySpan = document.createElement('span');
            madeBySpan.textContent = 'made by\u00A0'; // Using non-breaking space to ensure proper spacing
            madeBySpan.style.opacity = '0.7';

            const lostSpan = document.createElement('span');
            lostSpan.textContent = 'lost';
            lostSpan.style.fontWeight = '600';

            madeByText.appendChild(madeBySpan);
            madeByText.appendChild(lostSpan);

            // Add version text, separator, and made by text to container
            versionContainer.appendChild(versionText);
            versionContainer.appendChild(separator);
            versionContainer.appendChild(madeByText);

            // Add container to sidebar
            this.sidebar.appendChild(versionContainer);

            // Store reference
            this.versionContainer = versionContainer;

            console.log(`Version display added: ${window.appVersion.version}`);
        } else {
            console.warn('App version information not available');
        }
    }
}

// Initialize the sidebar when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.shortsLongsRatio = new ShortsLongsRatio();
});
