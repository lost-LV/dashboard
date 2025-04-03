// liquidations.js
(function () {
    // Configuration
    const config = {
        barInterval: 300000, // 5 minute, matching our chart interval
        maxLiquidations: 1000, // Limit stored liquidations
        updateThrottle: 100, // Throttle updates
        minMarkerSize: 2, // Minimum arrow size (for 50k liquidations)
        maxMarkerSize: 10, // Maximum arrow size (for 1M+ liquidations)
        minDollarValue: 50000, // Minimum dollar value to display (50k)
        maxDollarValue: 1000000, // Maximum dollar value for scaling (1M)
        minDollarThreshold: 50000, // Only show liquidations when total > $50k
        minIndividualLiquidationSize: 0.5, // Minimum BTC size for individual liquidations
        minIndividualDollarValue: 50000, // Minimum dollar value for individual liquidations (50k)
        newLiquidationWindow: 60000, // Only show liquidations from the last 60 seconds (1 minute)
        liveIndicatorDuration: 5000, // How long to show the live indicator (5 seconds)
    };

    // Utility functions
    const throttle = (fn, limit) => {
        let timeout;
        const throttledFn = (...args) => {
            if (!timeout) {
                timeout = setTimeout(() => {
                    fn(...args);
                    timeout = null;
                }, limit);
            }
        };
        throttledFn.clear = () => {
            if (timeout) {
                clearTimeout(timeout);
                timeout = null;
            }
        };
        return throttledFn;
    };

    // Format dollar value as "Xk" or "X.XM"
    const formatDollarValue = (value) => {
        if (value >= 1000000) {
            return `$${(value / 1000000).toFixed(1)}M`;
        } else if (value >= 1000) {
            return `$${(value / 1000).toFixed(0)}k`;
        }
        return `$${value.toFixed(0)}`;
    };

    // Liquidation manager class
    class LiquidationManager {
        constructor() {
            this.pair = 'BTCUSDT'; // Default pair
            this.liquidations = []; // Raw liquidation events
            this.liveLiquidations = []; // Store recent liquidations for live indicator
            this.throttledUpdateMarkers = throttle(this.updateMarkers.bind(this), config.updateThrottle);
            this.markers = []; // Store markers for rendering
            this.exchanges = ['bybit']; // Only track Bybit for liquidations
            this.init();
        }

        init() {
            // Connect only to Bybit WebSocket for liquidations
            this.connectToBybitWebSocket();

            // We don't add test liquidations on startup anymore - only showing new liquidations

            // Listen for liquidation events
            window.addEventListener(`liquidation-${this.pair}`, (event) => {
                const liq = event.detail;
                this.addLiquidation(liq);
            });

            // Initial update
            this.updateMarkers();

            // Expose the instance globally for access from script.js
            window.liquidationManager = this;

            // Log that initialization is complete
            console.log('Liquidation manager initialized with Bybit data - only showing new liquidations');
        }

        // Add test liquidations for immediate visual feedback
        addTestLiquidations() {
            // Get the current price
            const currentPrice = window.btcPrice || 65000;

            // Add a few test liquidations around the current price
            const now = Date.now();

            // Calculate bar times to ensure liquidations align with candles
            const currentBarTime = Math.floor(now / config.barInterval) * config.barInterval;

            // Add multiple liquidations to the same bar to test aggregation
            // First bar - sell liquidations (longs liquidated)
            this.addLiquidation({
                exchange: 'bybit',
                price: currentPrice * 0.995, // Slightly below current price
                size: 3.0, // Increased size to meet 100k minimum
                side: 'Sell',
                time: currentBarTime - config.barInterval, // Previous bar
                pair: this.pair,
                dollarValue: currentPrice * 0.995 * 3.0
            });

            // Add another liquidation to the same bar
            this.addLiquidation({
                exchange: 'bybit',
                price: currentPrice * 0.993, // Slightly below current price
                size: 3.5, // Increased size to meet 100k minimum
                side: 'Sell',
                time: currentBarTime - config.barInterval, // Same bar as previous
                pair: this.pair,
                dollarValue: currentPrice * 0.993 * 3.5
            });

            // Second bar - buy liquidations (shorts liquidated)
            this.addLiquidation({
                exchange: 'bybit',
                price: currentPrice * 1.005, // Slightly above current price
                size: 4.0, // Increased size to meet 100k minimum
                side: 'Buy',
                time: currentBarTime - (config.barInterval * 2), // Two bars ago
                pair: this.pair,
                dollarValue: currentPrice * 1.005 * 4.0
            });

            // Add another buy liquidation to the same bar
            this.addLiquidation({
                exchange: 'bybit',
                price: currentPrice * 1.007, // Slightly above current price
                size: 3.2, // Increased size to meet 100k minimum
                side: 'Buy',
                time: currentBarTime - (config.barInterval * 2), // Same bar as previous
                pair: this.pair,
                dollarValue: currentPrice * 1.007 * 3.2
            });

            // Third bar - larger sell liquidation
            this.addLiquidation({
                exchange: 'bybit',
                price: currentPrice * 0.99, // Below current price
                size: 3.5,
                side: 'Sell',
                time: currentBarTime - (config.barInterval * 3), // Three bars ago
                pair: this.pair,
                dollarValue: currentPrice * 0.99 * 3.5
            });

            // Fourth bar - mixed liquidations
            this.addLiquidation({
                exchange: 'bybit',
                price: currentPrice * 0.985, // Below current price
                size: 4.5, // Increased size to meet 100k minimum
                side: 'Sell',
                time: currentBarTime - (config.barInterval * 4), // Four bars ago
                pair: this.pair,
                dollarValue: currentPrice * 0.985 * 4.5
            });

            this.addLiquidation({
                exchange: 'bybit',
                price: currentPrice * 1.01, // Above current price
                size: 3.8, // Increased size to meet 100k minimum
                side: 'Buy',
                time: currentBarTime - (config.barInterval * 4), // Same bar as previous
                pair: this.pair,
                dollarValue: currentPrice * 1.01 * 3.8
            });

            console.log('Added test liquidations for visual feedback');
        }

        // Binance WebSocket connection removed - using only Bybit for liquidations

        connectToBybitWebSocket() {
            // Connect to Bybit WebSocket for liquidation data
            // Using v5 API for BTCUSDT liquidations
            const bybitWs = new WebSocket('wss://stream.bybit.com/v5/public/linear');

            // Subscribe to BTC liquidation stream
            bybitWs.onopen = () => {
                console.log('Connected to Bybit WebSocket for liquidations');
                const subscribeMsg = {
                    op: 'subscribe',
                    args: ['liquidation.BTCUSDT'],
                    req_id: 'liquidation_btc'
                };
                bybitWs.send(JSON.stringify(subscribeMsg));
            };

            // Process Bybit liquidation messages
            bybitWs.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // Check if it's a liquidation event
                    if (data.topic === 'liquidation.BTCUSDT' && data.data) {
                        console.log('Bybit liquidation:', data);

                        const liqData = data.data;

                        // Process the data according to the specified format:
                        // liqValue (size/quantity), side (Buy/Sell), price, timestamp
                        const size = parseFloat(liqData.size); // liqValue (size/quantity)
                        const side = liqData.side; // side (Buy/Sell)
                        const price = parseFloat(liqData.price); // price
                        const timestamp = liqData.updatedTime || Date.now(); // timestamp (use current time if not provided)

                        // Create a standardized liquidation object
                        const liquidation = {
                            exchange: 'bybit',
                            price: price,
                            size: size,
                            side: side,
                            time: timestamp,
                            pair: this.pair,
                            dollarValue: price * size
                        };

                        // Add the liquidation
                        this.addLiquidation(liquidation);
                    }
                } catch (error) {
                    console.error('Error processing Bybit liquidation:', error);
                }
            };

            // Handle connection errors
            bybitWs.onerror = (error) => {
                console.error('Bybit WebSocket error:', error);
            };

            // Reconnect on close
            bybitWs.onclose = () => {
                console.log('Bybit WebSocket closed, reconnecting...');
                setTimeout(() => this.connectToBybitWebSocket(), 5000);
            };
        }

        setupSimulatedLiquidations() {
            // Instead of generating random liquidations, we'll use a more realistic approach
            // that only creates liquidations when price moves significantly

            let lastPrice = window.btcPrice || 65000;
            let priceThreshold = 50; // Minimum price movement to trigger liquidations
            let lastLiquidationTime = Date.now();
            let cooldownPeriod = 30000; // 30 seconds minimum between liquidation clusters

            // Check for potential liquidations every 5 seconds
            setInterval(() => {
                const currentPrice = window.btcPrice || 65000;
                const currentTime = Date.now();
                const timeSinceLastLiquidation = currentTime - lastLiquidationTime;

                // Only generate liquidations if price has moved significantly AND we're not in cooldown
                if (Math.abs(currentPrice - lastPrice) > priceThreshold && timeSinceLastLiquidation > cooldownPeriod) {
                    // Price moved significantly, generate a cluster of liquidations
                    const isSell = currentPrice < lastPrice; // Price dropped = sell liquidations
                    const liquidationCount = Math.floor(Math.random() * 3) + 1; // 1-3 liquidations in a cluster

                    // Create a cluster of liquidations
                    for (let i = 0; i < liquidationCount; i++) {
                        setTimeout(() => {
                            this.generateRealisticLiquidation(currentPrice, isSell, currentTime + i * 1000);
                        }, i * 1000); // Spread liquidations over a few seconds
                    }

                    lastLiquidationTime = currentTime;
                }

                lastPrice = currentPrice;
            }, 5000);
        }

        generateRealisticLiquidation(currentPrice, isSell, time) {
            // Always use Bybit as the exchange
            const exchange = 'bybit';

            // Size for Bybit liquidations
            let baseSize = Math.random() * 2 + 1.5; // 1.5-3.5 BTC for Bybit (increased to meet 100k minimum)

            // Adjust size based on side (sells tend to be larger)
            const size = isSell ? baseSize * 1.2 : baseSize;

            // Price is slightly beyond the current price (that's why it liquidated)
            const priceOffset = isSell ? -50 - Math.random() * 100 : 50 + Math.random() * 100;
            const price = currentPrice + priceOffset;

            const liquidation = {
                time: time,
                price: price,
                size: size,
                side: isSell ? "Sell" : "Buy",
                exchange: exchange,
                dollarValue: price * size // Add dollar value for filtering
            };

            // Dispatch the liquidation event
            const event = new CustomEvent(`liquidation-${this.pair}`, {
                detail: liquidation
            });
            window.dispatchEvent(event);
        }

        addLiquidation(liq) {
            // Validate liquidation data
            if (!liq || !liq.price || !liq.size || !liq.side || !liq.time) {
                // Silently skip invalid liquidation
                return;
            }

            // Validate price and size are reasonable
            if (liq.price <= 0 || liq.size <= 0 || liq.price > 1000000 || liq.size > 1000) {
                // Silently skip unreasonable liquidation
                return;
            }

            // Ensure liquidation is only from Bybit
            if (liq.exchange !== 'bybit') {
                // Silently skip liquidations from other exchanges
                return;
            }

            const dollarValue = liq.price * liq.size; // Calculate dollar value

            // Filter out small liquidations
            if (liq.size < config.minIndividualLiquidationSize || dollarValue < config.minIndividualDollarValue) {
                // Silently skip small liquidations
                return;
            }

            // Validate that the liquidation time is reasonable (not in the future)
            const now = Date.now();
            if (liq.time > now + 60000) {
                // Silently skip liquidation with future time
                return;
            }

            // For test liquidations, set the time to now to make them appear as new
            if (liq.time < now - config.newLiquidationWindow) {
                liq.time = now;
            }

            // Create liquidation object
            const liquidation = {
                time: liq.time,
                dollarValue: dollarValue, // Store in dollars
                side: liq.side,
                exchange: liq.exchange || 'unknown', // Store which exchange it came from
                price: liq.price,
                size: liq.size,
                addedAt: Date.now() // Track when this liquidation was added
            };

            // Add to main collection
            this.liquidations.push(liquidation);

            // Also add to live liquidations for current bar indicator
            this.liveLiquidations.push(liquidation);

            // Remove old live liquidations after the duration
            setTimeout(() => {
                const index = this.liveLiquidations.indexOf(liquidation);
                if (index !== -1) {
                    this.liveLiquidations.splice(index, 1);
                    // Force update to remove the live indicator
                    this.updateMarkers();
                }
            }, config.liveIndicatorDuration);

            // Log the accepted liquidation
            console.log(`Added liquidation: ${liq.size.toFixed(2)} BTC ($${dollarValue.toFixed(0)}) - ${liq.side} - ${liq.exchange}`);

            // Limit the number of stored liquidations
            if (this.liquidations.length > config.maxLiquidations) this.liquidations.shift();

            // Update the markers
            this.throttledUpdateMarkers();
        }

        aggregateLiquidations() {
            const aggregated = new Map();
            const now = Date.now();

            // Only include liquidations from the last minute (or configured window)
            const recentLiquidations = this.liquidations.filter(liq =>
                liq.time >= now - config.newLiquidationWindow
            );

            console.log(`Filtering liquidations: ${this.liquidations.length} total, ${recentLiquidations.length} recent`);

            recentLiquidations.forEach((liq) => {
                const barTime = Math.floor(liq.time / config.barInterval) * config.barInterval;
                if (!aggregated.has(barTime)) {
                    aggregated.set(barTime, {
                        sellDollars: 0,
                        buyDollars: 0,
                        bybitSellDollars: 0,
                        bybitBuyDollars: 0,
                        liquidations: [] // Store individual liquidations for hover details
                    });
                }
                const agg = aggregated.get(barTime);

                // Add to total dollars by side
                if (liq.side === "Sell") {
                    agg.sellDollars += liq.dollarValue;

                    // Add to exchange-specific totals (only Bybit now)
                    if (liq.exchange === 'bybit') {
                        agg.bybitSellDollars += liq.dollarValue;
                    }
                } else if (liq.side === "Buy") {
                    agg.buyDollars += liq.dollarValue;

                    // Add to exchange-specific totals (only Bybit now)
                    if (liq.exchange === 'bybit') {
                        agg.bybitBuyDollars += liq.dollarValue;
                    }
                }

                // Store the liquidation for hover details
                agg.liquidations.push(liq);
            });
            return aggregated;
        }

        updateMarkers() {
            const aggregated = this.aggregateLiquidations();
            this.markers = [];

            console.log(`Updating markers with ${aggregated.size} aggregated time periods`);

            // We only want to show recent liquidations, so we don't add test data if none are found
            // This ensures only new liquidations are displayed

            aggregated.forEach((agg, barTime) => {
                // Total liquidation values for the bar
                const totalSellDollars = agg.sellDollars;
                const totalBuyDollars = agg.buyDollars;

                // Exchange breakdown for hover info (only Bybit now)
                const bybitSellDollars = agg.bybitSellDollars || 0;
                const bybitBuyDollars = agg.bybitBuyDollars || 0;

                // Sell liquidation marker (below bar) - show if total exceeds threshold
                if (totalSellDollars >= config.minDollarThreshold) {
                    // Logarithmic scaling between min and max size based on dollar value (50k to 1M)
                    // For values at minDollarValue (50k), use minMarkerSize
                    // For values at or above maxDollarValue (1M), use maxMarkerSize
                    // For values in between, scale logarithmically for better visual representation
                    const sellSizeFactor = totalSellDollars >= config.minDollarValue ?
                        Math.min(
                            config.maxMarkerSize - config.minMarkerSize,
                            (Math.log(totalSellDollars) - Math.log(config.minDollarValue)) /
                            (Math.log(config.maxDollarValue) - Math.log(config.minDollarValue)) *
                            (config.maxMarkerSize - config.minMarkerSize)
                        ) : 0;

                    // Create hover details with exchange breakdown (only Bybit now)
                    const hoverDetails = {
                        total: formatDollarValue(totalSellDollars),
                        bybit: formatDollarValue(bybitSellDollars),
                        liquidations: agg.liquidations.filter(l => l.side === "Sell")
                    };

                    // Set color for sell liquidations
                    const color = "rgba(220, 50, 50, 1.0)"; // Darker red for Bybit

                    this.markers.push({
                        time: barTime,
                        position: "below", // Below the price for sell liquidations (shorts liquidated)
                        color: color,
                        shape: "arrow",
                        text: formatDollarValue(totalSellDollars), // Show cumulative total
                        size: config.minMarkerSize + sellSizeFactor,
                        hoverDetails: hoverDetails, // Add hover details
                        side: "Sell"
                    });
                }

                // Buy liquidation marker (above bar) - show if total exceeds threshold
                if (totalBuyDollars >= config.minDollarThreshold) {
                    // Logarithmic scaling between min and max size based on dollar value (50k to 1M)
                    // For values at minDollarValue (50k), use minMarkerSize
                    // For values at or above maxDollarValue (1M), use maxMarkerSize
                    // For values in between, scale logarithmically for better visual representation
                    const buySizeFactor = totalBuyDollars >= config.minDollarValue ?
                        Math.min(
                            config.maxMarkerSize - config.minMarkerSize,
                            (Math.log(totalBuyDollars) - Math.log(config.minDollarValue)) /
                            (Math.log(config.maxDollarValue) - Math.log(config.minDollarValue)) *
                            (config.maxMarkerSize - config.minMarkerSize)
                        ) : 0;

                    // Create hover details with exchange breakdown
                    const hoverDetails = {
                        total: formatDollarValue(totalBuyDollars),
                        bybit: formatDollarValue(bybitBuyDollars),
                        liquidations: agg.liquidations.filter(l => l.side === "Buy")
                    };

                    // Set color for buy liquidations
                    const color = "rgba(0, 200, 200, 1.0)"; // Darker aqua for Bybit

                    this.markers.push({
                        time: barTime,
                        position: "above", // Above the price for buy liquidations (longs liquidated)
                        color: color,
                        shape: "arrow",
                        text: formatDollarValue(totalBuyDollars), // Show cumulative total
                        size: config.minMarkerSize + buySizeFactor,
                        hoverDetails: hoverDetails, // Add hover details
                        side: "Buy"
                    });
                }
            });

            // The markers will be rendered by script.js
            if (window.drawChart) {
                window.drawChart();
            }
        }

        // Not needed in our implementation as we're using timestamps directly
        findBar(timestamp) {
            return { time: timestamp };
        }
    }

    // Initialize liquidations manager immediately
    const liquidationManager = new LiquidationManager();

    // Function to draw live liquidation indicators
    function drawLiveLiquidationIndicators(ctx, bars, getYForPrice, barWidth, viewOffset, liveLiquidations) {
        if (!bars || bars.length === 0 || !liveLiquidations || liveLiquidations.length === 0) return;

        // Get the current bar (last bar)
        const currentBar = bars[bars.length - 1];
        if (!currentBar) return;

        // Calculate position of the current bar
        const barIndex = bars.length - 1;
        const x = (barIndex - viewOffset) * barWidth + barWidth / 2;

        // Skip if the current bar is not in view
        if (x < 0 || x > ctx.canvas.width) return;

        // Aggregate live liquidations by side
        let totalBuyDollars = 0;
        let totalSellDollars = 0;

        liveLiquidations.forEach(liq => {
            if (liq.side === 'Buy') {
                totalBuyDollars += liq.dollarValue;
            } else if (liq.side === 'Sell') {
                totalSellDollars += liq.dollarValue;
            }
        });

        // Draw buy liquidation indicator (above bar)
        if (totalBuyDollars >= config.minDollarThreshold) {
            // Calculate size based on dollar value
            const normalizedValue = Math.min(Math.max(totalBuyDollars, config.minDollarValue), config.maxDollarValue);
            const valueRange = config.maxDollarValue - config.minDollarValue;
            const sizeRange = config.maxMarkerSize - config.minMarkerSize;
            const sizeFactor = ((normalizedValue - config.minDollarValue) / valueRange) * sizeRange;
            const size = config.minMarkerSize + sizeFactor;

            // Calculate dimensions
            const arrowWidth = size * 0.8;
            const arrowHeight = size * 1.5;

            // Calculate y position (above the high)
            const y = getYForPrice(currentBar.high * 1.001);

            // Draw pulsing arrow
            const pulseIntensity = 0.5 + 0.5 * Math.sin(Date.now() / 200); // Pulsing effect
            ctx.fillStyle = `rgba(0, 255, 255, ${pulseIntensity})`;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.lineWidth = 1.5;

            // Draw arrow pointing down
            ctx.beginPath();
            ctx.moveTo(x, y - arrowHeight);
            ctx.lineTo(x + arrowWidth / 2, y - arrowHeight + arrowWidth);
            ctx.lineTo(x + arrowWidth / 4, y - arrowHeight + arrowWidth);
            ctx.lineTo(x + arrowWidth / 4, y);
            ctx.lineTo(x - arrowWidth / 4, y);
            ctx.lineTo(x - arrowWidth / 4, y - arrowHeight + arrowWidth);
            ctx.lineTo(x - arrowWidth / 2, y - arrowHeight + arrowWidth);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Draw dollar value
            ctx.font = '10px Arial';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(formatDollarValue(totalBuyDollars), x, y - arrowHeight - 5);
        }

        // Draw sell liquidation indicator (below bar)
        if (totalSellDollars >= config.minDollarThreshold) {
            // Calculate size based on dollar value
            const normalizedValue = Math.min(Math.max(totalSellDollars, config.minDollarValue), config.maxDollarValue);
            const valueRange = config.maxDollarValue - config.minDollarValue;
            const sizeRange = config.maxMarkerSize - config.minMarkerSize;
            const sizeFactor = ((normalizedValue - config.minDollarValue) / valueRange) * sizeRange;
            const size = config.minMarkerSize + sizeFactor;

            // Calculate dimensions
            const arrowWidth = size * 0.8;
            const arrowHeight = size * 1.5;

            // Calculate y position (below the low)
            const y = getYForPrice(currentBar.low * 0.999);

            // Draw pulsing arrow
            const pulseIntensity = 0.5 + 0.5 * Math.sin(Date.now() / 200); // Pulsing effect
            ctx.fillStyle = `rgba(255, 85, 85, ${pulseIntensity})`;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.lineWidth = 1.5;

            // Draw arrow pointing up
            ctx.beginPath();
            ctx.moveTo(x, y + arrowHeight);
            ctx.lineTo(x + arrowWidth / 2, y + arrowHeight - arrowWidth);
            ctx.lineTo(x + arrowWidth / 4, y + arrowHeight - arrowWidth);
            ctx.lineTo(x + arrowWidth / 4, y);
            ctx.lineTo(x - arrowWidth / 4, y);
            ctx.lineTo(x - arrowWidth / 4, y + arrowHeight - arrowWidth);
            ctx.lineTo(x - arrowWidth / 2, y + arrowHeight - arrowWidth);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Draw dollar value
            ctx.font = '10px Arial';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(formatDollarValue(totalSellDollars), x, y + arrowHeight + 15);
        }
    }

    // Track hover state
    let hoveredMarker = null;
    let mouseX = null;
    let mouseY = null;

    // Add mouse move listener for hover detection
    document.addEventListener('mousemove', (e) => {
        const canvas = document.getElementById('chart');
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
    });

    // Expose drawing function for script.js to use
    window.drawLiquidationMarkers = (ctx, bars, getYForPrice, barWidth, viewOffset) => {
        if (!liquidationManager) {
            console.error('Liquidation manager not available');
            return;
        }

        // Draw regular liquidation markers
        if (liquidationManager.markers && liquidationManager.markers.length > 0) {
            console.log(`Drawing ${liquidationManager.markers.length} liquidation markers`);
        } else {
            // No markers to draw - this is expected when there are no recent liquidations
            // We don't force an update anymore since we only want to show new liquidations
        }

        // Draw live liquidation indicators for current bar
        const liveLiquidations = liquidationManager.liveLiquidations;
        if (liveLiquidations && liveLiquidations.length > 0) {
            console.log(`Drawing ${liveLiquidations.length} live liquidation indicators`);
            drawLiveLiquidationIndicators(ctx, bars, getYForPrice, barWidth, viewOffset, liveLiquidations);
        }

        // Reset hovered marker
        hoveredMarker = null;

        // Draw each marker regardless of zoom level
        liquidationManager.markers.forEach(marker => {
            // Find the bar with the exact time match or closest time
            let targetBar = null;
            let minTimeDiff = Infinity;
            let barIndex = -1;

            // First try to find an exact time match
            for (let i = 0; i < bars.length; i++) {
                // For exact match, use Math.floor to match the aggregation logic
                const barTime = Math.floor(bars[i].time / config.barInterval) * config.barInterval;
                if (barTime === marker.time) {
                    targetBar = bars[i];
                    barIndex = i;
                    break;
                }

                // If no exact match, keep track of closest bar
                const timeDiff = Math.abs(bars[i].time - marker.time);
                if (timeDiff < minTimeDiff) {
                    minTimeDiff = timeDiff;
                    targetBar = bars[i];
                    barIndex = i;
                }
            }

            // Skip if no matching bar found
            if (!targetBar) {
                console.log(`No matching bar found for liquidation at time ${new Date(marker.time).toLocaleString()}`);
                return;
            }

            // Calculate position - check if the bar is in view
            // Use the barIndex we already calculated instead of bars.indexOf(targetBar)

            // Skip if the bar is not in the visible range
            if (barIndex < Math.floor(viewOffset) || barIndex > Math.floor(viewOffset) + Math.ceil(ctx.canvas.width / barWidth)) {
                // console.log(`Liquidation marker at ${new Date(marker.time).toLocaleString()} is not in visible range`);
                return;
            }

            // Only log the first few markers to avoid console spam
            if (liquidationManager.markers.indexOf(marker) < 3) {
                console.log(`Drawing liquidation marker at time ${new Date(marker.time).toLocaleString()} for bar index ${barIndex}`);
            }


            // Calculate x position based on bar position
            const x = (barIndex - viewOffset) * barWidth + barWidth / 2;

            // Calculate arrow dimensions based on size - scale with liquidation value
            // For 50k liquidations: small arrow
            // For 1M+ liquidations: large arrow
            const size = marker.size * 5; // Increased base multiplier for better visibility
            const arrowWidth = size * 1.0; // Wider arrows for better visibility
            const arrowHeight = size * 2.0; // Taller arrows for better visibility
            const arrowHeadSize = size * 0.8; // Larger arrow heads

            // Calculate arrow positions based on whether it's above or below
            const isAbove = marker.position === "above";
            const priceY = getYForPrice(isAbove ? targetBar.high : targetBar.low);
            const arrowY = isAbove ? priceY - arrowHeight : priceY;

            // Store position in marker for hover detection
            marker.renderX = x;
            marker.renderY = isAbove ? (priceY - arrowHeight/2) : (priceY + arrowHeight/2);
            marker.arrowTop = isAbove ? arrowY : priceY;
            marker.arrowBottom = isAbove ? priceY : (priceY + arrowHeight);
            marker.arrowWidth = arrowWidth;

            // Check if mouse is hovering over this marker (check if mouse is within arrow bounds)
            if (mouseX !== null && mouseY !== null) {
                const isInXBounds = mouseX >= (x - arrowWidth/2) && mouseX <= (x + arrowWidth/2);
                const isInYBounds = mouseY >= marker.arrowTop && mouseY <= marker.arrowBottom;

                if (isInXBounds && isInYBounds) {
                    hoveredMarker = marker;
                }
            }

            // Draw with slightly different style if hovered
            if (marker === hoveredMarker) {
                // Draw highlight glow
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = 10;
            }

            // Draw arrow
            ctx.fillStyle = marker.color;
            ctx.beginPath();

            if (isAbove) {
                // Arrow pointing down to price
                // Arrow head (triangle pointing down)
                ctx.moveTo(x - arrowHeadSize, priceY - arrowHeadSize);
                ctx.lineTo(x + arrowHeadSize, priceY - arrowHeadSize);
                ctx.lineTo(x, priceY);
                ctx.closePath();

                // Arrow body (rectangle above)
                ctx.rect(x - arrowWidth/2, arrowY, arrowWidth, arrowHeight - arrowHeadSize);
            } else {
                // Arrow pointing up to price
                // Arrow head (triangle pointing up)
                ctx.moveTo(x - arrowHeadSize, priceY + arrowHeadSize);
                ctx.lineTo(x + arrowHeadSize, priceY + arrowHeadSize);
                ctx.lineTo(x, priceY);
                ctx.closePath();

                // Arrow body (rectangle below)
                ctx.rect(x - arrowWidth/2, priceY + arrowHeadSize, arrowWidth, arrowHeight - arrowHeadSize);
            }

            ctx.fill();

            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            // Draw text at the opposite end of the arrow
            if (marker.text) {
                // Adjust font size based on liquidation size
                // Larger font for larger liquidations
                const fontSize = Math.max(12, Math.min(20, 12 + Math.log10(marker.size) * 3));
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';

                // Position text at the base of the arrow (opposite from price)
                const textY = isAbove ?
                    arrowY + fontSize/2 : // For arrows above price, text at top of arrow
                    priceY + arrowHeight + fontSize + 2; // For arrows below price, text below arrow

                ctx.fillText(marker.text, x, textY);
            }
        });

        // Draw hover tooltip if a marker is hovered
        if (hoveredMarker && hoveredMarker.hoverDetails) {
            const details = hoveredMarker.hoverDetails;
            const x = hoveredMarker.renderX;
            const y = hoveredMarker.renderY;
            const side = hoveredMarker.side;

            // Create tooltip
            const tooltipWidth = 200;
            const tooltipHeight = 80; // Reduced height since we removed Binance
            const tooltipX = Math.min(ctx.canvas.width - tooltipWidth - 10, Math.max(10, x - tooltipWidth / 2));
            const tooltipY = side === "Sell" ? y + 20 : y - tooltipHeight - 20;

            // Draw tooltip background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
            ctx.strokeStyle = side === "Sell" ? 'rgba(255, 85, 85, 0.8)' : 'rgba(0, 255, 255, 0.8)';
            ctx.lineWidth = 2;
            ctx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);

            // Draw tooltip content
            ctx.font = 'bold 12px Arial';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.fillText(`${side} Liquidations: ${details.total}`, tooltipX + 10, tooltipY + 20);

            ctx.font = '11px Arial';
            ctx.fillText(`Bybit: ${details.bybit}`, tooltipX + 10, tooltipY + 45);

            // Count liquidations
            const bybitCount = details.liquidations.filter(l => l.exchange === 'bybit').length;
            ctx.fillText(`(${bybitCount} orders)`, tooltipX + 120, tooltipY + 45);

            // Draw timestamp
            ctx.font = '10px Arial';
            ctx.fillText(new Date(hoveredMarker.time).toLocaleTimeString(), tooltipX + 10, tooltipY + 85);
        }
    };
})();