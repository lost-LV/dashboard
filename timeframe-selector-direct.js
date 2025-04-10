// Direct timeframe selector implementation
(function() {
    console.log('Initializing direct timeframe selector...');

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initButtons);
    } else {
        initButtons();
    }

    // Also try on window load
    window.addEventListener('load', initButtons);

    function initButtons() {
        console.log('Setting up timeframe buttons...');

        // Get all timeframe buttons
        const buttons = document.querySelectorAll('.timeframe-button');
        if (!buttons || buttons.length === 0) {
            console.error('No timeframe buttons found!');
            return;
        }

        console.log(`Found ${buttons.length} timeframe buttons`);

        // Add click handlers to each button
        buttons.forEach(button => {
            button.addEventListener('click', function() {
                const timeframe = parseInt(this.getAttribute('data-timeframe'));
                console.log(`Timeframe button clicked: ${timeframe}m`);

                // Update active state
                buttons.forEach(b => {
                    b.classList.remove('active');
                    // Reset to default styling
                    b.style.backgroundColor = '#2a2e39';
                    b.style.color = '#aaa';
                });
                this.classList.add('active');
                // Set background color to bullish candle color
                const bullishColor = window.colorCustomizer ?
                    (window.colorCustomizer.colors.bullishCandleBody || window.colorCustomizer.colors.bullishCandle || '#26a69a') :
                    '#26a69a';
                this.style.backgroundColor = bullishColor;
                // Set text color based on background brightness
                if (window.isBrightColor && typeof window.isBrightColor === 'function') {
                    const textColor = window.isBrightColor(bullishColor) ? 'black' : 'white';
                    this.style.color = textColor;
                    console.log('Timeframe button active: bg color =', bullishColor, 'text color =', textColor);
                } else {
                    this.style.color = 'white'; // Default to white if function not available
                }

                // Call the switchTimeframe function
                switchTimeframe(timeframe);
            });
        });
    }

    // Function to switch timeframes
    function switchTimeframe(newTimeframe) {
        console.log(`Direct switch to timeframe: ${newTimeframe}m`);

        // Access the script.js variables and functions
        if (typeof window.currentTimeframe !== 'undefined') {
            // Store the old timeframe for logging
            const oldTimeframe = window.currentTimeframe;

            // Update the timeframe
            window.currentTimeframe = newTimeframe;

            // Update the bar interval
            window.barIntervalMs = newTimeframe * 60 * 1000;

            console.log(`Changed timeframe from ${oldTimeframe}m to ${newTimeframe}m`);

            // Handle WebSocket subscriptions
            if (window.bybitWsManager && window.coinManager) {
                const currentCoin = window.coinManager.getCurrentCoin();

                // Unsubscribe from all timeframe channels
                const channels = [
                    `kline.1.${currentCoin.bybitSymbol}`,
                    `kline.5.${currentCoin.bybitSymbol}`,
                    `kline.15.${currentCoin.bybitSymbol}`,
                    `kline.60.${currentCoin.bybitSymbol}`
                ];

                channels.forEach(channel => {
                    console.log(`Unsubscribing from: ${channel}`);
                    window.bybitWsManager.unsubscribe(channel);
                });

                // Subscribe to the new channel
                const newChannel = `kline.${newTimeframe}.${currentCoin.bybitSymbol}`;
                console.log(`Subscribing to: ${newChannel}`);

                window.bybitWsManager.subscribe(newChannel, function(data) {
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
                        if (typeof window.processNewBar === 'function') {
                            window.processNewBar(newBar);
                        } else {
                            console.error('processNewBar function not found!');
                        }
                    }
                });

                // Reset chart data
                if (Array.isArray(window.bars)) {
                    window.bars.length = 0;
                    console.log('Cleared bars array');
                }

                // Fetch new historical data
                if (typeof window.fetchHistoricalData === 'function') {
                    console.log('Fetching new historical data...');
                    window.fetchHistoricalData();
                } else {
                    console.error('fetchHistoricalData function not found!');
                }

                // Update the countdown timer
                if (typeof window.updateBarCountdown === 'function') {
                    console.log('Updating bar countdown...');
                    window.updateBarCountdown();
                } else {
                    console.error('updateBarCountdown function not found!');
                }

                // Reset VWAP if available
                if (typeof window.initializeVwapPeriod === 'function') {
                    console.log('Resetting VWAP period...');
                    window.initializeVwapPeriod();
                }

                console.log('Timeframe switch completed');
            } else {
                console.error('WebSocket manager or coin manager not available!');
            }
        } else {
            console.error('currentTimeframe variable not found in window scope!');
        }
    }
})();
