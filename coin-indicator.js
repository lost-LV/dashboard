// Coin indicator - Shows which coin is currently displayed in the top bar
function updateCoinIndicator() {
    // Get the coin indicator elements in the top bar
    const topBarCoinIndicator = document.getElementById('coin-symbol-top-bar');
    const topBarCoinContainer = document.getElementById('coin-indicator-top-bar');

    // Get current coin info
    const coin = window.coinManager ? window.coinManager.getCurrentCoin() : { symbol: 'BTC', name: 'Bitcoin', color: '#F7931A' };
    const coinSymbol = coin.symbol.toLowerCase();
    const currentPrice = window.latestPrice || 0;

    // Update the top bar coin indicator if it exists
    if (topBarCoinIndicator) {
        // Add special handling for Bitcoin logo to ensure visibility
        const logoStyle = coinSymbol === 'btc' ?
            'width: 16px; height: 16px; vertical-align: middle; margin-right: 5px; background-color: transparent;' :
            'width: 16px; height: 16px; vertical-align: middle; margin-right: 5px;';

        const logoHtml = `<img src="images/crypto-logos/${coinSymbol}.svg" alt="${coin.name} Logo" style="${logoStyle}">`;
        topBarCoinIndicator.innerHTML = `${logoHtml}${coin.symbol}`;
    }

    // Update the top bar coin container border color if it exists
    if (topBarCoinContainer) {
        topBarCoinContainer.style.borderColor = coin.color || '#F7931A';
    }

    // Update the document title with only the price
    if (currentPrice > 0) {
        const formattedPrice = currentPrice.toFixed(coin.pricePrecision || 2);
        document.title = `${formattedPrice}`;
    }
}

// Update the coin indicator when the coin changes
document.addEventListener('coinChanged', (e) => {
    console.log('Coin changed event received in coin-indicator.js');
    updateCoinIndicator();
});

// Update the coin indicator periodically to show the latest price
setInterval(updateCoinIndicator, 1000);

// Initialize the coin indicator
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing coin indicator');
    updateCoinIndicator();
});

// If DOM is already loaded, initialize immediately
if (document.readyState !== 'loading') {
    console.log('DOM already loaded, initializing coin indicator immediately');
    updateCoinIndicator();
}
