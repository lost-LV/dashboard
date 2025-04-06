// Timeframe selector functionality
document.addEventListener('DOMContentLoaded', function() {
    initializeTimeframeSelector();
});

// Also initialize on window load as a fallback
window.addEventListener('load', function() {
    initializeTimeframeSelector();
    // Try again after a delay
    setTimeout(initializeTimeframeSelector, 1000);
});

function initializeTimeframeSelector() {
    console.log('Initializing timeframe selector from dedicated script...');
    const timeframeButtons = document.querySelectorAll('.timeframe-button');

    if (!timeframeButtons || timeframeButtons.length === 0) {
        console.error('Timeframe selector buttons not found!');
        return;
    }

    console.log(`Found ${timeframeButtons.length} timeframe buttons`);
    timeframeButtons.forEach(btn => {
        console.log(`Button: ${btn.textContent}, data-timeframe: ${btn.getAttribute('data-timeframe')}`);
    });

    timeframeButtons.forEach(button => {
        // Remove any existing event listeners by cloning and replacing the button
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);

        newButton.addEventListener('click', function() {
            // Get the timeframe from the button's data attribute
            const newTimeframe = parseInt(this.getAttribute('data-timeframe'));

            console.log(`Button clicked: ${this.textContent}, data-timeframe: ${newTimeframe}`);
            console.log(`Current timeframe: ${window.currentTimeframe}, type: ${typeof window.currentTimeframe}`);
            console.log(`New timeframe: ${newTimeframe}, type: ${typeof newTimeframe}`);

            // Only proceed if the timeframe is different from current
            if (window.currentTimeframe !== newTimeframe) {
                console.log(`Switching timeframe from ${window.currentTimeframe}m to ${newTimeframe}m`);

                // Update active button styling
                timeframeButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');

                // Update the current timeframe
                window.currentTimeframe = newTimeframe;

                // Update the bar interval
                window.barIntervalMs = newTimeframe * 60 * 1000;

                // Unsubscribe from current kline channel
                if (window.bybitWsManager && window.coinManager) {
                    const currentCoin = window.coinManager.getCurrentCoin();
                    const oldChannels = [
                        `kline.1.${currentCoin.bybitSymbol}`,
                        `kline.5.${currentCoin.bybitSymbol}`,
                        `kline.15.${currentCoin.bybitSymbol}`
                    ];
                    oldChannels.forEach(channel => window.bybitWsManager.unsubscribe(channel));

                    // Subscribe to new kline channel
                    const newKlineChannel = `kline.${newTimeframe}.${currentCoin.bybitSymbol}`;
                    console.log(`Subscribing to new Bybit channel: ${newKlineChannel}`);
                    window.bybitWsManager.subscribe(newKlineChannel, (data) => {
                        if (data.topic && data.data && data.data.length > 0) {
                            const bar = data.data[0];
                            const newBar = {
                                time: parseInt(bar.start),
                                open: parseFloat(bar.open),
                                high: parseFloat(bar.high),
                                low: parseFloat(bar.low),
                                close: parseFloat(bar.close)
                            };

                            // Process the new bar
                            window.processNewBar(newBar);
                        }
                    });
                }

                // Reset chart data
                window.bars = [];

                // Reset VWAP
                window.initializeVwapPeriod();

                // Fetch new historical data
                window.fetchHistoricalData();

                // Update the countdown timer
                window.updateBarCountdown();
            }
        });
    });

    console.log('Timeframe selector initialized successfully');
}
