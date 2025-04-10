// Real-time updater for chart data
// This module ensures that price data is always up-to-date

(function() {
    // Store the latest price
    let latestPrice = null;
    let lastUpdateTime = 0;
    let updateCount = 0;

    // Reference to the chart's bars array and current candle
    let chartBars = null;
    let currentCandle = null;

    // Initialize the updater
    function init() {
        console.log('Initializing real-time updater');

        // Get references to the chart's data
        if (window.bars) {
            chartBars = window.bars;
            console.log('Got reference to chart bars array:', chartBars.length);
        }

        // Set up polling for Bitstamp price
        startBitstampPolling();

        // Set up forced chart updates
        startForcedChartUpdates();

        // Listen for WebSocket messages directly
        listenForWebSocketMessages();

        // Create a direct WebSocket connection to Bitstamp
        createDirectBitstampConnection();
    }

    // Create a direct WebSocket connection to Bitstamp
    function createDirectBitstampConnection() {
        console.log('Creating direct WebSocket connection to Bitstamp');

        // Get the current coin
        const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin() : { symbol: 'BTC' };
        const symbol = currentCoin.symbol.toLowerCase() + 'usd';

        // Create a new WebSocket connection
        const ws = new WebSocket('wss://ws.bitstamp.net');

        // Set up a ping interval to keep the connection alive
        let pingInterval;

        ws.onopen = function() {
            console.log('Direct Bitstamp WebSocket connection established');

            // Subscribe to live trades
            const subscribeMsg = {
                "event": "bts:subscribe",
                "data": {
                    "channel": `live_trades_${symbol}`
                }
            };

            ws.send(JSON.stringify(subscribeMsg));

            // Also subscribe to order book to get more frequent updates
            const orderBookMsg = {
                "event": "bts:subscribe",
                "data": {
                    "channel": `order_book_${symbol}`
                }
            };

            ws.send(JSON.stringify(orderBookMsg));

            // Set up a ping every 15 seconds to keep the connection alive
            pingInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ "event": "bts:ping" }));
                }
            }, 15000);
        };

        ws.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);

                // Handle trade data
                if (data.event === 'trade' && data.data && data.data.price) {
                    const price = parseFloat(data.data.price);
                    const amount = parseFloat(data.data.amount || '0');
                    const tradeValue = price * amount;
                    console.log(`[real-time-updater] Trade received: ${tradeValue.toLocaleString()} USD (${price} × ${amount}) from direct WebSocket`);
                    updatePrice(price, 'direct-websocket-trade');
                }

                // Also use order book data for more frequent updates
                if (data.event === 'data' && data.channel && data.channel.startsWith('order_book_') && data.data) {
                    // Use the midpoint of the best bid and ask as the current price
                    if (data.data.bids && data.data.bids.length > 0 && data.data.asks && data.data.asks.length > 0) {
                        const bestBid = parseFloat(data.data.bids[0][0]);
                        const bestAsk = parseFloat(data.data.asks[0][0]);
                        const midPrice = (bestBid + bestAsk) / 2;
                        updatePrice(midPrice, 'direct-websocket-orderbook');
                    }
                }
            } catch (error) {
                console.error('Error processing direct WebSocket message:', error);
            }
        };

        ws.onerror = function(error) {
            console.error('Direct WebSocket error:', error);
            clearInterval(pingInterval);
        };

        ws.onclose = function() {
            console.log('Direct WebSocket connection closed, reconnecting immediately...');
            clearInterval(pingInterval);
            // Reconnect immediately
            createDirectBitstampConnection();
        };
    }

    // Start polling Bitstamp API for latest price
    function startBitstampPolling() {
        console.log('Starting Bitstamp price polling');

        // Poll immediately
        pollBitstampPrice();

        // Then poll every 1 second
        setInterval(pollBitstampPrice, 1000);
    }

    // Poll Bitstamp API for latest price
    function pollBitstampPrice() {
        const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin() : { symbol: 'BTC' };
        const symbol = currentCoin.symbol.toLowerCase() + 'usd';

        // Use a no-cache fetch to ensure we get the latest data
        fetch(`https://www.bitstamp.net/api/v2/ticker/${symbol}/`, {
            cache: 'no-cache',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        })
            .then(response => response.json())
            .then(data => {
                if (data && data.last) {
                    const price = parseFloat(data.last);
                    updatePrice(price, 'api-poll');
                }
            })
            .catch(error => {
                console.error('Error polling Bitstamp API:', error);
            });
    }

    // Start forced chart updates
    function startForcedChartUpdates() {
        console.log('Starting forced chart updates');

        // Force update every 50ms (20 times per second)
        setInterval(() => {
            if (latestPrice !== null) {
                updateCount++;
                // Reduce logging to avoid console spam
                if (updateCount % 10 === 0) {
                    console.log(`Forced chart update #${updateCount} with price ${latestPrice}`);
                }

                // Update the current candle
                updateCurrentCandle(latestPrice);

                // Force chart redraw using all available methods
                if (window.drawChart) {
                    window.drawChart();
                }

                if (window.requestChartUpdate) {
                    window.requestChartUpdate(true);
                }

                // Update the document title with only the price
                document.title = `${latestPrice.toFixed(2)}`;

                // Force a DOM update by triggering a custom event
                document.dispatchEvent(new CustomEvent('forceChartUpdate', {
                    detail: { price: latestPrice, time: Date.now() }
                }));
            }
        }, 50);

        // Add a more aggressive update every 500ms
        setInterval(() => {
            if (latestPrice !== null && window.bars && window.bars.length > 0) {
                // Get the last candle
                const lastCandle = window.bars[window.bars.length - 1];

                // Force the close price to be the latest price
                lastCandle.close = latestPrice;
                lastCandle.high = Math.max(lastCandle.high, latestPrice);
                lastCandle.low = Math.min(lastCandle.low, latestPrice);

                // If we have a processNewBar function, call it directly
                if (typeof window.processNewBar === 'function') {
                    window.processNewBar(lastCandle);
                }

                // Force redraw
                if (window.drawChart) {
                    window.drawChart();
                }
            }
        }, 500);

        // Add an ultra-aggressive update every 100ms
        setInterval(() => {
            if (latestPrice !== null && window.bars && window.bars.length > 0) {
                // Direct DOM manipulation - fastest possible update
                const lastCandle = window.bars[window.bars.length - 1];

                // Just update the close price directly
                lastCandle.close = latestPrice;

                // Force immediate redraw
                if (window.drawChart) {
                    window.drawChart();
                }
            }
        }, 100);
    }

    // Listen for WebSocket messages directly
    function listenForWebSocketMessages() {
        // Create a proxy for the WebSocket prototype's onmessage
        const originalWebSocketSend = WebSocket.prototype.send;
        WebSocket.prototype.send = function(data) {
            // Call the original send method
            originalWebSocketSend.apply(this, arguments);

            // Add our custom onmessage handler if this is a Bitstamp WebSocket
            if (this.url && this.url.includes('bitstamp')) {
                const originalOnMessage = this.onmessage;
                this.onmessage = function(event) {
                    // Call the original onmessage handler
                    if (originalOnMessage) {
                        originalOnMessage.call(this, event);
                    }

                    // Process the message ourselves
                    try {
                        const data = JSON.parse(event.data);
                        if (data.data && data.data.price) {
                            const price = parseFloat(data.data.price);
                            updatePrice(price, 'websocket');
                        }
                    } catch (error) {
                        console.error('Error processing WebSocket message:', error);
                    }
                };
            }
        };
    }

    // Update the price
    function updatePrice(price, source) {
        const now = Date.now();

        // Always update the price, regardless of whether it has changed
        // This ensures maximum responsiveness

        // Reduce logging to avoid console spam
        if (price !== latestPrice) {
            console.log(`Updating price to ${price} from ${source}`);
        }

        // Store the previous price for comparison
        const previousPrice = latestPrice;

        // Store the new price
        latestPrice = price;
        lastUpdateTime = now;

        // Update the document title with only the price
        document.title = `${price.toFixed(2)}`;

        // Update the live price display
        updateLivePriceDisplay(price, previousPrice);

        // Direct DOM manipulation for the current price - fastest possible update
        if (window.bars && window.bars.length > 0) {
            const lastBar = window.bars[window.bars.length - 1];
            lastBar.close = price;
            lastBar.high = Math.max(lastBar.high, price);
            lastBar.low = Math.min(lastBar.low, price);
        }

        // Update the current candle
        updateCurrentCandle(price);

        // Force chart redraw using all available methods
        if (window.drawChart) {
            window.drawChart();
        }

        if (window.requestChartUpdate) {
            window.requestChartUpdate(true);
        }

        // Dispatch a custom event
        document.dispatchEvent(new CustomEvent('realTimePriceUpdated', {
            detail: { price, source, time: now }
        }));

        // Also dispatch the forceChartUpdate event
        document.dispatchEvent(new CustomEvent('forceChartUpdate', {
            detail: { price, source, time: now }
        }));
    }

    // Update the live price display (function disabled as the price tag has been removed)
    function updateLivePriceDisplay(price, previousPrice) {
        // Live price display element has been removed
        return;
    }

    // Update the current candle with the latest price
    function updateCurrentCandle(price) {
        console.log(`DIRECT UPDATE: Updating candle with price ${price}, countdown: ${window.barCloseCountdown || 'unknown'}`);

        // Get references to the chart's data if we don't have them yet
        if (!chartBars && window.bars) {
            chartBars = window.bars;
        }

        // Always refresh the reference to ensure we have the latest
        if (window.bars) {
            chartBars = window.bars;
        }

        // Check if we need to create a new bar based on the countdown
        if ((window.barCloseCountdown === 0 || window.barCloseCountdown === '0') &&
            typeof window.createNewBar === 'function' &&
            !window.barCreatedForCurrentInterval) {

            console.log('Real-time updater detected countdown at 0, creating new bar');
            window.createNewBar();

            // After creating a new bar, we need to update it with the current price
            // Get the updated references
            if (window.bars) {
                chartBars = window.bars;
            }

            // Now update the newly created bar
            if (chartBars && chartBars.length > 0) {
                const newBar = chartBars[chartBars.length - 1];
                if (newBar) {
                    console.log('Updating newly created bar with current price:', price);
                    newBar.high = Math.max(newBar.high, price);
                    newBar.low = Math.min(newBar.low, price);
                    newBar.close = price;

                    // Also update the current candle reference
                    if (window.currentCandle) {
                        window.currentCandle.high = Math.max(window.currentCandle.high, price);
                        window.currentCandle.low = Math.min(window.currentCandle.low, price);
                        window.currentCandle.close = price;
                    }

                    // Process the updated bar
                    if (typeof window.processNewBar === 'function') {
                        window.processNewBar(newBar);
                    }
                }
            }
            return;
        }

        // Find the current candle
        if (chartBars && chartBars.length > 0) {
            // Get the most recent candle
            const lastCandle = chartBars[chartBars.length - 1];

            // Update the candle
            if (lastCandle) {
                // Always update the candle to ensure it reflects the latest price
                lastCandle.high = Math.max(lastCandle.high, price);
                lastCandle.low = Math.min(lastCandle.low, price);
                lastCandle.close = price;

                // Also update the current candle reference if available
                if (window.currentCandle) {
                    window.currentCandle.high = Math.max(window.currentCandle.high, price);
                    window.currentCandle.low = Math.min(window.currentCandle.low, price);
                    window.currentCandle.close = price;
                }

                // If we have a processNewBar function, call it directly
                if (typeof window.processNewBar === 'function') {
                    window.processNewBar(lastCandle);
                }
            }
        }
    }

    // Initialize when the window loads
    window.addEventListener('load', init);

    // Listen for coin changes to update the WebSocket connection
    document.addEventListener('coinChanged', () => {
        console.log('Coin changed, updating WebSocket connection');
        // Create a new direct WebSocket connection with the new coin
        createDirectBitstampConnection();
    });

    // Listen for the countdown reaching 0 event
    document.addEventListener('newBarCreated', (event) => {
        console.log('New bar created event received:', event.detail);
        // Update the new bar with the latest price if available
        if (latestPrice !== null) {
            console.log('Updating newly created bar with latest price:', latestPrice);
            updateCurrentCandle(latestPrice);
        }
    });

    // Set up a timer to check if we need to create a new bar
    setInterval(() => {
        if (window.barCloseCountdown === 0 &&
            typeof window.createNewBar === 'function' &&
            !window.barCreatedForCurrentInterval) {
            console.log('Timer detected countdown at 0, creating new bar');
            window.createNewBar();
        }
    }, 100); // Check every 100ms

    // Export functions for external use
    window.realTimeUpdater = {
        updatePrice,
        getLatestPrice: () => latestPrice
    };
})();
