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

            // Create a new event each time to ensure it's properly dispatched
            const coinChangeEvent = new CustomEvent('coinChanged', {
                detail: {
                    coin: this.getCurrentCoin(),
                    previousCoin: this.coins[previousCoin]
                }
            });

            // Dispatch event to notify other components
            document.dispatchEvent(coinChangeEvent);

            // Log the coin change
            console.log(`Coin changed to ${symbol}. Event dispatched.`);

            // Update page title
            this.updateTitle();

            // Update the threshold slider if the function exists
            if (window.updateThresholdSlider) {
                console.log('Calling updateThresholdSlider from coin-manager');
                setTimeout(() => window.updateThresholdSlider(), 100);
            }

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

    // Load saved coin preference from localStorage
    loadSavedCoin() {
        try {
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
        document.title = `${coin.symbol}/USDT: ${price}`;
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
}

// Create global instance
window.coinManager = new CoinManager();
