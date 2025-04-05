// Coin indicator - Shows which coin is currently displayed
function updateCoinIndicator() {
    // Get the coin indicator element
    const coinIndicator = document.getElementById('coin-indicator');
    if (!coinIndicator) return;

    // Get current coin info
    const coin = window.coinManager ? window.coinManager.getCurrentCoin() : { symbol: 'BTC', name: 'Bitcoin', color: '#F7931A' };
    const coinSymbol = coin.symbol.toLowerCase();
    const currentPrice = window[`${coinSymbol}Price`] || 0;

    // Format price according to coin's precision
    const formattedPrice = currentPrice.toFixed(coin.pricePrecision || 2);

    // Update the indicator content - show logo and symbol
    // Add special handling for Bitcoin logo to ensure visibility
    const logoStyle = coinSymbol === 'btc' ?
        'width: 16px; height: 16px; vertical-align: middle; margin-right: 5px; background-color: transparent;' :
        'width: 16px; height: 16px; vertical-align: middle; margin-right: 5px;';

    const logoHtml = `<img src="images/crypto-logos/${coinSymbol}.svg" alt="${coin.name} Logo" style="${logoStyle}">`;
    coinIndicator.innerHTML = `${logoHtml}${coin.symbol}`;

    // Update the border color to match the coin's color
    coinIndicator.style.borderColor = coin.color || '#F7931A';
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
