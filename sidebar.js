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

        // Initialize
        this.init();

        // Add version display
        this.addVersionDisplay();

        // Apply initial colors
        this.applyColors();

        // Listen for color changes
        document.addEventListener('colorsUpdated', () => {
            this.applyColors();
        });
    }

    init() {
        // Subscribe to orderbook updates
        if (window.bitstampWsManager) {
            window.bitstampWsManager.subscribe('order_book_btcusd', this.handleOrderbookUpdate.bind(this));
        } else {
            console.error('Bitstamp WebSocket manager not available');
            // Retry after a delay
            setTimeout(() => this.init(), 1000);
        }
    }

    handleOrderbookUpdate(data) {
        if (data.event === 'data' && data.data && data.data.bids && data.data.asks) {
            // Store raw orderbook data
            this.data.bids = data.data.bids.map(order => [parseFloat(order[0]), parseFloat(order[1])]);
            this.data.asks = data.data.asks.map(order => [parseFloat(order[0]), parseFloat(order[1])]);

            // Update the sidebar
            this.updateSidebar();
        }
    }

    updateSidebar() {
        // Calculate total BTC volume for bids (longs) and asks (shorts)
        const totalBidBTC = this.data.bids.reduce((sum, [, volume]) => sum + volume, 0);
        const totalAskBTC = this.data.asks.reduce((sum, [, volume]) => sum + volume, 0);
        const totalBTC = totalBidBTC + totalAskBTC;

        // Get current BTC price for USD calculations
        const currentPrice = window.btcPrice || 0;

        // Calculate USD values
        const totalBidUSD = totalBidBTC * currentPrice;
        const totalAskUSD = totalAskBTC * currentPrice;
        const totalUSD = totalBidUSD + totalAskUSD;

        // Calculate ratio as a percentage (longs as % of total)
        const longsPercentage = (totalBidBTC / totalBTC) * 100;
        const shortsPercentage = (totalAskBTC / totalBTC) * 100;

        // Calculate which side has more volume for color determination
        const longsGreaterThanShorts = totalBidBTC > totalAskBTC;

        // Calculate imbalance (difference between longs and shorts)
        const imbalanceValue = longsPercentage - shortsPercentage;

        // Calculate imbalance in USD and BTC
        const imbalanceUSD = totalBidUSD - totalAskUSD;
        const imbalanceBTC = totalBidBTC - totalAskBTC;

        // Update DOM elements
        this.longsBar.style.width = `${longsPercentage}%`;
        this.shortsBar.style.width = `${shortsPercentage}%`;
        this.totalVolume.textContent = totalBTC.toFixed(2);
        this.totalUsd.textContent = `$${this.formatNumberWithCommas(totalUSD.toFixed(0))}`;
        this.longsVolume.textContent = totalBidBTC.toFixed(2);
        this.longsUsd.textContent = `$${this.formatNumberWithCommas(totalBidUSD.toFixed(0))}`;
        this.longsPercentage.textContent = `${longsPercentage.toFixed(2)}%`;
        this.shortsVolume.textContent = totalAskBTC.toFixed(2);
        this.shortsUsd.textContent = `$${this.formatNumberWithCommas(totalAskUSD.toFixed(0))}`;
        this.shortsPercentage.textContent = `${shortsPercentage.toFixed(2)}%`;

        // Update imbalance text with sign
        const sign = imbalanceValue > 0 ? '+' : '';
        this.imbalance.textContent = `${sign}${imbalanceValue.toFixed(2)}%`;

        // Update imbalance USD with sign and formatting
        const usdSign = imbalanceUSD > 0 ? '+' : '';
        this.imbalanceUsd.textContent = `${usdSign}$${this.formatNumberWithCommas(Math.abs(imbalanceUSD).toFixed(0))}`;

        // Update imbalance BTC with sign and formatting
        const btcSign = imbalanceBTC > 0 ? '+' : '';
        this.imbalanceBtc.textContent = `${btcSign}${Math.abs(imbalanceBTC).toFixed(2)}`;

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

    addVersionDisplay() {
        // Check if version information is available
        if (window.appVersion) {
            // Create version container
            const versionContainer = document.createElement('div');
            versionContainer.className = 'version-container';

            // Create version text
            const versionText = document.createElement('div');
            versionText.textContent = `v${window.appVersion.version}`;

            // Add version text to container
            versionContainer.appendChild(versionText);

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
