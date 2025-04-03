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
let btcPrice = 0;
let currentPriceY = null; // Y position of current price for price tag

// Bar interval and countdown
const barIntervalMs = 300000; // 5 minute bars (5 * 60 * 1000 ms)
let lastBarTime = 0;
let barCloseCountdown = 0;
let countdownInterval = null;

// View state
let viewOffset = 0;
let visibleBars = 60;
let mouseX = null, mouseY = null;
let initialMouseX = null;
let initialViewOffset = null;
let initialVisibleBars = null;
let isDragging = false;

// Crosshair state
let hoveredBarIndex = -1;
let hoveredPrice = null;
let hoveredLimitOrder = null; // Track hovered limit order
let showZoomLens = false; // Flag to control zoom lens visibility

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

// Previous day's VWAP data removed

// VWAP visibility toggle
let isVwapVisible = true;

// Volume Profile removed

// Price scale state
let isPriceScaleDragging = false;
let priceScaleDragStartY = null;
let priceScaleDragStartMinPrice = null;
let priceScaleDragStartMaxPrice = null;
let minPrice = 0;
let maxPrice = 100000; // Use a larger initial range
let isPriceScaleManuallySet = false;
let isPriceScaleLocked = false; // Start with price scale unlocked to allow initial auto-adjustment

// Chart dragging state
let isChartDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let initialMinPrice = 0;
let initialMaxPrice = 0;

// Orderbook heatmap settings
const orderProximityThreshold = 0.025;

// Price scale settings
const priceScaleWidth = 70;
const priceScaleDelimiterColor = '#ffffff';
const priceScaleDelimiterWidth = 1;
let barWidth = 0;

// Time scale settings
const timeScaleHeight = 30;
const timeScaleDelimiterColor = '#ffffff';
const timeScaleDelimiterWidth = 1;
const timeScaleBackgroundColor = '#131722';

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
    onMessage(data) { }
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

    // Account for the sidebar width
    const sidebarWidth = document.getElementById('sidebar').offsetWidth;

    // Use a fixed aspect ratio and size calculation
    // This ensures consistent sizing across different devices
    const containerWidth = window.innerWidth - sidebarWidth;
    const containerHeight = window.innerHeight;

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

    isPriceScaleManuallySet = false;
    drawChart();
}

function updateTitle() {
    if (bars.length > 0) {
        const currentPrice = bars[bars.length - 1].close;
        btcPrice = currentPrice;
        document.title = `${currentPrice.toFixed(2)}`;
    }
}

function addResetPriceScaleButton() {
    const button = document.createElement('button');
    button.textContent = 'Reset Zoom'; // Full text with smaller font
    button.style.position = 'absolute';
    button.style.bottom = '0px'; // Position at the very bottom of the screen
    button.style.right = '0px'; // Position at the very right of the screen
    button.style.width = priceScaleWidth + 'px'; // Width matches the price scale width
    button.style.height = timeScaleHeight + 'px'; // Height matches the time scale height
    button.style.padding = '0px'; // No padding
    button.style.fontSize = '8px'; // Very small font
    button.style.lineHeight = timeScaleHeight + 'px'; // Center text vertically to match time scale height
    button.style.backgroundColor = '#26a69a';
    button.style.color = '#ffffff';
    button.style.border = 'none';
    button.style.borderRadius = '0px'; // No rounded corners to fit perfectly in the corner
    button.style.cursor = 'pointer';
    button.style.zIndex = '1000';

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

    document.body.appendChild(button);

    // Add VWAP toggle button
    addVwapToggleButton();
}

function addVwapToggleButton() {
    const button = document.createElement('button');
    button.textContent = 'Toggle VWAP';
    button.style.position = 'absolute';
    button.style.bottom = '35px'; // Move up to avoid timescale
    button.style.left = 'calc(50% - 120px)'; // Fixed position for consistent layout
    button.style.width = '80px'; // Fixed width
    button.style.padding = '5px'; // Fixed padding
    button.style.fontSize = '10px'; // Fixed text size
    button.style.backgroundColor = '#2196F3'; // Blue color to match other buttons
    button.style.color = '#ffffff';
    button.style.border = 'none';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';
    button.style.zIndex = '1000';
    button.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
    button.style.transition = 'background-color 0.2s, transform 0.1s';

    // Add hover effect
    button.addEventListener('mouseover', () => {
        button.style.backgroundColor = '#1976D2'; // Darker blue on hover
    });

    button.addEventListener('mouseout', () => {
        button.style.backgroundColor = '#2196F3'; // Back to original blue
        updateVwapButtonAppearance(button); // Make sure we respect the VWAP toggle state
    });

    // Add active effect
    button.addEventListener('mousedown', () => {
        button.style.transform = 'scale(0.95)';
    });

    button.addEventListener('mouseup', () => {
        button.style.transform = 'scale(1)';
    });

    // Update button appearance based on current state
    updateVwapButtonAppearance(button);

    button.addEventListener('click', () => {
        // Toggle VWAP visibility
        isVwapVisible = !isVwapVisible;

        // Update button appearance
        updateVwapButtonAppearance(button);

        // Redraw chart
        drawChart();
    });

    document.body.appendChild(button);

    // Add sidebar toggle button
    addSidebarToggleButton();
}

// Volume Profile toggle button removed

function addSidebarToggleButton() {
    const button = document.createElement('button');
    button.textContent = 'Toggle Sidebar';
    button.style.position = 'absolute';
    button.style.bottom = '35px'; // Move up to avoid timescale
    button.style.left = 'calc(50% + 40px)'; // Fixed position for consistent layout
    button.style.width = '80px'; // Fixed width
    button.style.padding = '5px'; // Fixed padding
    button.style.fontSize = '10px'; // Fixed text size
    button.style.backgroundColor = '#2196F3'; // Blue color for sidebar toggle
    button.style.color = '#ffffff';
    button.style.border = 'none';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';
    button.style.zIndex = '1000';
    button.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
    button.style.transition = 'background-color 0.2s, transform 0.1s';

    // Track sidebar visibility state
    let isSidebarVisible = true;

    // Add hover effect
    button.addEventListener('mouseover', () => {
        button.style.backgroundColor = '#1976D2';
    });

    button.addEventListener('mouseout', () => {
        button.style.backgroundColor = '#2196F3';
    });

    // Add active effect
    button.addEventListener('mousedown', () => {
        button.style.transform = 'scale(0.95)';
    });

    button.addEventListener('mouseup', () => {
        button.style.transform = 'scale(1)';
    });

    button.addEventListener('click', () => {
        // Toggle sidebar visibility
        const sidebar = document.getElementById('sidebar');
        isSidebarVisible = !isSidebarVisible;

        if (isSidebarVisible) {
            sidebar.style.display = 'flex';
            button.style.opacity = '1';
        } else {
            sidebar.style.display = 'none';
            button.style.opacity = '0.6';
        }

        // Resize canvas to account for sidebar visibility change
        resizeCanvas();
    });

    document.body.appendChild(button);

    // Add "made by lost" text above the buttons
    addMadeByText();
}

function addMadeByText() {
    const madeByText = document.createElement('div');
    madeByText.textContent = 'made by lost';
    madeByText.style.position = 'absolute';
    madeByText.style.bottom = '55px'; // Position above the buttons
    madeByText.style.left = '50%';
    madeByText.style.transform = 'translateX(-50%)';
    madeByText.style.fontSize = '10px';
    madeByText.style.color = 'rgba(255, 255, 255, 0.5)';
    madeByText.style.fontStyle = 'italic';
    madeByText.style.textAlign = 'center';
    madeByText.style.width = '100px';
    madeByText.style.zIndex = '1000';

    document.body.appendChild(madeByText);
}

function updateVwapButtonAppearance(button) {
    if (isVwapVisible) {
        button.style.backgroundColor = '#2196F3'; // Blue color when VWAP is visible
        button.style.opacity = '1';
    } else {
        button.style.backgroundColor = '#2196F3'; // Same color but more transparent when VWAP is hidden
        button.style.opacity = '0.6';
    }
}

// --- Data Fetching ---
function fetchHistoricalData() {
    fetch('https://api.bybit.com/v5/market/kline?category=spot&symbol=BTCUSDT&interval=5&limit=750')
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

// --- WebSocket Subscriptions ---
function setupWebSockets() {
    // Create a throttled version of drawChart for price updates
    const throttledPriceUpdate = throttle(drawChart, 50); // Update at most every 50ms for price (more frequent than orderbook)

    // Initialize the sidebar after WebSocket managers are available
    if (typeof ShortsLongsRatio === 'function') {
        window.shortsLongsRatio = new ShortsLongsRatio();
        window.shortsLongsRatio.init();
        console.log('Shorts vs Longs ratio sidebar initialized');
    } else {
        console.error('ShortsLongsRatio class not available');
    }

    bybitWsManager.subscribe('kline.5.BTCUSDT', (data) => {
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

            // Strict validation for bar timestamps to prevent random bars
            const now = Date.now();

            // 1. Validate that the bar timestamp is aligned with a 5-minute interval
            const barDate = new Date(newBar.time);
            const barMinutes = barDate.getMinutes();
            const barSeconds = barDate.getSeconds();
            const barMs = barDate.getMilliseconds();

            // Bar must start exactly on a 5-minute boundary (e.g., 00:00, 00:05, 00:10...)
            // and have 0 seconds and 0 milliseconds
            if (barMinutes % 5 !== 0 || barSeconds !== 0 || barMs !== 0) {
                console.log(`Rejecting bar with non-aligned timestamp: ${barDate.toLocaleString()}`);
                return; // Skip this bar
            }

            // 2. Calculate the current 5-minute interval
            const currentDate = new Date(now);
            const currentMinutes = currentDate.getMinutes();
            const currentFiveMinInterval = Math.floor(currentMinutes / 5) * 5;

            // Create a date object for the start of the current 5-minute interval
            const intervalStart = new Date(currentDate);
            intervalStart.setMinutes(currentFiveMinInterval);
            intervalStart.setSeconds(0);
            intervalStart.setMilliseconds(0);

            const currentIntervalStart = intervalStart.getTime();
            const nextIntervalStart = currentIntervalStart + barIntervalMs;

            // 3. Determine if this bar is current, historical, or future
            const isCurrentIntervalBar = newBar.time === currentIntervalStart;
            const isHistoricalBar = newBar.time < currentIntervalStart;
            const isFutureBar = newBar.time > currentIntervalStart;

            // 4. Find if this bar already exists
            const existingBarIndex = bars.findIndex(b => b.time === newBar.time);
            const isNewBar = existingBarIndex === -1;

            // 5. Apply strict rules for bar acceptance
            // - Allow updates to existing bars
            // - Allow new bars only if they're historical or the current interval
            // - Never allow future bars
            if (isNewBar && isFutureBar) {
                console.log(`Rejecting future bar: ${barDate.toLocaleString()}`);
                return; // Skip future bars
            }

            // 6. For new bars in the current interval, ensure we're not creating them too early
            // Only create the current interval bar if we're at least 10 seconds into the interval
            if (isNewBar && isCurrentIntervalBar) {
                const secondsIntoInterval = (now - currentIntervalStart) / 1000;
                if (secondsIntoInterval < 10) {
                    console.log(`Too early to create current interval bar, only ${secondsIntoInterval.toFixed(1)} seconds in`);
                    return; // Too early to create this bar
                }
            }

            // Log accepted bar
            console.log(`${isNewBar ? 'Creating new' : 'Updating'} bar: ${barDate.toLocaleString()} (${isCurrentIntervalBar ? 'current' : isHistoricalBar ? 'historical' : 'future'})`);


            // Now it's safe to add or update the bar
            if (isNewBar) {
                bars.push(newBar);
                if (bars.length > 1000) bars.shift();
                if (viewOffset + visibleBars >= bars.length - 1) {
                    viewOffset = Math.max(0, bars.length - visibleBars);
                    isPriceScaleManuallySet = false;
                }
            } else {
                bars[existingBarIndex] = newBar;
            }

            // If this is a new bar, the previous bar has closed
            if (isNewBar && bars.length > 1) {
                // Update VWAP with the previous bar that just closed
                const previousBar = bars[bars.length - 2]; // Get the bar before the new one
                console.log(`Updating VWAP with previous bar at ${new Date(previousBar.time).toLocaleTimeString()} because it just closed`);
                updateVwap(previousBar, true);

                // Volume profile updates removed
            }

            // Only update VWAP for historical bars (never for the current interval bar)
            // We no longer update VWAP during bar formation
            if (!isCurrentIntervalBar) {
                console.log(`Updating VWAP with historical bar at ${new Date(newBar.time).toLocaleTimeString()}`);
                updateVwap(newBar, true);  // Historical bars are closed
            } else {
                console.log(`Skipping VWAP update for current interval bar at ${new Date(newBar.time).toLocaleTimeString()} - will update when bar closes`);
            }
            // IMPORTANT: Current interval bar is NEVER updated for VWAP until it closes
            // This ensures VWAP only changes on bar close, not during bar formation

            updateTitle();
            // Use throttled version of drawChart for better performance
            throttledPriceUpdate();
        }
    });

    // Create a throttled version of drawChart for orderbook updates
    const throttledOrderbookUpdate = throttle(drawChart, 100); // Update at most every 100ms

    bitstampWsManager.subscribe('order_book_btcusd', (data) => {
        // Log first successful data reception
        if (!window.bitstampConnected && data.event === 'data' && data.data) {
            console.log('✅ Bitstamp WebSocket connected and receiving data');
            window.bitstampConnected = true;
            // Connection notification removed from chart display
        }

        if (data.event === 'data' && data.data && data.data.bids && data.data.asks) {
            const rawBids = data.data.bids;
            const rawAsks = data.data.asks;
            const currentPrice = bars.length > 0 ? bars[bars.length - 1].close : 0;
            if (currentPrice === 0) return;

            btcPrice = currentPrice;

            // Process orderbook data for display
            orderbook.bids = rawBids.map(order => [parseFloat(order[0]), parseFloat(order[1]), parseFloat(order[0]) * parseFloat(order[1]) * btcPrice]);
            orderbook.asks = rawAsks.map(order => [parseFloat(order[0]), parseFloat(order[1]), parseFloat(order[0]) * parseFloat(order[1]) * btcPrice]);

            // Update the shorts vs longs ratio sidebar if it exists
            if (window.shortsLongsRatio && typeof window.shortsLongsRatio.handleOrderbookUpdate === 'function') {
                window.shortsLongsRatio.handleOrderbookUpdate(data);
            }

            // Process bids and asks in parallel using more efficient code
            const orderProximityThresholdValue = orderProximityThreshold; // Cache this value
            const minDollarValue = 300000; // Minimum dollar value threshold (increased to 400k USD)

            // Pre-allocate arrays for better performance
            const processedBids = [];
            const processedAsks = [];

            // Process bids efficiently
            for (let i = 0; i < rawBids.length; i++) {
                const order = rawBids[i];
                const price = parseFloat(order[0]);
                if (isNaN(price)) continue;

                // Quick proximity check
                if ((currentPrice - price) / currentPrice > orderProximityThresholdValue) continue;

                const volume = parseFloat(order[1]);
                const dollarValue = price * volume;

                // Quick dollar value check
                if (dollarValue < minDollarValue) continue;

                processedBids.push([price, volume, dollarValue, 'bid']);
            }

            // Process asks efficiently
            for (let i = 0; i < rawAsks.length; i++) {
                const order = rawAsks[i];
                const price = parseFloat(order[0]);
                if (isNaN(price)) continue;

                // Quick proximity check
                if ((price - currentPrice) / currentPrice > orderProximityThresholdValue) continue;

                const volume = parseFloat(order[1]);
                const dollarValue = price * volume;

                // Quick dollar value check
                if (dollarValue < minDollarValue) continue;

                processedAsks.push([price, volume, dollarValue, 'ask']);
            }

            // Combine and sort in one step for better performance
            const combinedOrders = [...processedBids, ...processedAsks];
            combinedOrders.sort((a, b) => b[2] - a[2]); // Sort by dollar value (descending)

            // Get top 20 orders
            const top20Orders = combinedOrders.slice(0, 20);

            // Clear existing arrays for better memory management
            orderbook.bids = [];
            orderbook.asks = [];

            // Separate back into bids and asks for rendering
            for (let i = 0; i < top20Orders.length; i++) {
                const order = top20Orders[i];
                if (order[3] === 'bid') {
                    orderbook.bids.push([order[0], order[1], order[2]]);
                } else {
                    orderbook.asks.push([order[0], order[1], order[2]]);
                }
            }

            // Use throttled version of drawChart for better performance
            throttledOrderbookUpdate();
        }
    });
}

// --- Mouse Interaction ---
function handleMouseDown(e) {
    if (!canvas) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;

    if (mouseX > canvas.width - priceScaleWidth) {
        // Price scale dragging (vertical only)
        isPriceScaleDragging = true;
        priceScaleDragStartY = e.clientY;
        priceScaleDragStartMinPrice = minPrice;
        priceScaleDragStartMaxPrice = maxPrice;
        canvas.style.cursor = 'ns-resize';

        // Mark the price scale as manually set when it's dragged
        isPriceScaleManuallySet = true;
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

    if (isPriceScaleDragging) {
        const chartHeight = canvas.height - timeScaleHeight;

        // Previous comment removed
        // TradingView price scale behavior - stretching/zooming
        const dragDistance = mouseY - priceScaleDragStartY;
        const priceRange = priceScaleDragStartMaxPrice - priceScaleDragStartMinPrice;

        if (priceRange > 0 && isFinite(priceRange)) {
            // Calculate stretch factor based on drag distance
            // Dragging down stretches the chart (increases the range)
            // Dragging up compresses the chart (decreases the range)
            const stretchFactor = 1 + (dragDistance / chartHeight);

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

function handleMouseHover(e) {
    if (!canvas || isDragging) return;
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;

    // Reset hovered limit order and zoom lens by default
    // This ensures the zoom lens disappears when not hovering over a limit
    hoveredLimitOrder = null;
    showZoomLens = false;

    // Calculate hovered price
    const chartHeight = canvas.height - timeScaleHeight;
    if (mouseY >= 0 && mouseY <= chartHeight) {
        const priceRange = Math.max(1e-6, maxPrice - minPrice);
        hoveredPrice = maxPrice - (mouseY / chartHeight) * priceRange;

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

    // Calculate hovered bar index
    const chartWidth = canvas.width - priceScaleWidth;
    if (mouseX >= 0 && mouseX < chartWidth) {
        const startIndex = Math.max(0, Math.floor(viewOffset));
        const barIndexOffset = mouseX / barWidth;
        hoveredBarIndex = startIndex + barIndexOffset;
    } else {
        hoveredBarIndex = -1;
    }

    if (mouseX > canvas.width - priceScaleWidth) {
        canvas.style.cursor = 'ns-resize';
    } else {
        canvas.style.cursor = 'crosshair';
    }
    drawChart();
}

function handleMouseUp(e) {
    if (!canvas) return;
    e.preventDefault();
    isDragging = false;
    isChartDragging = false;
    isPriceScaleDragging = false;
    initialViewOffset = null;
    initialMinPrice = null;
    initialMaxPrice = null;

    // Reset cursor based on position
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

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
    const chartHeight = canvas.height - timeScaleHeight;
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

    // Only consider orders with significant value (400k USD or more)
    const minOrderValue = 400000;

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

    // If the bar is from today, just show time
    const today = new Date();
    if (date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear()) {
        return `${hours}:${minutes}`;
    }

    // Otherwise show date and time
    return `${day}.${month} ${hours}:${minutes}`;
}

// --- Drawing Functions ---
function drawCrosshair() {
    if (!ctx || !canvas || mouseX === null || mouseY === null) return;

    const chartWidth = canvas.width - priceScaleWidth;
    const chartHeight = canvas.height - timeScaleHeight;

    // Only draw crosshair in the chart area
    if (mouseX < 0 || mouseX >= chartWidth || mouseY < 0 || mouseY >= chartHeight) return;

    // Calculate hovered bar index and check if it's in the future
    const startIndex = Math.max(0, Math.floor(viewOffset));
    const fractionalOffset = viewOffset - startIndex;
    const startX = -fractionalOffset * barWidth;
    hoveredBarIndex = startIndex + (mouseX - startX) / barWidth;

    // Determine if we're hovering over a future bar
    const isHoveringFutureBar = hoveredBarIndex >= bars.length;

    // Calculate time for future bars if needed
    let hoveredTime = null;
    if (isHoveringFutureBar && bars.length > 0) {
        // Calculate how many bars into the future we are
        const futureBarOffset = Math.floor(hoveredBarIndex) - (bars.length - 1);
        // Get the last real bar's time and add the appropriate interval
        const lastBarTime = bars[bars.length - 1].time;
        hoveredTime = lastBarTime + (futureBarOffset * barIntervalMs);
    } else if (hoveredBarIndex >= 0 && hoveredBarIndex < bars.length) {
        // Get time from an existing bar
        const barIndex = Math.floor(hoveredBarIndex);
        hoveredTime = bars[barIndex].time;
    }

    // Draw vertical line
    ctx.strokeStyle = getColor('crosshair', 'rgba(150, 150, 150, 0.5)');
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(mouseX, 0);
    ctx.lineTo(mouseX, chartHeight);
    ctx.stroke();

    // Draw horizontal line
    ctx.beginPath();
    ctx.moveTo(0, mouseY);
    ctx.lineTo(chartWidth, mouseY);
    ctx.stroke();
    ctx.setLineDash([]);

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
            const bidColor = getColor('bullishCandle', '#26a69a');
            const askColor = getColor('bearishCandle', '#ef5350');

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
            const bidColor = getColor('bullishCandle', '#26a69a');
            const askColor = getColor('bearishCandle', '#ef5350');

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

    // Draw time label at the bottom
    if (hoveredTime !== null) {
        const labelWidth = 100;
        const labelHeight = 20;
        const labelX = mouseX - labelWidth / 2;
        const labelY = chartHeight;

        // Different style for future bars
        if (isHoveringFutureBar) {
            ctx.fillStyle = 'rgba(31, 41, 55, 0.7)'; // Slightly more transparent for future
        } else {
            ctx.fillStyle = 'rgba(31, 41, 55, 0.9)';
        }
        ctx.fillRect(labelX, labelY, labelWidth, labelHeight);

        ctx.font = '10px Arial';
        if (isHoveringFutureBar) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'; // Slightly more transparent for future
        } else {
            ctx.fillStyle = '#ffffff';
        }
        ctx.textAlign = 'center';
        ctx.fillText(formatTimestamp(hoveredTime), mouseX, labelY + 14);
    }
}

function drawBidAskTags() {
    if (!ctx || !canvas) return;

    // Always use the orderbook data we have
    if (!orderbook.bids || !orderbook.asks || orderbook.bids.length === 0 || orderbook.asks.length === 0) {
        console.log('No orderbook data available for bid/ask tags');
        return;
    }

    // Get the top bid and ask by dollar value (they're already sorted)
    const topBid = orderbook.bids[0];
    const topAsk = orderbook.asks[0];
    const topBidPrice = topBid[0];
    const topAskPrice = topAsk[0];
    const bidDollarValue = topBid[2];
    const askDollarValue = topAsk[2];

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
            getColor('bullishCandle', '#26a69a') :
            getColor('bearishCandle', '#ef5350');

        tags.push({
            type: 'current',
            y: currentPriceY,
            height: tagHeight,
            color: priceColor,
            price: currentPrice,
            value: null
        });

        // Add countdown tag (will be positioned after adjusting all tags)
        tags.push({
            type: 'countdown',
            y: currentPriceY + tagHeight + 2, // Initial position, will be adjusted
            height: tagHeight,
            color: 'rgba(31, 41, 55, 0.95)',
            price: null,
            value: null
        });
    }

    // Add bid tag
    const bidColor = getColor('bullishCandle', '#26a69a');
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

    // Add ask tag
    const askColor = getColor('bearishCandle', '#ef5350');
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
                ctx.strokeStyle = tag.color;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(canvas.width - priceScaleWidth, tagY);
                ctx.lineTo(priceTagX - priceTagWidth / 2, tagY);
                ctx.stroke();
            }

            // Draw price tag background
            ctx.fillStyle = tag.color;
            ctx.fillRect(priceTagX - priceTagWidth / 2, tagTop, priceTagWidth, tag.height);

            // Draw price text - use black for bright backgrounds, white for dark
            ctx.font = 'bold 12px Arial';
            ctx.fillStyle = isBrightColor(tag.color) ? '#000000' : '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(tag.price.toFixed(2), priceTagX, tagY + 5);

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
            ctx.fillText(countdownText, priceTagX, tagY + 5);

        } else if (tag.type === 'bid' || tag.type === 'ask') {
            // Draw value label (outside price scale)
            ctx.fillStyle = tag.color;
            ctx.fillRect(valueLabelX - valueLabelWidth, tagTop, valueLabelWidth, tag.height);

            // Use black text for bright backgrounds, white for dark backgrounds
            ctx.fillStyle = isBrightColor(tag.color) ? '#000000' : '#ffffff';
            ctx.textAlign = 'right';
            ctx.font = '10px Arial';
            ctx.fillText(`${tag.type.toUpperCase()} $${formatNumberAbbreviation(tag.value)}`, valueLabelX - 5, tagY + 5);

            // Draw price tag (inside price scale)
            ctx.fillStyle = tag.color;
            ctx.fillRect(priceTagX - priceTagWidth / 2, tagTop, priceTagWidth, tag.height);

            // Use black text for bright backgrounds, white for dark backgrounds
            ctx.fillStyle = isBrightColor(tag.color) ? '#000000' : '#ffffff';
            ctx.textAlign = 'center';
            ctx.font = '10px Arial';
            ctx.fillText(tag.price.toFixed(2), priceTagX, tagY + 5);

            // Draw connecting line between value label and price tag
            ctx.strokeStyle = tag.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(valueLabelX, tagY);
            ctx.lineTo(priceTagX - priceTagWidth / 2, tagY);
            ctx.stroke();
        }
    });
}

function drawHeatmapLine(price, dollarValue, color, maxDollarValue) {
    if (price >= minPrice && price <= maxPrice) {
        const y = getYForPrice(price);
        if (!isFinite(y)) return;

        // Calculate line width based on dollar value relative to max dollar value
        // Use a more aggressive power curve (^3 instead of ^2) and increase the multiplier
        const valueRatio = Math.min(1, dollarValue / maxDollarValue);

        // Make smaller lines thinner and bigger lines thicker
        const minLineWidth = 0.5; // Thinner minimum line width
        const maxLineWidth = 12;  // Thicker maximum line width

        // Use cubic power for more dramatic contrast
        const lineWidth = minLineWidth + Math.pow(valueRatio, 3) * (maxLineWidth - minLineWidth);

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

    // Previous day's VWAP removed

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

        drawVwapLine(
            vwapData.points,
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

        // For debugging
        console.log('Applied opacity to VWAP bands:', bandColor);
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

    // Draw main VWAP line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
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

    const chartWidth = canvas.width - priceScaleWidth;
    const chartHeight = canvas.height - timeScaleHeight;

    // Fill time scale background with the same color as the chart for seamless appearance
    ctx.fillStyle = '#131722';
    ctx.fillRect(0, chartHeight, chartWidth, timeScaleHeight);

    // Draw a subtle horizontal line between chart and time scale (TradingView style)
    ctx.strokeStyle = 'rgba(150, 150, 150, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, chartHeight);
    ctx.lineTo(chartWidth, chartHeight);
    ctx.stroke();

    // Countdown is displayed in the time scale area

    if (bars.length === 0 || visibleBars <= 0) return;

    const startIndex = Math.max(0, Math.floor(viewOffset));
    const endIndex = Math.min(bars.length, startIndex + Math.ceil(visibleBars));
    const visibleBarsData = bars.slice(startIndex, endIndex);
    const fractionalOffset = viewOffset - startIndex;

    // Determine how many labels to show based on available space
    const minLabelSpacing = 80; // Minimum pixels between labels
    const labelInterval = Math.max(1, Math.ceil(minLabelSpacing / barWidth));

    // Use a consistent font size across all devices
    ctx.font = '10px Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const startX = -fractionalOffset * barWidth;

    // Draw labels for visible bars
    visibleBarsData.forEach((bar, i) => {
        // Only show labels at regular intervals
        if (i % labelInterval === 0) {
            const x = startX + i * barWidth;
            const formattedTime = formatTimestamp(bar.time);

            // Draw time label
            ctx.fillText(formattedTime, x + barWidth / 2, chartHeight + timeScaleHeight / 2 + 5);
        }
    });

    // Add future bars if we're at the end of the data
    if (endIndex >= bars.length && bars.length > 0) {
        const lastBar = bars[bars.length - 1];
        const lastBarTime = lastBar.time;
        const lastBarX = startX + (visibleBarsData.length - 1) * barWidth;

        // Calculate how many future bars we can show
        const availableWidth = chartWidth - lastBarX - barWidth;
        const maxFutureBars = Math.floor(availableWidth / barWidth);

        // Draw future bars (up to 12 or available space)
        const futureBarsToShow = Math.min(12, maxFutureBars);

        for (let i = 1; i <= futureBarsToShow; i++) {
            // Calculate future bar time (5-minute intervals)
            const futureBarTime = lastBarTime + (barIntervalMs * i);
            const x = lastBarX + (i * barWidth);

            // Only show labels at regular intervals
            if (i % labelInterval === 0) {
                const formattedTime = formatTimestamp(futureBarTime);

                // Draw time label with slightly different style for future bars
                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.fillText(formattedTime, x + barWidth / 2, chartHeight + timeScaleHeight / 2 + 5);
                ctx.fillStyle = '#ffffff'; // Reset for next labels
            }

            // Vertical lines for future bars removed
        }
    }
}

function drawPriceScale() {
    if (!ctx || !canvas) return;

    const chartHeight = canvas.height - timeScaleHeight;
    const priceRange = Math.max(1e-6, maxPrice - minPrice);
    const numGridLines = Math.max(2, Math.floor(chartHeight / 50));
    const priceStep = priceRange / numGridLines;

    // Fill price scale background with the same color as the chart for seamless appearance
    ctx.fillStyle = '#131722';
    ctx.fillRect(canvas.width - priceScaleWidth, 0, priceScaleWidth, chartHeight);

    // Draw a subtle vertical line between chart and price scale (TradingView style)
    ctx.strokeStyle = 'rgba(150, 150, 150, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(canvas.width - priceScaleWidth, 0);
    ctx.lineTo(canvas.width - priceScaleWidth, chartHeight);
    ctx.stroke();

    // Use a consistent font size across all devices
    ctx.font = '10px Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= numGridLines; i++) {
        const price = minPrice + i * priceStep;
        const y = chartHeight - ((price - minPrice) / priceRange) * chartHeight;
        if (isFinite(y)) {
            // Skip drawing price labels where tags will be (bid, ask, current price, countdown)
            let skipLabel = false;

            // Skip near current price
            if (currentPriceY !== null && Math.abs(y - currentPriceY) < 15) {
                skipLabel = true;
            }

            // Skip near bid/ask if available
            if (orderbook.bids && orderbook.bids.length > 0) {
                const bidY = getYForPrice(orderbook.bids[0][0]);
                if (Math.abs(y - bidY) < 15) skipLabel = true;
            }

            if (orderbook.asks && orderbook.asks.length > 0) {
                const askY = getYForPrice(orderbook.asks[0][0]);
                if (Math.abs(y - askY) < 15) skipLabel = true;
            }

            // Skip near countdown (which is below current price)
            if (currentPriceY !== null && Math.abs(y - (currentPriceY + 25)) < 15) {
                skipLabel = true;
            }

            if (!skipLabel) {
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
}

function drawChart() {
    try {
        if (!ctx || !canvas) {
            console.error('Canvas or context is not available');
            return;
        }

        // Make drawChart globally accessible
        window.drawChart = drawChart;

        // Initialize VWAP if needed
        if (vwapData.startTime === 0) {
            initializeVwapPeriod();
        }

        // Volume Profile initialization removed

        // Function to get customized colors
        function getColor(id, defaultColor) {
            if (window.colorCustomizer) {
                return window.colorCustomizer.getColor(id) || defaultColor;
            }
            return defaultColor;
        }

        // Clear the entire canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Fill the chart background (excluding price scale and time scale)
        ctx.fillStyle = getColor('background', '#131722');
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Set consistent font rendering
        ctx.textBaseline = 'middle';
        ctx.textRendering = 'geometricPrecision';
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Grid lines removed

        if (bars.length === 0) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Waiting for data...', canvas.width / 2, (canvas.height - timeScaleHeight) / 2);
            ctx.textAlign = 'left';
            drawConnectionStatus();
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

        if (orderbook.bids && orderbook.asks && orderbook.bids.length > 0 && orderbook.asks.length > 0) {
            // Find max dollar value for scaling
            const maxBidValue = orderbook.bids.length > 0 ? orderbook.bids[0][2] : 0;
            const maxAskValue = orderbook.asks.length > 0 ? orderbook.asks[0][2] : 0;
            const maxValue = Math.max(maxBidValue, maxAskValue);

            // Draw bid lines
            orderbook.bids.forEach(([price, , dollarValue]) => {
                // Skip orders under 400k USD
                if (dollarValue >= 400000) {
                    const bidColor = getColor('bullishCandle', '#26a69a');
                    // Convert hex to rgba with 0.6 opacity
                    const rgbaColor = bidColor.startsWith('#') ?
                        `rgba(${parseInt(bidColor.slice(1, 3), 16)}, ${parseInt(bidColor.slice(3, 5), 16)}, ${parseInt(bidColor.slice(5, 7), 16)}, 0.6)` :
                        bidColor;
                    drawHeatmapLine(price, dollarValue, rgbaColor, maxValue);
                }
            });

            // Draw ask lines
            orderbook.asks.forEach(([price, , dollarValue]) => {
                // Skip orders under 400k USD
                if (dollarValue >= 400000) {
                    const askColor = getColor('bearishCandle', '#ef5350');
                    // Convert hex to rgba with 0.6 opacity
                    const rgbaColor = askColor.startsWith('#') ?
                        `rgba(${parseInt(askColor.slice(1, 3), 16)}, ${parseInt(askColor.slice(3, 5), 16)}, ${parseInt(askColor.slice(5, 7), 16)}, 0.6)` :
                        askColor;
                    drawHeatmapLine(price, dollarValue, rgbaColor, maxValue);
                }
            });
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
            const candleColor = isBullish ?
                getColor('bullishCandle', '#26a69a') :
                getColor('bearishCandle', '#ef5350');

            ctx.strokeStyle = candleColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(candleX + candleWidth / 2, yHigh);
            ctx.lineTo(candleX + candleWidth / 2, yLow);
            ctx.stroke();

            ctx.fillStyle = candleColor;
            const bodyHeight = Math.max(1, Math.abs(yClose - yOpen));
            const bodyY = Math.min(yOpen, yClose);
            ctx.fillRect(candleX, bodyY, effectiveCandleWidth, bodyHeight);
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

        // Draw time scale
        drawTimeScale();

        // Draw bid/ask tags
        drawBidAskTags();

        // Connection status widget removed from top left

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

        // Make btcPrice available globally for liquidations.js
        window.btcPrice = bars.length > 0 ? bars[bars.length - 1].close : 0;
    } catch (error) {
        console.error('Error in drawChart:', error);
    }
}

function drawConnectionStatus() {
    // Function disabled - connection status widget removed from top left
    return;
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
