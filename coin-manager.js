// Coin Manager - Handles switching between different cryptocurrencies
class CoinManager {
    constructor() {
        // Available coins with their configurations
        this.coins = {
            BTC: {
                name: 'Bitcoin',
                symbol: 'BTC',
                bybitSymbol: 'BTCUSDT',
                bitstampSymbol: 'btcusd',
                color: '#F7931A', // Bitcoin orange
                minLiquidationSize: 0.5, // Minimum size in BTC
                minLiquidationValue: 50000, // Minimum value in USD
                // Scaling factors for visual elements
                pricePrecision: 1, // Decimal places for price display
                sizePrecision: 2, // Decimal places for size display
                valueScaleFactor: 1 // For scaling liquidation arrows
            },
            ETH: {
                name: 'Ethereum',
                symbol: 'ETH',
                bybitSymbol: 'ETHUSDT',
                bitstampSymbol: 'ethusd',
                color: '#627EEA', // Ethereum blue
                minLiquidationSize: 5, // Minimum size in ETH
                minLiquidationValue: 50000, // Minimum value in USD
                pricePrecision: 2,
                sizePrecision: 2,
                valueScaleFactor: 0.15 // ETH is about 15% of BTC's value
            },
            SOL: {
                name: 'Solana',
                symbol: 'SOL',
                bybitSymbol: 'SOLUSDT',
                bitstampSymbol: 'solusd',
                color: '#9945FF', // Solana purple
                minLiquidationSize: 100, // Minimum size in SOL
                minLiquidationValue: 50000, // Minimum value in USD
                pricePrecision: 3,
                sizePrecision: 0,
                valueScaleFactor: 0.01 // SOL is about 1% of BTC's value
            },
            LTC: {
                name: 'Litecoin',
                symbol: 'LTC',
                bybitSymbol: 'LTCUSDT',
                bitstampSymbol: 'ltcusd',
                color: '#BFBBBB', // Litecoin silver
                minLiquidationSize: 50, // Minimum size in LTC
                minLiquidationValue: 50000, // Minimum value in USD
                pricePrecision: 2,
                sizePrecision: 1,
                valueScaleFactor: 0.02 // LTC is about 2% of BTC's value
            },
            XRP: {
                name: 'Ripple',
                symbol: 'XRP',
                bybitSymbol: 'XRPUSDT',
                bitstampSymbol: 'xrpusd',
                color: '#23292F', // XRP dark blue/black
                minLiquidationSize: 100000, // Minimum size in XRP
                minLiquidationValue: 50000, // Minimum value in USD
                pricePrecision: 4,
                sizePrecision: 0,
                valueScaleFactor: 0.005 // XRP is about 0.5% of BTC's value
            }
        };

        // Current selected coin
        this.currentCoin = 'BTC';

        // Load saved coin preference if available
        this.loadSavedCoin();

        // Create global event for coin changes
        this.coinChangeEvent = new CustomEvent('coinChanged', {
            detail: { coin: this.getCurrentCoin() }
        });
    }

    // Get current coin configuration
    getCurrentCoin() {
        return this.coins[this.currentCoin];
    }

    // Switch to a different coin
    switchCoin(symbol) {
        if (this.coins[symbol] && symbol !== this.currentCoin) {
            // Store the previous coin for reference
            const previousCoin = this.currentCoin;

            // Update current coin
            this.currentCoin = symbol;

            // Save preference
            this.saveCoinPreference();

            // RADICAL SOLUTION: Force a complete page reload when switching coins
            // This ensures all data is completely reset and reloaded
            console.log(`Forcing page reload for coin change to ${symbol}`);

            // Show loading overlay
            this.showLoadingOverlay(symbol);

            // Add a query parameter to the URL to indicate we're reloading after a coin change
            const url = new URL(window.location.href);
            url.searchParams.set('coin', symbol);
            url.searchParams.set('reload', Date.now()); // Add timestamp to prevent caching

            // Short delay to allow the loading overlay to appear
            setTimeout(() => {
                // Reload the page with the new URL
                window.location.href = url.toString();
            }, 100);

            return true;
        }
        return false;
    }

    // Save coin preference to localStorage
    saveCoinPreference() {
        try {
            localStorage.setItem('selectedCoin', this.currentCoin);
            console.log(`Coin preference saved: ${this.currentCoin}`);
        } catch (error) {
            console.error('Error saving coin preference:', error);
        }
    }

    // Load saved coin preference from localStorage or URL parameters
    loadSavedCoin() {
        try {
            // Check URL parameters first (highest priority)
            const urlParams = new URLSearchParams(window.location.search);
            const coinParam = urlParams.get('coin');

            if (coinParam && this.coins[coinParam]) {
                this.currentCoin = coinParam;
                console.log(`Loaded coin from URL parameter: ${coinParam}`);
                // Clean up URL after loading to avoid issues with refreshing
                if (window.history && window.history.replaceState) {
                    const cleanUrl = new URL(window.location.href);
                    cleanUrl.searchParams.delete('coin');
                    cleanUrl.searchParams.delete('reload');
                    window.history.replaceState({}, document.title, cleanUrl.toString());
                }
                return;
            }

            // Fall back to localStorage if no URL parameter
            const savedCoin = localStorage.getItem('selectedCoin');
            if (savedCoin && this.coins[savedCoin]) {
                this.currentCoin = savedCoin;
                console.log(`Loaded saved coin preference: ${this.currentCoin}`);
            }
        } catch (error) {
            console.error('Error loading saved coin preference:', error);
        }
    }

    // Update page title with current coin
    updateTitle() {
        const coin = this.getCurrentCoin();
        const price = window[`${coin.symbol.toLowerCase()}Price`] || 'Loading...';
        document.title = `${price}`;
    }

    // Format price according to coin's precision
    formatPrice(price) {
        const coin = this.getCurrentCoin();
        return parseFloat(price).toFixed(coin.pricePrecision);
    }

    // Format size according to coin's precision
    formatSize(size) {
        const coin = this.getCurrentCoin();
        return parseFloat(size).toFixed(coin.sizePrecision);
    }

    // Get minimum liquidation size for current coin
    getMinLiquidationSize() {
        return this.getCurrentCoin().minLiquidationSize;
    }

    // Get minimum liquidation value for current coin
    getMinLiquidationValue() {
        return this.getCurrentCoin().minLiquidationValue;
    }

    // Get value scale factor for current coin
    getValueScaleFactor() {
        return this.getCurrentCoin().valueScaleFactor;
    }

    // Show loading overlay when switching coins
    showLoadingOverlay(symbol) {
        // Create loading overlay if it doesn't exist
        let overlay = document.getElementById('coin-loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'coin-loading-overlay';
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.backgroundColor = 'rgba(19, 23, 34, 0.9)';
            overlay.style.zIndex = '9999';
            overlay.style.display = 'flex';
            overlay.style.flexDirection = 'column';
            overlay.style.justifyContent = 'center';
            overlay.style.alignItems = 'center';
            overlay.style.color = 'white';
            overlay.style.fontFamily = 'Arial, sans-serif';
            document.body.appendChild(overlay);
        } else {
            overlay.style.display = 'flex';
        }

        // Get coin color
        const coinColor = this.coins[symbol].color;

        // Set content
        overlay.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 20px; color: ${coinColor};">Switching to ${this.coins[symbol].name}</div>
            <div class="loading-spinner" style="border: 5px solid #f3f3f3; border-top: 5px solid ${coinColor}; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite;"></div>
        `;

        // Add animation style
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
}

// Create global instance
window.coinManager = new CoinManager();

// Hide loading overlay when page is fully loaded
window.addEventListener('load', () => {
    const overlay = document.getElementById('coin-loading-overlay');
    if (overlay) {
        // Fade out and remove
        overlay.style.transition = 'opacity 0.5s';
        overlay.style.opacity = '0';
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 500);
    }
});
