(() => {
    // Function to get customized colors
    function getColor(id, defaultColor) {
        if (window.colorCustomizer) {
            return window.colorCustomizer.getColor(id) || defaultColor;
        }
        return defaultColor;
    }

    // Function to determine if a color is bright (needs dark text)
    function isBrightColor(color) {
        // For rgba format
        if (color.startsWith('rgba')) {
            const rgbaMatch = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
            if (rgbaMatch) {
                const r = parseInt(rgbaMatch[1]);
                const g = parseInt(rgbaMatch[2]);
                const b = parseInt(rgbaMatch[3]);
                // Calculate perceived brightness using the formula: (0.299*R + 0.587*G + 0.114*B)
                const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
                return brightness > 160; // Threshold for bright colors
            }
        }
        // For hex format
        else if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            // Calculate perceived brightness
            const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
            return brightness > 160; // Threshold for bright colors
        }
        return false; // Default to false for unknown formats
    }

    // Data storage
    let bars = [];
    let orderbook = { bids: [], asks: [] };
    let bidAskTags = [];

    // Make bidAskTags globally accessible
    window.bidAskTags = bidAskTags;

    // Price variables for different coins
    let btcPrice = 0;
    let ethPrice = 0;
    let solPrice = 0;
    let ltcPrice = 0;
    let xrpPrice = 0;

    // Make price variables globally accessible
    window.btcPrice = btcPrice;
    window.ethPrice = ethPrice;
    window.solPrice = solPrice;
    window.ltcPrice = ltcPrice;
    window.xrpPrice = xrpPrice;

    let currentPriceY = null; // Y position of current price for price tag

    // Current trading pair
    let currentPair = window.coinManager ? window.coinManager.getCurrentCoin().bybitSymbol : 'BTCUSDT';

    // Bar interval and countdown
    const barIntervalMs = 300000; // 5 minute bars (5 * 60 * 1000 ms)
    let barCloseCountdown = 0;
    let countdownInterval = null;

    // View state
    let viewOffset = 0;
    let visibleBars = 25; // Adjusted to 25 as requested
    let mouseX = null, mouseY = null;
    let initialViewOffset = null;
    let isDragging = false;

    // Crosshair state
    let hoveredBarIndex = -1;
    let hoveredPrice = null;
    let hoveredLimitOrder = null; // Track hovered limit order
    let showZoomLens = false; // Flag to control zoom lens visibility
    let snappedMouseX = null; // For bar-to-bar crosshair movement

    // VWAP state
    let vwapData = {
        startTime: 0,
        cumulativePriceVolume: 0,
        cumulativeVolume: 0,
        cumulativeSquaredDiff: 0, // For standard deviation calculation
        value: 0,
        standardDeviation: 0,
        points: []
    };

    // VWAP visibility toggle
    let isVwapVisible = localStorage.getItem('isVwapVisible') !== 'false'; // Default to true if not set

    // Bid/Ask strength visibility toggle
    let isBidAskStrengthVisible = localStorage.getItem('isBidAskStrengthVisible') !== 'false'; // Default to true if not set

    // User-defined minimum order values for heatmap (in thousands of USD) for each coin
    let coinMinOrderValues = {
        BTC: parseInt(localStorage.getItem('minOrderValue_BTC')) || 400, // Default to 400k USD for Bitcoin
        ETH: parseInt(localStorage.getItem('minOrderValue_ETH')) || 150, // Default to 150k USD for Ethereum
        SOL: parseInt(localStorage.getItem('minOrderValue_SOL')) || 100, // Default to 100k USD for Solana
        LTC: parseInt(localStorage.getItem('minOrderValue_LTC')) || 75,  // Default to 75k USD for Litecoin
        XRP: parseInt(localStorage.getItem('minOrderValue_XRP')) || 150  // Default to 150k USD for XRP
    };

    // Recommended values for each coin (in thousands of USD)
    window.coinRecommendedValues = {
        BTC: 400, // Recommended: 400k USD for Bitcoin
        ETH: 150, // Recommended: 150k USD for Ethereum
        SOL: 100, // Recommended: 100k USD for Solana
        LTC: 75,  // Recommended: 75k USD for Litecoin
        XRP: 150  // Recommended: 150k USD for XRP
    };
    // No need for a local variable since we're using window.coinRecommendedValues directly

    // Minimum slider values for each coin (in thousands of USD)
    window.coinMinSliderValues = {
        BTC: 100, // Bitcoin minimum: 100k USD
        ETH: 25,  // Ethereum minimum: 25k USD
        SOL: 25,  // Solana minimum: 25k USD
        LTC: 25,  // Litecoin minimum: 25k USD
        XRP: 25   // XRP minimum: 25k USD
    };
    // Make it accessible locally too
    const coinMinSliderValues = window.coinMinSliderValues;
    // Log the values for debugging
    console.log('Coin min slider values:', coinMinSliderValues);

    // Make it accessible globally
    window.coinMinOrderValues = coinMinOrderValues;

    // Current coin's minimum order value (will be updated based on selected coin)
    let userMinOrderValue = coinMinOrderValues.BTC; // Default to BTC

    // Volume Profile removed

    // Price scale state
    let isPriceScaleDragging = false;
    let priceScaleDragStartY = null;
    let priceScaleDragStartMinPrice = null;
    let priceScaleDragStartMaxPrice = null;
    let minPrice = 0;
    let maxPrice = 100000; // Use a larger initial range
    let isPriceScaleManuallySet = false;

    // Chart dragging state
    let isChartDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialMinPrice = 0;
    let initialMaxPrice = 0;

    // Price scale settings
    const priceScaleWidth = 70;
    let barWidth = 0;

    // Time scale settings
    const timeScaleHeight = 25; // TradingView-style compact time scale

    // Debug mode removed - no longer needed

    // Bid/Ask strength histogram settings
    let histogramHeight = parseInt(localStorage.getItem('histogramHeight')) || 35; // Load saved height or default to 35 (reduced from 40)
    const histogramPaneGap = 0; // No gap between histogram pane and time scale to avoid white line
    let isHistogramResizing = false;
    let histogramResizeStartY = 0;
    let histogramResizeStartHeight = 0;

    // Make histogram height accessible globally
    window.histogramHeight = histogramHeight;
    window.histogramPaneGap = histogramPaneGap;

    // Canvas setup
    const canvas = document.getElementById('chart');
    const ctx = canvas ? canvas.getContext('2d') : null;

    // WebSocket Managers
    class WebSocketManager {
        constructor(url, exchangeName, dataType) {
            this.url = url;
            this.exchangeName = exchangeName;
            this.dataType = dataType;
            this.ws = null;
            this.connect();
        }

        connect() {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log(`${this.exchangeName} WebSocket connected (${this.dataType})`);
                this.onConnect();
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.onMessage(data);
                } catch (error) {
                    console.error(`Error parsing ${this.exchangeName} WebSocket message (${this.dataType}):`, error, event.data);
                }
            };

            this.ws.onclose = () => {
                console.log(`${this.exchangeName} WebSocket disconnected (${this.dataType})`);
                this.onDisconnect();
                setTimeout(() => this.connect(), 5000);
            };

            this.ws.onerror = (error) => {
                console.error(`${this.exchangeName} WebSocket error (${this.dataType}):`, error);
            };
        }

        onConnect() { }
        onMessage() { }
        onDisconnect() { }

        subscribe(channel, callback) {
            this.onMessage = callback;
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendSubscriptionMessage(channel);
            } else {
                this.ws.onopen = () => {
                    this.sendSubscriptionMessage(channel);
                };
            }
        }

        sendSubscriptionMessage(channel) {
            let subscriptionMessage = {};
            if (this.exchangeName === 'bybit') {
                subscriptionMessage = {
                    "op": "subscribe",
                    "args": [channel]
                };
            } else if (this.exchangeName === 'bitstamp') {
                subscriptionMessage = {
                    "event": "bts:subscribe",
                    "data": {
                        "channel": channel
                    }
                };
            }
            this.ws.send(JSON.stringify(subscriptionMessage));
        }

        unsubscribe(channel) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendUnsubscriptionMessage(channel);
            } else if (this.ws) {
                this.ws.onopen = () => {
                    this.sendUnsubscriptionMessage(channel);
                };
            }
        }

        sendUnsubscriptionMessage(channel) {
            let unsubscriptionMessage = {};
            if (this.exchangeName === 'bybit') {
                unsubscriptionMessage = {
                    "op": "unsubscribe",
                    "args": [channel]
                };
            } else if (this.exchangeName === 'bitstamp') {
                unsubscriptionMessage = {
                    "event": "bts:unsubscribe",
                    "data": {
                        "channel": channel
                    }
                };
            }
            this.ws.send(JSON.stringify(unsubscriptionMessage));
        }
    }

    const bybitWsManager = new WebSocketManager('wss://stream.bybit.com/v5/public/spot', 'bybit', 'charts');
    const bitstampWsManager = new WebSocketManager('wss://ws.bitstamp.net', 'bitstamp', 'orderbooks');

    // Make WebSocket managers available globally
    window.bybitWsManager = bybitWsManager;
    window.bitstampWsManager = bitstampWsManager;

    // --- Helper Functions ---
    // Throttle function to limit how often a function can be called
    function throttle(func, limit) {
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

    function resizeCanvas() {
        if (!canvas) return;

        // Check if sidebar is visible
        const isSidebarVisible = document.body.classList.contains('sidebar-visible');
        const sidebarWidth = isSidebarVisible ? 160 : 0; // Use fixed width instead of DOM measurement

        // Get the container element to match its dimensions
        const container = document.getElementById('container');
        const containerRect = container ? container.getBoundingClientRect() : null;

        // Use container dimensions if available, otherwise fall back to window dimensions
        // Subtract 40px for the top sidebar height
        const containerWidth = window.innerWidth - sidebarWidth;
        const containerHeight = containerRect ? containerRect.height : (window.innerHeight - 40);

        console.log('Resizing canvas:', {
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            containerWidth,
            containerHeight,
            timeScaleHeight,
            containerRect: containerRect ? { width: containerRect.width, height: containerRect.height } : null
        });

        // Set canvas dimensions using CSS pixels to ensure consistent rendering
        canvas.style.width = containerWidth + 'px';
        canvas.style.height = containerHeight + 'px';

        // Set actual canvas dimensions - we'll use 1:1 pixel ratio for consistent sizing
        // This ensures everything appears the same size on all devices
        canvas.width = containerWidth;
        canvas.height = containerHeight;

        // Calculate chart dimensions and bar width
        const chartWidth = containerWidth - priceScaleWidth;
        barWidth = chartWidth / visibleBars;

        // Ensure the canvas is fully cleared to avoid white bands
        ctx.clearRect(0, 0, containerWidth, containerHeight);

        // Update button positions when canvas is resized
        updateButtonPositions();

        // Update the top-right-background-fix position and size
        const cornerFix = document.getElementById('top-right-background-fix');
        if (cornerFix) {
            cornerFix.style.width = priceScaleWidth + 'px';
            cornerFix.style.height = '40px'; // Match top sidebar height
            cornerFix.style.backgroundColor = '#131722'; // Match chart background
        }

        isPriceScaleManuallySet = false;

        // Force a redraw with a delay to ensure everything is properly sized
        setTimeout(() => {
            drawChart();
            // Log the canvas dimensions after redraw
            console.log('Canvas dimensions after redraw:', {
                width: canvas.width,
                height: canvas.height,
                styleWidth: canvas.style.width,
                styleHeight: canvas.style.height
            });
        }, 100);
    }

    function updateTitle() {
        if (bars.length > 0) {
            const currentPrice = bars[bars.length - 1].close;

            // Get current coin info
            if (window.coinManager) {
                const coin = window.coinManager.getCurrentCoin();
                const coinSymbol = coin.symbol.toLowerCase();
                window[`${coinSymbol}Price`] = currentPrice;

                // Format price according to coin's precision
                const formattedPrice = currentPrice.toFixed(coin.pricePrecision);
                document.title = `${coin.symbol}/USDT: ${formattedPrice}`;
            } else {
                btcPrice = currentPrice;
                document.title = `BTC/USDT: ${currentPrice.toFixed(2)}`;
            }
        }
    }

    function addResetPriceScaleButton() {
        // Create the button directly without using DOM utilities
        const button = document.createElement('button');
        button.textContent = 'Reset Zoom';
        button.id = 'resetZoomButton';
        button.style.position = 'absolute'; // Use absolute positioning to ensure it's at the bottom right of the chart
        // Position at the very bottom right of the screen, under the price scale and to the right of the time scale
        button.style.bottom = '0';
        button.style.right = '0';
        button.style.width = priceScaleWidth + 'px';
        button.style.height = timeScaleHeight + 'px';
        button.style.padding = '0px';
        button.style.fontSize = '8px';
        button.style.lineHeight = timeScaleHeight + 'px';
        button.style.backgroundColor = '#26a69a';
        button.style.color = '#ffffff';
        button.style.border = 'none';
        button.style.borderRadius = '0px';
        button.style.cursor = 'pointer';
        button.style.zIndex = '1001'; // Higher z-index to ensure visibility

        // Add hover effects
        button.addEventListener('mouseenter', () => {
            button.style.opacity = '1';
        });

        button.addEventListener('mouseleave', () => {
            button.style.opacity = '0.8';
        });

        button.addEventListener('click', () => {
            // Force a complete reset of the price scale
            isPriceScaleManuallySet = false;
            isPriceScaleLocked = false; // Temporarily unlock to allow auto-adjustment

            // Reset to invalid values to force recalculation
            minPrice = 0;
            maxPrice = 100000;

            // Reset view to latest data
            viewOffset = Math.max(0, bars.length - visibleBars);

            // Redraw to trigger auto-adjustment
            drawChart();

            // Lock after adjustment
            isPriceScaleLocked = true;
        });

        // Make sure the button is at the very bottom right of the screen
        document.body.appendChild(button);

        // Add VWAP toggle button
        addVwapToggleButton();
    }

    // Debounce function removed

    // Handle coin change event
    function handleCoinChange(coin) {
        console.log(`Chart handling coin change to ${coin.symbol}`);

        // Update current pair
        currentPair = coin.bybitSymbol;

        // Force immediate update of the coin indicator if the function exists
        if (typeof drawCoinIndicator === 'function') {
            drawCoinIndicator();
        }

        // Update document title
        updateTitle();

        // Clear existing bid/ask tags
        bidAskTags = [];

        // Clear existing orderbook data
        orderbook = { bids: [], asks: [] };

        // Ensure the sidebar is updated with the new coin
        if (window.shortsLongsRatio) {
            window.shortsLongsRatio.handleCoinChange(coin);
        }

        // Force a chart redraw to ensure the coin indicator is visible if the function exists
        if (typeof drawChart === 'function') {
            drawChart();
        }

        // Unsubscribe from old WebSocket channels
        if (window.bybitWsManager) {
            // Unsubscribe from all kline channels
            Object.values(window.coinManager.coins).forEach(c => {
                const channel = `kline.5.${c.bybitSymbol}`;
                window.bybitWsManager.unsubscribe(channel);
            });

            // Subscribe to new kline channel
            const newKlineChannel = `kline.5.${coin.bybitSymbol}`;
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

                    // Process the new bar as in setupWebSockets
                    processNewBar(newBar);
                }
            });
        }

        // Unsubscribe from old Bitstamp orderbook channels
        if (window.bitstampWsManager) {
            // Unsubscribe from all orderbook channels
            Object.values(window.coinManager.coins).forEach(c => {
                const channel = `order_book_${c.bitstampSymbol}`;
                window.bitstampWsManager.unsubscribe(channel);
            });

            // Subscribe to new orderbook channel
            const newOrderBookChannel = `order_book_${coin.bitstampSymbol}`;
            console.log(`Subscribing to new Bitstamp channel: ${newOrderBookChannel}`);
            window.bitstampWsManager.subscribe(newOrderBookChannel, handleBitstampOrderbook);
        }

        // Reset chart data
        bars = [];
        orderbook = { bids: [], asks: [] };

        // Reset price scale
        isPriceScaleManuallySet = false;
        minPrice = 0;
        maxPrice = 100000;

        // Clear any existing bid/ask tags
        if (window.bidAskTags) {
            window.bidAskTags = [];
        }

        // Reset VWAP
        initializeVwapPeriod();

        // Fetch new historical data
        fetchHistoricalData();

        // Update title
        updateTitle();
    }

    // Helper function to process new bars (used by both WebSocket and coin change)
    const processNewBar = function(newBar) {
        // Find the index where this bar should be inserted or updated
        const existingBarIndex = bars.findIndex(b => b.time === newBar.time);

        if (existingBarIndex >= 0) {
            // Update existing bar
            bars[existingBarIndex] = newBar;
        } else {
            // Insert new bar (maintaining chronological order)
            let insertIndex = bars.length;
            for (let i = bars.length - 1; i >= 0; i--) {
                if (bars[i].time < newBar.time) {
                    insertIndex = i + 1;
                    break;
                }
            }
            bars.splice(insertIndex, 0, newBar);
        }

        // Determine if this is the current interval bar
        const now = new Date();
        const intervalStart = new Date(now);
        const minutes = intervalStart.getMinutes();
        const currentFiveMinInterval = Math.floor(minutes / 5) * 5;
        intervalStart.setMinutes(currentFiveMinInterval);
        intervalStart.setSeconds(0);
        intervalStart.setMilliseconds(0);

        const currentIntervalStart = intervalStart.getTime();
        const isCurrentIntervalBar = newBar.time === currentIntervalStart;

        // Only update VWAP for historical bars (never for the current interval bar)
        if (!isCurrentIntervalBar) {
            updateVwap(newBar, true);  // Historical bars are closed
        }

        // Update title and redraw chart
        updateTitle();
        drawChart();
    }

    // Handler for Bitstamp orderbook data
    function handleBitstampOrderbook(data) {
        // Get current coin for logging
        const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';

        // Log first successful data reception
        if (!window.bitstampConnected && data.event === 'data' && data.data) {
            console.log(`✅ Bitstamp WebSocket connected and receiving ${currentCoin} data`);
            window.bitstampConnected = true;
        }

        // Debug XRP data
        if (currentCoin === 'XRP' && data.event === 'data' && data.data) {
            console.log(`XRP orderbook data received:`, {
                channel: data.channel,
                bids: data.data.bids ? data.data.bids.length : 0,
                asks: data.data.asks ? data.data.asks.length : 0
            });
        }

        // Log subscription events
        if (data.event === 'bts:subscription_succeeded') {
            console.log(`Successfully subscribed to ${currentCoin} orderbook channel`);
        } else if (data.event === 'bts:error') {
            console.error(`Error in ${currentCoin} orderbook subscription:`, data);
        }

        if (data.event === 'data' && data.data && data.data.bids && data.data.asks) {
            try {
                // Get current coin symbol for logging
                const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
                console.log(`Processing ${currentCoin} orderbook data with ${data.data.bids.length} bids and ${data.data.asks.length} asks`);

                const rawBids = data.data.bids;
                const rawAsks = data.data.asks;
                const currentPrice = bars.length > 0 ? bars[bars.length - 1].close : 0;
                if (currentPrice === 0) {
                    console.log(`Skipping orderbook update for ${currentCoin} because currentPrice is 0`);
                    return;
                }

                // Store price in the appropriate variable based on current coin
                if (window.coinManager) {
                    const coinSymbol = window.coinManager.getCurrentCoin().symbol.toLowerCase();
                    window[`${coinSymbol}Price`] = currentPrice;

                    // Also update the local variable
                    if (coinSymbol === 'btc') {
                        btcPrice = currentPrice;
                    } else if (coinSymbol === 'eth') {
                        ethPrice = currentPrice;
                    } else if (coinSymbol === 'sol') {
                        solPrice = currentPrice;
                    } else if (coinSymbol === 'ltc') {
                        ltcPrice = currentPrice;
                    } else if (coinSymbol === 'xrp') {
                        xrpPrice = currentPrice;
                    }
                } else {
                    btcPrice = currentPrice; // Fallback to BTC
                    window.btcPrice = currentPrice;
                }

                // Clear existing orderbook data
                orderbook.bids = [];
                orderbook.asks = [];

                // Get minimum dollar value threshold for the current coin
                // Use the already declared currentCoin variable
                userMinOrderValue = window.coinMinOrderValues[currentCoin] || coinMinOrderValues[currentCoin];
                let minDollarValue = userMinOrderValue * 1000; // Convert from k to actual USD value

                // Process bids - convert to USD value based on current coin's price
                for (let i = 0; i < rawBids.length; i++) {
                    const order = rawBids[i];
                    const price = parseFloat(order[0]);
                    const size = parseFloat(order[1]);

                    // Calculate dollar value based on the current coin
                    let dollarValue;
                    if (window.coinManager) {
                        // Use the coin's price for conversion
                        dollarValue = price * size;
                    } else {
                        // Fallback to BTC calculation
                        dollarValue = price * size;
                    }

                    // Only add orders above the threshold
                    if (dollarValue >= minDollarValue) {
                        orderbook.bids.push([price, size, dollarValue]);
                    }
                }

                // Process asks - convert to USD value based on current coin's price
                for (let i = 0; i < rawAsks.length; i++) {
                    const order = rawAsks[i];
                    const price = parseFloat(order[0]);
                    const size = parseFloat(order[1]);

                    // Calculate dollar value based on the current coin
                    let dollarValue;
                    if (window.coinManager) {
                        // Use the coin's price for conversion
                        dollarValue = price * size;
                    } else {
                        // Fallback to BTC calculation
                        dollarValue = price * size;
                    }

                    // Only add orders above the threshold
                    if (dollarValue >= minDollarValue) {
                        orderbook.asks.push([price, size, dollarValue]);
                    }
                }

                // Sort bids by dollar value (descending)
                orderbook.bids.sort((a, b) => b[2] - a[2]);

                // Sort asks by dollar value (descending)
                orderbook.asks.sort((a, b) => b[2] - a[2]);

                // Limit to top 10 bids and 10 asks by dollar value
                orderbook.bids = orderbook.bids.slice(0, 10);
                orderbook.asks = orderbook.asks.slice(0, 10);

                // Now sort bids by price (descending) and asks by price (ascending) for display
                orderbook.bids.sort((a, b) => b[0] - a[0]);
                orderbook.asks.sort((a, b) => a[0] - b[0]);

                // Update the shorts vs longs ratio sidebar if it exists
                if (window.shortsLongsRatio && typeof window.shortsLongsRatio.handleOrderbookUpdate === 'function') {
                    window.shortsLongsRatio.handleOrderbookUpdate(data);
                }

                // Log the number of filtered orders
                console.log(`Processed orderbook: ${orderbook.bids.length} bids, ${orderbook.asks.length} asks above ${minDollarValue} USD`);

                // Use throttled version of drawChart for better performance
                throttledDrawChart();
            } catch (error) {
                console.error('Error processing orderbook data:', error);
            }
        }
    }

    function addVwapToggleButton() {
        // Get the sidebar buttons container
        const buttonsContainer = document.getElementById('sidebar-buttons');
        if (!buttonsContainer) {
            console.error('Sidebar buttons container not found');
            return;
        }

        // Create the button with the sidebar-button class
        const button = document.createElement('button');
        button.className = 'sidebar-button' + (isVwapVisible ? '' : ' inactive');
        button.id = 'vwap-toggle-button';

        // Add feature icon and text
        const featureIcon = document.createElement('span');
        featureIcon.className = 'feature-icon';
        button.appendChild(featureIcon);

        // Add text after the icon
        const textNode = document.createTextNode('VWAP');
        button.appendChild(textNode);

        // Add click event listener
        button.addEventListener('click', () => {
            // Toggle VWAP visibility
            isVwapVisible = !isVwapVisible;
            localStorage.setItem('isVwapVisible', isVwapVisible);

            // Update button appearance
            if (isVwapVisible) {
                button.classList.remove('inactive');
            } else {
                button.classList.add('inactive');
            }

            // Redraw chart
            drawChart();
        });

        // Add the button to the sidebar buttons container
        buttonsContainer.appendChild(button);

        // Add bid/ask strength toggle button
        addBidAskStrengthToggleButton();

        // Add sidebar toggle button
        addSidebarToggleButton();
    }

    // Volume Profile toggle button removed

    function addBidAskStrengthToggleButton() {
        // Get the sidebar buttons container
        const buttonsContainer = document.getElementById('sidebar-buttons');
        if (!buttonsContainer) {
            console.error('Sidebar buttons container not found');
            return;
        }

        // Create the button with the sidebar-button class
        const button = document.createElement('button');
        button.className = 'sidebar-button' + (isBidAskStrengthVisible ? '' : ' inactive');
        button.id = 'bid-ask-strength-toggle-button';

        // Add feature icon and text
        const featureIcon = document.createElement('span');
        featureIcon.className = 'feature-icon';
        button.appendChild(featureIcon);

        // Add text after the icon
        const textNode = document.createTextNode('Depth');
        button.appendChild(textNode);

        // Add click event listener
        button.addEventListener('click', () => {
            // Toggle Bid/Ask strength visibility
            isBidAskStrengthVisible = !isBidAskStrengthVisible;
            localStorage.setItem('isBidAskStrengthVisible', isBidAskStrengthVisible);

            // Update button appearance
            if (isBidAskStrengthVisible) {
                button.classList.remove('inactive');
            } else {
                button.classList.add('inactive');
            }

            // Redraw chart
            drawChart();
        });

        // Add the button to the sidebar buttons container
        buttonsContainer.appendChild(button);
    }

    function addSidebarToggleButton() {
        // Get initial sidebar visibility state
        let isSidebarVisible = localStorage.getItem('isSidebarVisible') !== 'false'; // Default to true if not set

        // Apply the saved state immediately
        const sidebar = document.getElementById('sidebar');
        if (!isSidebarVisible) {
            sidebar.style.display = 'none';
            document.body.classList.remove('sidebar-visible');
        } else {
            document.body.classList.add('sidebar-visible');
        }

        // Get the sidebar buttons container
        const buttonsContainer = document.getElementById('sidebar-buttons');

        // Create the button with the sidebar-button class
        const button = document.createElement('button');
        button.className = 'sidebar-button' + (isSidebarVisible ? '' : ' inactive');
        button.id = 'sidebar-toggle-button';

        // Add feature icon and text
        const featureIcon = document.createElement('span');
        featureIcon.className = 'feature-icon';
        button.appendChild(featureIcon);

        // Add text after the icon
        const textNode = document.createTextNode('Sidebar');
        button.appendChild(textNode);

        // Create an arrow button on the middle left of the screen
        const arrowButton = document.createElement('div');
        arrowButton.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 18L15 12L9 6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        arrowButton.style.position = 'fixed';
        arrowButton.style.left = '0';
        arrowButton.style.top = '50%';
        arrowButton.style.transform = 'translateY(-50%)';
        arrowButton.style.width = '22px';
        arrowButton.style.height = '44px';
        arrowButton.style.backgroundColor = 'rgba(50, 50, 50, 0.85)';
        arrowButton.style.color = '#ffffff';
        arrowButton.style.border = 'none';
        arrowButton.style.borderTopRightRadius = '6px';
        arrowButton.style.borderBottomRightRadius = '6px';
        arrowButton.style.fontSize = '16px';
        arrowButton.style.cursor = 'pointer';
        arrowButton.style.zIndex = '1000'; // Higher z-index to ensure visibility
        arrowButton.style.display = isSidebarVisible ? 'none' : 'flex';
        arrowButton.style.justifyContent = 'center';
        arrowButton.style.alignItems = 'center';
        arrowButton.style.boxShadow = '2px 0 5px rgba(0, 0, 0, 0.3)';
        arrowButton.style.transition = 'all 0.2s ease';
        arrowButton.style.opacity = '0.8';
        arrowButton.title = 'Show Sidebar'; // Tooltip

        // Toggle function that both buttons will use
        const toggleSidebar = () => {
            // Toggle sidebar visibility
            isSidebarVisible = !isSidebarVisible;
            localStorage.setItem('isSidebarVisible', isSidebarVisible);

            if (isSidebarVisible) {
                sidebar.style.display = 'flex';
                button.classList.remove('inactive');
                arrowButton.style.display = 'none';
                document.body.classList.add('sidebar-visible');
            } else {
                sidebar.style.display = 'none';
                button.classList.add('inactive');
                arrowButton.style.display = 'flex';
                document.body.classList.remove('sidebar-visible');
            }

            // Resize canvas to adjust for sidebar visibility change
            resizeCanvas();
        };

        // Add hover effect to arrow button
        arrowButton.addEventListener('mouseenter', () => {
            arrowButton.style.backgroundColor = 'rgba(60, 60, 60, 0.95)'; // Darker gray on hover
            arrowButton.style.width = '26px'; // Slightly wider on hover
            arrowButton.style.opacity = '1'; // Full opacity on hover
        });

        arrowButton.addEventListener('mouseleave', () => {
            arrowButton.style.backgroundColor = 'rgba(50, 50, 50, 0.85)'; // Back to original gray
            arrowButton.style.width = '22px'; // Back to original width
            arrowButton.style.opacity = '0.8'; // Back to original opacity
        });

        // Add active effect
        arrowButton.addEventListener('mousedown', () => {
            arrowButton.style.backgroundColor = 'rgba(70, 70, 70, 1)'; // Darker on click
            arrowButton.style.transform = 'translateY(-50%) scale(0.95)'; // Slight scale down effect
        });

        arrowButton.addEventListener('mouseup', () => {
            arrowButton.style.backgroundColor = 'rgba(60, 60, 60, 0.95)'; // Back to hover color
            arrowButton.style.transform = 'translateY(-50%)'; // Back to original scale
        });

        // Add click event listeners to both buttons
        button.addEventListener('click', toggleSidebar);
        arrowButton.addEventListener('click', toggleSidebar);

        // Add the buttons to their respective containers
        if (buttonsContainer) {
            buttonsContainer.appendChild(button);
        } else {
            console.error('Sidebar buttons container not found');
        }

        document.body.appendChild(arrowButton);

        // Add color customizer button
        addColorCustomizerButton();

        // Add "made by lost" text above the buttons
        addMadeByText();

        // Store the arrow button in a global variable for access from other scripts
        window.sidebarArrowButton = arrowButton;

        // Make sure the arrow button is always visible when the sidebar is hidden
        // This is important in case the page loads with the sidebar hidden
        if (!isSidebarVisible) {
            arrowButton.style.display = 'flex';
        }

        // Add a check on window load to ensure the arrow button is visible if sidebar is hidden
        window.addEventListener('load', () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.style.display === 'none') {
                arrowButton.style.display = 'flex';
            }
        });
    }

    // The button is now created directly in color-customizer-new.js
    // This is just a placeholder function to avoid reference errors
    function addColorCustomizerButton() {
        // This is a placeholder function - the button is created in color-customizer-new.js
        // We'll add it to the sidebar buttons container there
        console.log('Color customizer button is managed by color-customizer-new.js');

        // The button will be added to the sidebar in color-customizer-new.js
        // We don't need to do anything here
    }

    function addMadeByText() {
        // Create the text element with styling
        const madeByText = document.createElement('div');
        madeByText.innerHTML = '<span style="opacity: 0.7;">made by</span> <span style="font-weight: 600;">lost</span>';
        madeByText.style.fontSize = '10px';
        madeByText.style.color = 'rgba(255, 255, 255, 0.6)';
        madeByText.style.textAlign = 'center';
        madeByText.style.position = 'absolute';
        madeByText.style.top = '55px'; // Position it below the coin indicator
        madeByText.style.left = '50%';
        madeByText.style.transform = 'translateX(-50%)';
        madeByText.style.letterSpacing = '0.5px';
        madeByText.style.zIndex = '1000'; // Same z-index as coin indicator
        madeByText.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.8)'; // Add shadow for better visibility

        // Add the text to the container
        document.getElementById('container').appendChild(madeByText);
    }

    // updateVwapButtonAppearance function removed - now handled by DOM utilities

    // --- Data Fetching ---
    function fetchHistoricalData() {
        // Get current trading pair from coin manager
        if (window.coinManager) {
            currentPair = window.coinManager.getCurrentCoin().bybitSymbol;
        }

        console.log(`Fetching historical data for ${currentPair}`);

        fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${currentPair}&interval=5&limit=750`)
            .then(response => response.json())
            .then(data => {
                if (data.retCode === 0 && data.result && data.result.list) {
                    // Parse and validate historical bars
                    const now = Date.now();
                    bars = data.result.list
                        .map(bar => ({
                            time: parseInt(bar[0]),
                            open: parseFloat(bar[1]),
                            high: parseFloat(bar[2]),
                            low: parseFloat(bar[3]),
                            close: parseFloat(bar[4])
                        }))
                        // Filter out any bars with invalid timestamps (future bars or invalid data)
                        .filter(bar => {
                            // Ensure the bar time is valid (not in the future, has reasonable values)
                            if (bar.time > now || isNaN(bar.time) || bar.time <= 0) {
                                console.log(`Filtering out invalid historical bar: ${new Date(bar.time).toLocaleString()}`);
                                return false;
                            }
                            // Ensure price data is valid
                            if (isNaN(bar.open) || isNaN(bar.high) || isNaN(bar.low) || isNaN(bar.close)) {
                                console.log(`Filtering out bar with invalid price data: ${new Date(bar.time).toLocaleString()}`);
                                return false;
                            }

                            // Ensure the bar aligns with 5-minute intervals
                            const barDate = new Date(bar.time);
                            const barMinutes = barDate.getMinutes();
                            if (barMinutes % 5 !== 0) {
                                console.log(`Filtering out bar not aligned with 5-minute intervals: ${barDate.toLocaleString()}`);
                                return false;
                            }

                            return true;
                        })
                        .reverse();

                    // Initialize VWAP with historical bars
                    initializeVwapPeriod();
                    bars.forEach(bar => {
                        if (isInCurrentVwapPeriod(bar.time)) {
                            // Historical bars are considered closed
                            updateVwap(bar, true);
                        }
                    });

                    viewOffset = Math.max(0, bars.length - visibleBars);
                    isPriceScaleManuallySet = false;
                    updateTitle();
                    drawChart();
                } else {
                    console.error('Historical fetch failed:', data.retMsg || 'Unknown error');
                    drawChart();
                }
            })
            .catch(error => {
                console.error('Fetch error (Historical):', error);
                drawChart();
            });
    }

    // Create throttled versions of drawChart for different update types
    let throttledDrawChart = throttle(drawChart, 100); // For orderbook updates
    let throttledPriceUpdate = throttle(drawChart, 50); // For price updates

    // --- WebSocket Subscriptions ---
    function setupWebSockets() {

        // Initialize the sidebar after WebSocket managers are available
        if (typeof ShortsLongsRatio === 'function') {
            window.shortsLongsRatio = new ShortsLongsRatio();
            window.shortsLongsRatio.init();
            console.log('Shorts vs Longs ratio sidebar initialized');
        } else {
            console.error('ShortsLongsRatio class not available');
        }

        // Get current trading pair from coin manager
        if (window.coinManager) {
            currentPair = window.coinManager.getCurrentCoin().bybitSymbol;
        }

        // Listen for coin changes
        document.addEventListener('coinChanged', (e) => {
            handleCoinChange(e.detail.coin);
        });

        // Subscribe to the current pair's kline channel
        const klineChannel = `kline.5.${currentPair}`;
        console.log(`Subscribing to Bybit channel: ${klineChannel}`);

        bybitWsManager.subscribe(klineChannel, (data) => {
            // Log first successful data reception
            if (!window.bybitConnected && data.topic && data.data) {
                console.log('✅ Bybit WebSocket connected and receiving data');
                window.bybitConnected = true;
                // Connection notification removed from chart display
            }

            if (data.topic && data.data && data.data.length > 0) {
                const bar = data.data[0];
                const newBar = {
                    time: parseInt(bar.start),
                    open: parseFloat(bar.open),
                    high: parseFloat(bar.high),
                    low: parseFloat(bar.low),
                    close: parseFloat(bar.close)
                };

                // Process the new bar using our helper function
                processNewBar(newBar);

                // Use throttled version of drawChart for better performance
                throttledPriceUpdate();
            }
        });

        // Using global throttled functions defined above

        // Subscribe to orderbook channel for the current coin
        if (window.coinManager) {
            const currentCoin = window.coinManager.getCurrentCoin();
            const orderBookChannel = `order_book_${currentCoin.bitstampSymbol}`;
            console.log(`Subscribing to Bitstamp channel: ${orderBookChannel}`);
            bitstampWsManager.subscribe(orderBookChannel, handleBitstampOrderbook);
        } else {
            // Fallback for when coin manager is not available
            const bitstampSymbol = 'btcusd';
            const orderBookChannel = `order_book_${bitstampSymbol}`;
            console.log(`Subscribing to Bitstamp channel: ${orderBookChannel}`);
            bitstampWsManager.subscribe(orderBookChannel, handleBitstampOrderbook);
        }
    }

    // --- Mouse Interaction ---
    function handleMouseDown(e) {
        if (!canvas) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;

        // Calculate histogram area
        const chartHeight = canvas.height - timeScaleHeight - histogramHeight - histogramPaneGap;
        const histogramY = chartHeight;
        const histogramWidth = canvas.width - priceScaleWidth;

        // Calculate histogram bottom boundary
        const histogramBottom = histogramY + histogramHeight;

        // Log chart dimensions for debugging
        console.log('Chart dimensions:', {
            canvasHeight: canvas.height,
            chartHeight,
            histogramHeight,
            timeScaleHeight
        });

        console.log('Mouse down at:', { mouseX, mouseY, canvasWidth: canvas.width, priceScaleWidth });

        // Check if mouse is over histogram resize handle (entire top border)
        if (mouseY >= histogramY - 3 && mouseY <= histogramY + 5 && mouseX < histogramWidth) {
            // Start resizing histogram
            isHistogramResizing = true;
            histogramResizeStartY = mouseY;
            histogramResizeStartHeight = histogramHeight;
            canvas.style.cursor = 'ns-resize';
            isDragging = true;
            console.log('Histogram resize started');
            return;
        }

        // Check if mouse is over price scale area (right side of canvas)
        // This includes both the main chart price scale and the histogram price scale
        if (mouseX > canvas.width - priceScaleWidth) {
            // Price scale dragging (vertical only)
            isPriceScaleDragging = true;
            priceScaleDragStartY = e.clientY;
            priceScaleDragStartMinPrice = minPrice;
            priceScaleDragStartMaxPrice = maxPrice;
            canvas.style.cursor = 'ns-resize';

            console.log('Price scale drag started:', {
                startY: priceScaleDragStartY,
                minPrice: priceScaleDragStartMinPrice,
                maxPrice: priceScaleDragStartMaxPrice
            });

            // Mark the price scale as manually set when it's dragged
            isPriceScaleManuallySet = true;
        }
        // Check if mouse is over the histogram area (but not the resize handle)
        else if (mouseY >= histogramY && mouseY <= histogramBottom && mouseX < histogramWidth) {
            console.log('Mouse down in histogram area');
            // Allow dragging in the histogram area
            isChartDragging = true;
            dragStartX = mouseX;
            dragStartY = mouseY;
            initialViewOffset = viewOffset;
            initialMinPrice = minPrice;
            initialMaxPrice = maxPrice;
            canvas.style.cursor = 'move';
            isDragging = true;
        } else {
            // Chart area dragging (both horizontal and vertical when not locked)
            isChartDragging = true;
            dragStartX = mouseX;
            dragStartY = mouseY;
            initialViewOffset = viewOffset;
            initialMinPrice = minPrice;
            initialMaxPrice = maxPrice;
            canvas.style.cursor = 'move'; // Change cursor to indicate both directions
        }
        isDragging = true;
    }

    function handleMouseMove(e) {
        if (!canvas || !isDragging) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;

        // Handle mouse movement during dragging

        // Handle histogram resizing
        if (isHistogramResizing) {
            // Calculate the drag distance
            const dragDistance = mouseY - histogramResizeStartY;

            // Calculate new histogram height (inverse relationship - dragging up increases height)
            let newHeight = histogramResizeStartHeight - dragDistance;

            // Constrain the height to reasonable values
            newHeight = Math.max(20, Math.min(150, newHeight));

            // Update the histogram height
            histogramHeight = newHeight;
            window.histogramHeight = newHeight;

            // Save the histogram height to localStorage
            localStorage.setItem('histogramHeight', newHeight);

            // Update button positions to match new histogram height
            updateButtonPositions();

            // Redraw the chart
            drawChart();
            return;
        }

        if (isPriceScaleDragging) {
            // Use the full chart height for better scaling
            const chartHeight = canvas.height - timeScaleHeight;

            // TradingView price scale behavior - stretching/zooming
            const dragDistance = mouseY - priceScaleDragStartY;
            const priceRange = priceScaleDragStartMaxPrice - priceScaleDragStartMinPrice;

            // Debug price scale dragging
            console.log('Price scale dragging:', {
                dragDistance,
                priceRange,
                priceScaleDragStartY,
                mouseY,
                chartHeight
            });

            if (priceRange > 0 && isFinite(priceRange)) {
                // Calculate stretch factor based on drag distance
                // Dragging down stretches the chart (increases the range)
                // Dragging up compresses the chart (decreases the range)
                const stretchFactor = 1 + (dragDistance / (chartHeight * 0.5)); // Increased sensitivity

                // Calculate new min and max prices by stretching around the center
                const centerPrice = (priceScaleDragStartMaxPrice + priceScaleDragStartMinPrice) / 2;
                let newMinPrice = centerPrice - (priceRange / 2) * stretchFactor;
                let newMaxPrice = centerPrice + (priceRange / 2) * stretchFactor;

                // Ensure minimum range to prevent excessive zoom
                const minAllowedRange = 10;
                if (newMaxPrice - newMinPrice < minAllowedRange) {
                    const midPrice = (newMinPrice + newMaxPrice) / 2;
                    newMinPrice = midPrice - minAllowedRange / 2;
                    newMaxPrice = midPrice + minAllowedRange / 2;
                }

                if (isFinite(newMinPrice) && isFinite(newMaxPrice)) {
                    minPrice = newMinPrice;
                    maxPrice = newMaxPrice;
                    isPriceScaleManuallySet = true;
                    drawChart();
                }
            }
        } else if (isChartDragging) {
            // Handle horizontal scrolling (left/right)
            const deltaX = mouseX - dragStartX;
            const currentChartWidth = canvas.width - priceScaleWidth;
            const currentBarWidth = currentChartWidth / visibleBars;
            const barsToShift = currentBarWidth > 0 ? deltaX / currentBarWidth : 0;

            let newViewOffset = initialViewOffset - barsToShift;
            const maxViewOffset = bars.length; // Allow scrolling right up to the end
            const minViewOffset = 0;
            viewOffset = Math.max(minViewOffset, Math.min(newViewOffset, maxViewOffset));

            // Handle vertical scrolling (up/down) when not locked
            const deltaY = mouseY - dragStartY;
            const chartHeight = canvas.height - timeScaleHeight;
            const priceRange = initialMaxPrice - initialMinPrice;
            const priceShift = (deltaY / chartHeight) * priceRange;

            // Move price range up or down based on vertical drag
            if (priceRange > 0 && isFinite(priceRange)) {
                minPrice = initialMinPrice + priceShift;
                maxPrice = initialMaxPrice + priceShift;
                // Only set isPriceScaleManuallySet to true when dragging the price scale itself
                // This ensures the auto-zoom scale remains active when dragging the chart
            }

            drawChart();
        }
    }

    // Function to calculate the nearest bar center position
    function calculateNearestBarCenter(mouseXPos) {
        if (!canvas || mouseXPos === null) return null;

        const chartWidth = canvas.width - priceScaleWidth;
        if (mouseXPos < 0 || mouseXPos >= chartWidth) return null;

        const startIndex = Math.max(0, Math.floor(viewOffset));
        const fractionalOffset = viewOffset - startIndex;
        const startX = -fractionalOffset * barWidth;

        // Calculate which bar the mouse is over
        const barIndexOffset = (mouseXPos - startX) / barWidth;
        const exactBarIndex = startIndex + barIndexOffset;

        // Round to the nearest bar index
        const nearestBarIndex = Math.round(exactBarIndex);

        // Calculate the x-coordinate of the center of the nearest bar
        const nearestBarCenterX = startX + (nearestBarIndex - startIndex) * barWidth + barWidth / 2;

        // Ensure the position is within the chart area
        return Math.max(0, Math.min(chartWidth - 1, nearestBarCenterX));
    }

    function handleMouseHover(e) {
        if (!canvas || isDragging) return;
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;

        // Calculate histogram area for resize handle detection
        const histogramAreaHeight = canvas.height - timeScaleHeight - histogramHeight - histogramPaneGap;
        const histogramY = histogramAreaHeight;
        const histogramWidth = canvas.width - priceScaleWidth;

        // Check if mouse is over histogram resize handle
        if (mouseY >= histogramY - 3 && mouseY <= histogramY + 5 && mouseX < histogramWidth) {
            canvas.style.cursor = 'ns-resize';
            return;
        }

        // Check if mouse is over the price scale area (including histogram price scale)
        if (mouseX > canvas.width - priceScaleWidth) {
            canvas.style.cursor = 'ns-resize';
            return;
        }

        // Reset hovered limit order and zoom lens by default
        // This ensures the zoom lens disappears when not hovering over a limit
        hoveredLimitOrder = null;
        showZoomLens = false;

        // Calculate hovered price
        const chartHeight = canvas.height - timeScaleHeight - histogramHeight - histogramPaneGap;
        if (mouseY >= 0 && mouseY <= chartHeight) {
            const priceRange = Math.max(1e-6, maxPrice - minPrice);
            hoveredPrice = maxPrice - (mouseY / chartHeight) * priceRange;

            // Calculate snapped mouse X position for bar-to-bar movement
            snappedMouseX = calculateNearestBarCenter(mouseX);

            // Only check for limit orders if we're in the chart area (not over price scale)
            const chartWidth = canvas.width - priceScaleWidth;
            if (mouseX >= 0 && mouseX < chartWidth) {
                // Only try to find a limit order if we have a valid orderbook
                if (orderbook && orderbook.bids && orderbook.asks) {
                    // Check if hovering over a limit order
                    const result = findHoveredLimitOrder(mouseY);

                    // Only set hoveredLimitOrder and enable zoom lens if we have a valid result
                    // This ensures the zoom lens only appears when directly over a limit order's exact price
                    if (result && result.price && result.dollarValue >= 400000) {
                        // Extra check to ensure we're exactly at the order's price
                        const exactPriceMatch = Math.abs(hoveredPrice - result.price) < 0.000001;
                        if (exactPriceMatch) {
                            hoveredLimitOrder = result;
                            showZoomLens = true; // Only enable zoom lens when directly over a valid limit order
                            console.log('CONFIRMED limit order:', hoveredLimitOrder.type, 'at price', hoveredLimitOrder.price);
                        } else {
                            // Not exactly at the order's price
                            hoveredLimitOrder = null;
                            showZoomLens = false;
                        }
                    } else {
                        // Explicitly reset these values when not over a limit order
                        hoveredLimitOrder = null;
                        showZoomLens = false;
                    }
                }
            }
        } else {
            hoveredPrice = null;
        }

        // Calculate hovered bar index - include time scale area
        const chartWidth = canvas.width - priceScaleWidth;
        if (mouseX >= 0 && mouseX < chartWidth) {
            // Calculate snapped mouse X position for bar-to-bar movement
            // This applies to both chart area and time scale area
            snappedMouseX = calculateNearestBarCenter(mouseX);

            // If mouse is in the time scale area, still calculate the bar index
            // This allows the crosshair to work in the time scale area
            if (mouseY > chartHeight && mouseY <= canvas.height) {
                // Keep the same horizontal position calculation
                // This ensures the vertical crosshair aligns with the correct bar
            }
        } else {
            hoveredBarIndex = -1;
            snappedMouseX = null;
        }

        // Set cursor style based on position
        if (mouseX > canvas.width - priceScaleWidth) {
            canvas.style.cursor = 'ns-resize'; // Price scale area
        } else {
            // Use crosshair cursor for both chart area and time scale area
            canvas.style.cursor = 'crosshair';
        }
        drawChart();
    }

    function handleMouseUp(e) {
        if (!canvas) return;
        e.preventDefault();

        // Log the state before resetting
        console.log('Mouse up - drag states:', {
            isDragging,
            isChartDragging,
            isPriceScaleDragging,
            isHistogramResizing
        });

        isDragging = false;
        isChartDragging = false;
        isPriceScaleDragging = false;
        isHistogramResizing = false;
        initialViewOffset = null;
        initialMinPrice = null;
        initialMaxPrice = null;
        histogramResizeStartY = 0;
        histogramResizeStartHeight = 0;

        // Reset cursor based on position
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        console.log('Mouse up at:', { x, y, canvasWidth: canvas.width, priceScaleWidth });

        if (x > canvas.width - priceScaleWidth) {
            canvas.style.cursor = 'ns-resize';
        } else {
            canvas.style.cursor = 'crosshair';
        }
        dragStartX = 0;
        priceScaleDragStartY = null;
        priceScaleDragStartMinPrice = null;
        priceScaleDragStartMaxPrice = null;
        handleMouseHover(e);
    }

    function handleWheel(e) {
        if (!canvas) return;
        e.preventDefault();

        try {
            const rect = canvas.getBoundingClientRect();
            const mouseXOnChart = e.clientX - rect.left;
            const mouseYOnChart = e.clientY - rect.top;

            // Ensure we have valid data before proceeding
            if (bars.length === 0) {
                console.log('No bars data available, ignoring wheel event');
                return;
            }

            // If mouse is over price scale, enable price scale zooming
            if (mouseXOnChart > canvas.width - priceScaleWidth) {
                // Price scale zooming with mouse wheel
                const zoomFactor = e.deltaY < 0 ? 0.9 : 1.1; // Zoom in when scrolling up, out when scrolling down
                const chartHeight = canvas.height - timeScaleHeight;
                const priceRange = maxPrice - minPrice;

                if (priceRange <= 0 || !isFinite(priceRange)) {
                    console.log('Invalid price range, ignoring wheel event');
                    return;
                }

                // Calculate the price at mouse position
                const priceAtMouse = minPrice + (1 - mouseYOnChart / chartHeight) * priceRange;

                // Calculate new min and max prices centered on mouse position
                let newMinPrice = priceAtMouse - (priceAtMouse - minPrice) * zoomFactor;
                let newMaxPrice = priceAtMouse + (maxPrice - priceAtMouse) * zoomFactor;

                // Ensure minimum range to prevent excessive zoom
                const minAllowedRange = 10;
                if (newMaxPrice - newMinPrice < minAllowedRange) {
                    const midPrice = (newMinPrice + newMaxPrice) / 2;
                    newMinPrice = midPrice - minAllowedRange / 2;
                    newMaxPrice = midPrice + minAllowedRange / 2;
                }

                if (isFinite(newMinPrice) && isFinite(newMaxPrice)) {
                    minPrice = newMinPrice;
                    maxPrice = newMaxPrice;
                    isPriceScaleManuallySet = true;
                    drawChart();
                }

                return;
            }

            // Chart zooming (horizontal only)
            const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
            const newVisibleBars = Math.max(10, Math.min(750, Math.round(visibleBars * zoomFactor)));

            if (newVisibleBars === visibleBars) return;

            const currentChartWidth = canvas.width - priceScaleWidth;
            if (currentChartWidth <= 0) {
                console.log('Invalid chart width, ignoring wheel event');
                return;
            }

            const currentBarWidth = currentChartWidth / visibleBars;
            if (currentBarWidth <= 0) {
                console.log('Invalid bar width, ignoring wheel event');
                return;
            }

            const barIndexUnderMouse = viewOffset + (mouseXOnChart / currentBarWidth);

            const mouseRatio = mouseXOnChart / currentChartWidth;
            const newViewOffset = barIndexUnderMouse - mouseRatio * newVisibleBars;

            visibleBars = newVisibleBars;
            const maxViewOffset = bars.length;
            const minViewOffset = 0;

            viewOffset = Math.max(minViewOffset, Math.min(newViewOffset, maxViewOffset));

            // Don't call resizeCanvas here, just recalculate barWidth
            barWidth = (canvas.width - priceScaleWidth) / visibleBars;

            // The price scale will auto-adjust in drawChart() based on the visible bars
            // This creates the automatic zoom scale that adapts to candlestick positions

            drawChart();
        } catch (error) {
            console.error('Error in wheel handler:', error);
        }
    }

    function handleMouseLeave(e) {
        if (!canvas) return;
        e.preventDefault();
        mouseX = null;
        mouseY = null;
        hoveredBarIndex = -1;
        hoveredPrice = null;
        hoveredLimitOrder = null;
        snappedMouseX = null; // Reset snapped mouse position
        showZoomLens = false; // Reset zoom lens flag when mouse leaves canvas
        if (isDragging) {
            handleMouseUp(e);
        }
        canvas.style.cursor = 'default';
        drawChart();
    }

    function handleDoubleClick(e) {
        if (!canvas) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;

        // If double-click is on the price scale, reset zoom
        if (x > canvas.width - priceScaleWidth) {
            // Force a complete reset of the price scale
            isPriceScaleManuallySet = false;

            // Reset to invalid values to force recalculation
            minPrice = 0;
            maxPrice = 100000;

            // Redraw to trigger auto-adjustment
            drawChart();
        }
    }

    // --- Helper Functions for Drawing ---
    function getYForPrice(price) {
        // Use histogramHeight only if bid/ask strength is visible
        const histogramHeightToUse = isBidAskStrengthVisible ? histogramHeight : 0;
        const histogramPaneGapToUse = isBidAskStrengthVisible ? histogramPaneGap : 0;
        const chartHeight = canvas.height - timeScaleHeight - histogramHeightToUse - histogramPaneGapToUse;
        const clampedPrice = Math.max(minPrice, Math.min(price, maxPrice));
        const priceRange = Math.max(1e-6, maxPrice - minPrice);
        return chartHeight - ((clampedPrice - minPrice) / priceRange) * chartHeight;
    }

    // Function to check if mouse is hovering over a limit order
    function findHoveredLimitOrder(mouseY) {
        // Immediate null checks
        if (!orderbook || !orderbook.bids || !orderbook.asks || !mouseY) {
            return null;
        }

        // If orderbook is empty or has no significant orders, return null
        if (orderbook.bids.length === 0 && orderbook.asks.length === 0) {
            return null;
        }

        // Calculate mouse price
        const chartHeight = canvas.height - timeScaleHeight;
        const priceRange = Math.max(1e-6, maxPrice - minPrice);
        const mousePrice = minPrice + (1 - mouseY / chartHeight) * priceRange;

        // Get minimum dollar value threshold for the current coin
        const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
        userMinOrderValue = window.coinMinOrderValues[currentCoin] || coinMinOrderValues[currentCoin];
        let minOrderValue = userMinOrderValue * 1000; // Convert from k to actual USD value

        // Filter to only significant orders
        const significantBids = orderbook.bids.filter(([, , value]) => value >= minOrderValue);
        const significantAsks = orderbook.asks.filter(([, , value]) => value >= minOrderValue);

        // If no significant orders, return null
        if (significantBids.length === 0 && significantAsks.length === 0) {
            return null;
        }

        // Define an extremely small hover threshold for exact detection
        // This ensures orders can only be hovered over exactly where they are
        // The zoom lens will only appear when directly over a limit order's exact price
        const hoverThreshold = 0.000001; // Ultra-tiny epsilon for exact floating point comparison

        // First check bids
        for (const [price, size, dollarValue] of significantBids) {
            // Only match if the price is EXACTLY equal (with the tiny epsilon)
            if (Math.abs(price - mousePrice) < hoverThreshold) {
                console.log('EXACT match on BID at price', price);
                return {
                    type: 'BID',
                    price: price,
                    size: size,
                    dollarValue: dollarValue
                };
            }
        }

        // Then check asks
        for (const [price, size, dollarValue] of significantAsks) {
            // Only match if the price is EXACTLY equal (with the tiny epsilon)
            if (Math.abs(price - mousePrice) < hoverThreshold) {
                console.log('EXACT match on ASK at price', price);
                return {
                    type: 'ASK',
                    price: price,
                    size: size,
                    dollarValue: dollarValue
                };
            }
        }

        // If we get here, no exact match was found
        return null;
    }

    // getXForTime function removed

    // Check if a timestamp is within the current VWAP period (00:00 UTC+2 to 00:00 UTC+2 next day)
    function isInCurrentVwapPeriod(timestamp) {
        if (vwapData.startTime === 0) {
            initializeVwapPeriod();
        }
        return timestamp >= vwapData.startTime && timestamp < vwapData.startTime + 24 * 60 * 60 * 1000;
    }

    // Initialize the VWAP period start time (00:00 UTC+2 - daily open)
    function initializeVwapPeriod() {
        const now = new Date();
        const utcPlus2 = new Date(now.getTime() + 2 * 60 * 60 * 1000); // Convert to UTC+2

        // Set to 00:00 UTC+2 today (daily open)
        utcPlus2.setUTCHours(0, 0, 0, 0);

        // If current time is past midnight UTC+2, use today's open, otherwise use yesterday's open
        if (now.getTime() < utcPlus2.getTime()) {
            utcPlus2.setDate(utcPlus2.getDate() - 1);
        }

        // Save current VWAP data as previous day's data if it exists and is valid
        if (vwapData.startTime > 0 && vwapData.points.length > 0 && vwapData.value > 0) {
            // Deep copy the current VWAP data to previous day's data
            previousVwapData = {
                startTime: vwapData.startTime,
                value: vwapData.value,
                standardDeviation: vwapData.standardDeviation,
                points: JSON.parse(JSON.stringify(vwapData.points))
            };
            console.log(`Previous day VWAP saved: ${vwapData.value.toFixed(2)} (±${vwapData.standardDeviation.toFixed(2)})`);
        }

        vwapData.startTime = utcPlus2.getTime();
        vwapData.cumulativePriceVolume = 0;
        vwapData.cumulativeVolume = 0;
        vwapData.cumulativeSquaredDiff = 0;
        vwapData.value = 0;
        vwapData.standardDeviation = 0;
        vwapData.points = [];

        console.log(`VWAP period initialized (Daily): ${new Date(vwapData.startTime).toLocaleString()} to ${new Date(vwapData.startTime + 24 * 60 * 60 * 1000).toLocaleString()}`);
    }

    // Update VWAP with a new bar
    // IMPORTANT: VWAP should ONLY be updated when a bar is closed, never during bar formation
    function updateVwap(bar, isBarClosed = false) {
        // If the bar is not closed, do not update VWAP
        if (!isBarClosed) {
            console.log(`Skipping VWAP update for bar at ${new Date(bar.time).toLocaleTimeString()} - bar is still forming`);
            return;
        }

        // Check if we need to reset the VWAP (new day starting at midnight UTC+2)
        if (!isInCurrentVwapPeriod(bar.time)) {
            initializeVwapPeriod();
        }

        // Only include bars within the current VWAP period
        // We already checked isBarClosed above, so we know this bar is complete
        if (isInCurrentVwapPeriod(bar.time)) {
            // Calculate typical price: (high + low + close) / 3
            const typicalPrice = (bar.high + bar.low + bar.close) / 3;
            // Assume volume is 1 for each bar since we don't have actual volume data
            const volume = 1;

            // Update cumulative values
            vwapData.cumulativePriceVolume += typicalPrice * volume;
            vwapData.cumulativeVolume += volume;

            // Calculate VWAP
            if (vwapData.cumulativeVolume > 0) {
                vwapData.value = vwapData.cumulativePriceVolume / vwapData.cumulativeVolume;

                // Update squared differences for standard deviation calculation
                vwapData.cumulativeSquaredDiff += Math.pow(typicalPrice - vwapData.value, 2) * volume;

                // Calculate standard deviation
                if (vwapData.cumulativeVolume > 1) {
                    vwapData.standardDeviation = Math.sqrt(vwapData.cumulativeSquaredDiff / vwapData.cumulativeVolume);
                }

                // Store the VWAP point for this time with standard deviation bands
                vwapData.points.push({
                    time: bar.time,
                    value: vwapData.value,
                    upperBand: vwapData.value + vwapData.standardDeviation,
                    lowerBand: vwapData.value - vwapData.standardDeviation
                });

                console.log(`VWAP updated on bar close: ${new Date(bar.time).toLocaleTimeString()} - VWAP: ${vwapData.value.toFixed(2)} (bar is closed)`);
            }
        }
    }

    function formatNumberAbbreviation(value) {
        if (value >= 1e6) {
            return (value / 1e6).toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'M';
        } else if (value >= 1e3) {
            return Math.floor(value / 1e3).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'K';
        }
        return value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    // Format number with commas
    function formatNumberWithCommas(num) {
        return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    // --- Volume Profile Functions ---
    // Volume Profile Functions removed

    function formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');

        // Verify that this timestamp is aligned with 5-minute intervals for bar timestamps
        // This ensures we only show times like 00:00, 00:05, 00:10, etc.
        if (minutes % 5 !== 0) {
            console.warn(`Timestamp not aligned with 5-minute intervals: ${date.toLocaleTimeString()}`);
        }

        // TradingView style: Always use hours:minutes format without seconds
        const timeFormat = `${hours}:${minutes}`;

        // If the bar is from today, just show time (TradingView style)
        const today = new Date();
        if (date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear()) {
            return timeFormat;
        }

        // Otherwise show date and time (TradingView style: DD.MM HH:MM)
        return `${day}.${month} ${timeFormat}`;
    }

    // --- Drawing Functions ---
    function drawCrosshair() {
        if (!ctx || !canvas || mouseX === null || mouseY === null) return;

        // Use histogramHeight only if bid/ask strength is visible
        const histogramHeightToUse = isBidAskStrengthVisible ? histogramHeight : 0;
        const histogramPaneGapToUse = isBidAskStrengthVisible ? histogramPaneGap : 0;
        const chartWidth = canvas.width - priceScaleWidth;
        const chartHeight = canvas.height - timeScaleHeight - histogramHeightToUse - histogramPaneGapToUse;

        // Only draw crosshair if mouse is in the chart area, histogram area, or time scale area
        // Allow crosshair in time scale area (mouseY can be in time scale)
        if (mouseX < 0 || mouseX >= chartWidth || mouseY < 0) return;

        // Use snapped mouse X position for bar-to-bar movement if available
        // This creates the teleporting effect from bar to bar
        const crosshairX = snappedMouseX !== null ? snappedMouseX : mouseX;

        // Calculate hovered bar index and check if it's in the future
        const startIndex = Math.max(0, Math.floor(viewOffset));
        const fractionalOffset = viewOffset - startIndex;
        const startX = -fractionalOffset * barWidth;

        // Calculate hoveredBarIndex based on the snapped position
        hoveredBarIndex = startIndex + (crosshairX - startX) / barWidth;

        // Calculate the time for the hovered bar
        let hoveredTime = null;
        let isFutureBar = false;

        if (bars.length > 0) {
            const barIndex = Math.floor(hoveredBarIndex);
            // const barFraction = hoveredBarIndex - barIndex; // Not needed since we're not showing seconds

            if (barIndex >= 0 && barIndex < bars.length) {
                // We're hovering over an existing bar
                hoveredTime = bars[barIndex].time;

                // We're not adding seconds anymore as requested
            } else if (barIndex >= bars.length) {
                // We're hovering over a future bar
                const lastBarTime = bars[bars.length - 1].time;
                const futureBarOffset = barIndex - bars.length + 1;
                const baseFutureTime = lastBarTime + (barIntervalMs * futureBarOffset);

                // We're not adding seconds anymore as requested
                hoveredTime = baseFutureTime;
                isFutureBar = true;
            }
        }

        // Draw vertical line (extending to the bottom of the canvas)
        ctx.strokeStyle = getColor('crosshair', 'rgba(150, 150, 150, 0.5)');
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(crosshairX, 0);

        // Always extend vertical line to the bottom of the canvas (including time scale)
        ctx.lineTo(crosshairX, canvas.height);
        ctx.stroke();

        // Draw horizontal line (only in the area where the mouse is)
        // We still use the actual mouseY for the horizontal line since we want precise price hovering
        // This is intentional - vertical line snaps to bars, horizontal line follows exact mouse position
        ctx.beginPath();
        if (mouseY < chartHeight) {
            // Mouse is in chart area
            ctx.moveTo(0, mouseY);
            ctx.lineTo(chartWidth, mouseY);
        } else {
            // Mouse is in histogram area
            ctx.moveTo(0, mouseY);
            ctx.lineTo(chartWidth, mouseY);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw time tag at the bottom of the crosshair
        if (hoveredTime !== null) {
            const timeScaleY = chartHeight + histogramHeightToUse + histogramPaneGapToUse;
            const formattedTime = formatTimestamp(hoveredTime);

            // Measure text width to make the tag fit the content
            ctx.font = 'bold 11px Arial, sans-serif';
            const textWidth = ctx.measureText(formattedTime).width;

            // Draw time tag background (TradingView style)
            const timeTagWidth = Math.max(60, textWidth + 16); // TradingView uses more compact tags
            const timeTagHeight = 18; // Slightly smaller height for TradingView style
            // Use the snapped position for the time tag
            const timeTagX = crosshairX - timeTagWidth / 2;
            const timeTagY = timeScaleY - timeTagHeight - 1; // Position closer to time scale

            // Draw background with semi-transparent fill (TradingView style)
            ctx.fillStyle = 'rgba(45, 55, 65, 0.85)';
            ctx.fillRect(timeTagX, timeTagY, timeTagWidth, timeTagHeight);

            // Draw border with subtle color (TradingView style)
            ctx.strokeStyle = isFutureBar ? 'rgba(100, 100, 100, 0.6)' : 'rgba(150, 150, 150, 0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(timeTagX, timeTagY, timeTagWidth, timeTagHeight);

            // Draw time text (TradingView style)
            ctx.font = '10px Arial, sans-serif'; // TradingView uses smaller font
            ctx.fillStyle = isFutureBar ? 'rgba(200, 200, 200, 0.8)' : 'rgba(255, 255, 255, 0.9)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(formattedTime, crosshairX, timeTagY + timeTagHeight / 2);
        }

        // Draw price label to the left of the price scale
        if (hoveredPrice !== null) {
            // ONLY show the zoom lens if the global flag is true (which is only set when hovering over a valid limit order)
            if (showZoomLens && hoveredLimitOrder !== null) {
                console.log('Drawing zoom lens for limit order:', hoveredLimitOrder.type, 'at price', hoveredLimitOrder.price);
                // Draw a zoom lens for the limit order
                const labelWidth = 180;
                const labelHeight = 80;
                const labelX = chartWidth - labelWidth - 5; // Position to the left of price scale with a small gap
                const labelY = mouseY;

                // Get color based on order type
                const bidColor = getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a'));
                const askColor = getColor('bearishCandleBody', getColor('bearishCandle', '#ef5350'));

                const orderColor = hoveredLimitOrder.type === 'BID' ? bidColor : askColor;

                // Convert hex to rgba with 0.9 opacity
                const rgbaColor = orderColor.startsWith('#') ?
                    `rgba(${parseInt(orderColor.slice(1, 3), 16)}, ${parseInt(orderColor.slice(3, 5), 16)}, ${parseInt(orderColor.slice(5, 7), 16)}, 0.9)` :
                    orderColor;

                // Draw background
                ctx.fillStyle = 'rgba(31, 41, 55, 0.95)';
                ctx.fillRect(labelX, labelY - labelHeight / 2, labelWidth, labelHeight);

                // Draw border with order type color
                ctx.strokeStyle = rgbaColor;
                ctx.lineWidth = 3;
                ctx.strokeRect(labelX, labelY - labelHeight / 2, labelWidth, labelHeight);

                // Draw text
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';

                // Draw order type header
                ctx.fillStyle = rgbaColor;
                ctx.fillText(hoveredLimitOrder.type, labelX + labelWidth / 2, labelY - 25);

                // Draw details
                ctx.font = '11px Arial';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'left';
                const textX = labelX + 15;

                // Draw price with larger font
                ctx.font = 'bold 14px Arial';
                ctx.fillText(`${hoveredLimitOrder.price.toFixed(2)}`, textX, labelY);

                // Draw size and value
                ctx.font = '11px Arial';
                ctx.fillText(`Size: ${hoveredLimitOrder.size.toFixed(2)} BTC`, textX, labelY + 20);
                ctx.fillText(`Value: $${formatNumberWithCommas(hoveredLimitOrder.dollarValue)}`, textX, labelY + 35);
            } else {
                // Find nearest bid and ask
                let nearestBid = null;
                let nearestAsk = null;
                let nearestBidDiff = Infinity;
                let nearestAskDiff = Infinity;
                let bidValue = 0;
                let askValue = 0;

                // Find the nearest bid and ask to the hovered price
                if (orderbook.bids && orderbook.bids.length > 0) {
                    orderbook.bids.forEach(([price, , dollarValue]) => {
                        const diff = Math.abs(hoveredPrice - price);
                        if (diff < nearestBidDiff) {
                            nearestBidDiff = diff;
                            nearestBid = price;
                            bidValue = dollarValue;
                        }
                    });
                }

                if (orderbook.asks && orderbook.asks.length > 0) {
                    orderbook.asks.forEach(([price, , dollarValue]) => {
                        const diff = Math.abs(hoveredPrice - price);
                        if (diff < nearestAskDiff) {
                            nearestAskDiff = diff;
                            nearestAsk = price;
                            askValue = dollarValue;
                        }
                    });
                }

                // Determine if we're closer to a bid or ask
                const isCloserToBid = nearestBidDiff <= nearestAskDiff;
                const nearestPrice = isCloserToBid ? nearestBid : nearestAsk;
                const dollarValue = isCloserToBid ? bidValue : askValue;
                const orderType = isCloserToBid ? 'BID' : 'ASK';

                // Get customized colors for bid and ask
                const bidColor = getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a'));
                const askColor = getColor('bearishCandleBody', getColor('bearishCandle', '#ef5350'));

                // Convert hex to rgba with 0.9 opacity
                const bidRgbaColor = bidColor.startsWith('#') ?
                    `rgba(${parseInt(bidColor.slice(1, 3), 16)}, ${parseInt(bidColor.slice(3, 5), 16)}, ${parseInt(bidColor.slice(5, 7), 16)}, 0.9)` :
                    bidColor;
                const askRgbaColor = askColor.startsWith('#') ?
                    `rgba(${parseInt(askColor.slice(1, 3), 16)}, ${parseInt(askColor.slice(3, 5), 16)}, ${parseInt(askColor.slice(5, 7), 16)}, 0.9)` :
                    askColor;

                const orderColor = isCloserToBid ? bidRgbaColor : askRgbaColor;

                // Create a wider label with more information
                const labelWidth = 150;
                const labelHeight = 50;
                const labelX = chartWidth - labelWidth - 5; // Position to the left of price scale with a small gap
                const labelY = mouseY;

                // Draw background
                ctx.fillStyle = 'rgba(31, 41, 55, 0.9)';
                ctx.fillRect(labelX, labelY - labelHeight / 2, labelWidth, labelHeight);

                // Draw border with order type color
                ctx.strokeStyle = orderColor;
                ctx.lineWidth = 2;
                ctx.strokeRect(labelX, labelY - labelHeight / 2, labelWidth, labelHeight);

                // Draw text
                ctx.font = '10px Arial';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'left';
                const textX = labelX + 10;

                // Draw price
                ctx.fillText(`Price: ${hoveredPrice.toFixed(2)}`, textX, labelY - 15);

                // Draw nearest order info if available
                if (nearestPrice !== null) {
                    ctx.fillText(`${orderType}: ${nearestPrice.toFixed(2)}`, textX, labelY);
                    ctx.fillText(`Value: $${formatNumberAbbreviation(dollarValue)}`, textX, labelY + 15);
                }
            }
        }

        // We no longer need to draw time labels in the crosshair function
        // since we're showing all time labels in the timescale
    }

    function drawBidAskTags() {
        if (!ctx || !canvas) return;

        // Get current coin
        const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';

        // For XRP, create dummy orderbook data if none exists
        if (currentCoin === 'XRP' && window.xrpPrice > 0 &&
            ((!orderbook.bids || orderbook.bids.length === 0) && (!orderbook.asks || orderbook.asks.length === 0))) {

            // Create some dummy orderbook data for testing
            const currentPrice = window.xrpPrice;
            orderbook.bids = [
                [currentPrice * 0.99, 100000, 200000],  // price, size, dollar value
                [currentPrice * 0.98, 150000, 300000]
            ];
            orderbook.asks = [
                [currentPrice * 1.01, 100000, 200000],
                [currentPrice * 1.02, 150000, 300000]
            ];
        }

        // Check if we have any orderbook data
        if (!orderbook.bids && !orderbook.asks) {
            // No orderbook data available - this is normal when switching coins
            return;
        }

        // Check if we have at least some data (either bids or asks)
        const hasBids = orderbook.bids && orderbook.bids.length > 0;
        const hasAsks = orderbook.asks && orderbook.asks.length > 0;

        if (!hasBids && !hasAsks) {
            // No bids or asks available
            return;
        }

        // The orderbook data is already filtered and sorted in handleBitstampOrderbook
        // We need to find the largest bid and ask by dollar value

        // Create a copy of the orderbook data for sorting by dollar value
        let bidsByValue = orderbook.bids && orderbook.bids.length > 0 ? [...orderbook.bids] : [];
        let asksByValue = orderbook.asks && orderbook.asks.length > 0 ? [...orderbook.asks] : [];

        // Sort by dollar value (descending)
        bidsByValue.sort((a, b) => b[2] - a[2]);
        asksByValue.sort((a, b) => b[2] - a[2]);

        // Get the top bid and ask by dollar value if they exist
        const topBid = bidsByValue.length > 0 ? bidsByValue[0] : null;
        const topAsk = asksByValue.length > 0 ? asksByValue[0] : null;

        // Log the top bid and ask
        if (topBid) console.log(`Top bid: $${topBid[2].toFixed(2)} at price ${topBid[0]}`);
        if (topAsk) console.log(`Top ask: $${topAsk[2].toFixed(2)} at price ${topAsk[0]}`);

        // Check if we have at least one valid bid or ask
        if (!topBid && !topAsk) {
            // No valid bid/ask data - this is normal when switching coins
            return;
        }

        // Get coin-specific minimum dollar value threshold
        let minDollarValue = 400000; // Default for BTC (400k USD)

        // Use different thresholds for different coins
        if (window.coinManager) {
            const currentCoin = window.coinManager.getCurrentCoin().symbol;
            if (currentCoin === 'ETH') {
                minDollarValue = 200000; // 200k USD for Ethereum
            } else if (currentCoin === 'SOL') {
                minDollarValue = 100000; // 100k USD for Solana
            } else if (currentCoin === 'LTC') {
                minDollarValue = 75000; // 75k USD for Litecoin
            } else if (currentCoin === 'XRP') {
                minDollarValue = 150000; // 150k USD for XRP
                // For XRP, temporarily lower the threshold for testing
                minDollarValue = 1000; // Lower threshold for testing
            }
        }

        // Check if the orders are above the threshold
        const hasBidAboveThreshold = topBid && topBid[2] >= minDollarValue;
        const hasAskAboveThreshold = topAsk && topAsk[2] >= minDollarValue;

        // Only proceed if at least one order is above the threshold
        if (!hasBidAboveThreshold && !hasAskAboveThreshold) {
            console.log('No bids or asks above the threshold');
            return;
        }

        // Safely get values, handling cases where either might be null
        const topBidPrice = topBid ? topBid[0] : 0;
        const topAskPrice = topAsk ? topAsk[0] : 0;
        const bidDollarValue = topBid ? topBid[2] : 0;
        const askDollarValue = topAsk ? topAsk[2] : 0;

        // Get current price info
        const currentPrice = bars.length > 0 ? bars[bars.length - 1].close : null;
        const currentPriceY = currentPrice !== null ? getYForPrice(currentPrice) : null;

        // Calculate Y positions for bid and ask
        const bidLabelY = getYForPrice(topBidPrice);
        const askLabelY = getYForPrice(topAskPrice);

        // Define dimensions and positions
        const tagHeight = 20; // Consistent height for all tags
        const priceTagWidth = 60;
        const valueLabelWidth = 80;
        const countdownTagWidth = 50;

        // Position tags in price scale - ensure consistent positioning
        const priceTagX = canvas.width - priceScaleWidth / 2; // Center in price scale
        const valueLabelX = canvas.width - priceScaleWidth - 5; // Just outside price scale

        // Create array of all tags with their positions and sizes
        const tags = [];

        // Add current price tag if available
        if (currentPrice !== null && currentPriceY !== null) {
            // Get color based on price movement - use the same colors as candles
            const prevBar = bars.length > 1 ? bars[bars.length - 2] : null;
            const priceChange = prevBar ? currentPrice - prevBar.close : 0;
            const isBullish = priceChange >= 0;
            const priceColor = isBullish ?
                getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a')) :
                getColor('bearishCandleBody', getColor('bearishCandle', '#ef5350'));

            tags.push({
                type: 'current',
                y: currentPriceY,
                height: tagHeight,
                color: priceColor,
                price: currentPrice,
                value: null
            });

            // Add countdown tag (will be positioned after adjusting all tags)
            // Use the same color as the price tag for consistency
            tags.push({
                type: 'countdown',
                y: currentPriceY + tagHeight + 2, // Initial position, will be adjusted
                height: tagHeight,
                color: priceColor, // Use the same color as the price tag
                price: null,
                value: null
            });
        }

        // Add bid tag if we have a valid bid above threshold
        if (hasBidAboveThreshold) {
            const bidColor = getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a'));
            const bidRgbaColor = bidColor.startsWith('#') ?
                `rgba(${parseInt(bidColor.slice(1, 3), 16)}, ${parseInt(bidColor.slice(3, 5), 16)}, ${parseInt(bidColor.slice(5, 7), 16)}, 0.8)` :
                bidColor;

            tags.push({
                type: 'bid',
                y: bidLabelY,
                height: tagHeight,
                color: bidRgbaColor,
                price: topBidPrice,
                value: bidDollarValue
            });
        }

        // Add ask tag if we have a valid ask above threshold
        if (hasAskAboveThreshold) {
            const askColor = getColor('bearishCandleBody', getColor('bearishCandle', '#ef5350'));
            const askRgbaColor = askColor.startsWith('#') ?
                `rgba(${parseInt(askColor.slice(1, 3), 16)}, ${parseInt(askColor.slice(3, 5), 16)}, ${parseInt(askColor.slice(5, 7), 16)}, 0.8)` :
                askColor;

            tags.push({
                type: 'ask',
                y: askLabelY,
                height: tagHeight,
                color: askRgbaColor,
                price: topAskPrice,
                value: askDollarValue
            });
        }

        // Sort tags by Y position (top to bottom)
        tags.sort((a, b) => a.y - b.y);

        // Adjust positions to avoid overlapping
        for (let i = 1; i < tags.length; i++) {
            const prevTag = tags[i - 1];
            const currentTag = tags[i];
            const minSpacing = prevTag.height / 2 + currentTag.height / 2 + 2; // 2px minimum gap

            if (currentTag.y - prevTag.y < minSpacing) {
                currentTag.y = prevTag.y + minSpacing;
            }
        }

        // Check if tags are within visible price range
        const chartHeight = canvas.height - timeScaleHeight;
        tags.forEach(tag => {
            // For price-based tags, check if the price is within the visible range
            if (tag.price !== null) {
                // If price is outside visible range, mark tag as invisible
                if (tag.price < minPrice || tag.price > maxPrice) {
                    tag.visible = false;
                } else {
                    tag.visible = true;
                }
            } else if (tag.type === 'countdown') {
                // Countdown tag is only visible if the current price tag is visible
                const currentPriceTag = tags.find(t => t.type === 'current');
                tag.visible = currentPriceTag ? currentPriceTag.visible : false;
            }
        });

        // For visible tags, keep them within canvas bounds
        tags.forEach(tag => {
            if (tag.visible) {
                tag.y = Math.max(tag.height / 2, Math.min(chartHeight - tag.height / 2, tag.y));
            }
        });

        // Draw only visible tags
        tags.forEach(tag => {
            if (!tag.visible) return; // Skip invisible tags

            const tagY = tag.y;
            const tagTop = tagY - tag.height / 2;

            if (tag.type === 'current') {
                // Draw horizontal line at current price (only if price is in visible range)
                if (tag.price >= minPrice && tag.price <= maxPrice) {
                    ctx.strokeStyle = tag.color;
                    ctx.lineWidth = 1;
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.moveTo(0, tagY);
                    ctx.lineTo(canvas.width - priceScaleWidth, tagY);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                // Draw connecting line from price line to price tag (only if price is in visible range)
                if (tag.price >= minPrice && tag.price <= maxPrice) {
                    // No connecting line needed - the tag will extend through the separator
                }

                // Draw price tag background - extend it to connect with the price line
                ctx.fillStyle = tag.color;
                // Extend the tag all the way to the chart area
                const extendedTagWidth = priceTagWidth + (priceTagX - priceTagWidth / 2 - (canvas.width - priceScaleWidth));
                ctx.fillRect(canvas.width - priceScaleWidth, tagTop, extendedTagWidth, tag.height);

                // Draw price text - use black for bright backgrounds, white for dark
                ctx.font = 'bold 12px Arial';
                ctx.fillStyle = isBrightColor(tag.color) ? '#000000' : '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(tag.price.toFixed(2), priceTagX, tagY);

            } else if (tag.type === 'countdown') {
                // Format countdown time
                const minutes = Math.floor(barCloseCountdown / 60);
                const seconds = barCloseCountdown % 60;
                const countdownText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

                // Draw countdown background
                ctx.fillStyle = tag.color;
                ctx.fillRect(priceTagX - countdownTagWidth / 2, tagTop, countdownTagWidth, tag.height);

                // Draw countdown text - use black for bright backgrounds, white for dark
                ctx.font = 'bold 12px Arial';
                ctx.fillStyle = isBrightColor(tag.color) ? '#000000' : '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(countdownText, priceTagX, tagY);

            } else if (tag.type === 'bid' || tag.type === 'ask') {
                // We'll draw the value label as part of the continuous rectangle below

                // Draw price tag (inside price scale) - extend it to connect with the value label
                ctx.fillStyle = tag.color;

                // First draw the value label (outside price scale)
                ctx.fillRect(valueLabelX - valueLabelWidth, tagTop, valueLabelWidth, tag.height);

                // Then draw a continuous rectangle from the value label to the price tag
                const connectionWidth = (priceTagX + priceTagWidth / 2) - (valueLabelX - valueLabelWidth);
                ctx.fillRect(valueLabelX - valueLabelWidth, tagTop, connectionWidth, tag.height);

                // Draw the value label text
                ctx.fillStyle = isBrightColor(tag.color) ? '#000000' : '#ffffff';
                ctx.textAlign = 'right';
                ctx.font = 'bold 10px Arial';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${tag.type.toUpperCase()} $${formatNumberAbbreviation(tag.value)}`, valueLabelX - 5, tagY);

                // Use black text for bright backgrounds, white for dark backgrounds
                ctx.fillStyle = isBrightColor(tag.color) ? '#000000' : '#ffffff';
                ctx.textAlign = 'center';
                ctx.font = 'bold 10px Arial';
                ctx.textBaseline = 'middle';
                ctx.fillText(tag.price.toFixed(2), priceTagX, tagY);

                // No connecting line needed - the tag will extend through the separator
            }
        });
    }

    // Draw the bid/ask strength histogram
    function drawBidAskStrengthHistogram() {
        if (!ctx || !canvas) return;

        // Check if bid/ask strength histogram is visible
        if (!isBidAskStrengthVisible) return;

        console.log('Drawing bid/ask strength histogram');

        // Calculate the total USD value of top 10 bids and asks
        let totalBidValue = 0;
        let totalAskValue = 0;

        // Get top 20 bids and asks (increased from 10)
        const topBids = orderbook.bids ? orderbook.bids.slice(0, 20) : [];
        const topAsks = orderbook.asks ? orderbook.asks.slice(0, 20) : [];

        // Calculate total values and store individual values for histogram
        const bidValues = [];
        const askValues = [];

        topBids.forEach(bid => {
            const value = bid[2]; // bid[2] is the USD value
            totalBidValue += value;
            bidValues.push(value);
        });

        topAsks.forEach(ask => {
            const value = ask[2]; // ask[2] is the USD value
            totalAskValue += value;
            askValues.push(value);
        });

        // Sort values in descending order for better visualization
        bidValues.sort((a, b) => b - a);
        askValues.sort((a, b) => b - a);

        // Define the histogram area
        const histogramHeightToUse = histogramHeight; // Always use full height when visible
        const chartHeight = canvas.height - timeScaleHeight - histogramHeightToUse - histogramPaneGap;
        const histogramY = chartHeight;
        const histogramWidth = canvas.width - priceScaleWidth;

        // Draw background for histogram pane (including price scale area)
        ctx.fillStyle = '#131722'; // Dark background
        ctx.fillRect(0, histogramY, canvas.width, histogramHeight);

        // Draw separator line between histogram and chart
        ctx.strokeStyle = 'rgba(150, 150, 150, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, histogramY);
        ctx.lineTo(canvas.width, histogramY);
        ctx.stroke();

        // Draw vertical separator line between histogram and price scale (matching price scale separator)
        ctx.strokeStyle = 'rgba(150, 150, 150, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(canvas.width - priceScaleWidth, histogramY);
        ctx.lineTo(canvas.width - priceScaleWidth, histogramY + histogramHeight);
        ctx.stroke();

        // Draw resize handle only in the center to avoid a full line across the top
        ctx.fillStyle = 'rgba(150, 150, 150, 0.3)';
        ctx.fillRect(histogramWidth / 2 - 40, histogramY, 80, 3);

        // Then draw a more visible handle in the center
        ctx.fillStyle = 'rgba(150, 150, 150, 0.7)';
        ctx.fillRect(histogramWidth / 2 - 40, histogramY, 80, 3);

        // Add drag indicators (three dots)
        ctx.fillStyle = 'rgba(200, 200, 200, 0.9)';
        ctx.beginPath();
        ctx.arc(histogramWidth / 2 - 15, histogramY + 1.5, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(histogramWidth / 2, histogramY + 1.5, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(histogramWidth / 2 + 15, histogramY + 1.5, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Update global variable
        window.histogramHeight = histogramHeight;

        // Draw title for the histogram pane
        ctx.font = 'bold 10px Arial';
        ctx.fillStyle = '#999';
        ctx.textAlign = 'left';
        ctx.fillText('Depth', 5, histogramY + 10);

        // Draw the histogram bars
        const midPoint = histogramWidth / 2;
        const maxBars = 20; // Maximum 20 bars on each side (increased from 10)
        const barSpacing = 1; // Space between bars (reduced)
        const maxBarHeight = histogramHeight - 18; // Leave more space for labels with USD values

        // Find the maximum value for scaling
        const maxValue = Math.max(
            ...bidValues,
            ...askValues,
            1000 // Minimum scale to avoid division by zero
        );

        // Draw bid bars (left side, green)
        const bidBarWidth = Math.min(2, (midPoint - 15) / maxBars - barSpacing); // Limit max width to 2px (reduced from 3px)
        bidValues.forEach((value, index) => {
            if (index >= maxBars) return; // Only show top 20

            const barHeight = Math.min((value / maxValue) * maxBarHeight, maxBarHeight * 0.9); // Limit max height
            const x = midPoint - 5 - (index + 1) * (bidBarWidth + barSpacing);
            const y = histogramY + histogramHeight - 5 - barHeight;

            // Use customizable bid strength color
            ctx.fillStyle = getColor('bidStrengthColor', 'rgba(38, 166, 154, 0.7)'); // Default: Bullish green with transparency
            ctx.fillRect(x, y, bidBarWidth, barHeight);
        });

        // Draw ask bars (right side, red)
        const askBarWidth = Math.min(2, (midPoint - 15) / maxBars - barSpacing); // Limit max width to 2px (reduced from 3px)
        askValues.forEach((value, index) => {
            if (index >= maxBars) return; // Only show top 20

            const barHeight = Math.min((value / maxValue) * maxBarHeight, maxBarHeight * 0.9); // Limit max height
            const x = midPoint + 5 + index * (askBarWidth + barSpacing);
            const y = histogramY + histogramHeight - 5 - barHeight;

            // Use customizable ask strength color
            ctx.fillStyle = getColor('askStrengthColor', 'rgba(239, 83, 80, 0.7)'); // Default: Bearish red with transparency
            ctx.fillRect(x, y, askBarWidth, barHeight);
        });

        // Draw divider line at the middle
        ctx.strokeStyle = 'rgba(150, 150, 150, 0.4)'; // Consistent with other separators
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(midPoint, histogramY + 5);
        ctx.lineTo(midPoint, histogramY + histogramHeight - 5);
        ctx.stroke();

        // Draw labels
        ctx.font = '10px Arial';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.fillText(`Bids: $${formatNumber(totalBidValue)}`, 5, histogramY + histogramHeight - 5);
        ctx.textAlign = 'right';
        ctx.fillText(`Asks: $${formatNumber(totalAskValue)}`, histogramWidth - 5, histogramY + histogramHeight - 5);

        // Draw USD scale on the right side
        // Find the maximum value for the scale
        const maxScaleValue = Math.max(...bidValues, ...askValues, 1000);
        const scaleSteps = [0, maxScaleValue / 4, maxScaleValue / 2, maxScaleValue * 3 / 4, maxScaleValue];

        // Draw scale lines and labels
        ctx.textAlign = 'left';
        ctx.fillStyle = '#999';
        ctx.font = '9px Arial';

        // Draw scale in the price scale area
        scaleSteps.forEach((value, index) => {
            // Skip the first step (0) for the line
            if (index > 0) {
                const y = histogramY + histogramHeight - 5 - (value / maxScaleValue) * (histogramHeight - 15);

                // Draw scale line
                ctx.strokeStyle = 'rgba(150, 150, 150, 0.2)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(histogramWidth, y);
                ctx.lineTo(canvas.width - 5, y);
                ctx.stroke();

                // Draw scale label
                ctx.fillText(`$${formatCompactNumber(value)}`, histogramWidth + 5, y + 3);
            }
        });

        // Draw strength indicator - only show the stronger side
        const totalValue = totalBidValue + totalAskValue;
        if (totalValue > 0) {
            const bidPercentage = Math.round((totalBidValue / totalValue) * 100);
            const askPercentage = 100 - bidPercentage;

            ctx.textAlign = 'center';
            ctx.font = 'bold 9px Arial'; // Reduced from 10px to 9px

            if (bidPercentage > askPercentage) {
                // Bid pressure is stronger
                ctx.fillStyle = getColor('bidStrengthColor', 'rgba(38, 166, 154, 0.7)');
                ctx.fillText(
                    `Bid Pressure: ${bidPercentage}% ($${formatCompactNumber(totalBidValue)})`,
                    midPoint,
                    histogramY + 12
                );
            } else if (askPercentage > bidPercentage) {
                // Ask pressure is stronger
                ctx.fillStyle = getColor('askStrengthColor', 'rgba(239, 83, 80, 0.7)');
                ctx.fillText(
                    `Ask Pressure: ${askPercentage}% ($${formatCompactNumber(totalAskValue)})`,
                    midPoint,
                    histogramY + 12
                );
            } else {
                // Equal pressure (50/50)
                ctx.fillStyle = '#999';
                ctx.fillText(
                    `Neutral: 50% ($${formatCompactNumber(totalValue)})`,
                    midPoint,
                    histogramY + 12
                );
            }
        }
    }

    // Helper function to format numbers with commas
    function formatNumber(num) {
        return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }

    // Helper function to format numbers in a compact way (K, M, B)
    function formatCompactNumber(num) {
        if (num >= 1000000000) {
            return (num / 1000000000).toFixed(1) + 'B';
        } else if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        } else {
            return num.toFixed(0);
        }
    }

    // Helper function to update all button positions when histogram height changes
    function updateButtonPositions() {
        // Find all buttons and UI elements that need to be repositioned
        const buttons = document.querySelectorAll('button[style*="bottom"]');
        const madeByText = document.querySelector('div[style*="made by lost"]');
        const resetZoomButton = document.getElementById('resetZoomButton');

        // Calculate the new bottom position
        const bottomPosition = (timeScaleHeight + histogramHeight + histogramPaneGap + 10) + 'px';
        const madeByPosition = (timeScaleHeight + histogramHeight + histogramPaneGap + 30) + 'px';

        // Update each button's position, excluding the reset zoom button
        buttons.forEach(button => {
            // Skip the reset zoom button - it should always stay at the bottom right
            if (button === resetZoomButton) return;

            if (button.style.bottom.includes(timeScaleHeight) ||
                button.style.bottom.includes('px')) {
                button.style.bottom = bottomPosition;
            }
        });

        // Update the 'made by lost' text position
        if (madeByText) {
            madeByText.style.bottom = madeByPosition;
        }

        // Don't update the color customizer button position - it should stay in the sidebar
        // The code below is commented out to prevent the button from being moved out of the sidebar
        /*
        if (window.colorCustomizer && window.colorCustomizer.toggleButton) {
            window.colorCustomizer.toggleButton.style.bottom = bottomPosition;
            window.colorCustomizer.toggleButton.style.left = 'calc(50% - 40px)';
            window.colorCustomizer.toggleButton.style.transform = 'translateX(0)';
        }
        */
    }

    function drawHeatmapLine(price, dollarValue, color, maxDollarValue) {

        if (price >= minPrice && price <= maxPrice) {
            const y = getYForPrice(price);
            if (!isFinite(y)) return;

            // Get minimum dollar value threshold for the current coin
            const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
            userMinOrderValue = window.coinMinOrderValues[currentCoin] || coinMinOrderValues[currentCoin];
            let minDollarValue = userMinOrderValue * 1000; // Convert from k to actual USD value

            // Only draw lines for orders above the threshold
            if (dollarValue < minDollarValue) return;

            // Calculate line width based on dollar value relative to max dollar value
            // Use a more aggressive power curve (^3 instead of ^2) for better contrast
            const valueRatio = Math.min(1, dollarValue / maxDollarValue);

            // Make smaller lines thinner and bigger lines thicker
            const minLineWidth = 1; // Minimum line width for visibility
            const maxLineWidth = 10; // Maximum line width to avoid overwhelming the chart

            // Use cubic power for more dramatic contrast between small and large orders
            const lineWidth = minLineWidth + Math.pow(valueRatio, 2) * (maxLineWidth - minLineWidth);

            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width - priceScaleWidth, y); // Extend to price scale edge
            ctx.stroke();
        }
    }

    function drawVwap() {
        if (!ctx || !canvas || !isVwapVisible) return;

        const startIndex = Math.max(0, Math.floor(viewOffset));
        const endIndex = Math.min(bars.length, startIndex + Math.ceil(visibleBars));

        if (startIndex >= endIndex) return;

        // Find visible time range
        const startTime = bars[startIndex].time;
        const endTime = bars[endIndex - 1].time;

        // Draw current day's VWAP if available
        if (vwapData.points && vwapData.points.length > 0) {
            const vwapColor = getColor('vwapLine', 'rgba(255, 215, 0, 0.8)');

            // Get VWAP bands color and apply custom opacity if available
            let vwapBandsColor = getColor('vwapBands', 'rgba(255, 215, 0, 0.3)');

            // Apply custom opacity if available
            if (window.colorCustomizer && window.colorCustomizer.opacitySettings &&
                window.colorCustomizer.opacitySettings.vwapBandsOpacity !== undefined) {
                // Extract the RGB components from the current color
                const rgbaMatch = vwapBandsColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
                if (rgbaMatch) {
                    const r = parseInt(rgbaMatch[1]);
                    const g = parseInt(rgbaMatch[2]);
                    const b = parseInt(rgbaMatch[3]);
                    // Apply the custom opacity
                    vwapBandsColor = `rgba(${r}, ${g}, ${b}, ${window.colorCustomizer.opacitySettings.vwapBandsOpacity})`;
                }
            }

            // Create a copy of the points array to extend to the current time
            const extendedPoints = [...vwapData.points];

            // If there's at least one point, extend the VWAP line to the current time
            if (extendedPoints.length > 0) {
                const lastPoint = extendedPoints[extendedPoints.length - 1];
                const currentTime = bars[bars.length - 1].time;

                // Only add an extension point if the last point isn't already the current time
                if (lastPoint.time < currentTime) {
                    // Add a point at the current time with the same VWAP value as the last point
                    // This creates a straight, continuous line to the current time
                    extendedPoints.push({
                        time: currentTime,
                        value: lastPoint.value,
                        upperBand: lastPoint.upperBand,
                        lowerBand: lastPoint.lowerBand
                    });
                }
            }

            drawVwapLine(
                extendedPoints, // Use the extended points array
                startTime,
                endTime,
                startIndex,
                endIndex,
                vwapColor, // Use customized color for current day
                2,
                vwapBandsColor, // Use customized color for bands with custom opacity
                false // This is current day's VWAP
            );
        }
    }

    // drawVolumeProfile function removed

    // Helper function to draw a VWAP line with standard deviation bands
    function drawVwapLine(points, startTime, endTime, startIndex, endIndex, lineColor, lineWidth, bandColor, isPreviousDay = false) {
        // Apply opacity setting to band color if it's not already applied
        if (window.colorCustomizer && window.colorCustomizer.opacitySettings &&
            window.colorCustomizer.opacitySettings.vwapBandsOpacity !== undefined) {
            const opacity = window.colorCustomizer.opacitySettings.vwapBandsOpacity;

            // Check if bandColor is rgba
            const rgbaMatch = bandColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
            if (rgbaMatch) {
                const r = parseInt(rgbaMatch[1]);
                const g = parseInt(rgbaMatch[2]);
                const b = parseInt(rgbaMatch[3]);
                // Apply the custom opacity directly here
                bandColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
            } else {
                // Check if it's rgb
                const rgbMatch = bandColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                if (rgbMatch) {
                    const r = parseInt(rgbMatch[1]);
                    const g = parseInt(rgbMatch[2]);
                    const b = parseInt(rgbMatch[3]);
                    // Apply the custom opacity
                    bandColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
                } else {
                    // Check if it's a hex color
                    const hexMatch = bandColor.match(/#([0-9A-Fa-f]{6})/i);
                    if (hexMatch) {
                        const hex = hexMatch[1];
                        const r = parseInt(hex.substring(0, 2), 16);
                        const g = parseInt(hex.substring(2, 4), 16);
                        const b = parseInt(hex.substring(4, 6), 16);
                        // Apply the custom opacity
                        bandColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
                    } else {
                        // For named colors or other formats, use a fallback approach
                        // Create a temporary div to compute the RGB values
                        const tempDiv = document.createElement('div');
                        tempDiv.style.color = bandColor;
                        document.body.appendChild(tempDiv);
                        const computedColor = window.getComputedStyle(tempDiv).color;
                        document.body.removeChild(tempDiv);

                        // Parse the computed color (should be in rgb format)
                        const computedMatch = computedColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                        if (computedMatch) {
                            const r = parseInt(computedMatch[1]);
                            const g = parseInt(computedMatch[2]);
                            const b = parseInt(computedMatch[3]);
                            // Apply the custom opacity
                            bandColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
                        }
                    }
                }
            }

            // No need to log every time opacity is applied
        }
        const chartWidth = canvas.width - priceScaleWidth;

        // Find visible VWAP points
        const visiblePoints = points.filter(point =>
            point.time >= startTime && point.time <= endTime);

        if (visiblePoints.length < 2) return;

        // Map the first point
        let firstPointBar = null;
        let firstPointIndex = -1;

        for (let i = startIndex; i < endIndex; i++) {
            if (bars[i].time >= visiblePoints[0].time) {
                firstPointBar = bars[i];
                firstPointIndex = i;
                break;
            }
        }

        if (!firstPointBar) return;

        // Draw upper standard deviation band if available
        if (visiblePoints[0].upperBand) {
            ctx.strokeStyle = bandColor;
            ctx.lineWidth = 1;

            // Set a different dash pattern for bands to distinguish from main VWAP line
            // Use a more subtle, shorter dash pattern
            ctx.setLineDash([3, 3]);

            ctx.beginPath();

            const firstX = (firstPointIndex - viewOffset) * barWidth + barWidth / 2;
            const firstUpperY = getYForPrice(visiblePoints[0].upperBand);
            ctx.moveTo(firstX, firstUpperY);

            // Connect all visible points for upper band
            for (let i = 1; i < visiblePoints.length; i++) {
                const point = visiblePoints[i];
                if (!point.upperBand) continue;

                // Find the bar with the closest time
                let closestBar = null;
                let closestIndex = -1;
                let minTimeDiff = Infinity;

                for (let j = firstPointIndex; j < endIndex; j++) {
                    const timeDiff = Math.abs(bars[j].time - point.time);
                    if (timeDiff < minTimeDiff) {
                        minTimeDiff = timeDiff;
                        closestBar = bars[j];
                        closestIndex = j;
                    }
                }

                if (!closestBar) continue;

                const x = (closestIndex - viewOffset) * barWidth + barWidth / 2;
                const y = getYForPrice(point.upperBand);
                ctx.lineTo(x, y);
            }

            ctx.stroke();
        }

        // Draw lower standard deviation band if available
        if (visiblePoints[0].lowerBand) {
            ctx.strokeStyle = bandColor;
            ctx.lineWidth = 1;

            // Use the same dash pattern as the upper band
            ctx.setLineDash([3, 3]);

            ctx.beginPath();

            const firstX = (firstPointIndex - viewOffset) * barWidth + barWidth / 2;
            const firstLowerY = getYForPrice(visiblePoints[0].lowerBand);
            ctx.moveTo(firstX, firstLowerY);

            // Connect all visible points for lower band
            for (let i = 1; i < visiblePoints.length; i++) {
                const point = visiblePoints[i];
                if (!point.lowerBand) continue;

                // Find the bar with the closest time
                let closestBar = null;
                let closestIndex = -1;
                let minTimeDiff = Infinity;

                for (let j = firstPointIndex; j < endIndex; j++) {
                    const timeDiff = Math.abs(bars[j].time - point.time);
                    if (timeDiff < minTimeDiff) {
                        minTimeDiff = timeDiff;
                        closestBar = bars[j];
                        closestIndex = j;
                    }
                }

                if (!closestBar) continue;

                const x = (closestIndex - viewOffset) * barWidth + barWidth / 2;
                const y = getYForPrice(point.lowerBand);
                ctx.lineTo(x, y);
            }

            ctx.stroke();
        }

        // No fill between bands - removed

        // Draw main VWAP line with TradingView-style cross pattern
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineWidth;

        // Set line dash pattern for a cross/dashed style
        // TradingView typically uses a pattern like [6, 3] for VWAP
        ctx.setLineDash([6, 3]);

        ctx.beginPath();

        const firstX = (firstPointIndex - viewOffset) * barWidth + barWidth / 2;
        const firstY = getYForPrice(visiblePoints[0].value);
        ctx.moveTo(firstX, firstY);

        // Connect all visible points
        for (let i = 1; i < visiblePoints.length; i++) {
            const point = visiblePoints[i];

            // Find the bar with the closest time
            let closestBar = null;
            let closestIndex = -1;
            let minTimeDiff = Infinity;

            for (let j = firstPointIndex; j < endIndex; j++) {
                const timeDiff = Math.abs(bars[j].time - point.time);
                if (timeDiff < minTimeDiff) {
                    minTimeDiff = timeDiff;
                    closestBar = bars[j];
                    closestIndex = j;
                }
            }

            if (!closestBar) continue;

            const x = (closestIndex - viewOffset) * barWidth + barWidth / 2;
            const y = getYForPrice(point.value);
            ctx.lineTo(x, y);
        }

        ctx.stroke();

        // Reset line dash to solid for other elements
        ctx.setLineDash([]);

        // Get the last point for label positioning
        const lastPoint = visiblePoints[visiblePoints.length - 1];
        const lastY = getYForPrice(lastPoint.value);
        const lastUpperY = lastPoint.upperBand ? getYForPrice(lastPoint.upperBand) : null;
        const lastLowerY = lastPoint.lowerBand ? getYForPrice(lastPoint.lowerBand) : null;

        // Draw VWAP labels 12 bars away from the right edge
        const labelX = chartWidth - (12 * barWidth);

        // Draw main VWAP label
        ctx.font = 'bold 10px Arial';

        // Use customized color for tags if available
        const tagColor = isPreviousDay ? lineColor : getColor('vwapTags', lineColor);

        // Use the tag color directly for text
        ctx.fillStyle = tagColor;
        ctx.textAlign = 'right';

        // Add PD prefix for previous day labels
        const prefix = isPreviousDay ? 'PD ' : '';

        ctx.fillText(`--- ${prefix}VWAP`, labelX, lastY + 4);

        // Draw upper band label (VAH - Volume-weighted Average High)
        if (lastUpperY) {
            // Use the tag color directly for text
            ctx.fillStyle = tagColor;
            ctx.fillText(`--- ${prefix}VAH`, labelX, lastUpperY + 4);
        }

        // Draw lower band label (VAL - Volume-weighted Average Low)
        if (lastLowerY) {
            // Use the tag color directly for text
            ctx.fillStyle = tagColor;
            ctx.fillText(`--- ${prefix}VAL`, labelX, lastLowerY + 4);
        }

        // No legend in top left anymore
    }

    function updateBarCountdown() {
        // Get the current time
        const now = Date.now();

        // Calculate the current 5-minute interval start time
        // This ensures we're aligned with real clock 5-minute intervals (00:00, 00:05, 00:10, etc.)
        const currentDate = new Date(now);
        const minutes = currentDate.getMinutes();
        const seconds = currentDate.getSeconds();
        const ms = currentDate.getMilliseconds();

        // Calculate the current 5-minute interval start time
        const currentFiveMinInterval = Math.floor(minutes / 5) * 5;
        const intervalStart = new Date(currentDate);
        intervalStart.setMinutes(currentFiveMinInterval);
        intervalStart.setSeconds(0);
        intervalStart.setMilliseconds(0);

        // Update lastBarTime
        lastBarTime = intervalStart.getTime();

        // Calculate minutes to the next 5-minute boundary
        const minutesToNext = 5 - (minutes % 5);
        // Calculate total milliseconds to the next 5-minute boundary
        const msToNext = (minutesToNext * 60 * 1000) - (seconds * 1000) - ms;

        // Calculate seconds remaining until next bar
        barCloseCountdown = Math.max(0, Math.floor(msToNext / 1000));

        // Log the countdown for debugging
        if (barCloseCountdown % 10 === 0) { // Log every 10 seconds to avoid console spam
            console.log(`Next 5-min bar in: ${Math.floor(barCloseCountdown / 60)}:${(barCloseCountdown % 60).toString().padStart(2, '0')}`);
        }
    }

    function startCountdownTimer() {
        // Clear any existing interval
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }

        // Update immediately
        updateBarCountdown();

        // Then update every second
        countdownInterval = setInterval(() => {
            updateBarCountdown();
            // Only redraw if the chart is visible
            if (document.visibilityState === 'visible') {
                drawChart();
            }
        }, 1000);
    }

    function drawTimeScale() {
        if (!ctx || !canvas) return;

        // Use histogramHeight only if bid/ask strength is visible
        const histogramHeightToUse = isBidAskStrengthVisible ? histogramHeight : 0;
        const histogramPaneGapToUse = isBidAskStrengthVisible ? histogramPaneGap : 0;
        const chartWidth = canvas.width - priceScaleWidth;
        const chartHeight = canvas.height - timeScaleHeight - histogramHeightToUse - histogramPaneGapToUse;

        // Draw the bid/ask strength histogram first (if visible)
        drawBidAskStrengthHistogram();

        // Calculate the time scale area
        const timeScaleY = chartHeight + histogramHeightToUse + histogramPaneGapToUse;

        // Fill time scale background with the same color as the chart (TradingView style)
        const bgColor = getColor('background', '#131722');
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, timeScaleY, chartWidth, timeScaleHeight);

        // Draw the space in the bottom right corner (under price scale, right of time scale)
        ctx.fillRect(chartWidth, timeScaleY, priceScaleWidth, timeScaleHeight);

        // Draw horizontal separator line between chart/histogram and time scale (TradingView style)
        ctx.strokeStyle = 'rgba(150, 150, 150, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, timeScaleY);
        ctx.lineTo(canvas.width, timeScaleY);
        ctx.stroke();

        // Draw vertical separator line between time scale and price scale area (TradingView style)
        ctx.strokeStyle = 'rgba(150, 150, 150, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(chartWidth, timeScaleY);
        ctx.lineTo(chartWidth, canvas.height);
        ctx.stroke();

        if (bars.length === 0 || visibleBars <= 0) {
            return;
        }

        const startIndex = Math.max(0, Math.floor(viewOffset));
        const endIndex = Math.min(bars.length, startIndex + Math.ceil(visibleBars));
        const visibleBarsData = bars.slice(startIndex, endIndex);
        const fractionalOffset = viewOffset - startIndex;

        // TradingView-style: Calculate how many labels to show based on available space
        // Adjust spacing to require a bit more zoom to show all time labels
        const minLabelSpacing = 60; // Increased to match TradingView spacing
        const labelInterval = Math.max(1, Math.ceil(minLabelSpacing / barWidth));

        // TradingView-style font settings
        ctx.font = '10px Arial, sans-serif';
        ctx.fillStyle = 'rgba(150, 150, 150, 0.9)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const startX = -fractionalOffset * barWidth;

        // Draw vertical grid lines for each bar (TradingView style)
        visibleBarsData.forEach((bar, i) => {
            const x = startX + i * barWidth + barWidth / 2;

            // Skip if off-screen
            if (x < 0 || x > chartWidth) return;

            // Draw thin vertical grid line for each bar (TradingView style)
            ctx.strokeStyle = 'rgba(70, 70, 70, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, timeScaleY);
            ctx.lineTo(x, timeScaleY + 4); // Short tick mark (TradingView style)
            ctx.stroke();

            // Draw time labels at appropriate intervals
            if (i % labelInterval === 0) {
                const formattedTime = formatTimestamp(bar.time);

                // TradingView-style: Position labels directly under their bars
                ctx.fillStyle = 'rgba(180, 180, 180, 0.9)';
                ctx.fillText(formattedTime, x, timeScaleY + 6);
            }
        });

        // Add future bars if we're at the end of the data (TradingView style)
        if (endIndex >= bars.length && bars.length > 0) {
            const lastBar = bars[bars.length - 1];
            const lastBarTime = lastBar.time;
            const lastBarX = startX + (visibleBarsData.length - 1) * barWidth;

            // Calculate how many future bars we can show
            const availableWidth = chartWidth - lastBarX - barWidth;
            const maxFutureBars = Math.floor(availableWidth / barWidth);

            // Draw future bars (up to 12 or available space - TradingView shows fewer future bars)
            const futureBarsToShow = Math.min(12, maxFutureBars);

            for (let i = 1; i <= futureBarsToShow; i++) {
                // Calculate future bar time (5-minute intervals)
                const futureBarTime = lastBarTime + (barIntervalMs * i);
                const x = lastBarX + (i * barWidth) + barWidth / 2;

                // Skip if off-screen
                if (x < 0 || x > chartWidth) continue;

                // Draw vertical grid line for future bars (lighter style for TradingView)
                ctx.strokeStyle = 'rgba(70, 70, 70, 0.2)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, timeScaleY);
                ctx.lineTo(x, timeScaleY + 4); // Short tick mark
                ctx.stroke();

                // Draw future time labels at appropriate intervals
                if (i % labelInterval === 0) {
                    const formattedTime = formatTimestamp(futureBarTime);
                    ctx.fillStyle = 'rgba(120, 120, 120, 0.7)'; // Lighter color for future times
                    ctx.fillText(formattedTime, x, timeScaleY + 6);
                }
            }
        }
    }

    function drawPriceScale() {
        if (!ctx || !canvas) return;

        // First, save the current context state
        ctx.save();

        // Use the background color from the color customizer
        ctx.fillStyle = getColor('background', '#131722');

        // Fill the price scale area
        ctx.fillRect(canvas.width - priceScaleWidth, 0, priceScaleWidth, canvas.height);

        // Draw vertical separator line between chart and price scale
        // Ensure it extends from top to bottom of the entire canvas
        ctx.strokeStyle = 'rgba(150, 150, 150, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(canvas.width - priceScaleWidth, 0);
        ctx.lineTo(canvas.width - priceScaleWidth, canvas.height);
        ctx.stroke();

        // We don't need to draw a separate line for the top bar area as it's handled differently

        // Use histogramHeight only if bid/ask strength is visible
        const histogramHeightToUse = isBidAskStrengthVisible ? histogramHeight : 0;
        const histogramPaneGapToUse = isBidAskStrengthVisible ? histogramPaneGap : 0;
        const chartHeight = canvas.height - timeScaleHeight - histogramHeightToUse - histogramPaneGapToUse;
        const priceRange = Math.max(1e-6, maxPrice - minPrice);
        const numGridLines = Math.max(2, Math.floor(chartHeight / 50));
        const priceStep = priceRange / numGridLines;

        // We already drew the vertical separator line above, no need to draw it again

        // Use a consistent font size across all devices
        ctx.font = '10px Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        // Get top bid and ask prices and colors for matching
        let topBidPrice = null;
        let topAskPrice = null;
        let bidColor = null;
        let askColor = null;

        // Get minimum dollar value threshold for the current coin
        const currentCoin = window.coinManager && window.coinManager.currentCoin ? window.coinManager.currentCoin.symbol : 'BTC';
        userMinOrderValue = window.coinMinOrderValues[currentCoin] || coinMinOrderValues[currentCoin];
        let minDollarValue = userMinOrderValue * 1000; // Convert from k to actual USD value

        // Find top bid and ask above threshold
        if (orderbook.bids && orderbook.bids.length > 0) {
            const topBid = orderbook.bids.find(bid => bid[2] >= minDollarValue);
            if (topBid) {
                topBidPrice = topBid[0];
                bidColor = getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a'));
            }
        }

        if (orderbook.asks && orderbook.asks.length > 0) {
            const topAsk = orderbook.asks.find(ask => ask[2] >= minDollarValue);
            if (topAsk) {
                topAskPrice = topAsk[0];
                askColor = getColor('bearishCandleBody', getColor('bearishCandle', '#ef5350'));
            }
        }

        for (let i = 0; i <= numGridLines; i++) {
            const price = minPrice + i * priceStep;
            const y = chartHeight - ((price - minPrice) / priceRange) * chartHeight;
            if (isFinite(y)) {
                // Skip drawing price labels where tags will be (bid, ask, current price, countdown)
                let skipLabel = false;

                // Check if this is close to the current price
                let isCurrentPrice = false;
                if (currentPriceY !== null) {
                    if (Math.abs(y - currentPriceY) < 15) {
                        skipLabel = true;
                    }

                    // Check if this price is close to the current price
                    const currentPrice = bars.length > 0 ? bars[bars.length - 1].close : null;
                    if (currentPrice && Math.abs(price - currentPrice) < priceStep * 0.5) {
                        isCurrentPrice = true;
                    }
                }

                // Skip near bid/ask if available
                let isBidPrice = false;
                let isAskPrice = false;

                if (orderbook.bids && orderbook.bids.length > 0) {
                    const bidY = getYForPrice(orderbook.bids[0][0]);
                    if (Math.abs(y - bidY) < 15) {
                        skipLabel = true;
                    }

                    // Check if this price is close to the top bid price
                    if (topBidPrice && Math.abs(price - topBidPrice) < priceStep * 0.5) {
                        isBidPrice = true;
                    }
                }

                if (orderbook.asks && orderbook.asks.length > 0) {
                    const askY = getYForPrice(orderbook.asks[0][0]);
                    if (Math.abs(y - askY) < 15) {
                        skipLabel = true;
                    }

                    // Check if this price is close to the top ask price
                    if (topAskPrice && Math.abs(price - topAskPrice) < priceStep * 0.5) {
                        isAskPrice = true;
                    }
                }

                // Skip near countdown (which is below current price)
                if (currentPriceY !== null && Math.abs(y - (currentPriceY + 25)) < 15) {
                    skipLabel = true;
                }

                if (!skipLabel) {
                    // Set color based on whether this is a bid, ask, or current price
                    if (isCurrentPrice) {
                        // Get color based on price movement - use the same colors as candles
                        const prevBar = bars.length > 1 ? bars[bars.length - 2] : null;
                        const currentPrice = bars[bars.length - 1].close;
                        const priceChange = prevBar ? currentPrice - prevBar.close : 0;
                        const isBullish = priceChange >= 0;
                        const priceColor = isBullish ?
                            getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a')) :
                            getColor('bearishCandleBody', getColor('bearishCandle', '#ef5350'));
                        ctx.fillStyle = priceColor;
                    } else if (isBidPrice && bidColor) {
                        ctx.fillStyle = bidColor;
                    } else if (isAskPrice && askColor) {
                        ctx.fillStyle = askColor;
                    } else {
                        ctx.fillStyle = '#ffffff'; // Default white color
                    }

                    // Move price labels 20px to the left from the right edge of the price scale
                    ctx.fillText(price.toFixed(2), canvas.width - 20, y + 3);
                }
            }
        }

        // Removed price scale drag indicator

        // Store current price and Y position for use in drawBidAskTags
        if (currentPriceY !== null && bars.length > 0) {
            window.currentPriceForTags = {
                price: bars[bars.length - 1].close,
                y: currentPriceY
            };
        }

        // Restore the context state
        ctx.restore();
    }

    function drawChart() {
        try {
            if (!ctx || !canvas) {
                console.error('Canvas or context is not available');
                return;
            }

            // Draw coin indicator in top middle
            drawCoinIndicator();

            // Log that we're drawing the coin indicator
            console.log('Drawing coin indicator for:', window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC');

            // Make drawChart globally accessible
            window.drawChart = drawChart;

            // Initialize VWAP if needed
            if (vwapData.startTime === 0) {
                initializeVwapPeriod();
            }

            // Function to get customized colors
            function getColor(id, defaultColor) {
                if (window.colorCustomizer) {
                    return window.colorCustomizer.getColor(id) || defaultColor;
                }
                return defaultColor;
            }

            // Clear the entire canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Use histogramHeight only if bid/ask strength is visible
            const histogramHeightToUse = isBidAskStrengthVisible ? histogramHeight : 0;
            const histogramPaneGapToUse = isBidAskStrengthVisible ? histogramPaneGap : 0;

            // Fill the chart background (excluding price scale and time scale)
            ctx.fillStyle = getColor('background', '#131722');
            ctx.fillRect(0, 0, canvas.width, canvas.height - timeScaleHeight - histogramHeightToUse - histogramPaneGapToUse);

            // If bid/ask strength is not visible, fill the entire area up to the time scale
            if (!isBidAskStrengthVisible) {
                ctx.fillStyle = getColor('background', '#131722');
                ctx.fillRect(0, canvas.height - timeScaleHeight - histogramHeight - histogramPaneGap, canvas.width, histogramHeight + histogramPaneGap);
            }

            // Set consistent font rendering
            ctx.textBaseline = 'middle';
            ctx.textRendering = 'geometricPrecision';
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            if (bars.length === 0) {
                ctx.fillStyle = '#ffffff';
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Waiting for data...', canvas.width / 2, (canvas.height - timeScaleHeight) / 2);
                ctx.textAlign = 'left';
                // Connection status widget removed
                drawPriceScale();
                drawTimeScale();
                return;
            }

            const startIndex = Math.max(0, Math.floor(viewOffset));
            const endIndex = Math.min(bars.length, startIndex + Math.ceil(visibleBars));
            const visibleBarsData = bars.slice(startIndex, endIndex);
            const fractionalOffset = viewOffset - startIndex;

            // Auto-adjust price scale based on visible candlesticks
            // This happens in two cases:
            // 1. When the chart is first loaded or reset (minPrice = 0, maxPrice = 100000)
            // 2. After horizontal scrolling/zooming to adapt to newly visible candlesticks

            // Check if we should auto-adjust the price scale
            const isInitialOrInvalid =
                (minPrice === 0 && maxPrice === 100000) ||
                (maxPrice - minPrice <= 0) ||
                !isFinite(minPrice) || !isFinite(maxPrice);

            // Auto-adjust in two cases:
            // 1. Initial load or invalid price range
            // 2. After horizontal scrolling (unless price scale was manually set by dragging)
            // This creates the automatic zoom scale that adapts to candlestick positions
            if (isInitialOrInvalid || !isPriceScaleManuallySet) {
                if (visibleBarsData.length > 0) {
                    const lows = visibleBarsData.map(b => b.low).filter(p => !isNaN(p));
                    const highs = visibleBarsData.map(b => b.high).filter(p => !isNaN(p));
                    if (lows.length > 0 && highs.length > 0) {
                        const localMinPrice = Math.min(...lows);
                        const localMaxPrice = Math.max(...highs);
                        const pricePadding = (localMaxPrice - localMinPrice) * 0.1;

                        // For initial load, set directly
                        if (isInitialOrInvalid) {
                            minPrice = localMinPrice - pricePadding;
                            maxPrice = localMaxPrice + pricePadding;
                        } else {
                            // For horizontal scrolling/zooming, smoothly transition
                            const transitionSpeed = 0.3; // Lower = smoother transition
                            minPrice = minPrice + (localMinPrice - pricePadding - minPrice) * transitionSpeed;
                            maxPrice = maxPrice + (localMaxPrice + pricePadding - maxPrice) * transitionSpeed;
                        }

                        if (minPrice === maxPrice) {
                            minPrice -= 1;
                            maxPrice += 1;
                        }
                    } else {
                        minPrice = btcPrice > 0 ? btcPrice * 0.99 : 0;
                        maxPrice = btcPrice > 0 ? btcPrice * 1.01 : 1;
                    }
                } else if (btcPrice > 0) {
                    // If we have a price but no bars, use the current price
                    minPrice = btcPrice * 0.95;
                    maxPrice = btcPrice * 1.05;
                }
            }

            const chartWidth = canvas.width - priceScaleWidth;
            barWidth = chartWidth / visibleBars;
            const candleWidth = Math.max(1, barWidth * 0.8);

            // Removed grid lines drawing code

            // Check if we have any orderbook data to display
            if (orderbook.bids || orderbook.asks) {
                // Find the maximum dollar value for scaling line thickness
                let maxValue = 0;

                // Check bids
                if (orderbook.bids && orderbook.bids.length > 0) {
                    orderbook.bids.forEach(([, , dollarValue]) => {
                        if (dollarValue > maxValue) maxValue = dollarValue;
                    });
                }

                // Check asks
                if (orderbook.asks && orderbook.asks.length > 0) {
                    orderbook.asks.forEach(([, , dollarValue]) => {
                        if (dollarValue > maxValue) maxValue = dollarValue;
                    });
                }

                // If no orders found, use a default value
                if (maxValue === 0) maxValue = 1000000;

                // Draw bid lines if we have any
                if (orderbook.bids && orderbook.bids.length > 0) {
                    orderbook.bids.forEach(([price, , dollarValue]) => {
                        const bidColor = getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a'));
                        // Convert hex to rgba with 0.6 opacity
                        const rgbaColor = bidColor.startsWith('#') ?
                            `rgba(${parseInt(bidColor.slice(1, 3), 16)}, ${parseInt(bidColor.slice(3, 5), 16)}, ${parseInt(bidColor.slice(5, 7), 16)}, 0.6)` :
                            bidColor;
                        drawHeatmapLine(price, dollarValue, rgbaColor, maxValue);
                    });
                }

                // Draw ask lines if we have any
                if (orderbook.asks && orderbook.asks.length > 0) {
                    orderbook.asks.forEach(([price, , dollarValue]) => {
                        const askColor = getColor('bearishCandleBody', getColor('bearishCandle', '#ef5350'));
                        // Convert hex to rgba with 0.6 opacity
                        const rgbaColor = askColor.startsWith('#') ?
                            `rgba(${parseInt(askColor.slice(1, 3), 16)}, ${parseInt(askColor.slice(3, 5), 16)}, ${parseInt(askColor.slice(5, 7), 16)}, 0.6)` :
                            askColor;
                        drawHeatmapLine(price, dollarValue, rgbaColor, maxValue);
                    });
                }

                // Log the number of bids and asks being displayed
                const bidCount = orderbook.bids ? orderbook.bids.length : 0;
                const askCount = orderbook.asks ? orderbook.asks.length : 0;
                console.log(`Drawing orderbook: ${bidCount} bids, ${askCount} asks`);
            }

            const startX = -fractionalOffset * barWidth;
            visibleBarsData.forEach((bar, i) => {
                const x = startX + i * barWidth;
                const candleX = x + (barWidth - candleWidth) / 2;

                // Allow candles to extend right up to the price scale (TradingView style)
                // Only skip if the candle is completely off-screen to the left
                if (candleX + candleWidth < 0) return;

                // For candles that extend into the price scale, clip them at the price scale boundary
                const effectiveCandleWidth = Math.min(candleWidth, canvas.width - priceScaleWidth - candleX);

                const yHigh = getYForPrice(bar.high);
                const yLow = getYForPrice(bar.low);
                const yOpen = getYForPrice(bar.open);
                const yClose = getYForPrice(bar.close);

                if (![yHigh, yLow, yOpen, yClose].every(isFinite)) return;

                const isBullish = bar.close >= bar.open;

                // Get colors for different candle components
                let bodyColor, borderColor, wickColor;

                if (isBullish) {
                    // Bullish candle colors
                    bodyColor = getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a'));
                    borderColor = getColor('bullishCandleBorder', getColor('bullishCandle', '#26a69a'));
                    wickColor = getColor('bullishCandleWick', getColor('bullishCandle', '#26a69a'));
                } else {
                    // Bearish candle colors
                    bodyColor = getColor('bearishCandleBody', getColor('bearishCandle', '#ef5350'));
                    borderColor = getColor('bearishCandleBorder', getColor('bearishCandle', '#ef5350'));
                    wickColor = getColor('bearishCandleWick', getColor('bearishCandle', '#ef5350'));
                }

                // Draw the wick
                ctx.strokeStyle = wickColor;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(candleX + candleWidth / 2, yHigh);
                ctx.lineTo(candleX + candleWidth / 2, yLow);
                ctx.stroke();

                // Calculate body dimensions
                const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
                const bodyY = Math.min(yOpen, yClose);

                // Draw the body fill
                ctx.fillStyle = bodyColor;
                ctx.fillRect(candleX, bodyY, effectiveCandleWidth, bodyHeight);

                // Draw the body border
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = 1;
                ctx.strokeRect(candleX, bodyY, effectiveCandleWidth, bodyHeight);
            });

            // Draw VWAP line
            drawVwap();

            // Draw current price line and store its position for the price tag
            if (bars.length > 0) {
                // No need to calculate chartWidth here as we're using canvas.width directly
                const currentPrice = bars[bars.length - 1].close;
                const priceY = getYForPrice(currentPrice);

                // Draw horizontal line at current price (extending all the way to the price scale)
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(0, priceY);
                ctx.lineTo(canvas.width - priceScaleWidth, priceY);
                ctx.stroke();
                ctx.setLineDash([]);

                // Store the current price Y position for the price scale to use
                currentPriceY = priceY;
            }

            // Draw price scale (will draw the price tag and countdown)
            drawPriceScale();

            // Draw the time scale
            drawTimeScale();

            // Draw bid/ask tags
            drawBidAskTags();

            // Draw liquidation markers if the function is available
            if (typeof window.drawLiquidationMarkers === 'function') {
                // Only log once every 10 seconds to avoid console spam
                const now = Date.now();
                if (!window.lastLiquidationLog || now - window.lastLiquidationLog > 10000) {
                    console.log('Calling drawLiquidationMarkers with:', {
                        barsLength: bars.length,
                        viewOffset: viewOffset,
                        barWidth: barWidth,
                        liquidationManagerExists: !!window.liquidationManager,
                        markersCount: window.liquidationManager ? window.liquidationManager.markers.length : 0
                    });
                    window.lastLiquidationLog = now;
                }
                window.drawLiquidationMarkers(ctx, bars, getYForPrice, barWidth, viewOffset);
            } else {
                console.warn('drawLiquidationMarkers function not available');
            }

            // Draw crosshair if mouse is over the chart
            if (mouseX !== null && mouseY !== null) {
                drawCrosshair();
            }

            // Make price available globally for other components
            if (window.coinManager) {
                const coinSymbol = window.coinManager.getCurrentCoin().symbol.toLowerCase();
                window[`${coinSymbol}Price`] = bars.length > 0 ? bars[bars.length - 1].close : 0;
            } else {
                window.btcPrice = bars.length > 0 ? bars[bars.length - 1].close : 0;
            }
        } catch (error) {
            console.error('Error in drawChart:', error);
        }
    }

    // Connection status widget removed

    // Draw coin indicator in the top middle of the chart
    function drawCoinIndicator() {
        console.log('drawCoinIndicator called');
        if (!ctx || !canvas) {
            console.error('Canvas or context not available for coin indicator');
            return;
        }

        // Get current coin info
        const coin = window.coinManager ? window.coinManager.getCurrentCoin() : { symbol: 'BTC', name: 'Bitcoin' };
        const currentPrice = window[`${coin.symbol.toLowerCase()}Price`] || 0;

        // Format price according to coin's precision
        const formattedPrice = currentPrice.toFixed(coin.pricePrecision || 2);

        // Create indicator text components
        const symbolText = coin.symbol;
        const priceText = `/USDT: ${formattedPrice}`;
        const fullText = `${symbolText}${priceText}`;

        // Set up styles
        ctx.font = 'bold 22px Arial'; // Increased font size for better visibility
        ctx.textAlign = 'center';

        // Calculate position (top center of the chart)
        const x = canvas.width / 2;
        const y = 30; // Position at the top of the chart

        // Log canvas dimensions and position for debugging
        console.log('Canvas dimensions:', canvas.width, 'x', canvas.height);
        console.log('Coin indicator position:', x, y);

        // Measure text dimensions
        const fullWidth = ctx.measureText(fullText).width;
        const padding = 20; // Increased padding
        const logoSpace = 30; // Space for the logo
        const bgWidth = fullWidth + padding * 2 + logoSpace;
        const bgHeight = 44; // Increased height

        // Draw outer shadow for better visibility
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(x - bgWidth / 2 - 3, y - bgHeight / 2 - 3, bgWidth + 6, bgHeight + 6);

        // Draw main background
        ctx.fillStyle = 'rgba(31, 41, 55, 0.95)';
        ctx.fillRect(x - bgWidth / 2, y - bgHeight / 2, bgWidth, bgHeight);

        // Draw border with coin color
        ctx.strokeStyle = coin.color || '#F7931A';
        ctx.lineWidth = 4; // Thicker border
        ctx.strokeRect(x - bgWidth / 2, y - bgHeight / 2, bgWidth, bgHeight);

        // Create a temporary canvas for the logo
        const logoSize = 24;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = logoSize;
        tempCanvas.height = logoSize;
        const tempCtx = tempCanvas.getContext('2d');

        // Draw the cryptocurrency logo
        const logo = new Image();
        logo.src = `images/crypto-logos/${coin.symbol.toLowerCase()}.svg`;

        // Function to draw the logo when it's loaded
        const drawLogoAndText = () => {
            // Draw the logo on the temporary canvas
            tempCtx.drawImage(logo, 0, 0, logoSize, logoSize);

            // No special case for BTC anymore - using the original darker style

            // Draw the logo on the main canvas
            ctx.drawImage(tempCanvas, x - bgWidth/2 + padding/2, y + 6 - logoSize/2, logoSize, logoSize);

            // Draw the coin symbol next to the logo
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillText(coin.symbol, x - bgWidth/2 + logoSize + padding, y + 8);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(coin.symbol, x - bgWidth/2 + logoSize + padding - 2, y + 6);

            // Draw the price text
            ctx.textAlign = 'right';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillText(`/USDT: ${formattedPrice}`, x + bgWidth/2 - padding + 2, y + 8);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`/USDT: ${formattedPrice}`, x + bgWidth/2 - padding, y + 6);
        };

        // Check if the logo is already loaded
        if (logo.complete) {
            drawLogoAndText();
        } else {
            // If not loaded, wait for it to load
            logo.onload = drawLogoAndText;

            // Fallback in case the logo doesn't load
            setTimeout(() => {
                if (!logo.complete) {
                    // Draw text without logo as fallback
                    ctx.textAlign = 'center';
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                    ctx.fillText(`${coin.symbol}/USDT: ${formattedPrice}`, x + 2, y + 8);
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(`${coin.symbol}/USDT: ${formattedPrice}`, x, y + 6);
                }
            }, 500);
        }

        // Reset line width to avoid affecting other drawing operations
        ctx.lineWidth = 1;
    }

    // --- Initialization ---
    function initializeChart() {
        if (!canvas || !ctx) {
            console.error("Canvas or Context failed to initialize.");
            const errorDiv = document.createElement('div');
            errorDiv.textContent = "Error: Could not initialize the chart canvas.";
            errorDiv.style.color = 'red';
            errorDiv.style.padding = '20px';
            errorDiv.style.fontFamily = 'Arial, sans-serif';
            document.body.prepend(errorDiv);
            return;
        }

        // Initialize the top-right-background-fix
        const cornerFix = document.getElementById('top-right-background-fix');
        if (cornerFix) {
            cornerFix.style.width = priceScaleWidth + 'px';
            cornerFix.style.height = '40px'; // Match top sidebar height
            cornerFix.style.backgroundColor = '#131722'; // Match chart background
        }

        // Set canvas styles to remove borders and padding
        canvas.style.display = 'block';
        canvas.style.margin = '0';
        canvas.style.padding = '0';
        document.body.style.margin = '0';  // Ensure the body has no margin either.
        document.body.style.overflow = 'hidden'; // Prevent scrollbars

        canvas.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mousemove', handleMouseHover);
        canvas.addEventListener('wheel', handleWheel, { passive: false });
        canvas.addEventListener('mouseleave', handleMouseLeave);
        canvas.addEventListener('dblclick', handleDoubleClick);
        window.addEventListener('resize', resizeCanvas);

        // Start the bar countdown timer
        startCountdownTimer();

        addResetPriceScaleButton();
        resizeCanvas();
        fetchHistoricalData();
        setupWebSockets();
        drawChart();

        // Make sure buttons are positioned correctly based on saved histogram height
        setTimeout(() => {
            updateButtonPositions();

            // Ensure the color customizer button is visible but don't reposition it
            // It should stay in the sidebar
            if (window.colorCustomizer && window.colorCustomizer.toggleButton) {
                window.colorCustomizer.toggleButton.style.display = 'block';
                // Don't set position properties - let the sidebar control its position
            }
        }, 1000); // Increased delay to ensure all UI elements are created
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeChart);
    } else {
        initializeChart();

        // Initialize the auto-updater after a short delay to ensure DOM is ready
        setTimeout(() => {
            if (window.Updater && window.appVersion) {
                console.log('Initializing auto-updater...');
                const updater = new window.Updater({
                    repoOwner: 'lost-LV', // Replace with your GitHub username
                    repoName: 'dashboard',        // Replace with your repository name
                    currentVersion: window.appVersion.version,
                    checkInterval: 3600000, // Check for updates every hour
                    onUpdateAvailable: (updateInfo) => {
                        console.log(`New version available: ${updateInfo.version}`);
                        // You can add custom notification logic here
                    }
                });

                // Make updater available globally
                window.appUpdater = updater;
                console.log('Auto-updater initialized successfully');
            } else {
                console.error('Updater or appVersion not available');
            }
        }, 1000); // Wait 1 second after page load
    }
    })();

    // Initialize the threshold slider
    function initializeThresholdSlider() {
        console.log('Initializing threshold slider...');
        const slider = document.getElementById('threshold-slider');
        const input = document.getElementById('threshold-input');
        const recommendedButton = document.getElementById('set-recommended');

        if (!slider || !input || !recommendedButton) {
            console.error('Slider, input, or recommended button elements not found!');
            return;
        }

        console.log('Slider and input elements found:', slider, input);

        // Update the slider progress bar
        function updateSliderProgress(slider, value) {
            const min = parseInt(slider.min) || 25;
            const max = parseInt(slider.max) || 1000;
            const progress = ((value - min) / (max - min)) * 100;
            slider.style.setProperty('--slider-progress', `${progress}%`);
        }

        // Update the slider and input based on the current coin
        function updateSliderForCurrentCoin() {
            const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
            const currentValue = window.coinMinOrderValues[currentCoin] || coinMinOrderValues[currentCoin];
            const minValue = coinMinSliderValues[currentCoin] || 25; // Default to 25k for unknown coins
            const recommendedValue = window.coinRecommendedValues[currentCoin] || 400; // Default to 400k for unknown coins

            console.log(`Updating slider for ${currentCoin}: value=${currentValue}, min=${minValue}, recommended=${recommendedValue}`);

            // Update slider attributes for the current coin
            slider.min = minValue;
            slider.value = currentValue;
            input.min = minValue;
            input.value = currentValue;

            // Update the slider progress bar
            updateSliderProgress(slider, currentValue);

            // Update the min delimiter text to show the actual minimum value
            const minDelimiter = document.querySelector('.slider-delimiter.min');
            if (minDelimiter) {
                minDelimiter.textContent = `${minValue}k`;
            }

            // Update the max delimiter text
            const maxDelimiter = document.querySelector('.slider-delimiter.max');
            if (maxDelimiter) {
                maxDelimiter.textContent = '1M';
            }

            // Update the recommended value text
            const recommendedText = document.getElementById('recommended-value');
            if (recommendedText) {
                recommendedText.textContent = `(Recommended: ${recommendedValue}k)`;
            }

            // Update the coin symbol in the label
            const coinLabel = document.getElementById('threshold-coin');
            if (coinLabel) {
                coinLabel.textContent = currentCoin;
            }
        }

        // Initialize with current coin's value
        updateSliderForCurrentCoin();

        // Update when slider changes
        slider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            input.value = value;

            // Update the slider progress bar
            updateSliderProgress(slider, value);

            // Update the value for the current coin
            const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
            window.coinMinOrderValues[currentCoin] = value;
            coinMinOrderValues[currentCoin] = value;

            // Save to localStorage
            localStorage.setItem(`minOrderValue_${currentCoin}`, value);

            // Redraw chart to update heatmap
            drawChart();
        });

        // Update when input changes
        input.addEventListener('change', (e) => {
            let value = parseInt(e.target.value);
            const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
            const minValue = coinMinSliderValues[currentCoin] || 25; // Default to 25k for unknown coins

            // Ensure value is within range
            if (value < minValue) value = minValue;
            if (value > 1000) value = 1000;

            // No rounding for manual input - allow any number
            // Only ensure it's within the valid range

            // Update input and slider
            input.value = value;
            slider.value = value;

            // Update the slider progress bar
            updateSliderProgress(slider, value);

            // Update the value for the current coin
            window.coinMinOrderValues[currentCoin] = value;
            coinMinOrderValues[currentCoin] = value;

            // Save to localStorage
            localStorage.setItem(`minOrderValue_${currentCoin}`, value);

            // Redraw chart to update heatmap
            drawChart();
        });

        // Add event listener for the recommended button
        recommendedButton.addEventListener('click', () => {
            const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
            const recommendedValue = window.coinRecommendedValues[currentCoin] || 400;

            // Update the slider and input values
            slider.value = recommendedValue;
            input.value = recommendedValue;

            // Update the slider progress bar
            updateSliderProgress(slider, recommendedValue);

            // Update the value for the current coin
            window.coinMinOrderValues[currentCoin] = recommendedValue;

            // Save to localStorage
            localStorage.setItem(`minOrderValue_${currentCoin}`, recommendedValue);

            // Redraw chart to update heatmap
            drawChart();
        });

        // Listen for coin changes to update the slider
        document.addEventListener('coinChanged', (event) => {
            console.log('Coin changed event received:', event.detail);
            updateSliderForCurrentCoin();
        });

        // Also listen for the global coin change event
        window.addEventListener('coinChanged', (event) => {
            console.log('Window coin changed event received:', event.detail);
            updateSliderForCurrentCoin();
        });

        // Add direct event listeners to coin buttons as a fallback
        const coinButtons = document.querySelectorAll('.coin-selector-container button');
        coinButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Wait a short time for the coin manager to update
                setTimeout(() => {
                    console.log('Coin button clicked, updating slider');
                    updateSliderForCurrentCoin();
                }, 100);
            });
        });
    }

    // Function to manually update the slider for the current coin
    function updateThresholdSliderForCurrentCoin() {
        console.log('Manually updating threshold slider for current coin');
        const slider = document.getElementById('threshold-slider');
        const input = document.getElementById('threshold-input');
        const recommendedText = document.getElementById('recommended-value');

        if (!slider || !input) {
            console.error('Slider or input elements not found!');
            return;
        }

        const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
        const currentValue = window.coinMinOrderValues[currentCoin] || coinMinOrderValues[currentCoin];
        const minValue = window.coinMinSliderValues[currentCoin] || 25;
        const recommendedValue = window.coinRecommendedValues[currentCoin] || 400;

        console.log(`Manually updating slider for ${currentCoin}: value=${currentValue}, min=${minValue}, recommended=${recommendedValue}`);

        // Update slider attributes for the current coin
        slider.min = minValue;
        slider.value = currentValue;
        input.min = minValue;
        input.value = currentValue;

        // Update the slider progress bar
        const min = parseInt(slider.min) || 25;
        const max = parseInt(slider.max) || 1000;
        const progress = ((currentValue - min) / (max - min)) * 100;
        slider.style.setProperty('--slider-progress', `${progress}%`);

        // Update the min delimiter text
        const minDelimiter = document.querySelector('.slider-delimiter.min');
        if (minDelimiter) {
            minDelimiter.textContent = `${minValue}k`;
        }

        // Update the recommended value text
        if (recommendedText) {
            recommendedText.textContent = `(Recommended: ${recommendedValue}k)`;
        }

        // Update the coin symbol in the label
        const coinLabel = document.getElementById('threshold-coin');
        if (coinLabel) {
            coinLabel.textContent = currentCoin;
        }
    }

    // Initialize the threshold slider when the DOM is fully loaded
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM loaded, initializing threshold slider...');
        // Try multiple times with increasing delays to ensure initialization
        setTimeout(() => initializeThresholdSlider(), 100);
        setTimeout(() => initializeThresholdSlider(), 500);
        setTimeout(() => initializeThresholdSlider(), 1000);

        // Also try to manually update the slider
        setTimeout(() => updateThresholdSliderForCurrentCoin(), 1500);
    });

    // Also try to initialize on window load as a fallback
    window.addEventListener('load', () => {
        console.log('Window loaded, initializing threshold slider...');
        initializeThresholdSlider();
        // Try again after a delay
        setTimeout(() => initializeThresholdSlider(), 1000);
        // Also try to manually update the slider
        setTimeout(() => updateThresholdSliderForCurrentCoin(), 1500);
    });

    // Add a global function to update the slider that can be called from other scripts
    window.updateThresholdSlider = updateThresholdSliderForCurrentCoin;
