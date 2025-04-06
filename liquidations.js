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

            // Simulated liquidations are disabled - only using real liquidations
            // this.setupSimulatedLiquidations();

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

        // Generate test liquidations for all coins - disabled to only show real liquidations
        generateTestLiquidationsForAllCoins() {
            console.log('Test liquidations are disabled - only showing real liquidations from Bybit');
            // No test liquidations will be generated
            return;
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

                // No test liquidations - only using real liquidations now
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

        setupSimulatedLiquidations() {
            // Simulated liquidations are disabled to only show real liquidations
            console.log('Simulated liquidations are disabled - only showing real liquidations from Bybit');
            // No simulated liquidations will be generated
        }

        generateRealisticLiquidation(currentPrice, isSell, time) {
            // Always use Bybit as the exchange
            const exchange = 'bybit';

            // Get current coin configuration
            const minSize = config.minIndividualLiquidationSize;
            const scaleFactor = config.valueScaleFactor;

            // Size for liquidations, scaled based on the coin's value
            let baseSize = (Math.random() * 2 + 1.5) / scaleFactor; // Original values

            // Adjust size based on side (sells tend to be larger)
            const size = isSell ? baseSize * 1.2 : baseSize; // Original values

            // Price is slightly beyond the current price (that's why it liquidated)
            const priceOffset = isSell ? -50 - Math.random() * 100 : 50 + Math.random() * 100;
            const price = currentPrice + priceOffset;

            const liquidation = {
                time: time,
                price: price,
                size: size,
                side: isSell ? "Sell" : "Buy",
                exchange: exchange,
                pair: this.pair, // Include the pair in the liquidation object
                dollarValue: price * size // Add dollar value for filtering
            };

            // Dispatch the liquidation event
            const event = new CustomEvent(`liquidation-${this.pair}`, {
                detail: liquidation
            });
            window.dispatchEvent(event);
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

            // Limit the number of stored liquidations for this coin
            if (coinLiquidations.length > config.maxLiquidations) {
                coinLiquidations.shift();
            }
        }

        aggregateLiquidations() {
            const aggregated = new Map();
            const now = Date.now();

            // Get the liquidations for the current pair
            const currentPairLiquidations = this.liquidationsByCoin[this.pair] || [];

            // Only include liquidations from the last minute (or configured window)
            const recentLiquidations = currentPairLiquidations.filter(liq =>
                liq.time >= now - config.newLiquidationWindow
            );

            console.log(`Filtering liquidations for ${this.pair}: ${currentPairLiquidations.length} total, ${recentLiquidations.length} recent`);

            recentLiquidations.forEach((liq) => {
                // The time should already be aligned with bar intervals, but let's ensure it
                const barTime = liq.time; // Already aligned in addLiquidation
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

            // No need to reset any flags since we always show the text

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
                    // No scaling factor applied to ensure accurate display
                    const scaledSellDollars = totalSellDollars; // No scaling factor
                    const sellSizeFactor = scaledSellDollars >= config.minDollarValue ?
                        Math.min(
                            config.maxMarkerSize - config.minMarkerSize,
                            (Math.log(scaledSellDollars) - Math.log(config.minDollarValue)) /
                            (Math.log(config.maxDollarValue) - Math.log(config.minDollarValue)) *
                            (config.maxMarkerSize - config.minMarkerSize)
                        ) : 0;

                    // Create hover details with exchange breakdown (only Bybit now)
                    const hoverDetails = {
                        total: formatDollarValue(totalSellDollars),
                        bybit: formatDollarValue(bybitSellDollars),
                        liquidations: agg.liquidations.filter(l => l.side === "Sell")
                    };

                    // Set color for sell liquidations using customization settings
                    const sellColor = window.colorCustomizer && window.colorCustomizer.colors.sellLiquidationColor || "rgba(220, 50, 50, 1.0)";
                    const sellOpacity = window.colorCustomizer && window.colorCustomizer.opacitySettings.sellLiquidationOpacity || 1.0;

                    // Apply opacity to color
                    let color;
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

                    this.markers.push({
                        time: barTime,
                        position: "above", // Above the price for sell liquidations (longs liquidated)
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
                    // No scaling factor applied to ensure accurate display
                    const scaledBuyDollars = totalBuyDollars; // No scaling factor
                    const buySizeFactor = scaledBuyDollars >= config.minDollarValue ?
                        Math.min(
                            config.maxMarkerSize - config.minMarkerSize,
                            (Math.log(scaledBuyDollars) - Math.log(config.minDollarValue)) /
                            (Math.log(config.maxDollarValue) - Math.log(config.minDollarValue)) *
                            (config.maxMarkerSize - config.minMarkerSize)
                        ) : 0;

                    // Create hover details with exchange breakdown
                    const hoverDetails = {
                        total: formatDollarValue(totalBuyDollars),
                        bybit: formatDollarValue(bybitBuyDollars),
                        liquidations: agg.liquidations.filter(l => l.side === "Buy")
                    };

                    // Set color for buy liquidations using customization settings
                    const buyColor = window.colorCustomizer && window.colorCustomizer.colors.buyLiquidationColor || "rgba(0, 200, 200, 1.0)";
                    const buyOpacity = window.colorCustomizer && window.colorCustomizer.opacitySettings.buyLiquidationOpacity || 1.0;

                    // Apply opacity to color
                    let color;
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

                    this.markers.push({
                        time: barTime,
                        position: "below", // Below the price for buy liquidations (shorts liquidated)
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

    // Make the liquidation manager globally accessible for debugging
    window.liquidationManager = liquidationManager;

    // Test liquidations functionality removed

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
            const size = marker.size * 3.0; // Base multiplier

            // Get customized arrow dimensions from settings
            const widthMultiplier = window.colorCustomizer && window.colorCustomizer.sizeSettings.liquidationArrowWidth || 0.5;
            const heightMultiplier = window.colorCustomizer && window.colorCustomizer.sizeSettings.liquidationArrowHeight || 1.2;
            const headSizeMultiplier = window.colorCustomizer && window.colorCustomizer.sizeSettings.liquidationArrowHeadSize || 0.6;

            const arrowWidth = size * widthMultiplier; // Width based on settings
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

            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            // Draw text at the opposite end of the arrow
            // Always show the USD value text
            if (marker.text) {
                // Adjust font size based on liquidation size
                // Larger font for larger liquidations
                const fontSize = Math.max(10, Math.min(16, 10 + Math.log10(marker.size) * 2.5));
                ctx.font = `bold ${fontSize}px Arial`;
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';

                // Position text at a safe distance from the arrow to prevent overlap
                const textY = isAbove ?
                    arrowY - fontSize/2 - 2 : // For arrows above price, text above arrow with padding
                    priceY + arrowHeight + fontSize + 2; // For arrows below price, text below arrow with padding

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

            // Draw timestamp - use bar time for display
            ctx.font = '10px Arial';
            const barDate = new Date(hoveredMarker.time);
            const formattedTime = barDate.toLocaleTimeString();
            ctx.fillText(`Bar time: ${formattedTime}`, tooltipX + 10, tooltipY + 85);
        }
    };
})();