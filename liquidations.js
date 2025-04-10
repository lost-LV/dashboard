// liquidations.js
(function () {
    // Configuration
    const config = {
        barInterval: 300000, // 5 minute, matching our chart interval
        maxLiquidations: 1000, // Limit stored liquidations per coin
        updateThrottle: 100, // Throttle updates
        minMarkerSize: 1.5, // Minimum arrow size (for 50k liquidations) - reduced from 2
        maxMarkerSize: 4, // Maximum arrow size (for 1M+ liquidations) - reduced from 8
        minDollarValue: 50000, // Minimum dollar value to display (50k)
        maxDollarValue: 1000000, // Maximum dollar value for scaling (1M)
        minDollarThreshold: 50000, // Only show liquidations when total > $50k
        // These values will be dynamically updated based on the selected coin
        minIndividualLiquidationSize: 0.5, // Default for BTC
        minIndividualDollarValue: 50000, // Minimum dollar value for individual liquidations (50k)
        newLiquidationWindow: 86400000, // Show liquidations from the last 24 hours (permanent display)
        liveIndicatorDuration: 86400000, // Keep the live indicator permanently (24 hours)
        valueScaleFactor: 1, // Default scale factor for BTC
        // List of supported coins
        supportedCoins: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'LTCUSDT', 'XRPUSDT']
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
            // Get current pair from coin manager if available
            this.pair = window.coinManager ? window.coinManager.getCurrentCoin().bybitSymbol : 'BTCUSDT';

            // Store liquidations for each coin separately
            this.liquidationsByCoin = {};

            // Initialize liquidation arrays for each supported coin
            config.supportedCoins.forEach(coin => {
                this.liquidationsByCoin[coin] = [];
            });

            this.liquidations = []; // Raw liquidation events for current coin (for backward compatibility)
            this.liveLiquidations = []; // Store recent liquidations for live indicator
            this.throttledUpdateMarkers = throttle(this.updateMarkers.bind(this), config.updateThrottle);
            this.markers = []; // Store markers for rendering
            this.exchanges = ['bybit']; // Only track Bybit for liquidations

            // Update config based on current coin
            this.updateConfigForCurrentCoin();

            // Initialize
            this.init();

            // Listen for coin changes
            document.addEventListener('coinChanged', (e) => {
                this.handleCoinChange(e.detail.coin);
            });
        }

        init() {
            // Connect only to Bybit WebSocket for liquidations
            this.connectToBybitWebSocket();

            // Listen for liquidation events for all supported coins
            config.supportedCoins.forEach(pair => {
                window.addEventListener(`liquidation-${pair}`, (event) => {
                    // Process liquidations for all pairs, not just the current one
                    const liq = event.detail;
                    this.addLiquidation(liq, pair);
                });
            });

            // Listen for color updates
            document.addEventListener('colorsUpdated', () => {
                console.log('Colors updated, refreshing liquidation markers');
                this.updateMarkers();
            });

            // Initial update
            this.updateMarkers();

            // Expose the instance globally for access from script.js
            window.liquidationManager = this;

            // Log that initialization is complete
            console.log(`Liquidation manager initialized for all coins with Bybit data - showing new liquidations for all coins`);
        }

        // Update configuration based on the current coin
        updateConfigForCurrentCoin() {
            if (window.coinManager) {
                const coin = window.coinManager.getCurrentCoin();

                // Update minimum liquidation size based on coin
                config.minIndividualLiquidationSize = coin.minLiquidationSize || 0.5;

                // Set value scale factor to 1 to ensure accurate display of liquidation values
                config.valueScaleFactor = 1; // Always use 1 to avoid scaling issues

                console.log(`Updated liquidation config for ${coin.symbol}: min size=${config.minIndividualLiquidationSize}, scale factor=${config.valueScaleFactor}`);
            }
        }

        // Handle coin change event
        handleCoinChange(coin) {
            console.log(`Liquidation manager handling coin change to ${coin.symbol}`);

            // Update pair
            this.pair = coin.bybitSymbol;

            // Update config for the new coin
            this.updateConfigForCurrentCoin();

            // Clear markers but keep liquidations for all coins
            this.markers = [];

            // Make sure the liquidationsByCoin object has an array for this pair
            if (!this.liquidationsByCoin[this.pair]) {
                this.liquidationsByCoin[this.pair] = [];
            }

            // Update the main liquidations array for backward compatibility
            this.liquidations = this.liquidationsByCoin[this.pair];

            // No need to reconnect to WebSocket since we're already subscribed to all coins

            // Update markers for the new coin
            this.updateMarkers();

            console.log(`Switched to showing liquidations for ${this.pair}. Have ${this.liquidations.length} liquidations for this coin.`);
        }



        // Binance WebSocket connection removed - using only Bybit for liquidations

        connectToBybitWebSocket() {
            // Connect to Bybit WebSocket for liquidation data
            // Using v5 API for liquidations
            const bybitWs = new WebSocket('wss://stream.bybit.com/v5/public/linear');

            // Subscribe to liquidation streams for all supported coins
            bybitWs.onopen = () => {
                console.log(`Connected to Bybit WebSocket for liquidations`);

                // Subscribe to all supported coins
                const subscribeMsg = {
                    op: 'subscribe',
                    args: config.supportedCoins.map(pair => `liquidation.${pair}`),
                    req_id: 'liquidation_all_coins'
                };
                bybitWs.send(JSON.stringify(subscribeMsg));

                console.log(`Subscribed to liquidation streams for: ${config.supportedCoins.join(', ')}`);
                console.log(`Currently displaying liquidations for: ${this.pair}`);

                // Log subscription message for debugging
                console.log('Sent Bybit subscription message:', subscribeMsg);
            };

            // Process Bybit liquidation messages
            bybitWs.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    // Check if it's a liquidation event for any supported pair
                    if (data.topic && data.topic.startsWith('liquidation.') && data.data) {
                        const pair = data.topic.replace('liquidation.', '');
                        console.log(`Bybit ${pair} liquidation:`, data);

                        // Process liquidations for all pairs, not just the current one
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
                            pair: pair,
                            dollarValue: price * size
                        };

                        // Add the liquidation to the appropriate coin's array
                        this.addLiquidation(liquidation, pair);
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





        addLiquidation(liq, pair) {
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

            // Use the provided pair or the pair from the liquidation object
            const liquidationPair = pair || liq.pair;

            // Skip if the pair is not supported
            if (!liquidationPair || !config.supportedCoins.includes(liquidationPair)) {
                console.log(`Skipping liquidation for unsupported pair: ${liquidationPair}`);
                return;
            }

            const dollarValue = liq.price * liq.size; // Calculate dollar value

            // We'll capture all liquidations regardless of size
            // The filtering will happen in the updateMarkers method
            // This ensures we don't miss any liquidations

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

            // Align liquidation time with the correct bar interval
            const barTime = Math.floor(liq.time / config.barInterval) * config.barInterval;

            // Create liquidation object
            const liquidation = {
                time: barTime, // Use aligned bar time instead of exact time
                dollarValue: dollarValue, // Store in dollars
                side: liq.side,
                exchange: liq.exchange || 'unknown', // Store which exchange it came from
                price: liq.price,
                size: liq.size,
                addedAt: Date.now(), // Track when this liquidation was added
                originalTime: liq.time, // Keep original time for reference
                pair: liquidationPair // Store which pair this liquidation is for
            };

            // Make sure the liquidationsByCoin object has an array for this pair
            if (!this.liquidationsByCoin[liquidationPair]) {
                this.liquidationsByCoin[liquidationPair] = [];
            }

            // Get the liquidations array for this coin
            const coinLiquidations = this.liquidationsByCoin[liquidationPair];

            // Check if this liquidation already exists to prevent duplicates
            const isDuplicate = coinLiquidations.some(liq =>
                liq.time === liquidation.time &&
                liq.price === liquidation.price &&
                liq.size === liquidation.size &&
                liq.side === liquidation.side &&
                liq.exchange === liquidation.exchange
            );

            if (!isDuplicate) {
                // Add to the coin-specific collection
                coinLiquidations.push(liquidation);

                // If this is the current pair, also add to the main liquidations array for backward compatibility
                if (liquidationPair === this.pair) {
                    this.liquidations.push(liquidation);
                    // Update the markers immediately for the current pair
                    this.throttledUpdateMarkers();
                }
            } else {
                console.log(`Skipping duplicate liquidation for ${liquidationPair}`);
                return; // Skip the rest of the processing for duplicates
            }

            // Keep liquidations permanently visible
            // We've set the liveIndicatorDuration to 24 hours, so they'll stay visible
            // No need to remove them with setTimeout

            // Get coin symbol for logging
            let coinSymbol = 'Unknown';
            if (liquidationPair.includes('BTC')) coinSymbol = 'BTC';
            else if (liquidationPair.includes('ETH')) coinSymbol = 'ETH';
            else if (liquidationPair.includes('SOL')) coinSymbol = 'SOL';
            else if (liquidationPair.includes('LTC')) coinSymbol = 'LTC';
            else if (liquidationPair.includes('XRP')) coinSymbol = 'XRP';

            // Log the accepted liquidation
            console.log(`Added liquidation for ${liquidationPair}: ${liq.size.toFixed(2)} ${coinSymbol} ($${dollarValue.toFixed(0)}) - ${liq.side} - ${liq.exchange}`);

            // Get the current audio threshold from audio manager or use default 1M
            const audioThreshold = window.audioManager ? window.audioManager.threshold : 1000000;

            // Play audio notification and show visual notification for large liquidations (above threshold)
            if (dollarValue >= audioThreshold) {
                console.log(`Large liquidation detected: ${formatDollarValue(dollarValue)}`);

                // Play audio notification if audio manager is available
                if (window.audioManager) {
                    window.audioManager.playLiquidationSound(liq.side, dollarValue);
                }

                // Show visual notification with threshold in the message
                const thresholdText = audioThreshold >= 1000000 ?
                    `$${(audioThreshold / 1000000).toFixed(1)}M` :
                    `$${(audioThreshold / 1000).toFixed(0)}K`;

                const notificationMessage = `Large ${liq.side === 'Buy' ? 'short' : 'long'} liquidation: ${formatDollarValue(dollarValue)} at ${liq.price.toFixed(1)}`;

                // Use the showNotification function if available
                if (typeof window.showNotification === 'function') {
                    window.showNotification(notificationMessage, 3000);
                } else if (typeof window.domUtils !== 'undefined' && typeof window.domUtils.showNotification === 'function') {
                    window.domUtils.showNotification(notificationMessage, 3000);
                } else {
                    // Fallback to alert if no notification function is available
                    console.log('No notification function available, showing alert');
                    alert(notificationMessage);
                }
            }

            // Limit the number of stored liquidations for this coin
            if (coinLiquidations.length > config.maxLiquidations) {
                coinLiquidations.shift();
            }
        }

        getLiquidations() {
            const now = Date.now();

            // Get the liquidations for the current pair
            const currentPairLiquidations = this.liquidationsByCoin[this.pair] || [];

            // Only include liquidations from the last minute (or configured window)
            const recentLiquidations = currentPairLiquidations.filter(liq =>
                liq.time >= now - config.newLiquidationWindow
            );

            console.log(`Filtering liquidations for ${this.pair}: ${currentPairLiquidations.length} total, ${recentLiquidations.length} recent`);

            return recentLiquidations;
        }

        updateMarkers() {
            const liquidations = this.getLiquidations();
            this.markers = [];

            console.log(`Updating markers with ${liquidations.length} individual liquidations`);

            // Group liquidations by time and side only (not by price)
            const liquidationGroups = new Map();

            // Process each liquidation individually
            liquidations.forEach((liq) => {
                // Skip liquidations below the threshold
                if (liq.dollarValue < config.minDollarThreshold) {
                    return;
                }

                // Create a key for grouping by time and side only
                const groupKey = `${liq.time}-${liq.side}`;

                if (!liquidationGroups.has(groupKey)) {
                    liquidationGroups.set(groupKey, []);
                }

                liquidationGroups.get(groupKey).push(liq);
            });

            // Process each group of liquidations
            liquidationGroups.forEach((liquidationsInGroup, groupKey) => {
                // Get the side from the first liquidation in the group
                const side = liquidationsInGroup[0].side;
                const time = liquidationsInGroup[0].time;

                // Calculate total dollar value for all liquidations in this group
                const totalDollarValue = liquidationsInGroup.reduce((sum, liq) => sum + liq.dollarValue, 0);

                // Logarithmic scaling between min and max size based on total dollar value (50k to 1M)
                const scaledDollars = totalDollarValue;
                const sizeFactor = scaledDollars >= config.minDollarValue ?
                    Math.min(
                        config.maxMarkerSize - config.minMarkerSize,
                        (Math.log(scaledDollars) - Math.log(config.minDollarValue)) /
                        (Math.log(config.maxDollarValue) - Math.log(config.minDollarValue)) *
                        (config.maxMarkerSize - config.minMarkerSize)
                    ) : 0;

                // Create hover details for the aggregated liquidation
                const hoverDetails = {
                    total: formatDollarValue(totalDollarValue),
                    bybit: formatDollarValue(totalDollarValue),
                    liquidations: liquidationsInGroup // All liquidations in this group
                };

                // Set color based on side
                let color;
                if (side === "Sell") {
                    // Set color for sell liquidations using customization settings
                    const sellColor = window.colorCustomizer && window.colorCustomizer.colors.sellLiquidationColor || "rgba(220, 50, 50, 1.0)";
                    const sellOpacity = window.colorCustomizer && window.colorCustomizer.opacitySettings.sellLiquidationOpacity || 1.0;

                    // Apply opacity to color
                    if (sellColor.startsWith('rgba')) {
                        // If it's already rgba, extract the RGB components and apply the new opacity
                        const rgbaMatch = sellColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
                        if (rgbaMatch) {
                            const r = parseInt(rgbaMatch[1]);
                            const g = parseInt(rgbaMatch[2]);
                            const b = parseInt(rgbaMatch[3]);
                            color = `rgba(${r}, ${g}, ${b}, ${sellOpacity})`;
                        } else {
                            color = sellColor; // Fallback if regex fails
                        }
                    } else if (sellColor.startsWith('#')) {
                        // If it's a hex color, convert to rgba
                        const r = parseInt(sellColor.slice(1, 3), 16);
                        const g = parseInt(sellColor.slice(3, 5), 16);
                        const b = parseInt(sellColor.slice(5, 7), 16);
                        color = `rgba(${r}, ${g}, ${b}, ${sellOpacity})`;
                    } else {
                        // Fallback
                        color = `rgba(220, 50, 50, ${sellOpacity})`;
                    }
                } else { // Buy side
                    // Set color for buy liquidations using customization settings
                    const buyColor = window.colorCustomizer && window.colorCustomizer.colors.buyLiquidationColor || "rgba(0, 200, 200, 1.0)";
                    const buyOpacity = window.colorCustomizer && window.colorCustomizer.opacitySettings.buyLiquidationOpacity || 1.0;

                    // Apply opacity to color
                    if (buyColor.startsWith('rgba')) {
                        // If it's already rgba, extract the RGB components and apply the new opacity
                        const rgbaMatch = buyColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
                        if (rgbaMatch) {
                            const r = parseInt(rgbaMatch[1]);
                            const g = parseInt(rgbaMatch[2]);
                            const b = parseInt(rgbaMatch[3]);
                            color = `rgba(${r}, ${g}, ${b}, ${buyOpacity})`;
                        } else {
                            color = buyColor; // Fallback if regex fails
                        }
                    } else if (buyColor.startsWith('#')) {
                        // If it's a hex color, convert to rgba
                        const r = parseInt(buyColor.slice(1, 3), 16);
                        const g = parseInt(buyColor.slice(3, 5), 16);
                        const b = parseInt(buyColor.slice(5, 7), 16);
                        color = `rgba(${r}, ${g}, ${b}, ${buyOpacity})`;
                    } else {
                        // Fallback
                        color = `rgba(0, 200, 200, ${buyOpacity})`;
                    }
                }

                // Create a single marker for the entire group of liquidations
                this.markers.push({
                    time: time,
                    position: side === "Sell" ? "above" : "below", // Above for sell, below for buy
                    color: color,
                    shape: "arrow",
                    text: formatDollarValue(totalDollarValue), // Show total value
                    size: config.minMarkerSize + sizeFactor, // Size based on total value
                    hoverDetails: hoverDetails,
                    side: side,
                    horizontalOffset: 0, // No horizontal offset needed for single arrow
                    liquidationCount: liquidationsInGroup.length // Store count for hover info
                });
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

    // Make the liquidation manager globally accessible for debugging
    window.liquidationManager = liquidationManager;

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

        // Draw buy liquidation indicator (below bar)
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

            // Calculate y position (below the low)
            const y = getYForPrice(currentBar.low * 0.999);

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

        // Draw sell liquidation indicator (above bar)
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

            // Calculate y position (above the high)
            const y = getYForPrice(currentBar.high * 1.001);

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

    // We'll use the canvas mousemove event from script.js instead of adding our own
    // This prevents interference with the main chart's event handling
    // The mouseX and mouseY variables will be updated by the main chart's event handlers

    // Expose drawing function for script.js to use
    window.drawLiquidationMarkers = (ctx, bars, getYForPrice, barWidth, viewOffset) => {
        if (!liquidationManager) {
            console.error('Liquidation manager not available');
            return;
        }

        // Get mouse position from script.js if available
        if (window.chartMouseX !== undefined && window.chartMouseY !== undefined) {
            mouseX = window.chartMouseX;
            mouseY = window.chartMouseY;
        }

        // Draw regular liquidation markers for the current pair only
        if (liquidationManager.markers && liquidationManager.markers.length > 0) {
            console.log(`Drawing ${liquidationManager.markers.length} liquidation markers for ${liquidationManager.pair}`);
        } else {
            // No markers to draw - this is expected when there are no recent liquidations
            // We don't force an update anymore since we only want to show new liquidations
        }

        // We'll skip live indicators since they're causing duplication
        // The regular markers already include all liquidations

        // Reset hovered marker
        hoveredMarker = null;

        // Draw each marker regardless of zoom level
        liquidationManager.markers.forEach((marker, index) => {
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
            // Apply horizontal offset if specified to stagger arrows
            const horizontalOffset = marker.horizontalOffset || 0;
            const x = (barIndex - viewOffset) * barWidth + barWidth / 2 + horizontalOffset;

            // Calculate arrow dimensions based on size - scale with liquidation value
            // For 50k liquidations: small arrow
            // For 1M+ liquidations: large arrow
            const size = marker.size * 3.0; // Base multiplier

            // Get customized arrow dimensions from settings
            const widthMultiplier = window.colorCustomizer && window.colorCustomizer.sizeSettings.liquidationArrowWidth || 0.5;
            const heightMultiplier = window.colorCustomizer && window.colorCustomizer.sizeSettings.liquidationArrowHeight || 1.2;
            const headSizeMultiplier = window.colorCustomizer && window.colorCustomizer.sizeSettings.liquidationArrowHeadSize || 0.6;

            // Ensure arrows have enough width to prevent visual overlap
            const arrowWidth = Math.max(size * widthMultiplier, 6); // Width based on settings with minimum width
            const arrowHeight = size * heightMultiplier; // Height based on settings
            const arrowHeadSize = size * headSizeMultiplier; // Head size based on settings

            // Calculate arrow positions based on whether it's above or below
            const isAbove = marker.position === "above";
            const priceY = getYForPrice(isAbove ? targetBar.high : targetBar.low);
            // Position arrow at the price level with additional spacing
            // This ensures better separation between the arrow and the price/text
            const arrowY = isAbove ?
                priceY - arrowHeight - 3 : // Add space above the bar (reduced from 4)
                priceY + 3; // Add space below the bar (reduced from 4)

            // Store position in marker for hover detection
            marker.renderX = x;
            marker.renderY = isAbove ? (priceY - arrowHeight - 3) : (priceY + arrowHeight/2 + 3);
            marker.arrowTop = isAbove ? arrowY : (priceY + 3);
            marker.arrowBottom = isAbove ? priceY : (priceY + arrowHeight + 3);
            marker.arrowWidth = arrowWidth;
            // Store the horizontal offset for better hover detection
            marker.horizontalOffset = horizontalOffset;

            // Check if mouse is hovering over this marker
            if (mouseX !== null && mouseY !== null) {
                // Check if mouse is over the arrow
                // Account for horizontal offset in hover detection
                const isInArrowXBounds = mouseX >= (x - arrowWidth/2) && mouseX <= (x + arrowWidth/2);
                const isInArrowYBounds = mouseY >= marker.arrowTop && mouseY <= marker.arrowBottom;
                const isOverArrow = isInArrowXBounds && isInArrowYBounds;

                // Check if mouse is over the text (if text bounds exist)
                let isOverText = false;
                if (marker.textBounds) {
                    isOverText = mouseX >= marker.textBounds.x &&
                                mouseX <= (marker.textBounds.x + marker.textBounds.width) &&
                                mouseY >= marker.textBounds.y &&
                                mouseY <= (marker.textBounds.y + marker.textBounds.height);
                }

                // Check if mouse is in a UI area (price scale, time scale, etc.)
                const isPriceScaleArea = mouseX > ctx.canvas.width - 75; // Add extra margin
                const isTimeScaleArea = mouseY > ctx.canvas.height - 30; // Add extra margin
                const isTopBarArea = mouseY < 35; // Top bar area

                // Only set as hovered if mouse is over the element AND not in a UI area
                if ((isOverArrow || isOverText) && !isPriceScaleArea && !isTimeScaleArea && !isTopBarArea) {
                    hoveredMarker = marker;
                }
            }

            // Draw arrow
            ctx.fillStyle = marker.color;
            ctx.beginPath();

            if (isAbove) {
                // Arrow pointing down to price
                // Arrow head (triangle pointing down)
                ctx.moveTo(x - arrowHeadSize, priceY - arrowHeadSize - 4);
                ctx.lineTo(x + arrowHeadSize, priceY - arrowHeadSize - 4);
                ctx.lineTo(x, priceY - 4);
                ctx.closePath();
                ctx.fill();

                // Arrow body (rectangle above) - draw as separate shape to avoid path issues
                ctx.beginPath();
                ctx.rect(x - arrowWidth/2, arrowY, arrowWidth, arrowHeight - arrowHeadSize);
            } else {
                // Arrow pointing up to price
                // Arrow head (triangle pointing up)
                ctx.moveTo(x - arrowHeadSize, priceY + arrowHeadSize + 4);
                ctx.lineTo(x + arrowHeadSize, priceY + arrowHeadSize + 4);
                ctx.lineTo(x, priceY + 4);
                ctx.closePath();
                ctx.fill();

                // Arrow body (rectangle below) - draw as separate shape to avoid path issues
                ctx.beginPath();
                ctx.rect(x - arrowWidth/2, priceY + arrowHeadSize + 4, arrowWidth, arrowHeight - arrowHeadSize);
            }

            ctx.fill();

            // Draw text at the opposite end of the arrow
            // Always show the USD value text
            if (marker.text) {
                // Adjust font size based on liquidation size
                // Larger font for larger liquidations
                const fontSize = Math.max(10, Math.min(16, 10 + Math.log10(marker.size) * 2.5));
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';

                // Calculate text width to ensure no overlap with other markers
                const textWidth = ctx.measureText(marker.text).width;

                // Position text at a safe distance from the arrow to prevent overlap
                // Add index-based vertical offset to stagger text labels and prevent overlap
                const textVerticalOffset = index * 3; // Small vertical offset based on index
                const textY = isAbove ?
                    arrowY - fontSize - 4 - textVerticalOffset : // For arrows above price, text above arrow with more padding
                    priceY + arrowHeight + fontSize + 4 + textVerticalOffset; // For arrows below price, text below arrow with more padding

                // Add a background to make text more readable
                const padding = 2;
                const textBgWidth = textWidth + padding * 2;
                const textBgHeight = fontSize + padding * 2;
                const textBgX = x - textWidth/2 - padding;
                const textBgY = textY - fontSize + padding;

                // Store text bounds for hover detection
                marker.textBounds = {
                    x: textBgX,
                    y: textBgY,
                    width: textBgWidth,
                    height: textBgHeight
                };

                // Draw text background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillRect(textBgX, textBgY, textBgWidth, textBgHeight);

                // Draw text
                ctx.fillStyle = '#ffffff';
                ctx.fillText(marker.text, x, textY);
            }
        });

        // Draw hover tooltip if a marker is hovered
        if (hoveredMarker && hoveredMarker.hoverDetails) {
            // Double-check that mouse is not in a UI area
            const isPriceScaleArea = mouseX > ctx.canvas.width - 75; // Add extra margin
            const isTimeScaleArea = mouseY > ctx.canvas.height - 30; // Add extra margin
            const isTopBarArea = mouseY < 35; // Top bar area

            // Skip tooltip if mouse is in a UI area
            if (isPriceScaleArea || isTimeScaleArea || isTopBarArea) {
                hoveredMarker = null;
                return;
            }

            const details = hoveredMarker.hoverDetails;
            const x = hoveredMarker.renderX;
            const y = hoveredMarker.renderY;
            const side = hoveredMarker.side;

            // Create tooltip - size adjusted for detailed liquidation information
            const tooltipWidth = 180; // Increased width for more details
            // Calculate height based on number of liquidations (max 15 to show)
            const maxToShow = Math.min(details.liquidations.length, 15);
            const tooltipHeight = Math.min(350, 85 + (maxToShow * 16) + (details.liquidations.length > maxToShow ? 16 : 0)); // Dynamic height with increased max

            // Position tooltip to avoid UI elements
            let tooltipX = Math.min(ctx.canvas.width - tooltipWidth - 80, Math.max(10, x - tooltipWidth / 2));
            let tooltipY;

            // Position tooltip based on available space, considering the potentially larger height
            // For taller tooltips, prefer positioning to the side with more space
            const spaceAbove = y - 40; // Space above minus top bar
            const spaceBelow = ctx.canvas.height - 35 - y; // Space below minus time scale

            if (tooltipHeight <= spaceBelow || spaceBelow >= spaceAbove) {
                // Position below if there's enough space or more space below than above
                tooltipY = y + 20;
                // Ensure tooltip doesn't overlap with time scale
                if (tooltipY + tooltipHeight > ctx.canvas.height - 35) {
                    tooltipY = ctx.canvas.height - tooltipHeight - 35;
                }
            } else {
                // Position above if there's more space above
                tooltipY = y - tooltipHeight - 20;
                // Ensure tooltip doesn't overlap with top bar
                if (tooltipY < 40) {
                    tooltipY = 40;
                }
            }

            // If tooltip still doesn't fit, position it at the top with some padding
            if (tooltipY + tooltipHeight > ctx.canvas.height - 35) {
                tooltipY = Math.max(40, ctx.canvas.height - tooltipHeight - 35);
            }

            // Draw tooltip background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
            ctx.strokeStyle = side === "Sell" ? 'rgba(255, 85, 85, 0.8)' : 'rgba(0, 255, 255, 0.8)';
            ctx.lineWidth = 2;
            ctx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);

            // Draw tooltip content with detailed liquidation information
            ctx.font = 'bold 11px Arial';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';

            // Header with total liquidation value
            ctx.fillText(`${side} Liquidations: ${details.total}`, tooltipX + 6, tooltipY + 18);

            // Show count of liquidations in this group
            const count = hoveredMarker.liquidationCount || details.liquidations.length;
            ctx.font = '10px Arial';
            ctx.fillText(`Total Count: ${count}`, tooltipX + 6, tooltipY + 36);

            // Add a separator line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tooltipX + 6, tooltipY + 42);
            ctx.lineTo(tooltipX + tooltipWidth - 6, tooltipY + 42);
            ctx.stroke();

            // Show individual liquidation details
            if (details.liquidations && details.liquidations.length > 0) {
                // Sort liquidations by dollar value (largest first)
                const sortedLiquidations = [...details.liquidations].sort((a, b) => b.dollarValue - a.dollarValue);

                // Column headers
                ctx.font = 'bold 9px Arial';
                ctx.fillText('Amount', tooltipX + 6, tooltipY + 56);
                ctx.fillText('Price', tooltipX + 80, tooltipY + 56);
                ctx.fillText('Value', tooltipX + 130, tooltipY + 56);

                // Use the maxToShow value we already calculated
                ctx.font = '9px Arial';

                for (let i = 0; i < maxToShow; i++) {
                    const liq = sortedLiquidations[i];
                    const yPos = tooltipY + 72 + (i * 16);

                    // Get coin symbol for display
                    let coinSymbol = 'Unknown';
                    if (liq.pair.includes('BTC')) coinSymbol = 'BTC';
                    else if (liq.pair.includes('ETH')) coinSymbol = 'ETH';
                    else if (liq.pair.includes('SOL')) coinSymbol = 'SOL';
                    else if (liq.pair.includes('LTC')) coinSymbol = 'LTC';
                    else if (liq.pair.includes('XRP')) coinSymbol = 'XRP';

                    // Format size with appropriate precision based on coin
                    let sizeDisplay;
                    if (coinSymbol === 'BTC') {
                        sizeDisplay = liq.size.toFixed(3);
                    } else if (coinSymbol === 'ETH') {
                        sizeDisplay = liq.size.toFixed(2);
                    } else {
                        sizeDisplay = liq.size.toFixed(1);
                    }

                    // Display amount with coin symbol
                    ctx.fillText(`${sizeDisplay} ${coinSymbol}`, tooltipX + 6, yPos);

                    // Display price
                    ctx.fillText(`$${liq.price.toFixed(1)}`, tooltipX + 80, yPos);

                    // Display dollar value
                    ctx.fillText(formatDollarValue(liq.dollarValue), tooltipX + 130, yPos);
                }

                // If there are more liquidations than we can show
                if (sortedLiquidations.length > maxToShow) {
                    const remaining = sortedLiquidations.length - maxToShow;
                    ctx.fillText(`+ ${remaining} more...`, tooltipX + 6, tooltipY + 72 + (maxToShow * 16));

                    // Draw a simple scrollbar to indicate more content
                    const scrollbarHeight = Math.min(tooltipHeight - 100, 200);
                    const scrollbarY = tooltipY + 56;
                    const scrollThumbHeight = scrollbarHeight * (maxToShow / sortedLiquidations.length);

                    // Draw scrollbar track
                    ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
                    ctx.fillRect(tooltipX + tooltipWidth - 12, scrollbarY, 6, scrollbarHeight);

                    // Draw scrollbar thumb
                    ctx.fillStyle = 'rgba(200, 200, 200, 0.5)';
                    ctx.fillRect(tooltipX + tooltipWidth - 12, scrollbarY, 6, scrollThumbHeight);
                }

                // Show exchange at the bottom
                const exchangeY = tooltipY + tooltipHeight - 10;
                ctx.fillText(`Exchange: Bybit`, tooltipX + 6, exchangeY);
            }
        }
    };
})();