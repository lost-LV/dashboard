(() => {
    // Chart features:
    // - Volume Profile: Shows volume distribution across price levels (5-day lookback, 800 rows)
    //   Toggle with the Volume button in the top toolbar
    // - Measurement Tool: Press Shift + Left Click to start measuring, then drag to measure price movements
    //   (You can release Shift after starting). Shows percentage change between two points
    //
    // Function to get customized colors
    function getColor(id, defaultColor) {
        if (window.colorCustomizer) {
            return window.colorCustomizer.getColor(id) || defaultColor;
        }
        return defaultColor;
    }

    // Function to set CSS variables for colors
    function setColorVariables() {
        const bullishColor = getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a'));
        document.documentElement.style.setProperty('--bullish-candle-color', bullishColor);
        console.log('Setting bullish candle color CSS variable to:', bullishColor);

        const bearishColor = getColor('bearishCandleBody', getColor('bearishCandle', '#ef5350'));
        document.documentElement.style.setProperty('--bearish-candle-color', bearishColor);
        console.log('Setting bearish candle color CSS variable to:', bearishColor);
    }

    // Function to determine if a color is bright (needs dark text)
    function isBrightColor(hexColor) {
        // Convert hex to RGB
        let r, g, b;

        if (hexColor.startsWith('#')) {
            // Handle hex color
            const hex = hexColor.substring(1);
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
        } else if (hexColor.startsWith('rgb')) {
            // Handle rgb/rgba color
            const rgbMatch = hexColor.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+)?\s*\)/);
            if (rgbMatch) {
                r = parseInt(rgbMatch[1]);
                g = parseInt(rgbMatch[2]);
                b = parseInt(rgbMatch[3]);
            } else {
                // Default to not bright if can't parse
                return false;
            }
        } else {
            // Default to not bright if unknown format
            return false;
        }

        // Calculate perceived brightness using the formula
        // (0.299*R + 0.587*G + 0.114*B)
        const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // If brightness is greater than 0.65, consider it bright
        return brightness > 0.65;
    }

    // Make the isBrightColor function available globally
    window.isBrightColor = isBrightColor;

    // Function to get appropriate text color based on background color
    function getTextColorForBackground(bgColor) {
        return isBrightColor(bgColor) ? 'black' : 'white';
    }

    // Make the getTextColorForBackground function available globally
    window.getTextColorForBackground = getTextColorForBackground;

    // Function to calculate the exact center position accounting for sidebar
    function calculateCenterPosition() {
        // Check if sidebar is visible
        const isSidebarVisible = document.body.classList.contains('sidebar-visible');
        const sidebarWidth = isSidebarVisible ? 160 : 0; // Match the sidebar width in CSS

        // Calculate the container width accounting for sidebar
        const containerWidth = window.innerWidth - sidebarWidth;

        // Calculate the exact center position using the same formula as the depth pane drag button
        const fullWidth = containerWidth - priceScaleWidth;
        return fullWidth / 2;
    }

    // Make the function globally available
    window.calculateCenterPosition = calculateCenterPosition;



    // Data storage
    let bars = [];
    let orderbook = { bids: [], asks: [] };
    let bidAskTags = [];

    // Variables for building candles from Bitstamp trades
    let currentCandle = null;
    let currentCandleTime = 0;

    // Flag to indicate a coin change is in progress
    let isCoinChangeInProgress = false;

    // Flag to prevent creating multiple bars for the same interval
    let barCreatedForCurrentInterval = false;

    // Make data storage globally accessible
    window.bars = bars;
    window.orderbook = orderbook;
    window.bidAskTags = bidAskTags;
    window.currentCandle = currentCandle;
    window.currentCandleTime = currentCandleTime;

    // Global price variable for current coin
    window.latestPrice = 0;

    let currentPriceY = null; // Y position of current price for price tag

    // Current trading pair
    let currentPair = window.coinManager ? window.coinManager.getCurrentCoin().bybitSymbol : 'BTCUSDT';

    // Timeframe settings
    const TIMEFRAME_1M = 1;
    const TIMEFRAME_5M = 5;
    const TIMEFRAME_15M = 15;
    const TIMEFRAME_1H = 60;
    // Load saved timeframe or default to 5 minute
    let currentTimeframe = localStorage.getItem('currentTimeframe') ? parseInt(localStorage.getItem('currentTimeframe')) : TIMEFRAME_5M;

    // Make timeframe variables globally accessible
    window.TIMEFRAME_1M = TIMEFRAME_1M;
    window.TIMEFRAME_5M = TIMEFRAME_5M;
    window.TIMEFRAME_15M = TIMEFRAME_15M;
    window.TIMEFRAME_1H = TIMEFRAME_1H;
    window.currentTimeframe = currentTimeframe;

    // Bar interval and countdown
    let barIntervalMs = 300000; // 5 minute bars (5 * 60 * 1000 ms) by default
    let barCloseCountdown = 0;
    let countdownInterval = null;

    // Make bar interval globally accessible
    window.barIntervalMs = barIntervalMs;

    // View state
    // Initialize viewOffset to show the most recent bars by default
    let viewOffset = localStorage.getItem('chartViewOffset') ? parseFloat(localStorage.getItem('chartViewOffset')) : 0;
    let visibleBars = localStorage.getItem('chartVisibleBars') ? parseInt(localStorage.getItem('chartVisibleBars')) : 25; // Default to 25 bars
    let mouseX = null, mouseY = null;
    let initialViewOffset = null;
    let isDragging = false;

    // Price scale state
    let minPrice = localStorage.getItem('chartMinPrice') ? parseFloat(localStorage.getItem('chartMinPrice')) : 0;
    let maxPrice = localStorage.getItem('chartMaxPrice') ? parseFloat(localStorage.getItem('chartMaxPrice')) : 100000;
    let isPriceScaleManuallySet = localStorage.getItem('chartPriceScaleManuallySet') === 'true';

    // Crosshair state
    let hoveredBarIndex = -1;
    let hoveredPrice = null;
    let hoveredLimitOrder = null; // Track hovered limit order
    let showZoomLens = false; // Flag to control zoom lens visibility
    let snappedMouseX = null; // For bar-to-bar crosshair movement

    // Line drawing state
    let isLineDrawingMode = localStorage.getItem('isLineDrawingMode') === 'true';
    let isDrawingLine = false;
    let currentLine = null;
    let lines = [];

    // Load saved lines from localStorage
    try {
        const savedLines = localStorage.getItem('chartLines');
        if (savedLines) {
            const parsedLines = JSON.parse(savedLines);

            // Check if lines have the required properties (for backward compatibility)
            lines = parsedLines.filter(line => {
                // Check if line has all required properties
                const hasRequiredProps = (
                    line.startPrice !== undefined &&
                    line.endPrice !== undefined &&
                    line.startBarIndex !== undefined &&
                    line.endBarIndex !== undefined
                );

                // If not, try to convert from old format if possible
                if (!hasRequiredProps && line.startX !== undefined && line.endX !== undefined) {
                    // This is an old format line, we can't properly convert it
                    // Just skip it
                    return false;
                }

                return hasRequiredProps;
            });

            console.log(`Loaded ${lines.length} saved lines from localStorage`);
        }
    } catch (error) {
        console.error('Error loading saved lines:', error);
    }

    // Make line drawing state globally accessible
    window.isLineDrawingMode = isLineDrawingMode;
    window.lines = lines;

    // Function to save lines to localStorage
    function saveLines() {
        try {
            localStorage.setItem('chartLines', JSON.stringify(lines));
            console.log(`Saved ${lines.length} lines to localStorage`);
        } catch (error) {
            console.error('Error saving lines:', error);
        }
    }

    // Function to update the line drawing button state
    function updateLineDrawingButtonState() {
        const button = document.getElementById('line-drawing-toggle-button');
        if (!button) return;

        // Update button appearance based on current state
        if (isLineDrawingMode) {
            button.classList.add('active');
            // Set background color to bullish candle color
            const bullishColor = getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a'));
            button.style.backgroundColor = bullishColor;
            // Set text color based on background brightness
            const textColor = isBrightColor(bullishColor) ? 'black' : 'white';
            button.style.color = textColor;
            console.log('Draw button state updated: bg color =', bullishColor, 'text color =', textColor);
        } else {
            button.classList.remove('active');
            // Reset to default styling
            button.style.backgroundColor = '#2a2e39';
            button.style.color = '#aaa';
        }

        // Make sure timeframe buttons maintain their state
        const activeTimeframeButton = document.querySelector('.timeframe-button[data-timeframe].active');
        if (activeTimeframeButton) {
            const bullishColor = getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a'));
            activeTimeframeButton.style.backgroundColor = bullishColor;
            const textColor = isBrightColor(bullishColor) ? 'black' : 'white';
            activeTimeframeButton.style.color = textColor;
        }
    }

    // Measurement tool state
    let isMeasuring = false;
    let measurementStart = null;
    let measurementEnd = null;
    let isMeasurementToolActive = localStorage.getItem('isMeasurementToolActive') === 'true';

    // Initialize measurement flag in window scope
    window.measurementInitiated = false;

    // Volume Profile state
    let isVolumeProfileVisible = localStorage.getItem('isVolumeProfileVisible') === 'true';
    console.log('Initial volume profile visibility:', isVolumeProfileVisible, 'from localStorage:', localStorage.getItem('isVolumeProfileVisible'));
    let volumeProfileData = {
        pricePoints: [],
        maxVolume: 0,
        totalVolume: 0,
        valueAreaHigh: 0,
        valueAreaLow: 0,
        poc: 0 // Point of Control (price level with highest volume)
    };

    // Make volume profile state globally accessible
    window.isVolumeProfileVisible = isVolumeProfileVisible;
    window.volumeProfileData = volumeProfileData;

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

    // VWAP visibility toggle - read from localStorage or default to false
    let isVwapVisible = localStorage.getItem('isVwapVisible') === 'true';
    // Force it to be true to restore VWAP
    isVwapVisible = true;
    localStorage.setItem('isVwapVisible', 'true');
    // Make it globally accessible
    window.isVwapVisible = isVwapVisible;

    // Bid/Ask strength visibility toggle
    let isBidAskStrengthVisible = localStorage.getItem('isBidAskStrengthVisible') !== 'false'; // Default to true if not set
    // Force it to be true to restore the depth indicators
    isBidAskStrengthVisible = true;
    localStorage.setItem('isBidAskStrengthVisible', 'true');
    // Make it globally accessible
    window.isBidAskStrengthVisible = isBidAskStrengthVisible;
    console.log('Initial depth indicators visibility:', isBidAskStrengthVisible, 'from localStorage:', localStorage.getItem('isBidAskStrengthVisible'));

    // Create a variable to store the unfiltered orderbook data
    let unfilteredOrderbook = { bids: [], asks: [] };

    // Make unfilteredOrderbook globally accessible
    window.unfilteredOrderbook = unfilteredOrderbook;

    // Initialize orderbook with empty arrays to prevent null errors
    orderbook = { bids: [], asks: [] };
    window.orderbook = orderbook;

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
    // minPrice, maxPrice, and isPriceScaleManuallySet are now declared at the top of the file

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
    const histogramPaneGap = 2; // Small gap between histogram panes
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

    function resizeCanvas() {
        if (!canvas) return;

        // Check if sidebar is visible
        const isSidebarVisible = document.body.classList.contains('sidebar-visible');
        const sidebarWidth = isSidebarVisible ? 160 : 0; // Use fixed width instead of DOM measurement

        // Recalculate center position when canvas is resized
        // This will update the global function's calculation
        const centerX = calculateCenterPosition();
        console.log('Center position after resize:', centerX);

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

                // Update global latest price
                window.latestPrice = currentPrice;

                // Format price according to coin's precision
                const formattedPrice = currentPrice.toFixed(coin.pricePrecision);
                document.title = `${formattedPrice}`;
            } else {
                window.latestPrice = currentPrice;
                document.title = `${currentPrice.toFixed(2)}`;
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

        // Set flag to indicate a coin change is in progress
        isCoinChangeInProgress = true;
        console.log(`Coin change in progress flag set to: ${isCoinChangeInProgress}`);

        // Update current pair
        currentPair = coin.bybitSymbol;

        // Reset all chart-related data to prevent any data from the previous coin persisting
        console.log(`Completely resetting all data for coin change to ${coin.symbol}`);

        // Reset current candle data
        currentCandle = null;
        currentCandleTime = 0;
        barCreatedForCurrentInterval = false;

        // Reset global price variable
        window.latestPrice = 0;

        // Update the coin indicator in the top bar via the updateCoinIndicator function
        if (typeof updateCoinIndicator === 'function') {
            updateCoinIndicator();
        }

        // Reset volume profile data for the new coin
        volumeProfileData.pricePoints = [];
        volumeProfileData.maxVolume = 0;
        volumeProfileData.totalVolume = 0;
        volumeProfileData.valueAreaHigh = 0;
        volumeProfileData.valueAreaLow = 0;
        volumeProfileData.poc = 0;

        // If volume profile is visible, recalculate it for the new coin
        if (isVolumeProfileVisible) {
            console.log('Volume profile is visible, recalculating for new coin:', coin.symbol);
            // We'll calculate the volume profile after fetching historical data
        }

        // Update document title
        updateTitle();

        // Clear existing bid/ask tags
        bidAskTags = [];

        // Clear existing orderbook data
        orderbook = { bids: [], asks: [] };

        // Reset chart data
        bars = [];

        // Reset price scale state variables
        isPriceScaleDragging = false;
        priceScaleDragStartY = null;
        priceScaleDragStartMinPrice = null;
        priceScaleDragStartMaxPrice = null;
        isPriceScaleManuallySet = false;
        minPrice = 0;
        maxPrice = 100000; // Force recalculation based on new coin's price range

        console.log(`Price scale reset for ${coin.symbol}:`, {
            isPriceScaleDragging,
            priceScaleDragStartY,
            priceScaleDragStartMinPrice,
            priceScaleDragStartMaxPrice,
            isPriceScaleManuallySet,
            minPrice,
            maxPrice
        });

        // Ensure the sidebar is updated with the new coin
        if (window.shortsLongsRatio) {
            window.shortsLongsRatio.handleCoinChange(coin);
        }

        // Immediately fetch new historical data for the new coin
        // This ensures we have data to display before redrawing the chart
        fetchHistoricalData();

        // Force a chart redraw to ensure the coin indicator is visible if the function exists
        if (typeof drawChart === 'function') {
            // Use a longer timeout to ensure the data is fully loaded and processed
            // This is critical for preventing the large candle issue
            setTimeout(() => {
                // Check if we have valid data before proceeding
                if (bars.length === 0) {
                    console.log('No bars data available yet, waiting longer...');
                    // Wait a bit longer and try again
                    setTimeout(() => {
                        if (bars.length > 0) {
                            console.log(`Bars data now available (${bars.length} bars), proceeding with chart update`);
                            completeChartUpdate();
                        } else {
                            console.warn('Still no bars data available, forcing chart update anyway');
                            completeChartUpdate();
                        }
                    }, 1000);
                } else {
                    completeChartUpdate();
                }
            }, 1000); // Increased timeout to ensure data is fully loaded
        }

        // Helper function to complete the chart update process
        function completeChartUpdate() {
            // If volume profile is visible, calculate it for the new coin
            if (isVolumeProfileVisible && volumeProfileData.pricePoints.length === 0) {
                console.log('Calculating volume profile for new coin after data fetch');
                calculateVolumeProfile();
            }

            // Clear the coin change in progress flag
            isCoinChangeInProgress = false;
            console.log(`Coin change in progress flag cleared: ${isCoinChangeInProgress}`);

            // Now it's safe to draw the chart
            drawChart();

            // Force an update of the sidebar if it exists
            if (window.shortsLongsRatio && typeof window.shortsLongsRatio.updateSidebar === 'function') {
                console.log('Forcing sidebar update after coin change');
                window.shortsLongsRatio.updateSidebar();
            }
        }

        // Unsubscribe from old WebSocket channels
        if (window.bybitWsManager) {
            // Unsubscribe from all liquidation channels for all coins
            Object.values(window.coinManager.coins).forEach(c => {
                const liquidationChannel = `liquidation.${c.bybitSymbol}`;
                window.bybitWsManager.unsubscribe(liquidationChannel);
            });

            // Subscribe to new liquidation channel
            const newLiquidationChannel = `liquidation.${coin.bybitSymbol}`;
            console.log(`Subscribing to new Bybit channel for liquidations: ${newLiquidationChannel}`);
            window.bybitWsManager.subscribe(newLiquidationChannel, (data) => {
                // Process liquidation data here if needed
                if (data.topic && data.data) {
                    console.log('Received liquidation data:', data);
                }
            });
        }

        // Unsubscribe from old Bitstamp channels
        if (window.bitstampWsManager) {
            // Unsubscribe from all orderbook and live trades channels
            Object.values(window.coinManager.coins).forEach(c => {
                const orderBookChannel = `order_book_${c.bitstampSymbol}`;
                const liveTradesChannel = `live_trades_${c.bitstampSymbol}`;
                window.bitstampWsManager.unsubscribe(orderBookChannel);
                window.bitstampWsManager.unsubscribe(liveTradesChannel);
            });

            // Subscribe to new orderbook channel
            const newOrderBookChannel = `order_book_${coin.bitstampSymbol}`;
            console.log(`Subscribing to new Bitstamp channel for orderbook: ${newOrderBookChannel}`);
            window.bitstampWsManager.subscribe(newOrderBookChannel, handleBitstampOrderbook);

            // Subscribe to new live trades channel for candle data
            const newLiveTradesChannel = `live_trades_${coin.bitstampSymbol}`;
            console.log(`Subscribing to new Bitstamp channel for candle data: ${newLiveTradesChannel}`);

            // Reset candle building variables
            currentCandle = null;
            currentCandleTime = 0;

            // Make sure we're using the latest timeframe value
            const tf = window.currentTimeframe || currentTimeframe;

            window.bitstampWsManager.subscribe(newLiveTradesChannel, (data) => {
                if (data.data && data.data.price) {
                    const trade = data.data;
                    const price = parseFloat(trade.price);
                    const timestamp = parseInt(trade.timestamp) * 1000; // Convert to milliseconds

                    // Calculate the start time of the candle this trade belongs to
                    const tradeDate = new Date(timestamp);
                    const minutes = tradeDate.getMinutes();
                    const currentInterval = Math.floor(minutes / tf) * tf;
                    tradeDate.setMinutes(currentInterval);
                    tradeDate.setSeconds(0);
                    tradeDate.setMilliseconds(0);
                    const candleTime = tradeDate.getTime();

                    // If this is a new candle or we don't have a current candle
                    if (!currentCandle || candleTime !== currentCandleTime) {
                        // If we have a current candle, finalize it and add it to bars
                        if (currentCandle) {
                            // Process the completed candle
                            processNewBar(currentCandle);
                        }

                        // Start a new candle
                        currentCandle = {
                            time: candleTime,
                            open: price,
                            high: price,
                            low: price,
                            close: price
                        };
                        currentCandleTime = candleTime;
                    } else {
                        // Update the current candle with this trade
                        currentCandle.high = Math.max(currentCandle.high, price);
                        currentCandle.low = Math.min(currentCandle.low, price);
                        currentCandle.close = price; // Last price becomes the close
                    }

                    // Use throttled version of drawChart for better performance
                    throttledPriceUpdate();
                }
            });
        }

        // Reset chart data - completely clear all arrays
        bars = [];
        orderbook = { bids: [], asks: [] };

        // Also reset the unfiltered orderbook
        if (window.unfilteredOrderbook) {
            window.unfilteredOrderbook = { bids: [], asks: [] };
        }

        // Reset price scale - force a complete recalculation for the new coin
        isPriceScaleManuallySet = false;
        minPrice = 0;
        maxPrice = 100000;

        // Log that we're completely resetting the price scale for the new coin
        console.log(`Completely resetting price scale for ${coin.symbol}`);

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
        // Make this function globally accessible
        window.processNewBar = processNewBar;

        // Debug logging for bar updates
        const debugTime = new Date();
        console.log(`[${debugTime.toISOString()}] Processing bar update:`, {
            time: new Date(newBar.time).toISOString(),
            open: newBar.open,
            high: newBar.high,
            low: newBar.low,
            close: newBar.close
        });

        // Check if we have a latest price from the real-time updater
        if (window.realTimeUpdater && window.realTimeUpdater.getLatestPrice) {
            const latestPrice = window.realTimeUpdater.getLatestPrice();
            if (latestPrice !== null) {
                console.log(`processNewBar: Using latest price from realTimeUpdater: ${latestPrice}`);

                // Always use the latest price for the close
                newBar.close = latestPrice;
                newBar.high = Math.max(newBar.high, latestPrice);
                newBar.low = Math.min(newBar.low, latestPrice);
            }
        }

        // Find the index where this bar should be inserted or updated
        const existingBarIndex = bars.findIndex(b => b.time === newBar.time);

        if (existingBarIndex >= 0) {
            // Update existing bar
            console.log(`Updating existing bar at index ${existingBarIndex}:`, {
                old: {
                    open: bars[existingBarIndex].open,
                    high: bars[existingBarIndex].high,
                    low: bars[existingBarIndex].low,
                    close: bars[existingBarIndex].close
                },
                new: {
                    open: newBar.open,
                    high: newBar.high,
                    low: newBar.low,
                    close: newBar.close
                }
            });
            bars[existingBarIndex] = newBar;

            // If this is the current candle, update the currentCandle reference
            if (newBar.time === currentCandleTime) {
                currentCandle = newBar;
                console.log('Updated currentCandle reference');
            }
        } else {
            // Insert new bar (maintaining chronological order)
            let insertIndex = bars.length;
            for (let i = bars.length - 1; i >= 0; i--) {
                if (bars[i].time < newBar.time) {
                    insertIndex = i + 1;
                    break;
                }
            }
            console.log(`Adding new bar at index ${insertIndex}, time ${new Date(newBar.time).toISOString()}`);
            bars.splice(insertIndex, 0, newBar);

            // If this is the current candle time, update the currentCandle reference
            if (newBar.time === currentCandleTime) {
                currentCandle = newBar;
                console.log('Set currentCandle reference to new bar');
            }

            // If we're viewing the most recent bars, adjust viewOffset to keep showing the latest
            if (viewOffset + visibleBars >= bars.length - 1) {
                // Add padding of 10% of visible bars to ensure space between newest candle and price scale
                const rightPadding = Math.ceil(visibleBars * 0.1);
                // Only auto-adjust if we're not scrolled into the future area
                if (viewOffset < bars.length - visibleBars + rightPadding) {
                    viewOffset = Math.max(0, bars.length - visibleBars + rightPadding);
                    console.log(`Auto-adjusted view offset to ${viewOffset}`);
                }
            }
        }

        // Force a chart update
        if (window.drawChart) {
            console.log('Forcing chart update from processNewBar');
            window.drawChart();
        }

        // Determine if this is the current interval bar based on the current timeframe
        const now = new Date();
        const intervalStart = new Date(now);
        const minutes = intervalStart.getMinutes();
        // Make sure we're using the latest timeframe value
        const tf = window.currentTimeframe || currentTimeframe;
        const currentInterval = Math.floor(minutes / tf) * tf;
        intervalStart.setMinutes(currentInterval);
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

        // Use requestAnimationFrame for smoother updates
        requestChartUpdate();

        // Update the bar countdown timer
        updateBarCountdown();
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

        // Process orderbook data for whale watcher if available
        if (window.whaleWatcher && typeof window.whaleWatcher.processOrderbook === 'function') {
            console.log('Sending orderbook data to whale watcher');
            window.whaleWatcher.processOrderbook(data);
        } else {
            console.log('Whale watcher not available or missing processOrderbook method');
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

                // Performance optimization: Reduce logging frequency
                if (Math.random() < 0.1) { // Only log 10% of updates to reduce console spam
                    console.log(`Processing ${currentCoin} orderbook data with ${data.data.bids.length} bids and ${data.data.asks.length} asks`);
                }

                const rawBids = data.data.bids;
                const rawAsks = data.data.asks;
                const currentPrice = bars.length > 0 ? bars[bars.length - 1].close : 0;
                if (currentPrice === 0) {
                    console.log(`Skipping orderbook update for ${currentCoin} because currentPrice is 0`);
                    return;
                }

                // Store price in the global variable
                window.latestPrice = currentPrice;

                // Clear existing orderbook data for both filtered and unfiltered orderbooks
                // Use new arrays instead of clearing existing ones to avoid potential race conditions
                const newOrderbookBids = [];
                const newOrderbookAsks = [];
                const newUnfilteredOrderbookBids = [];
                const newUnfilteredOrderbookAsks = [];

                // Get minimum dollar value threshold for the current coin
                userMinOrderValue = window.coinMinOrderValues[currentCoin] || coinMinOrderValues[currentCoin];
                let minDollarValue = userMinOrderValue * 1000; // Convert from k to actual USD value

                // Process bids and asks in parallel using array methods for better performance
                // Process bids
                rawBids.forEach(order => {
                    const price = parseFloat(order[0]);
                    const size = parseFloat(order[1]);
                    const dollarValue = price * size; // Simplified calculation

                    // Add to unfiltered orderbook
                    newUnfilteredOrderbookBids.push([price, size, dollarValue]);

                    // Only add orders above the threshold to filtered orderbook
                    if (dollarValue >= minDollarValue) {
                        newOrderbookBids.push([price, size, dollarValue]);
                    }
                });

                // Process asks
                rawAsks.forEach(order => {
                    const price = parseFloat(order[0]);
                    const size = parseFloat(order[1]);
                    const dollarValue = price * size; // Simplified calculation

                    // Add to unfiltered orderbook
                    newUnfilteredOrderbookAsks.push([price, size, dollarValue]);

                    // Only add orders above the threshold to filtered orderbook
                    if (dollarValue >= minDollarValue) {
                        newOrderbookAsks.push([price, size, dollarValue]);
                    }
                });

                // Sort and limit the orderbooks
                // Sort by dollar value (descending) and take top 20
                newOrderbookBids.sort((a, b) => b[2] - a[2]);
                newOrderbookAsks.sort((a, b) => b[2] - a[2]);
                newUnfilteredOrderbookBids.sort((a, b) => b[2] - a[2]);
                newUnfilteredOrderbookAsks.sort((a, b) => b[2] - a[2]);

                // Limit to top 20 entries
                const limitedOrderbookBids = newOrderbookBids.slice(0, 20);
                const limitedOrderbookAsks = newOrderbookAsks.slice(0, 20);
                const limitedUnfilteredOrderbookBids = newUnfilteredOrderbookBids.slice(0, 20);
                const limitedUnfilteredOrderbookAsks = newUnfilteredOrderbookAsks.slice(0, 20);

                // Sort by price for display
                limitedOrderbookBids.sort((a, b) => b[0] - a[0]); // Descending for bids
                limitedOrderbookAsks.sort((a, b) => a[0] - b[0]); // Ascending for asks
                limitedUnfilteredOrderbookBids.sort((a, b) => b[0] - a[0]);
                limitedUnfilteredOrderbookAsks.sort((a, b) => a[0] - b[0]);

                // Update the orderbooks atomically to avoid race conditions
                orderbook.bids = limitedOrderbookBids;
                orderbook.asks = limitedOrderbookAsks;
                unfilteredOrderbook.bids = limitedUnfilteredOrderbookBids;
                unfilteredOrderbook.asks = limitedUnfilteredOrderbookAsks;

                // Make sure the global unfilteredOrderbook is updated
                window.unfilteredOrderbook = unfilteredOrderbook;

                // Update the shorts vs longs ratio sidebar if it exists
                if (window.shortsLongsRatio && typeof window.shortsLongsRatio.handleOrderbookUpdate === 'function') {
                    window.shortsLongsRatio.handleOrderbookUpdate(data);
                }

                // Performance optimization: Reduce logging frequency
                if (Math.random() < 0.1) { // Only log 10% of updates
                    console.log(`Processed orderbook: ${orderbook.bids.length} bids, ${orderbook.asks.length} asks above ${minDollarValue} USD`);
                }

                // Add timestamp to track when orderbook update was received
                const updateTimestamp = Date.now();
                window.lastOrderbookUpdateTime = updateTimestamp;

                // Use throttled version of drawChart for better performance
                throttledDrawChart();

                // Debug: Log time between orderbook update and chart redraw
                const drawStartTime = Date.now();
                window.lastDrawStartTime = drawStartTime;

                // Add a callback to measure rendering time after the throttled draw completes
                setTimeout(() => {
                    if (window.lastDrawStartTime === drawStartTime) {
                        const renderTime = Date.now() - updateTimestamp;
                        // Only log occasionally to reduce console spam
                        if (Math.random() < 0.05) { // 5% of updates
                            console.log(`Orderbook render time: ${renderTime}ms (update to screen)`);
                        }
                    }
                }, 100); // Check after expected throttle time
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

        // Log VWAP visibility state
        console.log('VWAP button initialized with visibility:', isVwapVisible);

        // Add feature icon and text
        const featureIcon = document.createElement('span');
        featureIcon.className = 'feature-icon';
        button.appendChild(featureIcon);

        // Add text after the icon
        const textNode = document.createTextNode('VWAP');
        button.appendChild(textNode);

        // Set initial button appearance based on VWAP visibility
        if (isVwapVisible) {
            button.classList.remove('inactive');
            console.log('VWAP button initially active');
        } else {
            button.classList.add('inactive');
            console.log('VWAP button initially inactive');
        }

        // Add click event listener
        button.addEventListener('click', () => {
            // Toggle VWAP visibility
            isVwapVisible = !isVwapVisible;
            // Update global variable
            window.isVwapVisible = isVwapVisible;
            localStorage.setItem('isVwapVisible', isVwapVisible.toString()); // Store as string 'true' or 'false'
            console.log('VWAP visibility toggled:', isVwapVisible);

            // Update button appearance
            if (isVwapVisible) {
                button.classList.remove('inactive');
                console.log('VWAP button active');
            } else {
                button.classList.add('inactive');
                console.log('VWAP button inactive');
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

    function addVolumeProfileToggleButton() {
        // Get the top sidebar container
        const topSidebar = document.getElementById('top-sidebar');
        if (!topSidebar) {
            console.error('Top sidebar not found');
            return;
        }

        // Create a container for the volume profile button
        const volumeProfileButtonContainer = document.createElement('div');
        volumeProfileButtonContainer.className = 'volume-profile-button-container';
        volumeProfileButtonContainer.style.display = 'flex';
        volumeProfileButtonContainer.style.alignItems = 'center';
        volumeProfileButtonContainer.style.marginLeft = '15px';

        // Create the button with its own styling
        const button = document.createElement('button');
        button.className = isVolumeProfileVisible ? 'active' : '';
        button.id = 'volume-profile-toggle-button';
        // Let CSS handle the styling

        // Add text to the button
        button.textContent = 'Volume Profile';

        // Add click event listener with debounce to prevent multiple rapid clicks
        let isCalculating = false;
        button.addEventListener('click', () => {
            // Prevent multiple clicks while calculating
            if (isCalculating) {
                console.log('Volume profile calculation in progress, ignoring click');
                return;
            }

            console.log('Volume profile button clicked');
            // Store the current POC value before toggling
            const previousPoc = volumeProfileData.poc;
            const previousValueAreaHigh = volumeProfileData.valueAreaHigh;
            const previousValueAreaLow = volumeProfileData.valueAreaLow;

            // Toggle volume profile visibility
            isVolumeProfileVisible = !isVolumeProfileVisible;
            window.isVolumeProfileVisible = isVolumeProfileVisible;
            localStorage.setItem('isVolumeProfileVisible', isVolumeProfileVisible.toString()); // Store as string 'true' or 'false'
            console.log('Volume profile visibility toggled:', isVolumeProfileVisible);

            // Update button appearance
            if (isVolumeProfileVisible) {
                // Show loading state
                button.classList.add('active');
                button.textContent = 'Loading...';
                button.style.backgroundColor = '#555';
                button.style.color = 'white';
                isCalculating = true;

                // If we have previous POC data, preserve it
                if (previousPoc > 0) {
                    console.log('Preserving previous POC value:', previousPoc);
                    // Keep the POC data but recalculate the price points
                    volumeProfileData.pricePoints = [];
                    // We'll restore the POC after calculation
                } else {
                    // No previous POC, do a full recalculation
                    console.log('No previous POC data, doing full recalculation');
                    volumeProfileData.pricePoints = [];
                    volumeProfileData.poc = 0;
                    volumeProfileData.valueAreaHigh = 0;
                    volumeProfileData.valueAreaLow = 0;
                }

                // Use setTimeout to make the calculation asynchronous
                setTimeout(() => {
                    try {
                        // Calculate the volume profile
                        calculateVolumeProfile();

                        // If we had a previous POC and we're preserving it, restore it now
                        if (previousPoc > 0) {
                            // Check if the new POC is significantly different from the previous one
                            const newPoc = volumeProfileData.poc;
                            const pocDifference = Math.abs(newPoc - previousPoc) / previousPoc;

                            // If the difference is less than 5%, keep the previous POC for consistency
                            if (pocDifference < 0.05) {
                                console.log(`New POC (${newPoc}) is close to previous POC (${previousPoc}), keeping previous for consistency`);
                                volumeProfileData.poc = previousPoc;

                                // Also restore Value Area High and Low if they're valid
                                if (previousValueAreaHigh > 0 && previousValueAreaLow > 0) {
                                    // Only restore if they're within a reasonable range of the new values
                                    const vahDifference = Math.abs(volumeProfileData.valueAreaHigh - previousValueAreaHigh) / previousValueAreaHigh;
                                    const valDifference = Math.abs(volumeProfileData.valueAreaLow - previousValueAreaLow) / previousValueAreaLow;

                                    if (vahDifference < 0.05 && valDifference < 0.05) {
                                        console.log(`Restoring previous VAH (${previousValueAreaHigh}) and VAL (${previousValueAreaLow}) for consistency`);
                                        volumeProfileData.valueAreaHigh = previousValueAreaHigh;
                                        volumeProfileData.valueAreaLow = previousValueAreaLow;
                                    } else {
                                        console.log(`New VAH/VAL too different from previous, using new values`);
                                    }
                                }
                            } else {
                                console.log(`New POC (${newPoc}) is significantly different from previous POC (${previousPoc}), using new POC`);
                            }
                        }

                        // Update button appearance after calculation
                        const bullishColor = getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a'));
                        button.style.backgroundColor = bullishColor;
                        // Use white or black text depending on background brightness
                        const textColor = isBrightColor(bullishColor) ? 'black' : 'white';
                        button.style.color = textColor;
                        button.textContent = 'Volume Profile';
                        console.log('Volume button active: bg color =', bullishColor, 'text color =', textColor);

                        // Redraw chart
                        drawChart();
                    } catch (error) {
                        console.error('Error calculating volume profile:', error);
                        // Reset button if there's an error
                        button.classList.remove('active');
                        button.style.backgroundColor = '#2a2e39';
                        button.style.color = '#aaa';
                        button.textContent = 'Volume Profile';
                        isVolumeProfileVisible = false;
                        window.isVolumeProfileVisible = false;
                        localStorage.setItem('isVolumeProfileVisible', 'false');
                    } finally {
                        isCalculating = false;
                    }
                }, 50); // Small delay to allow UI to update
            } else {
                button.classList.remove('active');
                // Reset to default styling
                button.style.backgroundColor = '#2a2e39';
                button.style.color = '#aaa';

                // Redraw chart
                drawChart();
            }

            // Make sure timeframe buttons maintain their state
            const activeTimeframeButton = document.querySelector('.timeframe-button[data-timeframe].active');
            if (activeTimeframeButton) {
                const bullishColor = getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a'));
                activeTimeframeButton.style.backgroundColor = bullishColor;
                const textColor = isBrightColor(bullishColor) ? 'black' : 'white';
                activeTimeframeButton.style.color = textColor;
            }
        });

        // No settings button - settings are accessible through the main settings menu

        // Add the button to the container
        volumeProfileButtonContainer.appendChild(button);

        // Add the container to the top sidebar
        topSidebar.appendChild(volumeProfileButtonContainer);
    }

    // Function to add coin indicator to the top bar
    function addCoinIndicatorToTopBar() {
        // Create a container for the coin indicator
        const coinIndicatorContainer = document.createElement('div');
        coinIndicatorContainer.id = 'coin-indicator-top-bar';

        // Create the coin symbol element
        const coinSymbolElement = document.createElement('div');
        coinSymbolElement.id = 'coin-symbol-top-bar';
        coinSymbolElement.textContent = 'BTC'; // Default value, will be updated by coin-indicator.js

        // Add the coin symbol to the container
        coinIndicatorContainer.appendChild(coinSymbolElement);

        // Add the container to the top sidebar
        const topSidebar = document.getElementById('top-sidebar');
        if (topSidebar) {
            // Check if we need to create a middle container for the coin indicator
            let middleContainer = document.getElementById('top-sidebar-middle');
            if (!middleContainer) {
                // Create containers for left, middle, and right sections
                const leftContainer = document.createElement('div');
                leftContainer.id = 'top-sidebar-left';
                leftContainer.style.display = 'flex';
                leftContainer.style.alignItems = 'center';
                leftContainer.style.flex = '1';

                middleContainer = document.createElement('div');
                middleContainer.id = 'top-sidebar-middle';
                middleContainer.style.display = 'flex';
                middleContainer.style.alignItems = 'center';
                middleContainer.style.justifyContent = 'center';
                middleContainer.style.flex = '1';

                const rightContainer = document.createElement('div');
                rightContainer.id = 'top-sidebar-right';
                rightContainer.style.display = 'flex';
                rightContainer.style.alignItems = 'center';
                rightContainer.style.justifyContent = 'flex-end';
                rightContainer.style.flex = '1';

                // Move existing elements to appropriate containers
                while (topSidebar.firstChild) {
                    const child = topSidebar.firstChild;
                    if (child.id === 'threshold-slider-container') {
                        rightContainer.appendChild(child);
                    } else {
                        leftContainer.appendChild(child);
                    }
                }

                // Add the containers to the top sidebar
                topSidebar.appendChild(leftContainer);
                topSidebar.appendChild(middleContainer);
                topSidebar.appendChild(rightContainer);
            }

            // Add the coin indicator to the middle container
            middleContainer.appendChild(coinIndicatorContainer);
        }
    }

    function addMeasurementToolButton() {
        // Create a container for the button
        const measurementToolButtonContainer = document.createElement('div');
        measurementToolButtonContainer.className = 'measurement-tool-button-container';
        measurementToolButtonContainer.style.display = 'flex';
        measurementToolButtonContainer.style.alignItems = 'center';
        measurementToolButtonContainer.style.marginLeft = '15px';

        // Create the button with its own styling
        const button = document.createElement('button');
        button.className = isMeasurementToolActive ? 'active' : '';
        button.id = 'measurement-tool-toggle-button';
        // Let CSS handle the styling

        // Add text to the button
        button.textContent = 'Measure';

        // Add debug click handler to verify button is receiving clicks
        button.addEventListener('click', (event) => {
            console.log('Measure button clicked!', event);

            // Toggle measurement tool active state
            isMeasurementToolActive = !isMeasurementToolActive;
            localStorage.setItem('isMeasurementToolActive', isMeasurementToolActive);
            console.log('Measurement tool active state:', isMeasurementToolActive);

            // Update button appearance
            if (isMeasurementToolActive) {
                button.classList.add('active');
                // Set background color to bullish candle color
                const bullishColor = getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a'));
                button.style.backgroundColor = bullishColor;
                // Set text color based on background brightness
                const textColor = isBrightColor(bullishColor) ? 'black' : 'white';
                button.style.color = textColor;
                console.log('Measurement button active: bg color =', bullishColor, 'text color =', textColor);
                // Don't set canvas cursor here - it will be set in drawChart
            } else {
                button.classList.remove('active');
                // Reset to default styling
                button.style.backgroundColor = '#2a2e39';
                button.style.color = '#aaa';
                // Don't set canvas cursor here - it will be set in drawChart
                // Clear any active measurement
                isMeasuring = false;
                window.measurementInitiated = false;
                measurementStart = null;
                measurementEnd = null;
                if (window.measurementClearTimeout) {
                    clearTimeout(window.measurementClearTimeout);
                    window.measurementClearTimeout = null;
                }
            }

            // Redraw chart
            drawChart();

            // Make sure timeframe buttons maintain their state
            const activeTimeframeButton = document.querySelector('.timeframe-button[data-timeframe].active');
            if (activeTimeframeButton) {
                const bullishColor = getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a'));
                activeTimeframeButton.style.backgroundColor = bullishColor;
                const textColor = isBrightColor(bullishColor) ? 'black' : 'white';
                activeTimeframeButton.style.color = textColor;
            }
        });

        // Add the button to the container
        measurementToolButtonContainer.appendChild(button);

        // Add the container to the top sidebar
        const topSidebar = document.getElementById('top-sidebar');
        if (topSidebar) {
            topSidebar.appendChild(measurementToolButtonContainer);
        }
    }

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

        // Add line drawing toggle button
        addLineDrawingToggleButton();

        // Add volume profile toggle button
        addVolumeProfileToggleButton();

        // Add measurement tool toggle button
        addMeasurementToolButton();

        // Add coin indicator to top bar - after the measurement tool button
        // This ensures it appears to the right of the measure button
        addCoinIndicatorToTopBar();
    }

    function addLineDrawingToggleButton() {
        // Get the top sidebar container
        const topSidebar = document.getElementById('top-sidebar');
        if (!topSidebar) {
            console.error('Top sidebar not found');
            return;
        }

        // Create a container for the line drawing button
        const lineButtonContainer = document.createElement('div');
        lineButtonContainer.className = 'line-drawing-button-container';
        lineButtonContainer.style.display = 'flex';
        lineButtonContainer.style.alignItems = 'center';
        lineButtonContainer.style.marginLeft = '15px';

        // Create the button with its own styling
        const button = document.createElement('button');
        button.className = isLineDrawingMode ? 'active' : '';
        button.id = 'line-drawing-toggle-button';
        // Let CSS handle the styling

        // Add text to the button
        button.textContent = 'Draw';

        // Add click event listener
        button.addEventListener('click', () => {
            // Toggle line drawing mode
            isLineDrawingMode = !isLineDrawingMode;
            window.isLineDrawingMode = isLineDrawingMode;
            localStorage.setItem('isLineDrawingMode', isLineDrawingMode);

            // Update button appearance
            if (isLineDrawingMode) {
                button.classList.add('active');
                // Set background color to bullish candle color
                const bullishColor = getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a'));
                button.style.backgroundColor = bullishColor;
                // Set text color based on background brightness
                const textColor = isBrightColor(bullishColor) ? 'black' : 'white';
                button.style.color = textColor;
                console.log('Draw button active: bg color =', bullishColor, 'text color =', textColor);
                canvas.style.cursor = 'crosshair';
            } else {
                button.classList.remove('active');
                // Reset to default styling
                button.style.backgroundColor = '#2a2e39';
                button.style.color = '#aaa';
                canvas.style.cursor = 'default';
                // Cancel any in-progress line drawing
                isDrawingLine = false;
                currentLine = null;
            }

            // Redraw chart
            drawChart();

            // Make sure timeframe buttons maintain their state
            const activeTimeframeButton = document.querySelector('.timeframe-button[data-timeframe].active');
            if (activeTimeframeButton) {
                const bullishColor = getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a'));
                activeTimeframeButton.style.backgroundColor = bullishColor;
                const textColor = isBrightColor(bullishColor) ? 'black' : 'white';
                activeTimeframeButton.style.color = textColor;
            }
        });

        // Add the button to the container
        lineButtonContainer.appendChild(button);

        // Simply add the button to the top sidebar
        // The CSS order property will ensure it's positioned correctly
        topSidebar.appendChild(lineButtonContainer);
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

            // Dispatch a custom event to notify other components about sidebar toggle
            document.dispatchEvent(new CustomEvent('sidebarToggled'));

            // Center elements no longer need to be updated
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

    // Removed updateCenterElements function as it's no longer needed

    // Function to update the coin symbol - removed as we now only use the top bar indicator

    // Removed addMadeByText function as it's no longer needed

    // updateVwapButtonAppearance function removed - now handled by DOM utilities

    // --- Data Fetching ---
    function fetchHistoricalData() {
        // Make this function globally accessible
        window.fetchHistoricalData = fetchHistoricalData;

        // Get current trading pair from coin manager
        let bitstampSymbol;
        if (window.coinManager) {
            currentPair = window.coinManager.getCurrentCoin().bybitSymbol; // Keep for reference
            bitstampSymbol = window.coinManager.getCurrentCoin().bitstampSymbol;
        } else {
            bitstampSymbol = 'btcusd'; // Default fallback
        }

        // Ensure we completely reset the bars array when fetching historical data for a new coin
        // This prevents any old data from the previous coin from persisting
        bars = [];

        // Make sure we're using the latest timeframe value
        const tf = window.currentTimeframe || currentTimeframe;
        // Convert timeframe to seconds for Bitstamp API
        const tfSeconds = tf * 60;

        // Get the current coin symbol for logging
        const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
        console.log(`Fetching historical data for ${currentCoin} (${bitstampSymbol}) from Bitstamp with ${tf}m timeframe`);

        // Calculate timestamps for fetching data in chunks
        // Bitstamp has a limit of 1000 bars per request, so we'll fetch in chunks
        const now = Math.floor(Date.now() / 1000); // Current time in seconds
        const barsNeeded = 2000; // We want 2000 bars total
        const chunkSize = 1000; // Bitstamp's limit per request
        const timePerBar = tf * 60; // Time per bar in seconds
        const totalTimeNeeded = timePerBar * barsNeeded; // Total time range in seconds
        const startTime = now - totalTimeNeeded; // Start time in seconds

        // We don't need this array since we're using processedBars
        // let allBars = [];

        // Function to fetch a chunk of data
        const fetchChunk = (start, end, limit) => {
            const url = `https://www.bitstamp.net/api/v2/ohlc/${bitstampSymbol}/`;
            const params = new URLSearchParams({
                step: tfSeconds,
                limit: limit,
                start: start,
                end: end
            });

            return fetch(`${url}?${params.toString()}`)
                .then(response => response.json())
                .then(data => {
                    if (data && data.data && data.data.ohlc) {
                        return data.data.ohlc;
                    } else {
                        console.error(`Invalid response from Bitstamp for ${currentCoin}:`, data);
                        return [];
                    }
                })
                .catch(error => {
                    console.error(`Fetch error from Bitstamp for ${currentCoin}:`, error);
                    return [];
                });
        };

        // Fetch data in two chunks to ensure we get enough bars
        const chunk1End = now;
        const chunk1Start = now - (totalTimeNeeded / 2);
        const chunk2End = chunk1Start;
        const chunk2Start = startTime;

        // First fetch the more recent chunk
        fetchChunk(chunk1Start, chunk1End, chunkSize)
            .then(chunk1Bars => {
                // Then fetch the older chunk
                return fetchChunk(chunk2Start, chunk2End, chunkSize)
                    .then(chunk2Bars => {
                        // Combine the chunks
                        const combinedBars = [...chunk2Bars, ...chunk1Bars];

                        // Process the bars
                        if (combinedBars.length > 0) {
                            // Parse and validate historical bars
                            // Make sure we start with a clean array
                            bars = [];

                            // Get current coin for validation
                            const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
                            console.log(`Processing historical data for ${currentCoin}`);

                            // Process the bars and add them to the bars array
                            const processedBars = combinedBars
                                .map(bar => {
                                    // Parse values
                                    const time = parseInt(bar.timestamp) * 1000; // Convert to milliseconds
                                    const open = parseFloat(bar.open);
                                    const high = parseFloat(bar.high);
                                    const low = parseFloat(bar.low);
                                    const close = parseFloat(bar.close);
                                    const volume = parseFloat(bar.volume);

                                    // Validate values - ensure they're all valid numbers
                                    if (isNaN(time) || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || isNaN(volume)) {
                                        console.log(`Skipping invalid bar data: ${JSON.stringify(bar)}`);
                                        return null;
                                    }

                                    return {
                                        time,
                                        open,
                                        high,
                                        low,
                                        close,
                                        volume
                                    };
                                })
                                // Filter out any null values from invalid bars
                                .filter(bar => bar !== null)
                                // Filter out any bars with invalid timestamps or data
                                .filter(bar => {
                                    const nowMs = Date.now();
                                    // Ensure the bar time is valid
                                    if (bar.time > nowMs || isNaN(bar.time) || bar.time <= 0) {
                                        console.log(`Filtering out invalid historical bar: ${new Date(bar.time).toLocaleString()}`);
                                        return false;
                                    }
                                    // Ensure price data is valid
                                    if (isNaN(bar.open) || isNaN(bar.high) || isNaN(bar.low) || isNaN(bar.close)) {
                                        console.log(`Filtering out bar with invalid price data: ${new Date(bar.time).toLocaleString()}`);
                                        return false;
                                    }

                                    // Ensure price data is reasonable (not extreme outliers)
                                    // This helps prevent the large candle issue when switching coins
                                    const prices = [bar.open, bar.high, bar.low, bar.close];
                                    const maxPrice = Math.max(...prices);
                                    const minPrice = Math.min(...prices);

                                    // If the high/low ratio is too extreme, filter it out
                                    if (maxPrice / minPrice > 1.5) { // 50% difference within a single candle is suspicious
                                        console.log(`Filtering out bar with suspicious price range: ${new Date(bar.time).toLocaleString()} - Range: ${minPrice} to ${maxPrice}`);
                                        return false;
                                    }

                                    // Ensure the bar aligns with the current timeframe intervals
                                    const barDate = new Date(bar.time);
                                    const barMinutes = barDate.getMinutes();
                                    // Make sure we're using the latest timeframe value
                                    if (barMinutes % tf !== 0) {
                                        console.log(`Filtering out bar not aligned with ${tf}-minute intervals: ${barDate.toLocaleString()}`);
                                        return false;
                                    }

                                    return true;
                                })
                                // Remove duplicates (by timestamp)
                                .filter((bar, index, self) =>
                                    index === self.findIndex(b => b.time === bar.time)
                                )
                                // Sort by time (oldest first for correct chart display)
                                .sort((a, b) => a.time - b.time);

                            // Assign the processed bars to the global bars array
                            bars = processedBars;

                            // Log the price range of the new bars for debugging
                            if (bars.length > 0) {
                                const prices = bars.flatMap(bar => [bar.open, bar.high, bar.low, bar.close]);
                                const minBarPrice = Math.min(...prices);
                                const maxBarPrice = Math.max(...prices);
                                console.log(`Price range for ${currentCoin}: ${minBarPrice} to ${maxBarPrice}`);

                                // Validate the price range - if it's too large, something might be wrong
                                const priceRatio = maxBarPrice / minBarPrice;
                                if (priceRatio > 1.5) { // Lower threshold to catch more potential issues
                                    console.warn(`Unusually large price range detected: ratio ${priceRatio.toFixed(2)}. This might indicate data issues.`);

                                    // Try to fix the issue by filtering out extreme outliers
                                    console.log('Attempting to fix price range by filtering out extreme outliers...');

                                    // Calculate median price to use as reference
                                    const allPrices = bars.flatMap(bar => [bar.open, bar.high, bar.low, bar.close]);
                                    allPrices.sort((a, b) => a - b);
                                    const medianPrice = allPrices[Math.floor(allPrices.length / 2)];

                                    console.log(`Median price for ${currentCoin}: ${medianPrice}`);

                                    // Filter out bars with prices that deviate too much from the median
                                    const filteredBars = bars.filter(bar => {
                                        const barPrices = [bar.open, bar.high, bar.low, bar.close];
                                        const maxBarPrice = Math.max(...barPrices);
                                        const minBarPrice = Math.min(...barPrices);

                                        // Check if any price is too far from the median
                                        const maxDeviation = maxBarPrice / medianPrice;
                                        const minDeviation = medianPrice / minBarPrice;

                                        // Use a stricter threshold for filtering
                                        if (maxDeviation > 1.3 || minDeviation > 1.3) {
                                            console.log(`Filtering out outlier bar at ${new Date(bar.time).toLocaleString()} - prices too far from median (max: ${maxBarPrice}, min: ${minBarPrice}, median: ${medianPrice})`);
                                            return false;
                                        }
                                        return true;
                                    });

                                    // Only apply the filter if we still have enough bars
                                    if (filteredBars.length > bars.length * 0.7) { // Keep at least 70% of bars
                                        console.log(`Applied outlier filter: reduced from ${bars.length} to ${filteredBars.length} bars`);
                                        bars = filteredBars;

                                        // Recalculate price range
                                        const newPrices = bars.flatMap(bar => [bar.open, bar.high, bar.low, bar.close]);
                                        const newMinBarPrice = Math.min(...newPrices);
                                        const newMaxBarPrice = Math.max(...newPrices);
                                        console.log(`New price range after filtering: ${newMinBarPrice} to ${newMaxBarPrice}`);

                                        // Set the price scale based on the filtered data
                                        const pricePadding = (newMaxBarPrice - newMinBarPrice) * 0.1;
                                        minPrice = newMinBarPrice - pricePadding;
                                        maxPrice = newMaxBarPrice + pricePadding;
                                        console.log(`Setting price scale based on filtered data: ${minPrice} to ${maxPrice}`);
                                    } else {
                                        console.warn(`Not enough bars would remain after filtering (${filteredBars.length}/${bars.length}). Using original data.`);
                                    }
                                }
                            }

                            // Set view to show the most recent bars with padding on the right
                            // Add padding of 10% of visible bars to ensure space between newest candle and price scale
                            const rightPadding1 = Math.ceil(visibleBars * 0.1);
                            viewOffset = Math.max(0, bars.length - visibleBars + rightPadding1);

                            console.log(`Processed ${bars.length} historical bars from Bitstamp for ${currentCoin}`);

                            // Initialize VWAP with historical bars
                            initializeVwapPeriod();
                            bars.forEach(bar => {
                                if (isInCurrentVwapPeriod(bar.time)) {
                                    // Historical bars are considered closed
                                    updateVwap(bar, true);
                                }
                            });

                            // Set view to show the most recent bars with padding on the right
                            // Add padding of 10% of visible bars to ensure space between newest candle and price scale
                            const rightPadding2 = Math.ceil(visibleBars * 0.1);
                            viewOffset = Math.max(0, bars.length - visibleBars + rightPadding2);

                            // Force price scale recalculation
                            isPriceScaleManuallySet = false;

                            // Calculate appropriate price range based on the actual data
                            if (bars.length > 0) {
                                const prices = bars.flatMap(bar => [bar.open, bar.high, bar.low, bar.close]);
                                const minBarPrice = Math.min(...prices);
                                const maxBarPrice = Math.max(...prices);
                                const pricePadding = (maxBarPrice - minBarPrice) * 0.1; // 10% padding

                                minPrice = minBarPrice - pricePadding;
                                maxPrice = maxBarPrice + pricePadding;

                                console.log(`Setting price scale for ${currentCoin} based on data: ${minPrice} to ${maxPrice}`);
                            } else {
                                // Fallback if no bars
                                minPrice = 0;
                                maxPrice = 100000; // Force recalculation based on visible bars
                            }

                            // Update title with current price
                            updateTitle();

                            // Draw chart with the new data
                            console.log(`Drawing chart for ${currentCoin} with ${bars.length} bars`);
                            drawChart();
                        } else {
                            console.error(`No historical data returned from Bitstamp for ${currentCoin}`);
                            drawChart();
                        }
                    });
            })
            .catch(error => {
                console.error(`Error fetching historical data from Bitstamp for ${currentCoin}:`, error);
                drawChart();
            });
    }

    // Use requestAnimationFrame for smoother updates instead of throttled functions
    let throttledDrawChart = () => requestChartUpdate();
    let throttledPriceUpdate = () => requestChartUpdate();

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

        // Subscribe to Bitstamp for candle data
        // Get the current coin's Bitstamp symbol
        let bitstampSymbol;
        if (window.coinManager) {
            bitstampSymbol = window.coinManager.getCurrentCoin().bitstampSymbol;
        } else {
            bitstampSymbol = 'btcusd'; // Default fallback
        }

        // Make sure we're using the latest timeframe value
        const tf = window.currentTimeframe || currentTimeframe;

        // Subscribe to Bitstamp live trades to build our own candles
        const liveTradesChannel = `live_trades_${bitstampSymbol}`;
        console.log(`Subscribing to Bitstamp channel for candle data: ${liveTradesChannel}`);

        // Using global variables for tracking the current candle being built

        // Create a global function to handle Bitstamp trades that can be called from anywhere
        window.handleBitstampTrade = function(trade, isManualUpdate = false) {
            const price = parseFloat(trade.price);
            const amount = parseFloat(trade.amount || '0');
            const timestamp = parseInt(trade.timestamp) * 1000; // Convert to milliseconds
            const type = trade.type === '0' ? 'buy' : 'sell'; // 0 = buy, 1 = sell

            // Debug logging for trade data
            console.log(`Trade processed: price=${price}, amount=${amount}, type=${type}, time=${new Date(timestamp).toISOString()}, manual=${isManualUpdate}`);

            // Update the DOM directly with the latest price
            document.title = `${price.toFixed(2)} | Orderbook`;

            // Store the latest price in a global variable for easy access
            window.latestPrice = price;

            // Process trade for whale watcher if available
            if (window.whaleWatcher && typeof window.whaleWatcher.processTrade === 'function') {
                const tradeValue = price * amount;
                console.log(`Sending trade to whale watcher: ${type} $${tradeValue.toLocaleString()} (${price} × ${amount}) at ${new Date(timestamp).toISOString()}`);
                window.whaleWatcher.processTrade({
                    price: price,
                    amount: amount,
                    value: tradeValue,
                    type: type,
                    timestamp: timestamp
                });
            }
        };

        bitstampWsManager.subscribe(liveTradesChannel, (data) => {
            // Log first successful data reception
            if (!window.bitstampTradesConnected && data.data) {
                console.log('✅ Bitstamp WebSocket connected and receiving trade data');
                window.bitstampTradesConnected = true;
            }

            // Debug logging for all received messages
            const now = new Date();
            console.log(`[${now.toISOString()}] Bitstamp message received:`, {
                event: data.event,
                channel: data.channel,
                hasData: !!data.data
            });

            if (data.data && data.data.price) {
                // Process the trade using our global handler
                window.handleBitstampTrade(data.data);

                const trade = data.data;
                const price = parseFloat(trade.price);
                const timestamp = parseInt(trade.timestamp) * 1000; // Convert to milliseconds

                // Calculate the start time of the candle this trade belongs to
                const tradeDate = new Date(timestamp);
                const minutes = tradeDate.getMinutes();
                const currentInterval = Math.floor(minutes / tf) * tf;
                tradeDate.setMinutes(currentInterval);
                tradeDate.setSeconds(0);
                tradeDate.setMilliseconds(0);
                const candleTime = tradeDate.getTime();

                console.log(`Calculated candle time: ${new Date(candleTime).toISOString()}, current interval: ${currentInterval}`);

                // If this is a new candle or we don't have a current candle
                if (!currentCandle || candleTime !== currentCandleTime) {
                    // If we have a current candle, finalize it and add it to bars
                    if (currentCandle) {
                        console.log(`Finalizing current candle at ${new Date(currentCandleTime).toISOString()}:`, currentCandle);
                        // Process the completed candle
                        processNewBar(currentCandle);
                    }

                    // Start a new candle
                    currentCandle = {
                        time: candleTime,
                        open: price,
                        high: price,
                        low: price,
                        close: price
                    };
                    currentCandleTime = candleTime;
                    console.log(`Started new candle at ${new Date(candleTime).toISOString()}:`, currentCandle);

                    // Add the new candle to the bars array
                    const existingIndex = bars.findIndex(b => b.time === candleTime);
                    if (existingIndex !== -1) {
                        // Replace existing bar
                        bars[existingIndex] = { ...currentCandle };
                        console.log(`Replaced existing bar at index ${existingIndex} with new candle`);
                    } else {
                        // Add new bar
                        bars.push({ ...currentCandle });
                        // Sort bars by time (ascending)
                        bars.sort((a, b) => a.time - b.time);
                        console.log(`Added new candle to bars array, now has ${bars.length} bars`);
                    }
                } else {
                    // Update the current candle with this trade
                    const oldHigh = currentCandle.high;
                    const oldLow = currentCandle.low;
                    const oldClose = currentCandle.close;

                    currentCandle.high = Math.max(currentCandle.high, price);
                    currentCandle.low = Math.min(currentCandle.low, price);
                    currentCandle.close = price; // Last price becomes the close

                    // Find the current candle in the bars array and update it directly
                    const currentBarIndex = bars.findIndex(b => b.time === currentCandle.time);
                    if (currentBarIndex !== -1) {
                        // Update the bar in the array
                        bars[currentBarIndex] = { ...currentCandle };
                        console.log(`Updated bar at index ${currentBarIndex} in bars array`);
                    } else {
                        // If the current candle isn't in the bars array yet, add it
                        bars.push({ ...currentCandle });
                        // Sort bars by time (ascending)
                        bars.sort((a, b) => a.time - b.time);
                        console.log(`Added current candle to bars array, now has ${bars.length} bars`);
                    }

                    // Only log if values actually changed
                    if (oldHigh !== currentCandle.high || oldLow !== currentCandle.low || oldClose !== currentCandle.close) {
                        console.log(`Updated current candle at ${new Date(candleTime).toISOString()}:`, {
                            changes: {
                                high: oldHigh !== currentCandle.high ? `${oldHigh} -> ${currentCandle.high}` : 'unchanged',
                                low: oldLow !== currentCandle.low ? `${oldLow} -> ${currentCandle.low}` : 'unchanged',
                                close: oldClose !== currentCandle.close ? `${oldClose} -> ${currentCandle.close}` : 'unchanged'
                            }
                        });
                    }
                }

                // Force a chart update to ensure the latest data is displayed
                // Use a direct call to drawChart for immediate update
                drawChart();

                // Also schedule an animation frame update for smoother rendering
                requestChartUpdate(true);

                // Update the title with the latest price
                updateTitle();

                // Force a DOM update by triggering a custom event
                document.dispatchEvent(new CustomEvent('priceUpdated', {
                    detail: { price: price, time: new Date().toISOString() }
                }));
            }
        });

        // Subscribe to Bybit only for liquidations
        const liquidationsChannel = `liquidation.${currentPair}`;
        console.log(`Subscribing to Bybit channel for liquidations: ${liquidationsChannel}`);

        bybitWsManager.subscribe(liquidationsChannel, (data) => {
            // Log first successful data reception
            if (!window.bybitConnected && data.topic) {
                console.log('✅ Bybit WebSocket connected and receiving liquidation data');
                window.bybitConnected = true;
            }

            // Process liquidation data here if needed
            if (data.topic && data.data) {
                // Handle liquidation data
                console.log('Received liquidation data:', data);
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

        // Reset mouse movement tracking
        mouseDownStartTime = Date.now();
        mouseHasMoved = false;

        // Calculate histogram area
        const chartHeight = canvas.height - timeScaleHeight - histogramHeight - histogramPaneGap;

        // Histogram area
        const histogramY = chartHeight;
        const histogramBottom = histogramY + histogramHeight;

        const fullWidth = canvas.width - priceScaleWidth;
        const histogramWidth = fullWidth / 2; // Half width for side-by-side display

        // Log chart dimensions for debugging
        console.log('Chart dimensions:', {
            canvasHeight: canvas.height,
            chartHeight,
            histogramHeight,
            timeScaleHeight
        });

        console.log('Mouse down at:', { mouseX, mouseY, canvasWidth: canvas.width, priceScaleWidth });

        // Check if Shift key is pressed or measurement tool is active
        if ((e.shiftKey || isMeasurementToolActive) && mouseX < canvas.width - priceScaleWidth && mouseY < chartHeight) {
            // Start measuring
            isMeasuring = true;
            measurementStart = {
                x: mouseX,
                y: mouseY,
                price: hoveredPrice,
                barIndex: viewOffset + (mouseX / barWidth)
            };
            measurementEnd = { ...measurementStart }; // Initialize end with start
            canvas.classList.add('cursor-plus');

            // Store that measurement was initiated
            // This allows the user to release Shift while still measuring
            window.measurementInitiated = true;
            console.log('Measurement initiated:', window.measurementInitiated);

            return; // Exit early to prevent other mouse interactions
        }

        // Check if clicking on a line endpoint
        if (hoveredLine && hoveredEndpoint) {
            // Start dragging the endpoint
            isDraggingEndpoint = true;
            isDrawingLine = true;

            // Reset double-click timer to prevent accidental deletion
            window.lastClickTime = 0;

            const line = hoveredLine.line;

            if (hoveredEndpoint === 'start') {
                // Dragging the start point - keep the end point fixed
                currentLine = {
                    startX: mouseX,
                    startY: mouseY,
                    endX: hoveredLine.endX,
                    endY: hoveredLine.endY,
                    startPrice: hoveredPrice,
                    endPrice: line.endPrice,
                    endBarIndex: line.endBarIndex,
                    isDraggingEndpoint: true,
                    draggedEndpoint: 'start',
                    originalIndex: hoveredLine.index
                };
            } else { // 'end'
                // Dragging the end point - keep the start point fixed
                currentLine = {
                    startX: hoveredLine.startX,
                    startY: hoveredLine.startY,
                    endX: mouseX,
                    endY: mouseY,
                    startPrice: line.startPrice,
                    endPrice: hoveredPrice,
                    startBarIndex: line.startBarIndex,
                    isDraggingEndpoint: true,
                    draggedEndpoint: 'end',
                    originalIndex: hoveredLine.index
                };
            }
            return;
        }

        // Check if double-clicking on a line (for deletion)
        if (hoveredLine && !hoveredEndpoint) {
            // Delete the line on double-click
            const now = Date.now();
            if (!window.lastClickTime || now - window.lastClickTime < 300) { // 300ms for double-click detection
                // Set a flag to delete on mouse up only if the mouse doesn't move
                window.pendingLineDelete = hoveredLine.index;
                window.lastClickTime = 0; // Reset to prevent triple-click
                return;
            }
            window.lastClickTime = now;
        }

        // Handle line drawing mode
        if (isLineDrawingMode && mouseX < canvas.width - priceScaleWidth && mouseY < chartHeight) {
            isDrawingLine = true;

            // Calculate bar index for the starting point
            const startBarIndex = viewOffset + (mouseX / barWidth);

            // Create a new line with start point at current mouse position
            currentLine = {
                startX: mouseX,
                startY: mouseY,
                endX: mouseX,  // Initially same as start
                endY: mouseY,  // Initially same as start
                // Store price values and bar indices for proper scaling when zooming/panning
                startPrice: hoveredPrice,
                endPrice: hoveredPrice,
                startBarIndex: startBarIndex,
                endBarIndex: startBarIndex
            };
            return; // Exit early to prevent other mouse interactions
        }

        // Check if mouse is over histogram resize handle (entire top border)
        if (mouseY >= histogramY - 3 && mouseY <= histogramY + 5 && mouseX < fullWidth) {
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
            // Get current coin for logging
            const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';

            // Price scale dragging (vertical only)
            isPriceScaleDragging = true;
            priceScaleDragStartY = e.clientY;

            // Store current price range for dragging
            priceScaleDragStartMinPrice = minPrice;
            priceScaleDragStartMaxPrice = maxPrice;

            // Change cursor to indicate vertical dragging
            canvas.style.cursor = 'ns-resize';

            console.log(`Price scale drag started for ${currentCoin}:`, {
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
            // Keep the plus sign cursor during dragging
            canvas.classList.add('cursor-plus');
            isDragging = true;
        } else {
            // Chart area dragging (both horizontal and vertical when not locked)
            isChartDragging = true;
            dragStartX = mouseX;
            dragStartY = mouseY;
            initialViewOffset = viewOffset;
            initialMinPrice = minPrice;
            initialMaxPrice = maxPrice;
            // Keep the plus sign cursor during dragging
            canvas.classList.add('cursor-plus');
        }
        isDragging = true;
    }

    function handleMouseMove(e) {
        if (!canvas) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const newMouseX = e.clientX - rect.left;
        const newMouseY = e.clientY - rect.top;

        // Check if mouse has moved significantly since mouse down
        if (!mouseHasMoved && (Math.abs(newMouseX - mouseX) > 3 || Math.abs(newMouseY - mouseY) > 3)) {
            mouseHasMoved = true;
        }

        // Update mouse position
        mouseX = newMouseX;
        mouseY = newMouseY;

        // Handle measurement tool - use the measurementInitiated flag
        // This allows the measurement to continue even if Shift is released
        if (window.measurementInitiated && measurementStart) {
            console.log('Continuing measurement, initiated:', window.measurementInitiated);
            // Update the end point of the measurement
            measurementEnd = {
                x: mouseX,
                y: mouseY,
                price: hoveredPrice,
                barIndex: viewOffset + (mouseX / barWidth)
            };

            // Make sure isMeasuring is true to keep the measurement active
            isMeasuring = true;

            drawChart(); // Redraw to show the measurement
            return;
        }

        // Handle line drawing mode
        if (isDrawingLine && currentLine) {
            if (currentLine.isDraggingEndpoint) {
                // We're dragging an endpoint
                if (currentLine.draggedEndpoint === 'start') {
                    // Update the start point
                    currentLine.startX = mouseX;
                    currentLine.startY = mouseY;
                    currentLine.startPrice = hoveredPrice;
                    currentLine.startBarIndex = viewOffset + (mouseX / barWidth);
                } else { // 'end'
                    // Update the end point
                    currentLine.endX = mouseX;
                    currentLine.endY = mouseY;
                    currentLine.endPrice = hoveredPrice;
                    currentLine.endBarIndex = viewOffset + (mouseX / barWidth);
                }
            } else {
                // Normal line drawing - update the end point
                currentLine.endX = mouseX;
                currentLine.endY = mouseY;
                currentLine.endPrice = hoveredPrice;
                currentLine.endBarIndex = viewOffset + (mouseX / barWidth);
            }

            drawChart(); // Redraw to show the line being drawn
            return;
        }

        // If not drawing, check for line hover to show popup
        if (!isDragging && !isDrawingLine) {
            drawChart(); // Redraw to check for line hover and show popup
        }

        // For other interactions, only proceed if dragging
        if (!isDragging) return;

        // Handle mouse movement during dragging

        // Ensure cursor stays as plus sign during dragging if in chart area
        if (mouseX < canvas.width - priceScaleWidth) {
            canvas.classList.add('cursor-plus');
        }

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
            // Get current coin for logging
            const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';

            // Calculate drag distance
            const dragDistance = mouseY - priceScaleDragStartY;

            // Skip if we don't have valid start values
            if (!isFinite(priceScaleDragStartMinPrice) || !isFinite(priceScaleDragStartMaxPrice) ||
                priceScaleDragStartMinPrice === priceScaleDragStartMaxPrice) {
                console.log('Invalid price range, skipping drag');
                return;
            }

            // Calculate price range
            const priceRange = priceScaleDragStartMaxPrice - priceScaleDragStartMinPrice;

            // Calculate stretch factor - use a very small sensitivity for more control
            // Positive dragDistance (moving down) increases the range (stretches)
            // Negative dragDistance (moving up) decreases the range (compresses)
            const sensitivity = 0.002; // Very small value for fine control
            const stretchFactor = Math.max(0.1, 1 + (dragDistance * sensitivity));

            // Calculate new min and max prices by stretching around the center
            const centerPrice = (priceScaleDragStartMaxPrice + priceScaleDragStartMinPrice) / 2;
            let newMinPrice = centerPrice - (priceRange / 2) * stretchFactor;
            let newMaxPrice = centerPrice + (priceRange / 2) * stretchFactor;

            // Ensure minimum range to prevent excessive zoom
            const minAllowedRange = priceRange * 0.1; // 10% of original range
            if (newMaxPrice - newMinPrice < minAllowedRange) {
                newMinPrice = centerPrice - minAllowedRange / 2;
                newMaxPrice = centerPrice + minAllowedRange / 2;
            }

            // Update price range if values are valid
            if (isFinite(newMinPrice) && isFinite(newMaxPrice) && newMinPrice < newMaxPrice) {
                minPrice = newMinPrice;
                maxPrice = newMaxPrice;
                isPriceScaleManuallySet = true;

                // Debug logging
                console.log(`Price scale updated for ${currentCoin}:`, {
                    dragDistance,
                    stretchFactor,
                    minPrice,
                    maxPrice
                });

                // Redraw the chart with new price range
                drawChart();
            }
        } else if (isChartDragging) {
            // Handle horizontal scrolling (left/right)
            const deltaX = mouseX - dragStartX;
            const currentChartWidth = canvas.width - priceScaleWidth;
            const currentBarWidth = currentChartWidth / visibleBars;
            // Invert the direction of the shift to make dragging more intuitive
            // Dragging right should move the chart to show older bars (decrease viewOffset)
            // Dragging left should move the chart to show newer bars (increase viewOffset)
            const barsToShift = currentBarWidth > 0 ? -deltaX / currentBarWidth : 0;

            // Make sure initialViewOffset is valid
            if (initialViewOffset !== null && isFinite(initialViewOffset)) {
                let newViewOffset = initialViewOffset + barsToShift;
                // Add padding of 10% of visible bars to ensure space between newest candle and price scale
                const rightPadding = Math.ceil(visibleBars * 0.1);
                // Allow scrolling into future bars (50% of visible bars)
                const futureBars = Math.ceil(visibleBars * 0.5);
                const maxViewOffset = bars.length - visibleBars + rightPadding + futureBars; // Allow scrolling past the end into future
                const minViewOffset = 0;
                viewOffset = Math.max(minViewOffset, Math.min(newViewOffset, maxViewOffset));
            }

            // Handle vertical scrolling (up/down) when not locked
            const deltaY = mouseY - dragStartY;
            const chartHeight = canvas.height - timeScaleHeight;

            // Make sure initialMinPrice and initialMaxPrice are valid
            if (initialMinPrice !== null && initialMaxPrice !== null &&
                isFinite(initialMinPrice) && isFinite(initialMaxPrice)) {
                const priceRange = initialMaxPrice - initialMinPrice;
                const priceShift = (deltaY / chartHeight) * priceRange;

                // Move price range up or down based on vertical drag
                if (priceRange > 0 && isFinite(priceRange)) {
                    minPrice = initialMinPrice + priceShift;
                    maxPrice = initialMaxPrice + priceShift;
                    // Only set isPriceScaleManuallySet to true when dragging the price scale itself
                    // This ensures the auto-zoom scale remains active when dragging the chart
                }
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

        // Expose mouse position for other components like liquidation markers
        window.chartMouseX = mouseX;
        window.chartMouseY = mouseY;

        // Always reset hovered limit order and zoom lens by default
        // This ensures the zoom lens disappears when not hovering over a limit
        hoveredLimitOrder = null;
        showZoomLens = false;

        // Calculate histogram area for resize handle detection
        const totalChartHeight = canvas.height - timeScaleHeight - histogramHeight - histogramPaneGap;

        // Histogram area
        const histogramY = totalChartHeight;

        // Force a redraw to update the time scale tag
        // This ensures the time tag is always updated when the mouse moves
        requestAnimationFrame(drawChart);

        const fullWidth = canvas.width - priceScaleWidth;

        // Calculate drag indicator button position
        const middleX = fullWidth / 2;
        const buttonWidth = 30;
        const buttonHeight = 10;
        const buttonX = middleX - buttonWidth / 2;
        const buttonY = histogramY - buttonHeight / 2;

        // Check if mouse is over the drag indicator button
        if (mouseX >= buttonX && mouseX <= buttonX + buttonWidth &&
            mouseY >= buttonY && mouseY <= buttonY + buttonHeight) {
            canvas.style.cursor = 'ns-resize';

            // Draw tooltip
            const tooltipText = 'Drag to resize depth panes';
            ctx.font = '12px Arial';
            const textWidth = ctx.measureText(tooltipText).width;
            const tooltipX = buttonX + buttonWidth / 2 - textWidth / 2;
            const tooltipY = buttonY - 10;

            // Draw tooltip background
            ctx.fillStyle = 'rgba(40, 40, 40, 0.9)';
            ctx.beginPath();
            ctx.roundRect(tooltipX - 5, tooltipY - 15, textWidth + 10, 20, 3);
            ctx.fill();

            // Draw tooltip text
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillText(tooltipText, tooltipX, tooltipY);

            return;
        }

        // Check if mouse is over histogram resize handle
        if (mouseY >= histogramY - 3 && mouseY <= histogramY + 5 && mouseX < fullWidth) {
            canvas.style.cursor = 'ns-resize';
            return;
        }

        // Check if mouse is over the price scale area (including histogram price scale)
        if (mouseX > canvas.width - priceScaleWidth) {
            canvas.style.cursor = 'ns-resize';
            return;
        }

        // Set cursor to plus sign when over the chart area
        if (mouseX < canvas.width - priceScaleWidth) {
            canvas.classList.add('cursor-plus');
        } else {
            canvas.classList.remove('cursor-plus');
        }

        // Calculate hovered price
        // Use the same totalChartHeight calculated above
        if (mouseY >= 0 && mouseY <= totalChartHeight) {
            const priceRange = Math.max(1e-6, maxPrice - minPrice);
            hoveredPrice = maxPrice - (mouseY / totalChartHeight) * priceRange;

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
                        const exactPriceMatch = Math.abs(hoveredPrice - result.price) < 0.0000001;
                        if (exactPriceMatch) {
                            hoveredLimitOrder = result;
                            showZoomLens = true; // Only enable zoom lens when directly over a valid limit order
                            console.log('CONFIRMED limit order:', hoveredLimitOrder.type, 'at price', hoveredLimitOrder.price);
                        } else {
                            // Not exactly at the order's price
                            hoveredLimitOrder = null;
                            showZoomLens = false;
                        }
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
            if (mouseY > totalChartHeight && mouseY <= canvas.height) {
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
            canvas.classList.remove('cursor-plus');
        } else {
            // Use plus sign cursor for both chart area and time scale area
            canvas.classList.add('cursor-plus');
        }
        drawChart();
    }

    function handleMouseUp(e) {
        if (!canvas) return;
        e.preventDefault();

        // End measurement if we were measuring
        if (isMeasuring || window.measurementInitiated) {
            console.log('Ending measurement, was initiated:', window.measurementInitiated);
            isMeasuring = false;
            // Reset the measurement initiated flag
            window.measurementInitiated = false;
            // Keep the measurement visible until the next chart redraw
            // We don't reset measurementStart and measurementEnd here
            // so they can be used in drawChart to show the final measurement
            drawChart();
            return;
        }

        // Check if we have a pending line delete and the mouse hasn't moved
        if (window.pendingLineDelete !== undefined && !mouseHasMoved) {
            // Delete the line
            lines.splice(window.pendingLineDelete, 1);
            saveLines();
            drawChart();
            window.pendingLineDelete = undefined;
            return;
        }

        // Clear any pending line delete
        window.pendingLineDelete = undefined;

        // Handle line drawing completion
        if (isDrawingLine && currentLine) {
            // Check if we're dragging an endpoint
            if (currentLine.isDraggingEndpoint) {
                // Update the existing line instead of creating a new one
                const lineIndex = currentLine.originalIndex;

                // Calculate the current bar index for the dragged point
                const currentBarIndex = viewOffset + (mouseX / barWidth);

                // Only update if the points are different
                if (currentLine.endX !== currentLine.startX || currentLine.endY !== currentLine.startY) {
                    if (currentLine.draggedEndpoint === 'start') {
                        // Update the line with new start point
                        lines[lineIndex] = {
                            startPrice: hoveredPrice,
                            endPrice: currentLine.endPrice,
                            startBarIndex: currentBarIndex,
                            endBarIndex: currentLine.endBarIndex
                        };
                        console.log('Line start point moved:', lines[lineIndex]);
                    } else { // 'end'
                        // Update the line with new end point
                        lines[lineIndex] = {
                            startPrice: currentLine.startPrice,
                            endPrice: hoveredPrice,
                            startBarIndex: currentLine.startBarIndex,
                            endBarIndex: currentBarIndex
                        };
                        console.log('Line end point moved:', lines[lineIndex]);
                    }
                    // Save lines to localStorage
                    saveLines();
                }
            } else {
                // Only add the line if it's not just a click (start and end points are different)
                if (currentLine.startX !== currentLine.endX || currentLine.startY !== currentLine.endY) {
                    // Add the completed line to the lines array
                    lines.push({
                        startPrice: currentLine.startPrice,
                        endPrice: currentLine.endPrice,
                        startBarIndex: currentLine.startBarIndex,
                        endBarIndex: currentLine.endBarIndex
                    });
                    console.log('Line added:', lines[lines.length - 1]);
                    // Save lines to localStorage
                    saveLines();
                }
            }

            // Reset the current line and drawing state
            currentLine = null;
            isDrawingLine = false;
            isDraggingEndpoint = false;
            drawChart();
            return;
        }

        // Reset mouse movement tracking
        mouseHasMoved = false;

        // Get current coin for logging
        const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';

        // Log the state before resetting
        console.log(`Mouse up for ${currentCoin} - drag states:`, {
            isDragging,
            isChartDragging,
            isPriceScaleDragging,
            isHistogramResizing,
            minPrice,
            maxPrice
        });

        // Reset all drag states
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

        // Reset drag start values
        dragStartX = 0;
        priceScaleDragStartY = null;
        priceScaleDragStartMinPrice = null;
        priceScaleDragStartMaxPrice = null;

        // Set cursor based on position
        if (x > canvas.width - priceScaleWidth) {
            canvas.style.cursor = 'ns-resize';
            canvas.classList.remove('cursor-plus');
        } else {
            // Always keep plus sign cursor in chart area
            canvas.classList.add('cursor-plus');
        }

        // Update hover state
        handleMouseHover(e);

        // Force a redraw to ensure everything is updated
        drawChart();
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

                // Get current coin for logging
                const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';

                console.log(`Price scale wheel zoom for ${currentCoin}:`, {
                    priceRange,
                    minPrice,
                    maxPrice,
                    zoomFactor,
                    deltaY: e.deltaY
                });

                // Ensure we have valid price range values
                if (priceRange <= 0 || !isFinite(priceRange)) {
                    console.log('Invalid price range, recalculating from visible bars');

                    // If we don't have valid values, get them from the visible bars
                    const startIndex = Math.max(0, Math.floor(viewOffset));
                    const endIndex = Math.min(bars.length, startIndex + Math.ceil(visibleBars));
                    // Get visible bars without reversing (bars are already in chronological order)
                    const visibleBarsData = bars.slice(startIndex, endIndex);

                    if (visibleBarsData.length > 0) {
                        const lows = visibleBarsData.map(b => b.low).filter(p => !isNaN(p));
                        const highs = visibleBarsData.map(b => b.high).filter(p => !isNaN(p));

                        if (lows.length > 0 && highs.length > 0) {
                            const localMinPrice = Math.min(...lows);
                            const localMaxPrice = Math.max(...highs);
                            const pricePadding = (localMaxPrice - localMinPrice) * 0.1;

                            minPrice = localMinPrice - pricePadding;
                            maxPrice = localMaxPrice + pricePadding;

                            console.log('Price scale values recalculated for wheel zoom:', {
                                minPrice,
                                maxPrice
                            });
                        }
                    }

                    // If we still don't have valid values, use current price as fallback
                    if (maxPrice <= minPrice || !isFinite(maxPrice) || !isFinite(minPrice)) {
                        const currentPrice = bars.length > 0 ? bars[bars.length - 1].close : 0;
                        if (currentPrice > 0) {
                            minPrice = currentPrice * 0.95;
                            maxPrice = currentPrice * 1.05;

                            console.log('Price scale values set from current price for wheel zoom:', {
                                minPrice,
                                maxPrice,
                                currentPrice
                            });
                        } else {
                            // Last resort fallback
                            minPrice = 0;
                            maxPrice = 100;
                            console.log('Using fallback price range for wheel zoom');
                            return; // Skip this wheel event
                        }
                    }
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

                    // Save zoom state to localStorage
                    localStorage.setItem('chartMinPrice', minPrice);
                    localStorage.setItem('chartMaxPrice', maxPrice);
                    localStorage.setItem('chartPriceScaleManuallySet', 'true');

                    drawChart();

                    console.log(`Price scale zoomed for ${currentCoin}:`, {
                        newMinPrice,
                        newMaxPrice
                    });
                }

                return;
            }

            // Chart zooming (horizontal only)
            const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
            const newVisibleBars = Math.max(10, Math.min(1500, Math.round(visibleBars * zoomFactor)));

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

            // Calculate the bar index under the mouse cursor
            const barIndexUnderMouse = viewOffset + (mouseXOnChart / currentBarWidth);

            // Calculate the new view offset to keep the bar under the mouse at the same position
            const mouseRatio = mouseXOnChart / currentChartWidth;
            const newViewOffset = barIndexUnderMouse - mouseRatio * newVisibleBars;

            // Update visible bars
            visibleBars = newVisibleBars;

            // Add padding of 10% of visible bars to ensure space between newest candle and price scale
            const rightPadding = Math.ceil(newVisibleBars * 0.1);
            // Allow scrolling into future bars (50% of visible bars)
            const futureBars = Math.ceil(newVisibleBars * 0.5);

            // Set limits for view offset
            const maxViewOffset = bars.length - newVisibleBars + rightPadding + futureBars; // Allow scrolling past the end into future
            const minViewOffset = 0; // Don't allow scrolling past the beginning

            // Apply the new view offset with limits
            viewOffset = Math.max(minViewOffset, Math.min(newViewOffset, maxViewOffset));

            // Save zoom state to localStorage
            localStorage.setItem('chartVisibleBars', visibleBars);
            localStorage.setItem('chartViewOffset', viewOffset);

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

        // Also reset global mouse position variables
        window.chartMouseX = null;
        window.chartMouseY = null;
        hoveredBarIndex = -1;
        hoveredPrice = null;
        hoveredLimitOrder = null;
        snappedMouseX = null; // Reset snapped mouse position
        showZoomLens = false; // Reset zoom lens flag when mouse leaves canvas
        if (isDragging) {
            handleMouseUp(e);
        }
        canvas.style.cursor = 'default';
        canvas.classList.remove('cursor-plus');
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
            return;
        }
    }

    // Helper function to calculate distance from a point to a line
    function distanceToLine(x, y, x1, y1, x2, y2) {
        // Line length
        const lineLength = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

        // If line length is 0, return distance to the point
        if (lineLength === 0) return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);

        // Calculate distance from point to line
        const t = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / (lineLength ** 2);

        // If t is outside [0,1], the closest point is an endpoint
        if (t < 0) return Math.sqrt((x - x1) ** 2 + (y - y1) ** 2);
        if (t > 1) return Math.sqrt((x - x2) ** 2 + (y - y2) ** 2);

        // Closest point on the line
        const closestX = x1 + t * (x2 - x1);
        const closestY = y1 + t * (y2 - y1);

        // Return distance to closest point
        return Math.sqrt((x - closestX) ** 2 + (y - closestY) ** 2);
    }

    // --- Helper Functions for Drawing ---
    function getColor(colorName, defaultColor) {
        // Get color from color customizer if available, otherwise use default
        return window.colorCustomizer?.colors?.[colorName] || defaultColor;
    }

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
            console.log('Null check failed in findHoveredLimitOrder');
            return null;
        }

        // If orderbook is empty or has no significant orders, return null
        if (orderbook.bids.length === 0 && orderbook.asks.length === 0) {
            console.log('No orders in orderbook');
            return null;
        }

        // Calculate mouse price
        const chartHeight = canvas.height - timeScaleHeight - histogramHeight - histogramPaneGap;
        const priceRange = Math.max(1e-6, maxPrice - minPrice);
        const mousePrice = maxPrice - (mouseY / chartHeight) * priceRange;

        // Get minimum dollar value threshold for the current coin
        const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
        userMinOrderValue = window.coinMinOrderValues[currentCoin] || coinMinOrderValues[currentCoin];
        let minOrderValue = userMinOrderValue * 1000; // Convert from k to actual USD value

        // Filter to only significant orders
        const significantBids = orderbook.bids.filter(([, , value]) => value >= minOrderValue);
        const significantAsks = orderbook.asks.filter(([, , value]) => value >= minOrderValue);

        // If no significant orders, return null
        if (significantBids.length === 0 && significantAsks.length === 0) {
            console.log('No significant orders found');
            return null;
        }

        // Define an extremely small hover threshold for exact detection
        // This ensures orders can only be hovered over exactly where they are
        // The zoom lens will only appear when directly over a limit order's exact price
        const hoverThreshold = 0.0000001; // Ultra-tiny epsilon for exact floating point comparison

        // First check bids
        for (const [price, size, dollarValue] of significantBids) {
            // Only match if the price is EXACTLY equal (with the tiny epsilon)
            if (Math.abs(price - mousePrice) < hoverThreshold) {
                console.log('EXACT match on BID at price', price, 'with difference', Math.abs(price - mousePrice));
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
                console.log('EXACT match on ASK at price', price, 'with difference', Math.abs(price - mousePrice));
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
        // Make this function globally accessible
        window.initializeVwapPeriod = initializeVwapPeriod;
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
    function calculateVolumeProfile() {
        console.log('calculateVolumeProfile called');

        // Reset volume profile data
        volumeProfileData.pricePoints = [];
        volumeProfileData.maxVolume = 0;
        volumeProfileData.totalVolume = 0;
        volumeProfileData.valueAreaHigh = 0;
        volumeProfileData.valueAreaLow = 0;
        volumeProfileData.poc = 0;

        // Fixed lookback days (3 days)
        const lookbackDays = 3;
        // Calculate number of bars based on lookback days (288 bars per day for 5-minute bars)
        // 288 = 24 hours * 12 bars per hour (5-minute bars)
        const numBarsToUse = 864; // Exactly 3 days of 5-minute bars
        console.log(`Using fixed ${lookbackDays} days for volume profile = ${numBarsToUse} 5-minute bars`);

        // Get current timeframe
        const tf = window.currentTimeframe || currentTimeframe;
        console.log('Current timeframe for volume profile:', tf);

        // Check if we're on 5-minute timeframe
        if (tf === TIMEFRAME_5M) {
            // We're already on 5-minute timeframe, just use the bars directly
            // Check if we need to fetch more data for the volume profile
            if (bars.length < numBarsToUse) {
                console.log(`Not enough bars for ${lookbackDays}-day volume profile. Have ${bars.length}, need ${numBarsToUse}`);
                // We'll continue with what we have, but the profile might not be complete
            }

            // Get the most recent bars for the volume profile
            const recentBars = bars.slice(-numBarsToUse);

            if (recentBars.length === 0) {
                console.log('No recent bars found for volume profile');
                return;
            }

            // Continue with these bars
            processVolumeProfileBars(recentBars);
            return;
        }

        // We're on a different timeframe, need to fetch 5-minute bars specifically
        console.log(`Current timeframe is ${tf}m, fetching 5-minute bars for volume profile...`);

        // Get current trading pair from coin manager
        let pairToUse = currentPair;
        if (window.coinManager) {
            pairToUse = window.coinManager.getCurrentCoin().bybitSymbol;
        }

        // Fetch 5-minute bars specifically for volume profile
        // Make sure we get the most recent data by including a timestamp parameter
        const timestamp = Date.now();
        fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${pairToUse}&interval=5&limit=2000&timestamp=${timestamp}`)
            .then(response => response.json())
            .then(data => {
                if (data.retCode === 0 && data.result && data.result.list) {
                    // Parse the 5-minute bars
                    const fiveMinBars = data.result.list
                        .map(bar => ({
                            time: parseInt(bar[0]),
                            open: parseFloat(bar[1]),
                            high: parseFloat(bar[2]),
                            low: parseFloat(bar[3]),
                            close: parseFloat(bar[4])
                        }))
                        .filter(bar => {
                            // Filter out invalid bars
                            return !isNaN(bar.time) && bar.time > 0 &&
                                   !isNaN(bar.open) && !isNaN(bar.high) &&
                                   !isNaN(bar.low) && !isNaN(bar.close);
                        });

                    // Sort by time (oldest first)
                    fiveMinBars.sort((a, b) => a.time - b.time);

                    // Take the most recent 1440 bars
                    const recentBars = fiveMinBars.slice(-numBarsToUse);

                    if (recentBars.length === 0) {
                        console.log('No 5-minute bars found for volume profile');
                        return;
                    }

                    console.log(`Using ${recentBars.length} 5-minute bars for volume profile`);

                    // Process these bars for volume profile
                    processVolumeProfileBars(recentBars);

                    // Redraw chart to show the volume profile
                    drawChart();
                } else {
                    console.error('Failed to fetch 5-minute bars for volume profile:', data.retMsg || 'Unknown error');
                }
            })
            .catch(error => {
                console.error('Error fetching 5-minute bars for volume profile:', error);
            });
    }

    function processVolumeProfileBars(recentBars) {
        if (!recentBars || recentBars.length === 0) {
            console.log('No bars to process for volume profile');
            return;
        }

        console.log(`Processing ${recentBars.length} bars for volume profile`);

        // Find min and max prices in the period
        let periodLow = Infinity;
        let periodHigh = -Infinity;

        recentBars.forEach(bar => {
            periodLow = Math.min(periodLow, bar.low);
            periodHigh = Math.max(periodHigh, bar.high);
        });

        // Add a small buffer to the price range to ensure we capture all activity
        const priceBuffer = (periodHigh - periodLow) * 0.02; // 2% buffer
        periodLow = Math.max(0, periodLow - priceBuffer); // Ensure we don't go below 0
        periodHigh = periodHigh + priceBuffer;

        // Use 864 bars to match the number of 5-minute bars in 3 days
        const numBuckets = 864; // Exactly 864 to match the 3 days of 5-minute bars
        const priceBucketSize = (periodHigh - periodLow) / numBuckets;
        const priceBuckets = {};

        // Initialize price buckets
        for (let i = 0; i < numBuckets; i++) {
            const bucketPrice = periodLow + (i * priceBucketSize);
            priceBuckets[bucketPrice.toFixed(8)] = 0; // Use more precision to avoid rounding issues
        }

        // Calculate volume for each price bucket using TradingView-like algorithm
        recentBars.forEach(bar => {
            // Use actual volume if available, otherwise use a proxy based on price movement
            const hasVolume = bar.volume !== undefined && bar.volume > 0;

            // Skip invalid bars
            if (bar.high <= bar.low || isNaN(bar.high) || isNaN(bar.low)) return;

            // Calculate bar volume - TradingView uses actual volume when available
            let barVolume;
            if (hasVolume) {
                barVolume = bar.volume;
            } else {
                // If no volume data, use a proxy that's proportional to price movement and range
                // This is similar to how TradingView estimates volume when it's not available
                const priceRange = bar.high - bar.low;
                const priceMove = Math.abs(bar.close - bar.open);
                // Scale up significantly for better visibility
                barVolume = priceRange * (1 + priceMove / priceRange) * 1000; // Increased scale factor from 100 to 1000
            }

            // Ensure we have a minimum volume for each bar to make the profile visible
            barVolume = Math.max(barVolume, 10);

            // TradingView's volume profile uses a TPO-like (Time Price Opportunity) approach
            // where each price level the bar traded at gets an equal portion of the volume

            // Calculate how many price levels to sample within this bar
            // More granular for larger price ranges
            const barPriceRange = bar.high - bar.low;
            // Increase the number of levels for better distribution
            const numLevels = Math.max(100, Math.ceil(barPriceRange / (priceBucketSize * 0.05)));
            const levelStep = barPriceRange / numLevels;

            // Distribute volume across all price levels within the bar
            for (let i = 0; i <= numLevels; i++) {
                const price = bar.low + (i * levelStep);

                // Find which bucket this price belongs to
                const bucketIndex = Math.floor((price - periodLow) / priceBucketSize);
                if (bucketIndex >= 0 && bucketIndex < numBuckets) {
                    const bucketPrice = periodLow + (bucketIndex * priceBucketSize);

                    // TradingView gives more weight to prices near the close price
                    // This helps identify where most trading actually occurred
                    let volumeWeight = 1.0;

                    // Calculate distance from this price to the close price
                    const distToClose = Math.abs(price - bar.close);

                    // Give more weight to prices near the close
                    if (distToClose < priceBucketSize) {
                        volumeWeight = 5.0; // Increased weight near close price (was 3.0)
                    } else if (distToClose < priceBucketSize * 3) {
                        volumeWeight = 2.5; // Increased weight for prices somewhat near close (was 1.5)
                    }

                    // Add weighted volume to this price bucket
                    // Divide by numLevels to distribute volume across the bar's price range
                    priceBuckets[bucketPrice.toFixed(8)] += (barVolume / numLevels) * volumeWeight;
                }
            }
        });

        // Add extra debug output to help diagnose POC issues
        console.log('Volume profile calculation details:', {
            periodLow,
            periodHigh,
            numBuckets,
            priceBucketSize,
            numPriceBuckets: Object.keys(priceBuckets).length,
            sampleBuckets: Object.entries(priceBuckets)
                .sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]))
                .slice(0, 5)
                .map(([price, volume]) => ({ price: parseFloat(price), volume }))
        });

        // Debug output to check price buckets
        console.log('Volume profile calculation:', {
            periodLow,
            periodHigh,
            numBuckets,
            priceBucketSize,
            numPriceBuckets: Object.keys(priceBuckets).length
        });

        // Convert buckets to array for easier processing
        const pricePoints = Object.entries(priceBuckets).map(([price, volume]) => ({
            price: parseFloat(price),
            volume: volume
        })).filter(point => point.volume > 0);

        // Sort by price (ascending)
        pricePoints.sort((a, b) => a.price - b.price);

        // Calculate total volume and find max volume
        let totalVolume = 0;
        let maxVolume = 0;
        let pocPrice = 0;
        let previousPocPrice = volumeProfileData.poc; // Store the previous POC price
        let hasSignificantChange = false;

        // First pass: calculate total volume and find max volume
        pricePoints.forEach(point => {
            totalVolume += point.volume;
            if (point.volume > maxVolume) {
                maxVolume = point.volume;
                pocPrice = point.price;
            }
        });

        // Second pass: find all price points with volume close to max volume
        // This helps identify potential POC candidates
        const pocCandidates = [];
        const volumeThreshold = maxVolume * 0.95; // Consider points within 95% of max volume

        pricePoints.forEach(point => {
            if (point.volume >= volumeThreshold) {
                pocCandidates.push({
                    price: point.price,
                    volume: point.volume
                });
            }
        });

        // Sort candidates by volume (highest first)
        pocCandidates.sort((a, b) => b.volume - a.volume);

        console.log('POC candidates:', pocCandidates);

        // If we have a previous POC and it's among the candidates, prefer to keep it
        // This adds "stickiness" to prevent the POC from jumping around
        if (previousPocPrice > 0) {
            // Check if previous POC is among the candidates
            const previousPocCandidate = pocCandidates.find(c =>
                Math.abs(c.price - previousPocPrice) < 0.0001);

            if (previousPocCandidate) {
                // If previous POC is still a valid candidate, keep it
                console.log('Keeping previous POC as it\'s still a valid candidate');
                pocPrice = previousPocPrice;
            } else {
                // If the top candidate has significantly more volume than others,
                // or if the previous POC is no longer valid, use the new top candidate
                hasSignificantChange = true;
                console.log('Previous POC is no longer a valid candidate, using new POC');
            }
        }

        // Calculate Value Area (68% of total volume) - as requested
        const valueAreaVolume = totalVolume * 0.68;
        let currentVolume = 0;
        let valueAreaPrices = [];

        // Find the exact POC index
        const pocIndex = pricePoints.findIndex(point => Math.abs(point.price - pocPrice) < 0.0001);
        if (pocIndex < 0) {
            console.error('POC index not found, using closest match');
            // Find closest price point to POC
            let minDist = Infinity;
            let closestIndex = -1;

            pricePoints.forEach((point, index) => {
                const dist = Math.abs(point.price - pocPrice);
                if (dist < minDist) {
                    minDist = dist;
                    closestIndex = index;
                }
            });

            if (closestIndex >= 0) {
                console.log(`Using closest price point to POC: ${pricePoints[closestIndex].price} (POC was ${pocPrice})`);
                pocPrice = pricePoints[closestIndex].price;
            }
        }

        // Start from POC and expand outward (TradingView approach)
        // This is how TradingView calculates the Value Area
        const exactPocIndex = pricePoints.findIndex(point => Math.abs(point.price - pocPrice) < 0.0001);

        if (exactPocIndex >= 0) {
            // Add POC to value area
            valueAreaPrices.push(pocPrice);
            currentVolume += pricePoints[exactPocIndex].volume;

            // Expand outward from POC, always taking the higher volume side first
            let upIndex = exactPocIndex + 1;
            let downIndex = exactPocIndex - 1;

            // Keep adding price levels until we reach 70% of total volume
            while (currentVolume < valueAreaVolume && (upIndex < pricePoints.length || downIndex >= 0)) {
                // Get volumes above and below current value area
                const upVolume = upIndex < pricePoints.length ? pricePoints[upIndex].volume : 0;
                const downVolume = downIndex >= 0 ? pricePoints[downIndex].volume : 0;

                if (upVolume > downVolume) {
                    // Add the upper price level
                    if (upIndex < pricePoints.length) {
                        valueAreaPrices.push(pricePoints[upIndex].price);
                        currentVolume += upVolume;
                    }
                    upIndex++;
                } else {
                    // Add the lower price level
                    if (downIndex >= 0) {
                        valueAreaPrices.push(pricePoints[downIndex].price);
                        currentVolume += downVolume;
                    }
                    downIndex--;
                }
            }

            // Log value area calculation details
            console.log('Value Area calculation (68%):', {
                totalVolume,
                valueAreaTarget: valueAreaVolume,
                actualValueAreaVolume: currentVolume,
                percentOfTotal: (currentVolume / totalVolume * 100).toFixed(2) + '%',
                numPricesInValueArea: valueAreaPrices.length
            });
        } else {
            console.error('Could not find exact POC in price points array');
        }

        // Find Value Area High and Value Area Low
        const valueAreaHigh = Math.max(...valueAreaPrices);
        const valueAreaLow = Math.min(...valueAreaPrices);

        // Update volume profile data
        volumeProfileData.pricePoints = pricePoints;
        volumeProfileData.maxVolume = maxVolume;
        volumeProfileData.totalVolume = totalVolume;
        volumeProfileData.valueAreaHigh = valueAreaHigh;
        volumeProfileData.valueAreaLow = valueAreaLow;

        // Only update POC if:
        // 1. We don't have a previous POC (first calculation)
        // 2. The previous POC is no longer a valid candidate
        // 3. There's a significant change in the volume profile
        if (previousPocPrice === 0 || hasSignificantChange) {
            volumeProfileData.poc = pocPrice;
            console.log('POC updated to:', pocPrice);
        } else {
            console.log('Maintaining previous POC:', previousPocPrice);
        }

        console.log('Volume profile calculated:', {
            totalBars: recentBars.length,
            pricePoints: pricePoints.length,
            totalVolume,
            poc: pocPrice,
            valueAreaHigh,
            valueAreaLow
        });
    }

    function formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');

        // Check if this is a future date
        const now = new Date();
        const isFuture = date > now;

        // We don't need the timeframe for formatting anymore

        // TradingView style: Always use hours:minutes format without seconds
        let timeFormat = `${hours}:${minutes}`;

        // Add a prefix for future dates to make them visually distinct
        if (isFuture) {
            timeFormat = `→${timeFormat}`; // Arrow indicating future
        }

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

        // Save the current context state
        ctx.save();

        // Debug info - uncomment if needed
        // console.log('drawCrosshair called:', { mouseX, mouseY, time: new Date().toISOString() });

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

                // Make sure the time is aligned with the current timeframe
                // Reduced logging to improve performance
                // const date = new Date(hoveredTime);
                // const tf = window.currentTimeframe || currentTimeframe;
                // console.log('Hovering over existing bar at time:', date.toLocaleTimeString(), 'with timeframe:', tf);
                // console.log('Bar index:', barIndex, 'of', bars.length, 'bars');
                // console.log('Bar data:', bars[barIndex]);

                // We're not adding seconds anymore as requested
            } else if (barIndex >= bars.length) {
                // We're hovering over a future bar
                const lastBarTime = bars[bars.length - 1].time;
                const futureBarOffset = barIndex - bars.length + 1;
                const baseFutureTime = lastBarTime + (barIntervalMs * futureBarOffset);

                // We're not adding seconds anymore as requested
                hoveredTime = baseFutureTime;
                isFutureBar = true;
                // console.log('Hovering over future bar at time:', new Date(hoveredTime).toLocaleTimeString());
            }
        } else {
            // console.log('No bars available for time tag');
        }

        // Draw crosshair lines with consistent styling
        ctx.strokeStyle = getColor('crosshair', 'rgba(150, 150, 150, 0.5)');
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);

        // Round coordinates to ensure pixel-perfect alignment
        const roundedCrosshairX = Math.round(crosshairX) + 0.5; // Add 0.5 for crisp 1px lines
        const roundedMouseY = Math.round(mouseY) + 0.5; // Add 0.5 for crisp 1px lines

        // Draw vertical line (extending to the bottom of the canvas)
        // Always use the snapped X position for the vertical line
        ctx.beginPath();
        ctx.moveTo(roundedCrosshairX, 0);
        ctx.lineTo(roundedCrosshairX, canvas.height);
        ctx.stroke();

        // Draw horizontal line (only in the area where the mouse is)
        // Use the exact mouse Y position for precise price hovering
        ctx.beginPath();
        if (mouseY < chartHeight) {
            // Mouse is in chart area
            ctx.moveTo(0, roundedMouseY);
            ctx.lineTo(chartWidth, roundedMouseY);
        } else {
            // Mouse is in histogram area
            ctx.moveTo(0, roundedMouseY);
            ctx.lineTo(chartWidth, roundedMouseY);
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

            // Always use the rounded snapped position for the time tag to align with the vertical line
            // Use the same rounded X coordinate as the vertical line for perfect alignment
            const timeTagX = Math.round(roundedCrosshairX - timeTagWidth / 2);
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
            // Use the same rounded X coordinate as the vertical line for perfect alignment
            ctx.fillText(formattedTime, roundedCrosshairX, timeTagY + timeTagHeight / 2);

            // Reduced logging to improve performance
            // console.log('Time tag displayed:', formattedTime, 'for timestamp:', new Date(hoveredTime).toLocaleString());
        }

        // Draw price label to the left of the price scale
        if (hoveredPrice !== null) {
            // ONLY show the zoom lens if the global flag is true AND we have a valid limit order
            // This double-check ensures the zoom lens disappears when not hovering over a limit
            if (showZoomLens === true && hoveredLimitOrder !== null && typeof hoveredLimitOrder === 'object') {
                console.log('Drawing zoom lens for limit order:', hoveredLimitOrder.type, 'at price', hoveredLimitOrder.price);
                // Draw a zoom lens for the limit order
                const labelWidth = 180;
                const labelHeight = 80;
                const labelX = chartWidth - labelWidth - 5; // Position to the left of price scale with a small gap
                // Round to the nearest pixel to avoid blurry rendering and ensure alignment with the horizontal line
                const labelY = Math.round(mouseY);

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
                // Use exact mouseY for precise alignment with the horizontal line
                // Round to the nearest pixel to avoid blurry rendering
                const labelY = Math.round(mouseY);

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

        // Restore the context state
        ctx.restore();
    }

    function drawBidAskTags() {
        if (!ctx || !canvas) return;

        console.log('Drawing bid/ask tags and price tag/countdown');

        // Save the current context state
        ctx.save();

        // Get current coin
        const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';

        // Debug orderbook data
        console.log('Orderbook data for tags:', {
            bids: orderbook.bids ? orderbook.bids.length : 0,
            asks: orderbook.asks ? orderbook.asks.length : 0
        });

        // Ensure we have valid orderbook data
        if (!orderbook.bids || !orderbook.asks) {
            console.error('Invalid orderbook data for tags');
        }

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

        // Always add current price tag if we have bars data
        if (bars.length > 0) {
            // Get the current price from the last bar
            const currentPrice = bars[bars.length - 1].close;
            const currentPriceY = getYForPrice(currentPrice);

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
                value: null,
                visible: true // Always make the price tag visible
            });

            // Always add countdown tag (will be positioned after adjusting all tags)
            // Use the same color as the price tag for consistency
            tags.push({
                type: 'countdown',
                y: currentPriceY + tagHeight + 2, // Initial position, will be adjusted
                height: tagHeight,
                color: priceColor, // Use the same color as the price tag
                price: null,
                value: null,
                visible: true // Always make the countdown visible
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
            // If the tag already has visibility set (like price tag and countdown), respect that
            if (tag.visible !== undefined) {
                // Keep the existing visibility setting
            }
            // For price-based tags, check if the price is within the visible range
            else if (tag.price !== null) {
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

                // Get current coin for price formatting
                const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin() : { pricePrecision: 2 };

                // Calculate price range for dynamic precision
                const visiblePriceRange = maxPrice - minPrice;

                // Get appropriate precision based on zoom level
                const precision = getDynamicPricePrecision(currentCoin, visiblePriceRange);

                // Format price with the correct precision
                ctx.fillText(tag.price.toFixed(precision), priceTagX, tagY);

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

                // Get current coin for price formatting
                const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin() : { pricePrecision: 2 };

                // Calculate price range for dynamic precision
                const visiblePriceRange = maxPrice - minPrice;

                // Get appropriate precision based on zoom level
                const precision = getDynamicPricePrecision(currentCoin, visiblePriceRange);

                // Format price with the correct precision
                ctx.fillText(tag.price.toFixed(precision), priceTagX, tagY);

                // No connecting line needed - the tag will extend through the separator
            }
        });

        // Restore the context state to ensure clean drawing state for subsequent operations
        ctx.restore();
        console.log('Bid/ask tags drawing complete');
    }

    // Function to filter orders within 2.5% of the current price
    function filterOrdersWithinPercentage(orders, currentPrice, percentage = 2.5) {
        if (!orders || !orders.length || !currentPrice) return [];

        // Calculate the price range (2.5% up and down)
        const lowerBound = currentPrice * (1 - percentage / 100);
        const upperBound = currentPrice * (1 + percentage / 100);

        // Filter orders within the range
        return orders.filter(order => {
            const price = order[0]; // price is at index 0
            return price >= lowerBound && price <= upperBound;
        });
    }

    // Draw the 2.5% range bid/ask strength histogram (left side of pane)
    function drawAllOrdersBidAskStrengthHistogram() {
        if (!ctx || !canvas) return;

        // Check if bid/ask strength histogram is visible
        if (!isBidAskStrengthVisible) {
            console.log('Bid/Ask strength histogram is not visible, skipping 2.5% range orders');
            return;
        }

        // Save the current context state
        ctx.save();

        // Make sure line dash is reset to solid lines
        ctx.setLineDash([]);

        console.log('Drawing 2.5% range bid/ask strength histogram');

        // Calculate the total USD value of bids and asks within 2.5% of current price
        let totalBidValue = 0;
        let totalAskValue = 0;

        // Ensure unfilteredOrderbook is properly initialized
        if (!window.unfilteredOrderbook || !window.unfilteredOrderbook.bids || !window.unfilteredOrderbook.asks) {
            console.error('Unfiltered orderbook not properly initialized for histogram');
            window.unfilteredOrderbook = { bids: [], asks: [] };
            unfilteredOrderbook = window.unfilteredOrderbook;
        }

        // Get current price from the last bar
        const currentPrice = bars.length > 0 ? bars[bars.length - 1].close : 0;
        if (currentPrice === 0) {
            console.log('Cannot calculate 2.5% range - current price is 0');
            ctx.restore();
            return;
        }

        // Filter orders within 2.5% of current price
        const unfilteredOrderbookToUse = window.unfilteredOrderbook;
        const rangePercentage = 2.5; // 2.5% up and down

        // Filter bids and asks within 2.5% of current price
        const filteredBids = filterOrdersWithinPercentage(unfilteredOrderbookToUse.bids, currentPrice, rangePercentage);
        const filteredAsks = filterOrdersWithinPercentage(unfilteredOrderbookToUse.asks, currentPrice, rangePercentage);

        // Take top 20 by value
        const topBids = filteredBids.sort((a, b) => b[2] - a[2]).slice(0, 20);
        const topAsks = filteredAsks.sort((a, b) => b[2] - a[2]).slice(0, 20);

        console.log('2.5% range orderbook data:', {
            bids: topBids.length,
            asks: topAsks.length,
            currentPrice: currentPrice,
            lowerBound: currentPrice * (1 - rangePercentage / 100),
            upperBound: currentPrice * (1 + rangePercentage / 100)
        });

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
        const chartHeight = canvas.height - timeScaleHeight - histogramHeight - histogramPaneGap;
        const histogramY = chartHeight;
        const histogramWidth = (canvas.width - priceScaleWidth) / 2; // Half width for side-by-side display

        // Draw background for left half of histogram pane
        ctx.fillStyle = '#131722'; // Dark background
        ctx.fillRect(0, histogramY, histogramWidth, histogramHeight);

        // Draw separator line between chart and histogram
        ctx.strokeStyle = '#2a2e39'; // Slightly lighter than background
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, histogramY);
        ctx.lineTo(canvas.width, histogramY);
        ctx.stroke();

        // Draw vertical separator between the two histograms
        ctx.beginPath();
        ctx.moveTo(histogramWidth, histogramY);
        ctx.lineTo(histogramWidth, histogramY + histogramHeight);
        ctx.stroke();

        // Draw a subtle drag handle at the top of the histogram pane
        ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
        ctx.fillRect(0, histogramY, histogramWidth, 3);

        // Draw a drag indicator button in the middle of the pane separator
        // Check if sidebar is visible
        const isSidebarVisible = document.body.classList.contains('sidebar-visible');

        // Calculate the position based on sidebar visibility
        let middleX;
        if (isSidebarVisible) {
            // Position at the center of the visible area (excluding sidebar)
            // We need to account for the sidebar width in the calculation
            const visibleAreaWidth = canvas.width - priceScaleWidth;
            middleX = visibleAreaWidth / 2;
        } else {
            // Position at the center when sidebar is hidden
            const fullWidth = canvas.width - priceScaleWidth;
            middleX = fullWidth / 2;
        }

        const buttonWidth = 30;
        const buttonHeight = 10;
        const buttonX = middleX - buttonWidth / 2;

        // Log the position for debugging
        console.log('Depth pane drag button center position:', middleX, 'Sidebar visible:', isSidebarVisible);
        const buttonY = histogramY - buttonHeight / 2;

        // Draw button background
        ctx.fillStyle = 'rgba(50, 50, 50, 0.7)';
        ctx.beginPath();
        ctx.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, 3);
        ctx.fill();

        // Draw drag handle icon (three horizontal lines)
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.8)';
        ctx.lineWidth = 1;

        // Draw three horizontal lines inside the button
        for (let i = 0; i < 3; i++) {
            const lineY = buttonY + 2 + i * 3;
            ctx.beginPath();
            ctx.moveTo(buttonX + 5, lineY);
            ctx.lineTo(buttonX + buttonWidth - 5, lineY);
            ctx.stroke();
        }

        // Draw title for the histogram pane
        ctx.font = 'bold 10px Arial';
        ctx.fillStyle = '#999';
        ctx.textAlign = 'left';
        ctx.fillText(`2.5% Range Depth`, 5, histogramY + 10);

        // Draw the histogram bars
        const midPoint = histogramWidth / 2;
        const maxBars = 20; // Maximum 20 bars on each side
        const barSpacing = 1; // Space between bars
        const maxBarHeight = histogramHeight - 18; // Leave space for labels

        // Find the maximum value for scaling
        const maxValue = Math.max(
            ...bidValues,
            ...askValues,
            1000 // Minimum scale to avoid division by zero
        );

        // Draw bid bars (left side, green)
        const bidBarWidth = Math.min(2, (histogramWidth/2 - 15) / maxBars - barSpacing);
        bidValues.forEach((value, index) => {
            if (index >= maxBars) return; // Only show top 20

            const barHeight = Math.min((value / maxValue) * maxBarHeight, maxBarHeight * 0.9);
            const x = midPoint - 5 - (index + 1) * (bidBarWidth + barSpacing);
            const y = histogramY + histogramHeight - 5 - barHeight;

            // Use customizable bid strength color
            ctx.fillStyle = getColor('bidStrengthColor', 'rgba(38, 166, 154, 0.7)');
            ctx.fillRect(x, y, bidBarWidth, barHeight);
        });

        // Draw ask bars (right side, red)
        const askBarWidth = Math.min(2, (histogramWidth/2 - 15) / maxBars - barSpacing);
        askValues.forEach((value, index) => {
            if (index >= maxBars) return; // Only show top 20

            const barHeight = Math.min((value / maxValue) * maxBarHeight, maxBarHeight * 0.9);
            const x = midPoint + 5 + index * (askBarWidth + barSpacing);
            const y = histogramY + histogramHeight - 5 - barHeight;

            // Use customizable ask strength color
            ctx.fillStyle = getColor('askStrengthColor', 'rgba(239, 83, 80, 0.7)');
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

        // Draw strength indicator - only show the stronger side
        const totalValue = totalBidValue + totalAskValue;
        if (totalValue > 0) {
            const bidPercentage = Math.round((totalBidValue / totalValue) * 100);
            const askPercentage = 100 - bidPercentage;

            ctx.textAlign = 'center';
            ctx.font = 'bold 9px Arial';

            if (bidPercentage > askPercentage) {
                // Bid pressure is stronger
                ctx.fillStyle = getColor('bidStrengthColor', 'rgba(38, 166, 154, 0.7)');
                ctx.fillText(
                    `2.5%: ${bidPercentage}% Bid ($${formatCompactNumber(totalBidValue)})`,
                    midPoint,
                    histogramY + 12
                );
            } else if (askPercentage > bidPercentage) {
                // Ask pressure is stronger
                ctx.fillStyle = getColor('askStrengthColor', 'rgba(239, 83, 80, 0.7)');
                ctx.fillText(
                    `2.5%: ${askPercentage}% Ask ($${formatCompactNumber(totalAskValue)})`,
                    midPoint,
                    histogramY + 12
                );
            } else {
                // Equal pressure (50/50)
                ctx.fillStyle = '#999';
                ctx.fillText(
                    `2.5%: 50% Neutral ($${formatCompactNumber(totalValue)})`,
                    midPoint,
                    histogramY + 12
                );
            }
        }

        // Restore the context state
        ctx.restore();
    }

    // Draw the filtered bid/ask strength histogram (right side of pane)
    function drawBidAskStrengthHistogram() {
        if (!ctx || !canvas) return;

        // Check if bid/ask strength histogram is visible
        if (!isBidAskStrengthVisible) {
            console.log('Bid/Ask strength histogram is not visible, skipping');
            return;
        }

        // Save the current context state
        ctx.save();

        // Make sure line dash is reset to solid lines
        ctx.setLineDash([]);

        console.log('Drawing filtered bid/ask strength histogram');

        // Calculate the total USD value of top bids and asks
        let totalBidValue = 0;
        let totalAskValue = 0;

        // Get top 20 bids and asks from filtered orderbook
        // Ensure orderbook is properly initialized
        if (!orderbook || !orderbook.bids || !orderbook.asks) {
            console.error('Orderbook not properly initialized for histogram');
            orderbook = { bids: [], asks: [] };
        }

        const topBids = orderbook.bids.slice(0, 20);
        const topAsks = orderbook.asks.slice(0, 20);

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
        const fullWidth = canvas.width - priceScaleWidth;
        const histogramWidth = fullWidth / 2; // Half width for side-by-side display
        const rightSideX = histogramWidth; // Starting X position for the right side

        // Draw background for right half of histogram pane only
        ctx.fillStyle = '#131722'; // Dark background
        ctx.fillRect(rightSideX, histogramY, histogramWidth, histogramHeight);

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

        // Draw a subtle drag handle at the top of the histogram pane
        ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
        ctx.fillRect(rightSideX, histogramY, histogramWidth, 3);

        // Draw a drag indicator button in the middle of the pane separator
        // Check if sidebar is visible
        const isSidebarVisible = document.body.classList.contains('sidebar-visible');

        // Calculate the position based on sidebar visibility
        let middleX;
        if (isSidebarVisible) {
            // Position at the center of the visible area (excluding sidebar)
            // We need to account for the sidebar width in the calculation
            const visibleAreaWidth = canvas.width - priceScaleWidth;
            middleX = visibleAreaWidth / 2;
        } else {
            // Position at the center when sidebar is hidden
            const fullWidth = canvas.width - priceScaleWidth;
            middleX = fullWidth / 2;
        }

        const buttonWidth = 30;
        const buttonHeight = 10;
        const buttonX = middleX - buttonWidth / 2;

        // Log the position for debugging
        console.log('Filtered depth pane drag button center position:', middleX, 'Sidebar visible:', isSidebarVisible);
        const buttonY = histogramY - buttonHeight / 2;

        // Draw button background
        ctx.fillStyle = 'rgba(50, 50, 50, 0.7)';
        ctx.beginPath();
        ctx.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, 3);
        ctx.fill();

        // Draw drag handle icon (three horizontal lines)
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.8)';
        ctx.lineWidth = 1;

        // Draw three horizontal lines inside the button
        for (let i = 0; i < 3; i++) {
            const lineY = buttonY + 2 + i * 3;
            ctx.beginPath();
            ctx.moveTo(buttonX + 5, lineY);
            ctx.lineTo(buttonX + buttonWidth - 5, lineY);
            ctx.stroke();
        }

        // Update global variable
        window.histogramHeight = histogramHeight;

        // Draw title for the histogram pane
        ctx.font = 'bold 10px Arial';
        ctx.fillStyle = '#999';
        ctx.textAlign = 'left';
        ctx.fillText('Filtered Depth', rightSideX + 5, histogramY + 10);

        // Draw the histogram bars
        const midPoint = rightSideX + (histogramWidth / 2);
        const maxBars = 20; // Maximum 20 bars on each side
        const barSpacing = 1; // Space between bars
        const maxBarHeight = histogramHeight - 18; // Leave space for labels

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
        ctx.fillText(`Bids: $${formatNumber(totalBidValue)}`, rightSideX + 5, histogramY + histogramHeight - 5);
        ctx.textAlign = 'right';
        ctx.fillText(`Asks: $${formatNumber(totalAskValue)}`, rightSideX + histogramWidth - 5, histogramY + histogramHeight - 5);

        // Draw strength indicator at the top
        ctx.textAlign = 'center';
        ctx.font = 'bold 9px Arial';

        // Calculate total value and percentages
        const totalValue = totalBidValue + totalAskValue;
        if (totalValue > 0) {
            const bidPercentage = Math.round((totalBidValue / totalValue) * 100);
            const askPercentage = 100 - bidPercentage;

            if (bidPercentage > askPercentage) {
                // Bid pressure is stronger
                ctx.fillStyle = getColor('bidStrengthColor', 'rgba(38, 166, 154, 0.7)');
                ctx.fillText(
                    `Filtered: ${bidPercentage}% Bid ($${formatCompactNumber(totalBidValue)})`,
                    midPoint,
                    histogramY + 12
                );
            } else if (askPercentage > bidPercentage) {
                // Ask pressure is stronger
                ctx.fillStyle = getColor('askStrengthColor', 'rgba(239, 83, 80, 0.7)');
                ctx.fillText(
                    `Filtered: ${askPercentage}% Ask ($${formatCompactNumber(totalAskValue)})`,
                    midPoint,
                    histogramY + 12
                );
            } else {
                // Equal pressure (50/50)
                ctx.fillStyle = '#999';
                ctx.fillText(
                    `Filtered: 50% Neutral ($${formatCompactNumber(totalValue)})`,
                    midPoint,
                    histogramY + 12
                );
            }
        }

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
                ctx.moveTo(rightSideX + histogramWidth, y);
                ctx.lineTo(canvas.width - 5, y);
                ctx.stroke();

                // Draw scale label
                ctx.fillText(`$${formatCompactNumber(value)}`, rightSideX + histogramWidth + 5, y + 3);
            }
        });

        // Restore the context state
        ctx.restore();
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

    // Helper function to determine appropriate price precision based on zoom level
    function getDynamicPricePrecision(coin, priceRange) {
        // Only apply dynamic precision to XRP
        if (coin.symbol !== 'XRP') {
            return coin.pricePrecision || 2;
        }

        // For XRP, determine precision based on price range (zoom level)
        if (priceRange >= 0.3) { // Very zoomed out
            return 0; // Show whole numbers
        } else if (priceRange >= 0.1) { // Moderately zoomed out
            return 1; // Show 1 decimal
        } else if (priceRange >= 0.03) { // Default zoom
            return 2; // Show 2 decimals
        } else if (priceRange >= 0.005) { // Zoomed in
            return 3; // Show 3 decimals
        } else { // Very zoomed in
            return 4; // Show 4 decimals (maximum)
        }
    }

    // Helper function to update all button positions when histogram height changes
    function updateButtonPositions() {
        // Find all buttons that need to be repositioned
        const buttons = document.querySelectorAll('button[style*="bottom"]');
        const resetZoomButton = document.getElementById('resetZoomButton');

        // Calculate the new bottom position
        const bottomPosition = (timeScaleHeight + histogramHeight + histogramPaneGap + 10) + 'px';

        // Update each button's position, excluding the reset zoom button
        buttons.forEach(button => {
            // Skip the reset zoom button - it should always stay at the bottom right
            if (button === resetZoomButton) return;

            if (button.style.bottom.includes(timeScaleHeight) ||
                button.style.bottom.includes('px')) {
                button.style.bottom = bottomPosition;
            }
        });

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

    // Variables for line interaction
    let hoveredLine = null;
    let hoveredEndpoint = null; // 'start' or 'end' to indicate which endpoint is hovered
    let mouseHasMoved = false; // Track if mouse has moved since mouse down

    // Function to draw all user-drawn lines
    function drawLines() {
        if (!ctx || !canvas) return;

        // Reset hovered line state
        hoveredLine = null;
        hoveredEndpoint = null;

        // Set cursor based on current state
        if (isDrawingLine || isLineDrawingMode || isDragging) {
            // Always use plus sign cursor when drawing lines or dragging the chart
            canvas.classList.add('cursor-plus');
        } else {
            // Keep plus sign cursor when over chart area
            if (mouseX !== null && mouseY !== null && mouseX < canvas.width - priceScaleWidth) {
                canvas.classList.add('cursor-plus');
            } else {
                canvas.style.cursor = 'default';
                canvas.classList.remove('cursor-plus');
            }
        }

        // Draw all saved lines
        if (lines.length > 0) {
            // Set line style
            ctx.lineWidth = 2;
            ctx.strokeStyle = getColor('lineColor', '#2196F3'); // Use custom color from color customizer
            ctx.setLineDash([]); // Solid line

            lines.forEach((line, index) => {
                // Calculate X positions based on bar index to handle horizontal scrolling correctly
                const startX = (line.startBarIndex - viewOffset) * barWidth + barWidth / 2;
                const endX = (line.endBarIndex - viewOffset) * barWidth + barWidth / 2;

                // Calculate Y positions based on stored prices to handle zooming/panning correctly
                const startY = getYForPrice(line.startPrice);
                const endY = getYForPrice(line.endPrice);

                // Check if line is visible on screen
                const isVisible = (
                    (startX >= 0 && startX <= canvas.width - priceScaleWidth) ||
                    (endX >= 0 && endX <= canvas.width - priceScaleWidth)
                );

                if (isVisible) {
                    // Draw the line
                    ctx.beginPath();
                    ctx.moveTo(startX, startY);
                    ctx.lineTo(endX, endY);
                    ctx.stroke();

                    // Check if mouse is hovering over this line
                    if (mouseX !== null && mouseY !== null && !isDrawingLine && !isDragging) {
                        // Check for endpoint hover first (higher priority)
                        const endpointRadius = 5;
                        const startDistance = Math.sqrt((mouseX - startX) ** 2 + (mouseY - startY) ** 2);
                        const endDistance = Math.sqrt((mouseX - endX) ** 2 + (mouseY - endY) ** 2);

                        if (startDistance <= endpointRadius) {
                            // Hovering over start endpoint
                            hoveredLine = {
                                index: index,
                                line: line,
                                startX: startX,
                                startY: startY,
                                endX: endX,
                                endY: endY
                            };
                            hoveredEndpoint = 'start';
                        } else if (endDistance <= endpointRadius) {
                            // Hovering over end endpoint
                            hoveredLine = {
                                index: index,
                                line: line,
                                startX: startX,
                                startY: startY,
                                endX: endX,
                                endY: endY
                            };
                            hoveredEndpoint = 'end';
                        } else {
                            // Check if hovering over the line itself
                            const distance = distanceToLine(mouseX, mouseY, startX, startY, endX, endY);
                            if (distance < 5) { // 5px threshold for hover detection
                                hoveredLine = {
                                    index: index,
                                    line: line,
                                    startX: startX,
                                    startY: startY,
                                    endX: endX,
                                    endY: endY
                                };
                            }
                        }

                        // If this line is hovered, highlight it and draw endpoints
                        if (hoveredLine && hoveredLine.index === index) {
                            // Highlight the hovered line
                            ctx.lineWidth = 3;
                            ctx.strokeStyle = getColor('lineHighlightColor', '#4CAF50'); // Use custom highlight color
                            ctx.beginPath();
                            ctx.moveTo(startX, startY);
                            ctx.lineTo(endX, endY);
                            ctx.stroke();

                            // Draw endpoint dots
                            ctx.fillStyle = hoveredEndpoint === 'start' ?
                                getColor('hoveredEndpointColor', '#FF5722') :
                                getColor('endpointColor', '#4CAF50');
                            ctx.beginPath();
                            ctx.arc(startX, startY, 5, 0, Math.PI * 2);
                            ctx.fill();

                            ctx.fillStyle = hoveredEndpoint === 'end' ?
                                getColor('hoveredEndpointColor', '#FF5722') :
                                getColor('endpointColor', '#4CAF50');
                            ctx.beginPath();
                            ctx.arc(endX, endY, 5, 0, Math.PI * 2);
                            ctx.fill();

                            // Set cursor style based on what's being hovered
                            if (hoveredEndpoint) {
                                canvas.style.cursor = 'move'; // Show move cursor for endpoints
                            } else {
                                canvas.style.cursor = 'pointer'; // Show pointer for line body
                            }

                            // Reset styles
                            ctx.lineWidth = 2;
                            ctx.strokeStyle = getColor('lineColor', '#2196F3');
                        }
                    }
                }
            });
        }

        // Draw the line currently being drawn
        if (isDrawingLine && currentLine) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = getColor('lineColor', '#2196F3'); // Use custom color for the line being drawn
            ctx.setLineDash([5, 5]); // Dashed line while drawing

            // Draw the line
            ctx.beginPath();
            ctx.moveTo(currentLine.startX, currentLine.startY);
            ctx.lineTo(currentLine.endX, currentLine.endY);
            ctx.stroke();

            // Reset line dash
            ctx.setLineDash([]);
        }
    }

    function drawHeatmapLine(price, dollarValue, color, maxDollarValue) {
        // Only process if price is within visible range
        if (price >= minPrice && price <= maxPrice) {
            // Calculate exact Y position for the price
            const y = getYForPrice(price);
            if (!isFinite(y)) return;

            // Get minimum dollar value threshold for the current coin
            const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
            userMinOrderValue = window.coinMinOrderValues[currentCoin] || coinMinOrderValues[currentCoin];
            let minDollarValue = userMinOrderValue * 1000; // Convert from k to actual USD value

            // Only draw lines for orders above the threshold
            if (dollarValue < minDollarValue) return;

            // Calculate line width based on dollar value relative to max dollar value
            // Use a more aggressive power curve for better contrast between small and large orders
            const valueRatio = Math.min(1, dollarValue / maxDollarValue);

            // Make smaller lines thinner and bigger lines thicker
            const minLineWidth = 1; // Minimum line width for visibility
            const maxLineWidth = 10; // Maximum line width to avoid overwhelming the chart

            // Use cubic power for more dramatic contrast between small and large orders
            const lineWidth = minLineWidth + Math.pow(valueRatio, 2) * (maxLineWidth - minLineWidth);

            // Ensure pixel-perfect alignment for crisp lines
            const roundedY = Math.round(y) + 0.5; // Add 0.5 for crisp 1px lines

            // Draw the line with the calculated width and color
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            ctx.moveTo(0, roundedY);
            ctx.lineTo(canvas.width - priceScaleWidth, roundedY); // Extend to price scale edge
            ctx.stroke();
        }
    }

    // Function to draw the measurement tool
    function drawMeasurementTool() {
        if (!ctx || !canvas || !measurementStart || !measurementEnd) return;

        // Calculate percentage change
        const startPrice = measurementStart.price;
        const endPrice = measurementEnd.price;

        if (!startPrice || !endPrice) return;

        const priceDiff = endPrice - startPrice;
        const percentChange = (priceDiff / startPrice) * 100;

        // Get bullish and bearish candle colors from color customizer
        const bullishColor = getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a'));
        const bearishColor = getColor('bearishCandleBody', getColor('bearishCandle', '#ef5350'));

        // Convert hex to rgba with full opacity
        const bullishRgba = bullishColor.startsWith('#') ?
            `rgba(${parseInt(bullishColor.slice(1, 3), 16)}, ${parseInt(bullishColor.slice(3, 5), 16)}, ${parseInt(bullishColor.slice(5, 7), 16)}, 1.0)` :
            bullishColor;
        const bearishRgba = bearishColor.startsWith('#') ?
            `rgba(${parseInt(bearishColor.slice(1, 3), 16)}, ${parseInt(bearishColor.slice(3, 5), 16)}, ${parseInt(bearishColor.slice(5, 7), 16)}, 1.0)` :
            bearishColor;

        // Draw the measurement line
        ctx.save();

        // Set line style
        ctx.lineWidth = 2;
        ctx.strokeStyle = percentChange >= 0 ? bullishRgba : bearishRgba;
        ctx.setLineDash([5, 5]); // Dashed line

        // Draw the line
        ctx.beginPath();
        ctx.moveTo(measurementStart.x, measurementStart.y);
        ctx.lineTo(measurementEnd.x, measurementEnd.y);
        ctx.stroke();

        // Reset line dash
        ctx.setLineDash([]);

        // Draw dots at the endpoints
        const dotRadius = 4;

        // Start point dot
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(measurementStart.x, measurementStart.y, dotRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = percentChange >= 0 ? bullishRgba : bearishRgba;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(measurementStart.x, measurementStart.y, dotRadius, 0, Math.PI * 2);
        ctx.stroke();

        // End point dot
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(measurementEnd.x, measurementEnd.y, dotRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = percentChange >= 0 ? bullishRgba : bearishRgba;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(measurementEnd.x, measurementEnd.y, dotRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Draw the percentage label
        const labelX = (measurementStart.x + measurementEnd.x) / 2;
        const labelY = (measurementStart.y + measurementEnd.y) / 2;

        // Format the percentage
        const formattedPercent = percentChange.toFixed(2);
        const percentText = `${formattedPercent}%`;

        // Draw label background
        ctx.font = 'bold 12px Arial';
        const textWidth = ctx.measureText(percentText).width;
        const padding = 6;
        const bgWidth = textWidth + padding * 2;
        const bgHeight = 20;

        // Create solid color versions for the background (no transparency)
        const bullishBgRgba = bullishColor.startsWith('#') ?
            `rgba(${parseInt(bullishColor.slice(1, 3), 16)}, ${parseInt(bullishColor.slice(3, 5), 16)}, ${parseInt(bullishColor.slice(5, 7), 16)}, 1.0)` :
            bullishColor;
        const bearishBgRgba = bearishColor.startsWith('#') ?
            `rgba(${parseInt(bearishColor.slice(1, 3), 16)}, ${parseInt(bearishColor.slice(3, 5), 16)}, ${parseInt(bearishColor.slice(5, 7), 16)}, 1.0)` :
            bearishColor;

        // Use the bullish/bearish colors for the background
        ctx.fillStyle = percentChange >= 0 ? bullishBgRgba : bearishBgRgba;
        ctx.fillRect(labelX - bgWidth / 2, labelY - bgHeight / 2, bgWidth, bgHeight);

        // Draw label text
        // Use black text for bright backgrounds, white text for dark backgrounds
        const bgColor = percentChange >= 0 ? bullishColor : bearishColor;
        const textColor = isBrightColor(bgColor) ? 'black' : 'white';
        console.log('Setting measurement text color:', textColor, 'for background color:', bgColor);
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(percentText, labelX, labelY);

        // Draw price labels at each endpoint
        ctx.font = '10px Arial';

        // Start price label
        const startPriceText = startPrice.toFixed(2);
        ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';
        ctx.fillText(startPriceText, measurementStart.x, measurementStart.y - 15);
        ctx.fillStyle = 'white';
        ctx.fillText(startPriceText, measurementStart.x, measurementStart.y - 16);

        // End price label
        const endPriceText = endPrice.toFixed(2);
        ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';
        ctx.fillText(endPriceText, measurementEnd.x, measurementEnd.y - 15);
        ctx.fillStyle = 'white';
        ctx.fillText(endPriceText, measurementEnd.x, measurementEnd.y - 16);

        // If not actively measuring, clear the measurement after a delay
        if (!isMeasuring) {
            if (!window.measurementClearTimeout) {
                window.measurementClearTimeout = setTimeout(() => {
                    measurementStart = null;
                    measurementEnd = null;
                    window.measurementClearTimeout = null;
                    drawChart();
                }, 3000); // Clear after 3 seconds
            }
        } else if (window.measurementClearTimeout) {
            // If we're measuring again, clear any existing timeout
            clearTimeout(window.measurementClearTimeout);
            window.measurementClearTimeout = null;
        }

        ctx.restore();
    }

    function drawVwap() {
        // Early return if VWAP is not visible or canvas is not available
        if (!ctx || !canvas) {
            console.error('Canvas or context not available for VWAP');
            return;
        }

        // Check if VWAP is visible
        if (!isVwapVisible) {
            console.log('VWAP is not visible, skipping drawVwap');
            return;
        }

        // Make sure VWAP is initialized if needed
        if (!vwapData || vwapData.startTime === 0 || !vwapData.points || vwapData.points.length === 0) {
            console.log('VWAP data not initialized or empty, initializing...');
            try {
                initializeVwapPeriod();

                // Process historical bars to populate VWAP data
                if (bars && bars.length > 0) {
                    console.log(`Processing ${bars.length} bars for VWAP initialization`);
                    bars.forEach(bar => {
                        if (isInCurrentVwapPeriod(bar.time)) {
                            // Historical bars are considered closed
                            updateVwap(bar, true);
                        }
                    });
                }
            } catch (error) {
                console.error('Error initializing VWAP:', error);
                return;
            }
        }

        console.log('Drawing VWAP with', vwapData.points.length, 'points');

        try {
            // Save the current context state
            ctx.save();

            // Make sure line dash is reset to solid lines
            ctx.setLineDash([]);

            // Check if we have bars data
            if (!bars || bars.length === 0) {
                console.log('No bars data available for VWAP');
                ctx.restore(); // Make sure to restore context before returning
                return;
            }

            const startIndex = Math.max(0, Math.floor(viewOffset));
            const endIndex = Math.min(bars.length, startIndex + Math.ceil(visibleBars));

            if (startIndex >= endIndex) {
                console.log('Invalid index range for VWAP');
                ctx.restore(); // Make sure to restore context before returning
                return;
            }

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

            // Calculate barWidth for VWAP drawing
            const chartWidth = canvas.width - priceScaleWidth;
            const currentBarWidth = chartWidth / visibleBars;

            drawVwapLine(
                extendedPoints, // Use the extended points array
                startTime,
                endTime,
                startIndex,
                endIndex,
                vwapColor, // Use customized color for current day
                2,
                vwapBandsColor, // Use customized color for bands with custom opacity
                false, // This is current day's VWAP
                currentBarWidth // Pass the calculated barWidth
            );
            }
        } catch (error) {
            console.error('Error in drawVwap:', error);
            // Make sure to restore context even if there's an error
            ctx.restore();
        }
    }

    function drawVolumeProfile() {
        console.log('drawVolumeProfile called:', {
            hasContext: !!ctx,
            hasCanvas: !!canvas,
            isVolumeProfileVisible,
            pricePointsLength: volumeProfileData.pricePoints.length
        });

        if (!ctx || !canvas) {
            console.error('Missing canvas or context for volume profile');
            return;
        }

        if (!isVolumeProfileVisible) {
            console.log('Volume profile is not visible, skipping drawVolumeProfile');
            return;
        }

        // Make sure we have a valid canvas size
        if (canvas.width <= 0 || canvas.height <= 0) {
            console.error('Invalid canvas dimensions for volume profile');
            return;
        }

        // Check if we're zoomed in too much - hide volume profile when zoom level is too high
        // This prevents the red line issue in the top left when zoomed in
        if (visibleBars < 10) { // If we're showing fewer than 10 bars, we're zoomed in too much
            console.log('Zoom level too high, hiding volume profile');
            return;
        }

        // If volume profile data is empty, calculate it
        if (volumeProfileData.pricePoints.length === 0) {
            console.log('Volume profile data is empty, calculating...');
            calculateVolumeProfile();
            // If still empty after calculation, return
            if (volumeProfileData.pricePoints.length === 0) {
                console.log('Failed to calculate volume profile data');
                return;
            }
        }

        // Get settings from color customizer if available
        const settings = window.colorCustomizer ? window.colorCustomizer.volumeProfileSettings : null;

        // Get customizable colors from color customizer
        let volumeProfileColor, pocColor, pocBarColor, valueAreaHighColor, valueAreaLowColor, vahLineColor, valLineColor;

        if (window.colorCustomizer && window.colorCustomizer.colors) {
            // Get colors from the main colors object
            volumeProfileColor = window.colorCustomizer.colors.volumeProfileColor || 'rgba(100, 149, 237, 0.6)';
            pocColor = window.colorCustomizer.colors.pocColor || 'rgba(255, 165, 0, 0.9)';
            pocBarColor = window.colorCustomizer.colors.pocBarColor || 'rgba(255, 165, 0, 0.7)';
            valueAreaHighColor = window.colorCustomizer.colors.valueAreaHighColor || 'rgba(46, 204, 113, 0.7)';
            valueAreaLowColor = window.colorCustomizer.colors.valueAreaLowColor || 'rgba(231, 76, 60, 0.7)';
            vahLineColor = window.colorCustomizer.colors.vahLineColor || 'rgba(46, 204, 113, 0.9)';
            valLineColor = window.colorCustomizer.colors.valLineColor || 'rgba(231, 76, 60, 0.9)';
        } else {
            // TradingView-style colors
            volumeProfileColor = 'rgba(118, 118, 118, 0.5)'; // Neutral gray like TradingView
            pocColor = 'rgba(255, 235, 59, 0.9)'; // Yellow for POC line
            pocBarColor = 'rgba(255, 235, 59, 0.9)'; // Yellow for POC bar
            valueAreaHighColor = 'rgba(118, 118, 118, 0.7)'; // Same as volume profile but more opaque
            valueAreaLowColor = 'rgba(118, 118, 118, 0.7)'; // Same as volume profile but more opaque
            vahLineColor = 'rgba(76, 175, 80, 0.9)'; // Green for VAH line
            valLineColor = 'rgba(244, 67, 54, 0.9)'; // Red for VAL line
        }

        console.log('Volume profile colors:', { volumeProfileColor, pocColor, pocBarColor, valueAreaHighColor, valueAreaLowColor, vahLineColor, valLineColor });

        // Get display options
        const showPocLine = settings && settings.showPocLine !== undefined ? settings.showPocLine : true;
        const showValueAreaHighLine = settings && settings.showValueAreaHighLine !== undefined ? settings.showValueAreaHighLine : true;
        const showValueAreaLowLine = settings && settings.showValueAreaLowLine !== undefined ? settings.showValueAreaLowLine : true;

        console.log('Volume profile display options:', { showPocLine, showValueAreaHighLine, showValueAreaLowLine });

        // No longer using bullish and bearish colors for volume profile

        // Calculate the width of the volume profile - smaller but still unconstrained
        // Allow it to use as much space as needed for high volume zones while taking less space overall
        const profileWidth = Math.min(canvas.width * 0.08, 80); // Smaller base width
        // We'll still allow bars to extend beyond this width when needed

        // Position the profile on the left side of the chart
        const profileX = 0;

        // Calculate the chart height (excluding time scale and histogram if visible)
        const chartHeight = canvas.height - timeScaleHeight - (isBidAskStrengthVisible ? histogramHeight + histogramPaneGap : 0);

        console.log('Drawing volume profile with chartHeight:', chartHeight);

        // Save context state
        ctx.save();

        // Set clipping region to prevent drawing outside the chart area and interfering with other elements
        // Make the clipping region much wider to ensure no bars are cut off
        ctx.beginPath();
        // Use a very wide clipping region - 3x the profile width to ensure no constraints
        ctx.rect(0, 0, profileWidth * 3, chartHeight);
        ctx.clip();

        // No background for the volume profile area as requested

        ctx.lineWidth = 1;
        // Make sure line dash is reset to solid lines
        ctx.setLineDash([]);

        // We'll draw the VAH, VAL, and POC lines after restoring the context
        // to ensure they extend fully across the chart

        ctx.setLineDash([]);

        // Group price points into rows matching the number of 5-minute bars (864 for 3 days)
        // This ensures each row corresponds to a specific time period
        const priceRange = maxPrice - minPrice;
        const numRows = 864; // Exactly 864 rows to match the 3 days of 5-minute bars
        const rowHeight = chartHeight / numRows;
        const priceStep = priceRange / numRows;

        // Create buckets for the grouped price points
        const volumeBuckets = new Array(numRows).fill(0);
        const bucketPrices = new Array(numRows).fill(0);

        // Distribute volume data into buckets
        volumeProfileData.pricePoints.forEach(point => {
            const bucketIndex = Math.min(numRows - 1, Math.floor((point.price - minPrice) / priceStep));
            if (bucketIndex >= 0 && bucketIndex < numRows) {
                volumeBuckets[bucketIndex] += point.volume;
                // Keep track of the price for each bucket (weighted average)
                bucketPrices[bucketIndex] = bucketPrices[bucketIndex] === 0 ?
                    point.price : (bucketPrices[bucketIndex] + point.price) / 2;
            }
        });

        // Find max volume in buckets for scaling
        const maxBucketVolume = Math.max(...volumeBuckets);

        // Log volume bucket statistics for debugging
        const nonZeroBuckets = volumeBuckets.filter(vol => vol > 0).length;
        console.log('Volume bucket statistics:', {
            maxVolume: maxBucketVolume,
            totalBuckets: volumeBuckets.length,
            nonZeroBuckets,
            percentFilled: ((nonZeroBuckets / volumeBuckets.length) * 100).toFixed(2) + '%',
            sampleVolumes: volumeBuckets.filter(vol => vol > 0).slice(0, 5)
        });

        // Find POC bucket based on the stored POC price, not just the max volume bucket
        // This ensures consistency with the calculated POC
        let pocBucketIndex = -1;

        if (volumeProfileData.poc > 0) {
            // Find the bucket that contains the POC price
            const pocPrice = volumeProfileData.poc;
            // Calculate which bucket should contain the POC price
            pocBucketIndex = Math.min(numRows - 1, Math.floor((pocPrice - minPrice) / priceStep));

            // Verify this bucket has volume - if not, fall back to max volume bucket
            if (pocBucketIndex < 0 || pocBucketIndex >= volumeBuckets.length || volumeBuckets[pocBucketIndex] === 0) {
                console.log('POC bucket has no volume, falling back to max volume bucket');
                pocBucketIndex = volumeBuckets.indexOf(Math.max(...volumeBuckets));
            }
        } else {
            // If no POC is stored, use the max volume bucket
            pocBucketIndex = volumeBuckets.indexOf(Math.max(...volumeBuckets));
        }

        // Log volume bucket statistics for debugging
        console.log('About to draw volume profile bars:', {
            numBuckets: volumeBuckets.length,
            nonZeroBuckets: volumeBuckets.filter(vol => vol > 0).length,
            maxVolume: maxBucketVolume,
            profileWidth,
            rowHeight
        });

        // Draw volume profile bars as vertical bars
        volumeBuckets.forEach((volume, index) => {
            if (volume === 0) return; // Skip empty buckets

            // Calculate bar position and dimensions
            const barY = chartHeight - (index + 1) * rowHeight;
            const barHeight = rowHeight;

            // Skip bars that are outside the visible chart area
            if (barY + barHeight < 0 || barY > chartHeight) {
                return; // Bar is not visible, skip drawing it
            }

            // Calculate the price for this bucket
            const bucketPrice = minPrice + (index + 0.5) * priceStep;

            // Determine if this is the POC
            const isPOC = index === pocBucketIndex;

            // Skip POC highlighting if POC is outside the visible price range
            const isPOCVisible = volumeProfileData.poc >= minPrice && volumeProfileData.poc <= maxPrice;

            // Determine if this is above VAH, below VAL, or in the value area
            // Also check if VAH and VAL are within the visible price range
            const isVAHVisible = volumeProfileData.valueAreaHigh >= minPrice && volumeProfileData.valueAreaHigh <= maxPrice;
            const isVALVisible = volumeProfileData.valueAreaLow >= minPrice && volumeProfileData.valueAreaLow <= maxPrice;

            const isAboveVAH = bucketPrice > volumeProfileData.valueAreaHigh;
            const isBelowVAL = bucketPrice < volumeProfileData.valueAreaLow;

            // Set color based on position relative to value area and POC
            let barColor;
            if (isPOC && isPOCVisible) {
                // POC gets its own bar color, but only if it's within the visible price range
                barColor = pocBarColor;
            } else if (isAboveVAH && isVAHVisible) {
                // Above Value Area High - use VAH color, but only if VAH is visible
                barColor = valueAreaHighColor;
            } else if (isBelowVAL && isVALVisible) {
                // Below Value Area Low - use VAL color, but only if VAL is visible
                barColor = valueAreaLowColor;
            } else {
                // In value area - use volume profile color
                barColor = volumeProfileColor;
            }

            // Draw the bar with a minimum width to ensure visibility
            ctx.fillStyle = barColor;

            // Completely unconstrained volume profile bars
            // Use a linear scale for direct volume representation
            // This ensures high volume zones can expand as much as needed

            // Calculate bar width as a direct proportion of the max volume
            // No power scaling or artificial constraints
            const volumeRatio = volume / maxBucketVolume;

            // Apply a moderate scale factor for the base size, but allow expansion for high volume
            const scaleFactor = 1.5; // Smaller base scale factor for a more compact profile
            // For high volume bars, we'll apply an additional multiplier

            // Calculate the bar width with a base scale factor
            let visibleBarWidth = profileWidth * volumeRatio * scaleFactor;

            // Special handling for high volume bars - allow them to expand beyond the base width
            if (volumeRatio > 0.5) { // If this is a high volume bar (>50% of max)
                // Apply an additional multiplier that increases with volume
                const expansionFactor = 1.0 + (volumeRatio - 0.5) * 2.0; // Ranges from 1.0 to 2.0
                visibleBarWidth *= expansionFactor;
            }

            // For low volume bars, use a minimum width
            // This ensures they're still visible but don't take up much space
            const minWidth = 0.5; // Minimum width for visibility
            const finalBarWidth = Math.max(minWidth, visibleBarWidth);

            // Log the width calculation for debugging high volume bars
            if (volumeRatio > 0.8) { // If this is a high volume bar (>80% of max)
                console.log(`High volume bar: ratio=${volumeRatio.toFixed(2)}, width=${finalBarWidth.toFixed(1)}px, max=${profileWidth * scaleFactor}px`);
            }

            // Draw the bar without a border (TradingView style)
            ctx.fillRect(profileX, barY, finalBarWidth, barHeight);

            // No border for TradingView-like clean appearance

            // Log the first few bars for debugging
            if (index < 5 && volume > 0) {
                console.log(`Bar ${index}: volume=${volume}, width=${finalBarWidth}, y=${barY}, height=${barHeight}`);
            }

            // Add highlight for POC - TradingView style
            if (isPOC && isPOCVisible) {
                // TradingView uses a different color for POC without borders
                ctx.fillStyle = pocBarColor; // Yellow for POC

                // Make POC bar slightly wider to ensure it stands out
                // For POC, we want it to be at least 20% wider than calculated
                const pocExtraWidth = Math.max(5, finalBarWidth * 0.2); // At least 5px or 20% wider
                ctx.fillRect(profileX, barY, finalBarWidth + pocExtraWidth, barHeight);

                // No border in TradingView style
            }
        });

        // Restore context to ensure we're not limited by the clipping region
        ctx.restore();

        // Now draw all the lines after restoring context to ensure they extend fully

        // Check if we're zoomed in too much - hide lines when zoom level is too high
        // This prevents the red line issue in the top left when zoomed in
        const isZoomedInTooMuch = visibleBars < 10;

        // Value Area High line - TradingView style
        if (showValueAreaHighLine && !isZoomedInTooMuch && volumeProfileData.valueAreaHigh) {
            // Check if VAH price is within the visible price range
            if (volumeProfileData.valueAreaHigh >= minPrice && volumeProfileData.valueAreaHigh <= maxPrice) {
                const valueAreaHighY = getYForPrice(volumeProfileData.valueAreaHigh);

                // Use the vahLineColor for VAH line
                ctx.strokeStyle = vahLineColor;
                ctx.setLineDash([]); // Solid line as requested
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, valueAreaHighY);
                ctx.lineTo(canvas.width - priceScaleWidth, valueAreaHighY);
                ctx.stroke();

                // No VAH label as requested
            }
        }

        // Value Area Low line - TradingView style
        if (showValueAreaLowLine && !isZoomedInTooMuch && volumeProfileData.valueAreaLow) {
            // Check if VAL price is within the visible price range
            if (volumeProfileData.valueAreaLow >= minPrice && volumeProfileData.valueAreaLow <= maxPrice) {
                const valueAreaLowY = getYForPrice(volumeProfileData.valueAreaLow);

                // Use the valLineColor for VAL line
                ctx.strokeStyle = valLineColor;
                ctx.setLineDash([]); // Solid line as requested
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, valueAreaLowY);
                ctx.lineTo(canvas.width - priceScaleWidth, valueAreaLowY);
                ctx.stroke();

                // No VAL label as requested
            }
        }

        // Draw POC price line across the entire chart - TradingView style
        if (showPocLine && !isZoomedInTooMuch && volumeProfileData.poc) {
            // Check if POC price is within the visible price range
            if (volumeProfileData.poc >= minPrice && volumeProfileData.poc <= maxPrice) {
                const pocY = getYForPrice(volumeProfileData.poc);

                // Draw a solid line for POC across the entire chart
                ctx.strokeStyle = pocColor;
                ctx.lineWidth = 1;
                ctx.setLineDash([]); // Solid line as requested
                ctx.beginPath();
                ctx.moveTo(0, pocY);
                ctx.lineTo(canvas.width - priceScaleWidth, pocY);
                ctx.stroke();

                // No POC label as requested
            }

            // Reset line dash
            ctx.setLineDash([]);
        }

        // Add a label for the volume profile - TradingView style
        ctx.font = '10px Arial'; // Not bold in TradingView
        ctx.fillStyle = 'rgba(150, 150, 150, 0.9)'; // Subtle gray like TradingView
        ctx.textAlign = 'center';
        // Get lookback days from settings or use default
        const lookbackDays = settings ? settings.lookbackDays : 3;
        ctx.fillText(`${lookbackDays}D Volume Profile`, profileX + profileWidth/2, 15);

        // Make sure to reset any context changes before restoring
        ctx.setLineDash([]);

        // Log before restoring context
        console.log('Volume profile drawing complete, about to restore context');

        // Restore context to ensure clean state for subsequent drawing operations
        ctx.restore();

        console.log('Context restored after volume profile drawing');
    }

    // Helper function to draw a VWAP line with standard deviation bands
    function drawVwapLine(points, startTime, endTime, startIndex, endIndex, lineColor, lineWidth, bandColor, isPreviousDay = false, currentBarWidth) {
        // Check if we have valid points
        if (!points || points.length === 0) {
            console.log('No points available for VWAP line');
            return;
        }

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
        // We'll calculate the tag position later

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

            const firstX = (firstPointIndex - viewOffset) * currentBarWidth + currentBarWidth / 2;
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

                const x = (closestIndex - viewOffset) * currentBarWidth + currentBarWidth / 2;
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

            const firstX = (firstPointIndex - viewOffset) * currentBarWidth + currentBarWidth / 2;
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

                const x = (closestIndex - viewOffset) * currentBarWidth + currentBarWidth / 2;
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

        const firstX = (firstPointIndex - viewOffset) * currentBarWidth + currentBarWidth / 2;
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

            const x = (closestIndex - viewOffset) * currentBarWidth + currentBarWidth / 2;
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

        // Calculate position for VWAP tags (12 bars away from the price scale)
        // Position from the right edge of the chart (where price scale begins)
        const tagX = canvas.width - priceScaleWidth - (12 * currentBarWidth);

        // Draw main VWAP label
        ctx.font = 'bold 10px Arial';

        // Use customized color for tags if available
        const tagColor = isPreviousDay ? lineColor : getColor('vwapTags', lineColor);

        // Use the tag color directly for text
        ctx.fillStyle = tagColor;
        ctx.textAlign = 'center';

        // Add PD prefix for previous day labels
        const prefix = isPreviousDay ? 'PD ' : '';

        ctx.fillText(`${prefix}VWAP`, tagX, lastY - 5);

        // Draw upper band label (STDEV+ - Standard Deviation Upper Band)
        if (lastUpperY) {
            // Use the tag color directly for text
            ctx.fillStyle = tagColor;
            ctx.fillText(`${prefix}STDEV+`, tagX, lastUpperY - 5);
        }

        // Draw lower band label (STDEV- - Standard Deviation Lower Band)
        if (lastLowerY) {
            // Use the tag color directly for text
            ctx.fillStyle = tagColor;
            ctx.fillText(`${prefix}STDEV-`, tagX, lastLowerY + 15);
        }

        // No legend in top left anymore

        // Restore the context state
        ctx.restore();
    }

    function updateBarCountdown() {
        // Make this function globally accessible
        window.updateBarCountdown = updateBarCountdown;
        // Get the current time
        const now = Date.now();

        // Calculate the current interval start time based on the current timeframe
        // This ensures we're aligned with real clock intervals (00:00, 00:01, 00:05, 00:15, etc.)
        const currentDate = new Date(now);
        const minutes = currentDate.getMinutes();
        const seconds = currentDate.getSeconds();
        const ms = currentDate.getMilliseconds();

        // Calculate the current interval start time based on the timeframe
        // Make sure we're using the latest timeframe value
        const tf = window.currentTimeframe || currentTimeframe;
        const currentInterval = Math.floor(minutes / tf) * tf;
        const intervalStart = new Date(currentDate);
        intervalStart.setMinutes(currentInterval);
        intervalStart.setSeconds(0);
        intervalStart.setMilliseconds(0);

        // Update lastBarTime
        lastBarTime = intervalStart.getTime();

        // Calculate minutes to the next interval boundary
        // Make sure we're using the latest timeframe value
        const minutesToNext = tf - (minutes % tf);
        // Calculate total milliseconds to the next interval boundary
        const msToNext = (minutesToNext * 60 * 1000) - (seconds * 1000) - ms;

        // Get the previous countdown value to detect when it reaches 0
        const previousCountdown = barCloseCountdown;

        // Calculate seconds remaining until next bar
        const newCountdown = Math.max(0, Math.floor(msToNext / 1000));

        // Make sure barCloseCountdown is globally accessible
        barCloseCountdown = newCountdown;
        window.barCloseCountdown = newCountdown;

        // Reset the bar creation flag when we're not at the interval boundary
        // This allows a new bar to be created for the next interval
        if (newCountdown > 0) {
            barCreatedForCurrentInterval = false;
            window.barCreatedForCurrentInterval = false;
        }

        // Check if we've just reached 0 from any positive value
        // This means the bar has just closed and we need to create a new one
        if (previousCountdown > 0 && newCountdown === 0 && !barCreatedForCurrentInterval) {
            console.log(`Bar countdown reached 0 (from ${previousCountdown}), creating new bar for next interval`);
            createNewBar();

            // Set the flag to prevent creating multiple bars for this interval
            barCreatedForCurrentInterval = true;
            window.barCreatedForCurrentInterval = true;
            lastBarCreationTime = now;
            window.lastBarCreationTime = now;
        }

        // Update the bar interval in milliseconds based on the current timeframe
        barIntervalMs = tf * 60 * 1000;
        window.barIntervalMs = barIntervalMs; // Update global variable

        // Log the countdown for debugging
        console.log(`Next ${tf}-min bar in: ${Math.floor(barCloseCountdown / 60)}:${(barCloseCountdown % 60).toString().padStart(2, '0')}`);
    }

    // Function to create a new bar when the current interval completes
    function createNewBar() {
        // Make this function globally accessible
        window.createNewBar = createNewBar;

        console.log('createNewBar called - creating a new bar for the next interval');

        // Check if we've already created a bar for this interval
        if (barCreatedForCurrentInterval) {
            console.log('Bar already created for current interval, skipping');
            return;
        }

        // Only proceed if we have bars and a current candle
        if (!bars || bars.length === 0) {
            console.log('Cannot create new bar: no existing bars');
            return;
        }

        // Get the last bar from the bars array
        const lastBar = bars[bars.length - 1];

        // Get the close price from the current candle or last bar
        const lastPrice = currentCandle ? currentCandle.close : lastBar.close;

        // Calculate the time for the new candle (next interval)
        const tf = window.currentTimeframe || currentTimeframe;
        const now = new Date();
        const minutes = now.getMinutes();
        const currentInterval = Math.floor(minutes / tf) * tf;
        const nextIntervalMinutes = (currentInterval + tf) % 60;

        // Create a date for the next interval
        const nextIntervalDate = new Date(now);
        nextIntervalDate.setMinutes(nextIntervalMinutes);
        nextIntervalDate.setSeconds(0);
        nextIntervalDate.setMilliseconds(0);

        // If we're crossing an hour boundary
        if (nextIntervalMinutes < currentInterval) {
            nextIntervalDate.setHours(nextIntervalDate.getHours() + 1);
        }

        const nextCandleTime = nextIntervalDate.getTime();

        // Create a new candle for the next interval
        const newCandle = {
            time: nextCandleTime,
            open: lastPrice,
            high: lastPrice,
            low: lastPrice,
            close: lastPrice
        };

        console.log(`Created new candle at ${new Date(nextCandleTime).toISOString()}:`, newCandle);

        // Update the current candle reference
        currentCandle = newCandle;
        currentCandleTime = nextCandleTime;

        // Make sure these are globally accessible
        window.currentCandle = newCandle;
        window.currentCandleTime = nextCandleTime;

        // Add the new candle to the bars array
        const existingIndex = bars.findIndex(b => b.time === nextCandleTime);
        if (existingIndex !== -1) {
            // Replace existing bar
            bars[existingIndex] = { ...newCandle };
            console.log(`Replaced existing bar at index ${existingIndex} with new candle`);
        } else {
            // Add new bar
            bars.push({ ...newCandle });
            // Sort bars by time (ascending)
            bars.sort((a, b) => a.time - b.time);
            console.log(`Added new candle to bars array, now has ${bars.length} bars`);
        }

        // Force a chart update
        drawChart();

        // Dispatch an event to notify other components that a new bar has been created
        document.dispatchEvent(new CustomEvent('newBarCreated', {
            detail: { bar: newCandle, time: nextCandleTime }
        }));
    }

    function startCountdownTimer() {
        // Clear any existing interval
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }

        // Update immediately
        updateBarCountdown();

        // Check if we need to create a new bar immediately
        // This handles cases where the page is loaded right at the interval boundary
        if (barCloseCountdown === 0 && !barCreatedForCurrentInterval) {
            console.log('Countdown is 0 at timer start, creating new bar immediately');
            createNewBar();
        }

        // Then update every second
        countdownInterval = setInterval(() => {
            // Update the countdown
            updateBarCountdown();

            // The updateBarCountdown function will handle creating a new bar if needed
            // We don't need to check the countdown here anymore as it would create duplicate bars

            // Only redraw if the chart is visible
            if (document.visibilityState === 'visible') {
                drawChart();
            }
        }, 1000);

        // Make the countdown timer globally accessible
        window.countdownInterval = countdownInterval;
    }

    function drawTimeScale() {
        if (!ctx || !canvas) {
            console.error('Canvas or context not available for time scale');
            return;
        }

        // Save context state to ensure time scale is drawn correctly
        ctx.save();

        // Use histogramHeight only if bid/ask strength is visible
        const histogramHeightToUse = isBidAskStrengthVisible ? histogramHeight : 0;
        const histogramPaneGapToUse = isBidAskStrengthVisible ? histogramPaneGap : 0;
        const chartWidth = canvas.width - priceScaleWidth;
        const chartHeight = canvas.height - timeScaleHeight - histogramHeightToUse - histogramPaneGapToUse;

            // Draw the filtered bid/ask strength histogram first (if visible)
            try {
                if (isBidAskStrengthVisible) {
                    drawBidAskStrengthHistogram();
                }
            } catch (error) {
                console.error('Error drawing bid/ask strength histogram:', error);
            }

            // Draw the all orders bid/ask strength histogram next (if visible)
            try {
                if (isBidAskStrengthVisible) {
                    drawAllOrdersBidAskStrengthHistogram();
                }
            } catch (error) {
                console.error('Error drawing all orders bid/ask strength histogram:', error);
            }

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

            // Calculate indices for visible bars
            const startIndex = Math.max(0, Math.floor(viewOffset));
            const endIndex = Math.min(bars.length, startIndex + Math.ceil(visibleBars));
            // Get visible bars without reversing (bars are already in chronological order)
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

        // We don't need to add future bars here anymore since they're already included in visibleBarsData
        // The future bars are now handled in the main drawChart function

        // Restore context state to ensure clean state for subsequent drawing operations
        ctx.restore();
    }

    function drawPriceScale() {
        if (!ctx || !canvas) {
            console.error('Canvas or context not available for price scale');
            return;
        }
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

                    // Get current coin for price formatting
                    const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin() : { pricePrecision: 2 };

                    // Calculate price range for dynamic precision
                    const visiblePriceRange = maxPrice - minPrice;

                    // Get appropriate precision based on zoom level
                    const precision = getDynamicPricePrecision(currentCoin, visiblePriceRange);

                    // Move price labels 20px to the left from the right edge of the price scale
                    ctx.fillText(price.toFixed(precision), canvas.width - 20, y + 3);
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

    // Animation frame request ID for cancellation
    let animationFrameId = null;

    // Flag to track if a chart update is pending
    let isChartUpdatePending = false;

    // Function to request a chart update using requestAnimationFrame
    function requestChartUpdate(forceUpdate = false) {
        // If force update is requested, cancel any pending update and draw immediately
        if (forceUpdate && animationFrameId) {
            window.cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
            isChartUpdatePending = false;
        }

        if (!isChartUpdatePending || forceUpdate) {
            isChartUpdatePending = true;
            console.log(`Requesting chart update at ${new Date().toISOString()}`);
            animationFrameId = window.requestAnimationFrame(() => {
                console.log(`Drawing chart at ${new Date().toISOString()}`);
                drawChart();
                isChartUpdatePending = false;
            });
        }
    }

    function drawChart() {
        try {
            if (!ctx || !canvas) {
                console.error('Canvas or context is not available');
                return;
            }

            // If a coin change is in progress, don't draw the chart yet
            if (isCoinChangeInProgress) {
                console.log('Coin change in progress, skipping chart draw');
                return;
            }

            // Reset line dash pattern to solid lines at the beginning of each draw cycle
            ctx.setLineDash([]);

            // Make drawChart and requestChartUpdate globally accessible
            window.drawChart = drawChart;
            window.requestChartUpdate = requestChartUpdate;

            // Expose bars and currentCandle to allow external updates
            window.bars = bars;
            window.currentCandle = currentCandle;
            window.currentCandleTime = currentCandleTime;

            // Check if we have a latest price from the real-time updater
            if (window.realTimeUpdater && window.realTimeUpdater.getLatestPrice && bars.length > 0) {
                const latestPrice = window.realTimeUpdater.getLatestPrice();
                if (latestPrice !== null) {
                    console.log(`drawChart: Using latest price from realTimeUpdater: ${latestPrice}`);

                    // Update the last candle with the latest price
                    const lastCandle = bars[bars.length - 1];
                    lastCandle.high = Math.max(lastCandle.high, latestPrice);
                    lastCandle.low = Math.min(lastCandle.low, latestPrice);
                    lastCandle.close = latestPrice;

                    // Also update the current candle reference if available
                    if (currentCandle) {
                        currentCandle.high = Math.max(currentCandle.high, latestPrice);
                        currentCandle.low = Math.min(currentCandle.low, latestPrice);
                        currentCandle.close = latestPrice;
                    }
                }
            }

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

            // Calculate indices for visible bars
            // viewOffset is set to show the most recent bars by default
            const startIndex = Math.max(0, Math.floor(viewOffset));
            const endIndex = Math.min(bars.length, startIndex + Math.ceil(visibleBars));
            // Get visible bars without reversing (bars are already in chronological order)
            let visibleBarsData = bars.slice(startIndex, endIndex);
            const fractionalOffset = viewOffset - startIndex;

            // Handle the case when we're scrolled into the future area
            // If we have fewer bars than expected, we're in the future area
            const expectedBars = Math.ceil(visibleBars);
            if (visibleBarsData.length < expectedBars && bars.length > 0) {
                // Create empty future bars to fill the gap
                const lastBar = bars[bars.length - 1];
                const missingBars = expectedBars - visibleBarsData.length;

                for (let i = 0; i < missingBars; i++) {
                    // Create a placeholder bar with the same close price as the last real bar
                    // but make it visually distinct (no body, just a line)
                    const futureTime = lastBar.time + ((i + 1) * barIntervalMs);
                    const placeholderBar = {
                        time: futureTime,
                        open: lastBar.close,
                        high: lastBar.close,
                        low: lastBar.close,
                        close: lastBar.close,
                        isFuture: true // Mark as a future bar for special rendering
                    };
                    visibleBarsData.push(placeholderBar);
                }
            }

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
                        minPrice = window.latestPrice > 0 ? window.latestPrice * 0.99 : 0;
                        maxPrice = window.latestPrice > 0 ? window.latestPrice * 1.01 : 1;
                    }
                } else if (window.latestPrice > 0) {
                    // If we have a price but no bars, use the current price
                    minPrice = window.latestPrice * 0.95;
                    maxPrice = window.latestPrice * 1.05;
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

                // Track when we start drawing orderbook lines
                const drawLinesStartTime = Date.now();
                window.lastOrderbookLinesDrawStartTime = drawLinesStartTime;

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

                // Track how long it took to draw all orderbook lines
                const drawLinesEndTime = Date.now();
                const drawLinesTime = drawLinesEndTime - drawLinesStartTime;

                // Only log occasionally to reduce console spam
                if (Math.random() < 0.05) { // 5% of updates
                    console.log(`Orderbook lines draw time: ${drawLinesTime}ms (${orderbook.bids.length} bids, ${orderbook.asks.length} asks)`);
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

                // Check if this is a future bar
                if (bar.isFuture) {
                    // For future bars, use a dashed line with neutral color
                    const futureColor = getColor('futureBar', '#888888');

                    // Draw a dashed vertical line for future bar
                    ctx.strokeStyle = futureColor;
                    ctx.lineWidth = 1;
                    ctx.setLineDash([3, 3]); // Dashed line
                    ctx.beginPath();
                    ctx.moveTo(candleX + candleWidth / 2, yHigh);
                    ctx.lineTo(candleX + candleWidth / 2, yLow);
                    ctx.stroke();
                    ctx.setLineDash([]); // Reset to solid line

                    // Skip the rest of the candle drawing for future bars
                    return;
                }

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

            // Make sure to reset line dash pattern before drawing bid/ask tags
            ctx.setLineDash([]);

                    // Make sure current price is set before drawing tags
            if (bars.length > 0) {
                const currentPrice = bars[bars.length - 1].close;
                const priceY = getYForPrice(currentPrice);
                currentPriceY = priceY;

                // Update global price variable
                window.latestPrice = currentPrice;
            }

            // We'll draw bid/ask tags after the price scale to ensure they appear on top

            // Calculate volume profile data if needed
            if (isVolumeProfileVisible && volumeProfileData.pricePoints.length === 0) {
                console.log('Volume profile is visible but data is empty, calculating...');
                // Force recalculation of volume profile data
                try {
                    calculateVolumeProfile();
                    console.log('Volume profile data calculated successfully');
                } catch (error) {
                    console.error('Error calculating volume profile data:', error);
                }
            }

            // Draw user-drawn lines
            drawLines();

            // Update line drawing button state
            updateLineDrawingButtonState();

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

            // Draw whale watcher markers if the function is available
            if (typeof window.drawWhaleMarkers === 'function') {
                // Pass mouse coordinates to enable hover tooltips
                window.drawWhaleMarkers(ctx, bars, getYForPrice, barWidth, viewOffset, mouseX, mouseY);
            } else {
                console.log('Whale watcher markers function not available yet');
            }

            // Always draw price scale and time scale first to ensure they're visible
            console.log('Drawing price scale and time scale');
            drawPriceScale();
            drawTimeScale();

            // Draw the depth indicators if visible (in a separate context to avoid affecting other elements)
            if (isBidAskStrengthVisible) {
                console.log('Drawing depth indicators in separate context...');
                // Save the main context before drawing depth indicators
                ctx.save();
                drawBidAskStrengthHistogram();
                drawAllOrdersBidAskStrengthHistogram();
                // Restore the main context after drawing depth indicators
                ctx.restore();
                console.log('Main context restored after depth indicators');
            }

            // Draw volume profile if visible (in a separate context to avoid affecting other elements)
            // Draw it after price scale, time scale, and depth indicators to ensure they remain visible
            if (isVolumeProfileVisible) {
                try {
                    console.log('Drawing volume profile in separate context...');
                    // Save the main context before drawing volume profile
                    ctx.save();
                    drawVolumeProfile();
                    // Restore the main context after drawing volume profile
                    ctx.restore();
                    console.log('Main context restored after volume profile');
                } catch (error) {
                    console.error('Error drawing volume profile:', error);
                    // Make sure context is restored even if there's an error
                    try { ctx.restore(); } catch (e) { /* ignore */ }
                }
            }

            // Now draw bid/ask tags on top of everything else
            // This ensures the price tag and countdown overlay the price scale
            console.log('Drawing bid/ask tags on top of price scale');
            drawBidAskTags();

            // Draw crosshair if mouse is over the chart
            if (mouseX !== null && mouseY !== null) {
                // Save context before drawing crosshair
                ctx.save();
                drawCrosshair();
                // Restore context after drawing crosshair
                ctx.restore();
            }

            // Draw measurement tool if we have measurement points
            if (measurementStart && measurementEnd) {
                drawMeasurementTool();
            }

            // Crosshair is already drawn above

            // Make price available globally for other components
            window.latestPrice = bars.length > 0 ? bars[bars.length - 1].close : 0;

            // Set cursor style based on active tools
            if (canvas) {
                if (isMeasurementToolActive || isLineDrawingMode || isDragging) {
                    // Always use plus sign cursor when measuring, drawing lines, or dragging the chart
                    canvas.classList.add('cursor-plus');
                } else if (mouseX !== null && mouseY !== null && mouseX < canvas.width - priceScaleWidth) {
                    canvas.classList.add('cursor-plus');
                } else {
                    canvas.style.cursor = 'default';
                    canvas.classList.remove('cursor-plus');
                }
            }
        } catch (error) {
            console.error('Error in drawChart:', error);
        }
    }

    // Connection status widget removed

    // Removed drawCoinIndicator function as we now only use the top bar indicator

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

    // Initialize the threshold slider
    function initializeThresholdSlider() {
        console.log('Initializing threshold slider...');
        const sliderContainer = document.querySelector('.slider-container');
        const input = document.getElementById('threshold-input');
        const recommendedButton = document.getElementById('set-recommended');

        if (!sliderContainer || !input || !recommendedButton) {
            console.error('Slider container, input, or recommended button elements not found!');
            return;
        }

        console.log('Slider container and input elements found:', sliderContainer, input);

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
        const input = document.getElementById('threshold-input');
        const recommendedText = document.getElementById('recommended-value');

        if (!input) {
            console.error('Input element not found!');
            return;
        }

        const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
        let currentValue = window.coinMinOrderValues[currentCoin] || coinMinOrderValues[currentCoin];
        const minValue = window.coinMinSliderValues[currentCoin] || 25;
        const recommendedValue = window.coinRecommendedValues[currentCoin] || 400;

        // Round to nearest 25k step
        currentValue = Math.round(currentValue / 25) * 25;

        console.log(`Manually updating slider for ${currentCoin}: value=${currentValue}, min=${minValue}, recommended=${recommendedValue}`);

        // Update input value
        input.min = minValue;
        input.value = currentValue;

        // Update custom slider if available
        if (window.customSlider) {
            window.customSlider.setOptions({
                min: minValue,
                value: currentValue,
                step: 25 // Ensure step is set to 25k
            });
        }

        // We don't need to update the min delimiter text anymore
        // as we now have min/max labels on the slider

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

    // Initialize the timeframe selector
    function initializeTimeframeSelector() {
        console.log('Initializing timeframe selector...');
        const timeframeButtons = document.querySelectorAll('.timeframe-button');

        if (!timeframeButtons || timeframeButtons.length === 0) {
            console.error('Timeframe selector buttons not found!');
            return;
        }

        // Set the active button based on the current timeframe
        console.log('Setting active timeframe button for timeframe:', currentTimeframe);
        timeframeButtons.forEach(btn => {
            const btnTimeframe = parseInt(btn.getAttribute('data-timeframe'));
            if (btnTimeframe === currentTimeframe) {
                btn.classList.add('active');
                // Set background color to bullish candle color
                const bullishColor = getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a'));
                btn.style.backgroundColor = bullishColor;
                // Set text color based on background brightness
                const textColor = isBrightColor(bullishColor) ? 'black' : 'white';
                btn.style.color = textColor;
                console.log('Timeframe button active: bg color =', bullishColor, 'text color =', textColor);
            } else {
                btn.classList.remove('active');
                // Reset to default styling
                btn.style.backgroundColor = '#2a2e39';
                btn.style.color = '#aaa';
            }
        });

        timeframeButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Get the timeframe from the button's data attribute
                const newTimeframe = parseInt(button.getAttribute('data-timeframe'));

                // Only proceed if the timeframe is different
                if (newTimeframe !== currentTimeframe) {
                    console.log(`Switching timeframe from ${currentTimeframe}m to ${newTimeframe}m`);

                    // Update active button styling
                    timeframeButtons.forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');

                    // Update the current timeframe
                    currentTimeframe = newTimeframe;
                    window.currentTimeframe = newTimeframe; // Update global variable

                    // Save the selected timeframe to localStorage
                    localStorage.setItem('currentTimeframe', newTimeframe);

                    // Update the bar interval
                    barIntervalMs = currentTimeframe * 60 * 1000;
                    window.barIntervalMs = barIntervalMs; // Update global variable

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
                        const newKlineChannel = `kline.${currentTimeframe}.${currentCoin.bybitSymbol}`;
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
                                processNewBar(newBar);
                            }
                        });
                    }

                    // Reset chart data
                    bars = [];

                    // Reset VWAP
                    initializeVwapPeriod();

                    // Reset volume profile data
                    volumeProfileData.pricePoints = [];
                    volumeProfileData.maxVolume = 0;
                    volumeProfileData.totalVolume = 0;
                    volumeProfileData.valueAreaHigh = 0;
                    volumeProfileData.valueAreaLow = 0;
                    volumeProfileData.poc = 0;

                    // Fetch new historical data
                    fetchHistoricalData();

                    // Update the countdown timer
                    updateBarCountdown();
                }
            });
        });
    }

    // Initialize the custom slider
    function initializeCustomSlider() {
        console.log('Initializing custom slider...');
        // Hide the original slider to prevent conflicts
        const originalSlider = document.getElementById('threshold-slider');
        if (originalSlider) {
            originalSlider.style.display = 'none';
        }

        const sliderContainer = document.querySelector('.slider-container');
        const input = document.getElementById('threshold-input');
        const recommendedButton = document.getElementById('set-recommended');

        if (!sliderContainer || !input || !recommendedButton) {
            console.error('Slider container, input, or recommended button elements not found!');
            return;
        }

        // Get current coin values
        const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
        const currentValue = window.coinMinOrderValues[currentCoin] || coinMinOrderValues[currentCoin];
        const minValue = coinMinSliderValues[currentCoin] || 25; // Default to 25k for unknown coins
        const recommendedValue = window.coinRecommendedValues[currentCoin] || 400; // Default to 400k for unknown coins

        console.log(`Initializing custom slider for ${currentCoin}: value=${currentValue}, min=${minValue}, recommended=${recommendedValue}`);

        // Initialize input value
        input.value = currentValue;
        input.min = minValue;

        // Create custom slider
        const customSlider = new CustomSlider({
            container: sliderContainer,
            min: minValue,
            max: 1000,
            value: currentValue,
            step: 25, // Increment by 25k steps
            onChange: (value) => {
                // Update input value
                input.value = value;

                // Update the value for the current coin
                const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
                window.coinMinOrderValues[currentCoin] = value;
                coinMinOrderValues[currentCoin] = value;

                // Save to localStorage
                localStorage.setItem(`minOrderValue_${currentCoin}`, value);

                // Redraw chart to update heatmap
                drawChart();
            }
        });

        // Store the custom slider instance globally
        window.customSlider = customSlider;

        // We don't need to update the min delimiter text anymore
        // as we now have min/max labels on the slider

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

        // Update when input changes
        input.addEventListener('change', (e) => {
            let value = parseInt(e.target.value);
            const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
            const minValue = coinMinSliderValues[currentCoin] || 25; // Default to 25k for unknown coins

            // Ensure value is within range
            if (value < minValue) value = minValue;
            if (value > 1000) value = 1000;

            // Round to nearest 25k step
            value = Math.round(value / 25) * 25;

            // Update input
            input.value = value;

            // Update custom slider
            customSlider.setValue(value);

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
            let recommendedValue = window.coinRecommendedValues[currentCoin] || 400;

            // Round to nearest 25k step
            recommendedValue = Math.round(recommendedValue / 25) * 25;

            // Update input
            input.value = recommendedValue;

            // Update custom slider
            customSlider.setValue(recommendedValue);

            // Update the value for the current coin
            window.coinMinOrderValues[currentCoin] = recommendedValue;

            // Save to localStorage
            localStorage.setItem(`minOrderValue_${currentCoin}`, recommendedValue);

            // Redraw chart to update heatmap
            drawChart();
        });

        // Function to update slider for current coin
        function updateCustomSliderForCurrentCoin() {
            const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
            let currentValue = window.coinMinOrderValues[currentCoin] || coinMinOrderValues[currentCoin];
            const minValue = coinMinSliderValues[currentCoin] || 25; // Default to 25k for unknown coins
            const recommendedValue = window.coinRecommendedValues[currentCoin] || 400; // Default to 400k for unknown coins

            // Round to nearest 25k step
            currentValue = Math.round(currentValue / 25) * 25;

            console.log(`Updating custom slider for ${currentCoin}: value=${currentValue}, min=${minValue}, recommended=${recommendedValue}`);

            // Update custom slider
            customSlider.setOptions({
                min: minValue,
                value: currentValue,
                step: 25 // Ensure step is set to 25k
            });

            // Update input
            input.value = currentValue;
            input.min = minValue;

            // We don't need to update the min delimiter text anymore
            // as we now have min/max labels on the slider

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

        // Make the update function available globally
        window.updateCustomSliderForCurrentCoin = updateCustomSliderForCurrentCoin;

        // Listen for coin changes to update the slider
        document.addEventListener('coinChanged', (event) => {
            console.log('Coin changed event received:', event.detail);
            updateCustomSliderForCurrentCoin();
        });

        // Also listen for the global coin change event
        window.addEventListener('coinChanged', (event) => {
            console.log('Window coin changed event received:', event.detail);
            updateCustomSliderForCurrentCoin();
        });

        // Add direct event listeners to coin buttons as a fallback
        const coinButtons = document.querySelectorAll('.coin-selector-container button');
        coinButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Wait a short time for the coin manager to update
                setTimeout(() => {
                    console.log('Coin button clicked, updating slider');
                    updateCustomSliderForCurrentCoin();
                }, 100);
            });
        });

        return updateCustomSliderForCurrentCoin;
    }

    // Initialize the threshold slider when the DOM is fully loaded
    document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM loaded, initializing threshold slider...');
        // Try multiple times with increasing delays to ensure initialization
        setTimeout(() => initializeThresholdSlider(), 100);
        setTimeout(() => initializeThresholdSlider(), 500);
        setTimeout(() => initializeThresholdSlider(), 1000);

        // Initialize custom slider
        setTimeout(() => initializeCustomSlider(), 200);
        setTimeout(() => initializeCustomSlider(), 600);
        setTimeout(() => initializeCustomSlider(), 1200);

        // Also try to manually update the slider
        setTimeout(() => updateThresholdSliderForCurrentCoin(), 1500);

        // Add a direct event listener to the slider as a fallback
        setTimeout(() => {
            const slider = document.getElementById('threshold-slider');
            const input = document.getElementById('threshold-input');
            if (slider && input) {
                console.log('Adding direct event listener to slider');
                slider.addEventListener('input', function(e) {
                    const value = parseInt(e.target.value);
                    input.value = value;

                    // Update the slider progress bar
                    const min = parseInt(slider.min) || 25;
                    const max = parseInt(slider.max) || 1000;
                    const progress = ((value - min) / (max - min)) * 100;
                    slider.style.setProperty('--slider-progress', `${progress}%`);

                    // Update the value for the current coin
                    const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
                    window.coinMinOrderValues[currentCoin] = value;
                    coinMinOrderValues[currentCoin] = value;

                    // Save to localStorage
                    localStorage.setItem(`minOrderValue_${currentCoin}`, value);

                    // Redraw chart to update heatmap
                    drawChart();
                });
            }
        }, 2000);

        // Initialize the timeframe selector
        setTimeout(() => initializeTimeframeSelector(), 100);
        setTimeout(() => initializeTimeframeSelector(), 500);
        setTimeout(() => initializeTimeframeSelector(), 1000);
    });

    // Function to update UI elements with bullish candle color
    function updateUIColors() {
        // Get the bullish candle color from CSS variable
        const bullishColor = getComputedStyle(document.documentElement).getPropertyValue('--bullish-candle-color').trim() || '#26a69a';

        // Update threshold slider
        const thresholdSlider = document.getElementById('threshold-slider');
        if (thresholdSlider) {
            // Update the slider track color using CSS variable
            document.documentElement.style.setProperty('--slider-track-color', bullishColor);
        }

        // Update recommended value text
        const recommendedValue = document.getElementById('recommended-value');
        if (recommendedValue) {
            recommendedValue.style.color = bullishColor;
        }

        // Update set recommended button
        const setRecommendedButton = document.getElementById('set-recommended');
        if (setRecommendedButton) {
            setRecommendedButton.style.backgroundColor = bullishColor;
        }

        // Update input focus border color
        const thresholdInput = document.getElementById('threshold-input');
        if (thresholdInput) {
            thresholdInput.addEventListener('focus', function() {
                this.style.borderColor = bullishColor;
            });
            thresholdInput.addEventListener('blur', function() {
                this.style.borderColor = '#3a3f4c';
            });
        }

        console.log('Updated UI elements with bullish candle color:', bullishColor);
    }

    // Listen for color updates to update CSS variables and UI elements
    document.addEventListener('colorsUpdated', () => {
        console.log('Colors updated, updating CSS variables and UI elements');
        setColorVariables();
        // Wait a bit for CSS variables to be applied
        setTimeout(updateUIColors, 100);
    });

    // Also try to initialize on window load as a fallback
    window.addEventListener('load', () => {
        console.log('Window loaded, initializing UI components...');
        // Set color variables for CSS
        setColorVariables();

        // Update UI elements with the bullish candle color
        setTimeout(updateUIColors, 100);

        initializeThresholdSlider();
        initializeTimeframeSelector();

        // Initialize volume profile if it should be visible
        if (isVolumeProfileVisible) {
            console.log('Volume profile should be visible on load, initializing...');
            // Force calculation of volume profile
            setTimeout(() => {
                console.log('Calculating volume profile after timeout...');
                // Always recalculate to ensure it's fresh
                volumeProfileData.pricePoints = [];
                calculateVolumeProfile();
                console.log('Volume profile calculated, redrawing chart...');
                drawChart();
            }, 2000); // Wait 2 seconds for data to load
        }

        // Try again after a delay
        setTimeout(() => {
            initializeThresholdSlider();
            initializeTimeframeSelector();
            // Update color variables again to ensure they're set
            setColorVariables();
            // Update UI elements again
            updateUIColors();
        }, 1000);

        // Initialize custom slider
        initializeCustomSlider();
        setTimeout(() => initializeCustomSlider(), 500);

        // Also try to manually update the slider
        setTimeout(() => updateThresholdSliderForCurrentCoin(), 1500);

        // Add a direct event listener to the slider as a fallback
        setTimeout(() => {
            const slider = document.getElementById('threshold-slider');
            const input = document.getElementById('threshold-input');
            if (slider && input) {
                console.log('Adding direct event listener to slider (window.load)');
                slider.addEventListener('input', function(e) {
                    const value = parseInt(e.target.value);
                    input.value = value;

                    // Update the slider progress bar
                    const min = parseInt(slider.min) || 25;
                    const max = parseInt(slider.max) || 1000;
                    const progress = ((value - min) / (max - min)) * 100;
                    slider.style.setProperty('--slider-progress', `${progress}%`);

                    // Update the value for the current coin
                    const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin().symbol : 'BTC';
                    window.coinMinOrderValues[currentCoin] = value;
                    coinMinOrderValues[currentCoin] = value;

                    // Save to localStorage
                    localStorage.setItem(`minOrderValue_${currentCoin}`, value);

                    // Redraw chart to update heatmap
                    drawChart();
                });
            }
        }, 2000);
    });

    // Add a global function to update the slider that can be called from other scripts
    window.updateThresholdSlider = updateThresholdSliderForCurrentCoin;

    // Initialize the coin indicator when the window loads
    window.addEventListener('load', () => {
        // Update the coin indicator in the top bar
        if (typeof updateCoinIndicator === 'function') {
            updateCoinIndicator();
        }

        // Add event listener for coin changes
        document.addEventListener('coinChanged', () => {
            console.log('Coin changed event received, updating coin indicator');
            if (typeof updateCoinIndicator === 'function') {
                updateCoinIndicator();
            }
        });

        // Add event listener for price updates
        document.addEventListener('priceUpdated', (event) => {
            console.log('Price updated event received:', event.detail);
            // Force a chart update
            if (typeof drawChart === 'function') {
                console.log('Forcing chart update due to price update event');
                drawChart();
            }
        });

        // Add event listener for forced chart updates
        document.addEventListener('forceChartUpdate', (event) => {
            console.log('Force chart update event received:', event.detail);

            // Update the current candle with the latest price
            if (event.detail && event.detail.price && bars.length > 0) {
                const price = event.detail.price;
                const lastCandle = bars[bars.length - 1];

                // Update the candle
                lastCandle.high = Math.max(lastCandle.high, price);
                lastCandle.low = Math.min(lastCandle.low, price);
                lastCandle.close = price;

                console.log(`Updated last candle in bars array from event: high=${lastCandle.high}, low=${lastCandle.low}, close=${price}`);

                // Also update the current candle reference if available
                if (currentCandle) {
                    currentCandle.high = Math.max(currentCandle.high, price);
                    currentCandle.low = Math.min(currentCandle.low, price);
                    currentCandle.close = price;
                }
            }

            // Force a chart update
            if (typeof drawChart === 'function') {
                console.log('Forcing chart update due to forceChartUpdate event');
                drawChart();
            }
        });
    });

    // Set up a periodic chart update to ensure the chart is always refreshed
    setInterval(() => {
        console.log('Periodic chart update triggered');
        if (typeof requestChartUpdate === 'function') {
            requestChartUpdate(true);
        } else if (typeof drawChart === 'function') {
            drawChart();
        }
    }, 1000); // Update every second

    // Set up a fallback polling mechanism to fetch the latest price from Bitstamp API
    // This ensures we always have the latest price even if WebSocket fails
    setInterval(() => {
        const currentCoin = window.coinManager ? window.coinManager.getCurrentCoin() : { symbol: 'BTC' };
        const symbol = currentCoin.symbol.toLowerCase() + 'usd';

        // Fetch the latest ticker data from Bitstamp
        fetch(`https://www.bitstamp.net/api/v2/ticker/${symbol}/`)
            .then(response => response.json())
            .then(data => {
                console.log('Fetched latest price from Bitstamp API:', data);

                if (data && data.last) {
                    // Create a synthetic trade object
                    const syntheticTrade = {
                        price: data.last,
                        amount: '0',
                        timestamp: Math.floor(Date.now() / 1000),
                        type: '0' // Default to buy
                    };

                    // Process this as a manual update
                    if (typeof window.handleBitstampTrade === 'function') {
                        window.handleBitstampTrade(syntheticTrade, true);
                    }

                    // Update the current candle with this price
                    if (currentCandle) {
                        const price = parseFloat(data.last);
                        const oldClose = currentCandle.close;

                        // Only update if the price has changed
                        if (price !== oldClose) {
                            console.log(`API poll: Price changed from ${oldClose} to ${price}`);

                            // Update the candle
                            const newHigh = Math.max(currentCandle.high, price);
                            const newLow = Math.min(currentCandle.low, price);

                            // Log changes
                            if (newHigh !== currentCandle.high) {
                                console.log(`API poll: Updating high from ${currentCandle.high} to ${newHigh}`);
                            }
                            if (newLow !== currentCandle.low) {
                                console.log(`API poll: Updating low from ${currentCandle.low} to ${newLow}`);
                            }

                            // Apply updates
                            currentCandle.high = newHigh;
                            currentCandle.low = newLow;
                            currentCandle.close = price;

                            // Find and update the current candle in the bars array
                            const currentBarIndex = bars.findIndex(b => b.time === currentCandle.time);
                            if (currentBarIndex !== -1) {
                                bars[currentBarIndex] = { ...currentCandle };
                                console.log(`API poll: Updated bar at index ${currentBarIndex} in bars array`);

                                // Log the updated bar
                                console.log('API poll: Updated bar:', bars[currentBarIndex]);
                            } else {
                                console.log(`API poll: Could not find current candle in bars array. Current time: ${currentCandle.time}`);

                                // Add it to the bars array
                                bars.push({ ...currentCandle });
                                // Sort bars by time (ascending)
                                bars.sort((a, b) => a.time - b.time);
                                console.log(`API poll: Added current candle to bars array, now has ${bars.length} bars`);
                            }

                            // Force a chart update
                            console.log('API poll: Forcing chart update');
                            drawChart();

                            // Also trigger a custom event for other components
                            document.dispatchEvent(new CustomEvent('priceUpdated', {
                                detail: { price: price, time: new Date().toISOString(), source: 'api-poll' }
                            }));
                        } else {
                            console.log(`API poll: Price unchanged at ${price}`);
                        }
                    }
                }
            })
            .catch(error => {
                console.error('Error fetching latest price from Bitstamp API:', error);
            });
    }, 5000); // Poll every 5 seconds
})();
