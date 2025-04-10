/**
 * Whale Watcher - Tracks and displays large orders in the orderbook
 *
 * This module detects large orders (whales) in the orderbook and displays them as bubbles on the chart.
 * It tracks orders above a configurable threshold (default 1M USD) and shows them with colors matching
 * bullish/bearish candle colors depending on whether it's a buy or sell.
 */

class WhaleWatcher {
    constructor() {
        // Configuration
        this.enabled = localStorage.getItem('whaleWatcherEnabled') === 'true';
        this.threshold = parseFloat(localStorage.getItem('whaleWatcherThreshold')) || 1000000; // Default 1M USD

        // Ensure threshold is at least 100000 (100K USD)
        if (this.threshold < 100000) {
            this.threshold = 100000;
        }

        // State
        this.markers = []; // Array to store whale markers
        this.lastOrderbookSnapshot = { bids: [], asks: [] }; // Last processed orderbook
        this.maxMarkersToKeep = 200; // Increased limit for individual orders
        this.processedTradeKeys = new Set(); // Set to track processed trades to avoid duplicates
        this.historicalDataLoaded = false; // Flag to track if historical data has been loaded

        // Make instance globally accessible
        window.whaleWatcher = this;

        console.log(`Whale Watcher initialized with threshold: $${this.formatDollarValue(this.threshold)}`);

        // Load historical data when initialized if enabled
        if (this.enabled) {
            // Wait for bars to be loaded before fetching historical data
            const checkBarsInterval = setInterval(() => {
                if (window.bars && window.bars.length > 0) {
                    clearInterval(checkBarsInterval);
                    this.fetchHistoricalTrades();
                }
            }, 500);

            // Clear interval after 10 seconds to prevent infinite checking
            setTimeout(() => clearInterval(checkBarsInterval), 10000);
        }
    }

    /**
     * Process a trade to detect whale trades
     * @param {Object} trade - Trade data object
     * @param {number} trade.price - Trade price
     * @param {number} trade.amount - Trade amount
     * @param {number} trade.value - Trade value in USD
     * @param {string} trade.type - Trade type ('buy' or 'sell')
     * @param {number} trade.timestamp - Trade timestamp
     * @param {boolean} isHistorical - Whether this is a historical trade being loaded
     */
    processTrade(trade, isHistorical = false) {
        if (!this.enabled) {
            return;
        }

        // Skip trades with zero or very small amounts (likely synthetic updates)
        if (!trade.amount || parseFloat(trade.amount) < 0.001) {
            console.log(`Skipping trade with small/zero amount: ${trade.amount}`);
            return;
        }

        // Debug logging for all trades (reduce logging for historical trades)
        if (!isHistorical) {
            console.log(`Trade received: ${trade.type} $${this.formatDollarValue(trade.value)} at ${trade.price} (${trade.amount} BTC) at ${new Date(trade.timestamp).toISOString()}`);
        }

        // Check if the trade value meets the threshold
        if (trade.value >= this.threshold) {
            if (!isHistorical) {
                console.log(`Whale trade detected: ${trade.type} $${this.formatDollarValue(trade.value)} at ${trade.price}`);
            }

            // Get the bar time for the trade's timestamp
            const currentBarTime = this.getCurrentBarTime(trade.timestamp);
            if (!currentBarTime) return;

            // Create a more robust unique key for this trade to avoid duplicates
            // Round price and amount to reduce variations that could cause duplicates
            const roundedPrice = Math.round(trade.price * 100) / 100; // Round to 2 decimal places
            const roundedAmount = Math.round(trade.amount * 10000) / 10000; // Round to 4 decimal places

            // Use a 5-second window for timestamp to group very close trades
            const timeWindow = Math.floor(trade.timestamp / 5000) * 5000;

            const tradeKey = `trade-${trade.type}-${roundedPrice.toFixed(2)}-${roundedAmount.toFixed(4)}-${timeWindow}`;

            // Check if we've already processed this trade
            if (this.processedTradeKeys.has(tradeKey)) {
                if (!isHistorical) {
                    console.log(`Trade already processed, skipping duplicate: ${tradeKey}`);
                }
                return;
            }

            // Add to processed trades set
            this.processedTradeKeys.add(tradeKey);

            if (!isHistorical) {
                console.log(`Generated trade key: ${tradeKey}`);
            }

            // Check if we already have this whale in our markers
            const existingMarkerIndex = this.markers.findIndex(m => m.orderKey === tradeKey);

            if (!isHistorical) {
                console.log(`Duplicate check: ${existingMarkerIndex === -1 ? 'New trade' : 'Duplicate trade'}`);
            }

            // Also check for similar trades (same price/amount within a time window)
            const similarTradeExists = this.markers.some(m => {
                // If it's not a trade marker, skip
                if (!m.orderKey.startsWith('trade-')) return false;

                // Parse the existing marker key
                const parts = m.orderKey.split('-');
                const existingType = parts[1];
                const existingPrice = parseFloat(parts[2]);
                const existingAmount = parseFloat(parts[3]);
                const existingTime = parseInt(parts[4]);

                // Check if this is a similar trade (same direction, very close price/amount, within 30 seconds)
                const sameDirection = existingType === trade.type;
                const closePrice = Math.abs(existingPrice - roundedPrice) < 10; // Within $10
                const closeAmount = Math.abs(existingAmount - roundedAmount) < 0.1; // Within 0.1 BTC
                const closeTime = Math.abs(existingTime - timeWindow) < 30000; // Within 30 seconds

                return sameDirection && closePrice && closeAmount && closeTime;
            });

            if (similarTradeExists) {
                if (!isHistorical) {
                    console.log(`Similar trade already exists, skipping to avoid duplicates`);
                }
                return;
            }

            if (existingMarkerIndex === -1) {
                // This is a new whale trade, add it to markers
                const isBuy = trade.type === 'buy';

                // Get colors based on side
                const bidColor = this.getColor('bullishCandleBody', this.getColor('bullishCandle', '#26a69a'));
                const askColor = this.getColor('bearishCandleBody', this.getColor('bearishCandle', '#ef5350'));

                // Create marker
                const marker = {
                    time: currentBarTime,
                    position: isBuy ? "belowBar" : "aboveBar", // Buy below, sell above
                    color: isBuy ? bidColor : askColor,
                    shape: "circle",
                    size: this.calculateMarkerSize(trade.value),
                    orderKey: tradeKey,
                    originalTimestamp: trade.timestamp, // Store original timestamp
                    details: {
                        side: isBuy ? "Buy" : "Sell",
                        price: trade.price,
                        size: trade.amount,
                        value: trade.value,
                        time: new Date(trade.timestamp).toLocaleTimeString()
                    }
                };

                // Add to markers array
                this.markers.push(marker);

                // Limit the number of markers to prevent memory issues
                if (this.markers.length > this.maxMarkersToKeep) {
                    this.markers.shift(); // Remove oldest marker
                }

                // Trigger chart redraw for live trades, but not for historical ones
                // to avoid excessive redraws during initial load
                if (!isHistorical && window.drawChart) {
                    window.drawChart();
                }
            }
        }
    }

    /**
     * Process orderbook data to detect whale orders
     * @param {Object} data - Orderbook data from Bitstamp
     */
    processOrderbook(data) {
        // Debug logging
        console.log('Whale Watcher processing orderbook data');

        if (!this.enabled) {
            console.log('Whale Watcher is disabled, skipping processing');
            return;
        }

        if (!data || !data.data || !data.data.bids || !data.data.asks) {
            console.log('Invalid orderbook data received:', data);
            return;
        }

        try {
            const currentTime = Date.now();
            const rawBids = data.data.bids;
            const rawAsks = data.data.asks;

            // Create maps of current orderbook for quick lookup
            const currentBids = new Map();
            const currentAsks = new Map();

            // Process bids (buy orders)
            rawBids.forEach(order => {
                const price = parseFloat(order[0]);
                const size = parseFloat(order[1]);
                const dollarValue = price * size;

                // Store in map for quick lookup
                currentBids.set(price.toString(), { price, size, dollarValue });

                // Check if this is a new large order
                if (dollarValue >= this.threshold) {
                    this.checkForNewWhale(price, size, dollarValue, 'bid', currentTime);
                }
            });

            // Process asks (sell orders)
            rawAsks.forEach(order => {
                const price = parseFloat(order[0]);
                const size = parseFloat(order[1]);
                const dollarValue = price * size;

                // Store in map for quick lookup
                currentAsks.set(price.toString(), { price, size, dollarValue });

                // Check if this is a new large order
                if (dollarValue >= this.threshold) {
                    this.checkForNewWhale(price, size, dollarValue, 'ask', currentTime);
                }
            });

            // Update last orderbook snapshot
            this.lastOrderbookSnapshot = {
                bids: currentBids,
                asks: currentAsks
            };

        } catch (error) {
            console.error('Error processing orderbook for whale detection:', error);
        }
    }

    /**
     * Check if an order is a new whale order
     * @param {number} price - Order price
     * @param {number} size - Order size
     * @param {number} dollarValue - Order value in USD
     * @param {string} side - 'bid' or 'ask'
     * @param {number} timestamp - Current timestamp
     */
    checkForNewWhale(price, size, dollarValue, side, timestamp) {
        // Get the bar time for this order's timestamp
        const currentBarTime = this.getCurrentBarTime(timestamp);
        if (!currentBarTime) return;

        // Create a unique key for this order to avoid duplicates
        const orderKey = `${side}-${price.toFixed(2)}-${size.toFixed(8)}`;

        // Check if we already have this whale in our markers
        const existingMarkerIndex = this.markers.findIndex(m => m.orderKey === orderKey);

        if (existingMarkerIndex === -1) {
            // This is a new whale order, add it to markers
            const isBid = side === 'bid';

            // Get colors based on side
            const bidColor = this.getColor('bullishCandleBody', this.getColor('bullishCandle', '#26a69a'));
            const askColor = this.getColor('bearishCandleBody', this.getColor('bearishCandle', '#ef5350'));

            // Create marker
            const marker = {
                time: currentBarTime,
                position: isBid ? "belowBar" : "aboveBar", // Buy below, sell above
                color: isBid ? bidColor : askColor,
                shape: "circle",
                size: this.calculateMarkerSize(dollarValue),
                orderKey: orderKey,
                originalTimestamp: timestamp, // Store original timestamp
                details: {
                    side: isBid ? "Buy" : "Sell",
                    price: price,
                    size: size,
                    value: dollarValue,
                    time: new Date(timestamp).toLocaleTimeString()
                }
            };

            // Add to markers array
            this.markers.push(marker);

            // Limit the number of markers to prevent memory issues
            if (this.markers.length > this.maxMarkersToKeep) {
                this.markers.shift(); // Remove oldest marker
            }

            console.log(`New whale detected: ${marker.details.side} $${this.formatDollarValue(dollarValue)} at ${price}`);

            // Trigger chart redraw
            if (window.drawChart) {
                window.drawChart();
            }
        }
    }

    /**
     * Calculate marker size based on dollar value
     * @param {number} dollarValue - Order value in USD
     * @returns {number} - Marker size
     */
    calculateMarkerSize(dollarValue) {
        // Base size - minimum size for orders at threshold
        const minSize = 3;
        const maxSize = 12;

        // Use logarithmic scaling for better visual representation
        // This will make the size increase more gradually for larger values
        const ratio = Math.log(dollarValue / this.threshold) / Math.log(5); // log base 5
        const size = minSize + Math.min(maxSize - minSize, Math.max(0, ratio * 3));

        console.log(`Calculated size ${size.toFixed(1)} for trade value $${this.formatDollarValue(dollarValue)}`);
        return Math.round(size);
    }

    /**
     * Find the appropriate bar time for a trade timestamp
     * @param {number} timestamp - Trade timestamp in milliseconds (optional)
     * @returns {number} - Bar time in milliseconds that contains this timestamp
     */
    getCurrentBarTime(timestamp) {
        if (!window.bars || window.bars.length === 0) {
            return null;
        }

        // If no timestamp provided, use current time
        if (!timestamp) {
            timestamp = Date.now();
        }

        // Get the current interval in milliseconds
        const intervalMs = this.getChartIntervalMs();
        if (!intervalMs) {
            // Fallback to last bar if we can't determine interval
            return window.bars[window.bars.length - 1].time;
        }

        // Find the bar that contains this timestamp
        // First, try to find an exact match
        for (let i = 0; i < window.bars.length; i++) {
            const bar = window.bars[i];
            // Check if timestamp falls within this bar's time range
            if (timestamp >= bar.time && timestamp < bar.time + intervalMs) {
                console.log(`Found exact bar match for timestamp ${new Date(timestamp).toISOString()} -> bar time ${new Date(bar.time).toISOString()}`);
                return bar.time;
            }
        }

        // If no exact match, find the closest bar that is not in the future
        // This ensures we anchor to a past candle rather than a future one
        let closestBar = null;
        let minDiff = Infinity;

        for (let i = 0; i < window.bars.length; i++) {
            // Only consider bars that are not in the future of the timestamp
            if (window.bars[i].time <= timestamp) {
                const diff = timestamp - window.bars[i].time;
                if (diff < minDiff) {
                    minDiff = diff;
                    closestBar = window.bars[i];
                }
            }
        }

        // If we found a non-future bar, return its time
        if (closestBar) {
            console.log(`Found closest bar for timestamp ${new Date(timestamp).toISOString()} -> bar time ${new Date(closestBar.time).toISOString()} (diff: ${minDiff}ms)`);
            return closestBar.time;
        }

        // If all bars are in the future (unlikely), fall back to the oldest bar
        console.log(`No suitable bar found for timestamp ${new Date(timestamp).toISOString()}, using oldest bar`);
        return window.bars[0].time;
    }

    /**
     * Get the current chart interval in milliseconds
     * @returns {number} - Interval in milliseconds
     */
    getChartIntervalMs() {
        // Try to get interval from window.currentInterval
        if (window.currentInterval) {
            // Convert interval string to milliseconds
            const intervalMap = {
                '1m': 60 * 1000,
                '5m': 5 * 60 * 1000,
                '15m': 15 * 60 * 1000,
                '1h': 60 * 60 * 1000
            };
            return intervalMap[window.currentInterval] || 5 * 60 * 1000; // Default to 5m
        }

        // If we have at least 2 bars, estimate interval from them
        if (window.bars && window.bars.length >= 2) {
            // Use the difference between the last two bars
            return window.bars[window.bars.length - 1].time - window.bars[window.bars.length - 2].time;
        }

        // Default to 5 minutes (300,000 ms)
        return 5 * 60 * 1000;
    }

    /**
     * Format dollar value for display
     * @param {number} value - Dollar value
     * @returns {string} - Formatted string
     */
    formatDollarValue(value) {
        if (value >= 1000000) {
            // For values over 1M, show 2 decimal places to display thousands
            return (value / 1000000).toFixed(2) + 'M';
        } else if (value >= 1000) {
            return (value / 1000).toFixed(1) + 'K';
        } else {
            return value.toFixed(0);
        }
    }

    /**
     * Get color from color customizer
     * @param {string} id - Color ID
     * @param {string} defaultColor - Default color
     * @returns {string} - Color value
     */
    getColor(id, defaultColor) {
        if (window.colorCustomizer) {
            return window.colorCustomizer.getColor(id) || defaultColor;
        }
        return defaultColor;
    }

    /**
     * Set the threshold for whale detection
     * @param {number} value - New threshold in USD
     */
    setThreshold(value) {
        this.threshold = value;
        localStorage.setItem('whaleWatcherThreshold', value.toString());
        console.log(`Whale Watcher threshold set to: $${this.formatDollarValue(value)}`);

        // Clear existing markers when threshold changes
        this.markers = [];
        this.processedTradeKeys.clear();
        this.historicalDataLoaded = false;

        // Reload historical data with new threshold
        if (this.enabled) {
            this.fetchHistoricalTrades();
        }

        // Trigger chart redraw
        if (window.drawChart) {
            window.drawChart();
        }
    }

    /**
     * Toggle whale watcher on/off
     * @param {boolean} enabled - Whether whale watcher is enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        // Save to localStorage
        localStorage.setItem('whaleWatcherEnabled', enabled.toString());
        console.log(`Whale Watcher ${enabled ? 'enabled' : 'disabled'}`);

        // Clear markers when disabled
        if (!enabled) {
            this.markers = [];
            this.processedTradeKeys.clear();
        } else if (!this.historicalDataLoaded) {
            // If enabling and we haven't loaded historical data yet, do it now
            this.fetchHistoricalTrades();
        }

        // Trigger chart redraw
        if (window.drawChart) {
            window.drawChart();
        }
    }

    /**
     * Check if mouse is hovering over a whale marker
     * @param {number} mouseX - Mouse X coordinate
     * @param {number} mouseY - Mouse Y coordinate
     * @param {Array} bars - Chart bars
     * @param {Function} getYForPrice - Function to convert price to Y coordinate
     * @param {number} barWidth - Width of a bar
     * @param {number} viewOffset - View offset for scrolling
     * @returns {Object|null} - Marker object if hovering, null otherwise
     */
    checkMarkerHover(mouseX, mouseY, bars, getYForPrice, barWidth, viewOffset) {
        if (!this.enabled || !bars || !getYForPrice) {
            return null;
        }

        // Only check markers if we have any
        if (this.markers.length === 0) {
            return null;
        }

        // Group markers by time and position (same as in drawMarkers)
        const groupedMarkers = new Map();

        this.markers.forEach(marker => {
            const key = `${marker.time}-${marker.position}`;
            if (!groupedMarkers.has(key)) {
                groupedMarkers.set(key, []);
            }
            groupedMarkers.get(key).push(marker);
        });

        // Check each group of markers
        for (const [key, markers] of groupedMarkers.entries()) {
            // Find the bar index for this marker's time
            const time = markers[0].time;
            const position = markers[0].position;

            // Find the bar with the exact time match
            let barIndex = bars.findIndex(bar => bar.time === time);

            // We don't recalculate or move markers to new candles
            // This ensures markers stay anchored to their original candles

            if (barIndex === -1) continue; // Skip if bar still not found

            // Calculate X position
            const x = (barIndex - viewOffset) * barWidth + barWidth / 2;
            const bar = bars[barIndex];

            // Check if there's a liquidation arrow at this position
            const hasLiquidationArrow = this.checkForLiquidationArrow(barIndex, position);

            // Base Y position with adjustment for liquidation arrows if needed
            let baseY;
            if (position === "belowBar") { // Buy bubbles (below bar)
                baseY = getYForPrice(bar.low) + 20; // Initial position below bar

                if (hasLiquidationArrow && hasLiquidationArrow.exists) {
                    // For buy bubbles (below bar), always position them below liquidation arrows
                    baseY += 60; // Add extra space to avoid overlap and make liquidations more prominent
                }
            } else { // aboveBar - Sell bubbles (above bar)
                baseY = getYForPrice(bar.high) - 20; // Initial position above bar

                if (hasLiquidationArrow && hasLiquidationArrow.exists) {
                    // For sell bubbles (above bar), always position them above liquidation arrows
                    baseY -= 60; // Add extra space to avoid overlap and make liquidations more prominent
                }
            }

            // Check each marker in the group
            for (let index = 0; index < markers.length; index++) {
                const marker = markers[index];
                const spacing = marker.size * 2 + 2;
                const y = position === "belowBar"
                    ? baseY + (index * spacing)
                    : baseY - (index * spacing);

                // Check if mouse is within the marker's circle
                const distance = Math.sqrt(Math.pow(mouseX - x, 2) + Math.pow(mouseY - y, 2));
                if (distance <= marker.size) {
                    return {
                        marker: marker,
                        x: x,
                        y: y
                    };
                }
            }
        }

        return null; // No marker found under mouse
    }

    /**
     * Draw tooltip for hovered marker
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Object} hoveredMarker - Hovered marker info
     */
    drawTooltip(ctx, hoveredMarker) {
        if (!hoveredMarker) return;

        const { marker, x, y } = hoveredMarker;
        const value = marker.details.value;
        const tooltipText = `$${this.formatDollarValue(value)}`;

        // Set tooltip style
        ctx.font = 'bold 12px Arial';
        const textWidth = ctx.measureText(tooltipText).width;
        const padding = 6;
        const tooltipWidth = textWidth + padding * 2;
        const tooltipHeight = 20;

        // Position tooltip above the marker
        const tooltipX = x - tooltipWidth / 2;
        const tooltipY = y - marker.size - tooltipHeight - 5;

        // Draw tooltip background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.strokeStyle = marker.color;
        ctx.lineWidth = 1;

        // Draw rounded rectangle
        const radius = 4;
        ctx.beginPath();
        ctx.moveTo(tooltipX + radius, tooltipY);
        ctx.lineTo(tooltipX + tooltipWidth - radius, tooltipY);
        ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY, tooltipX + tooltipWidth, tooltipY + radius);
        ctx.lineTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight - radius);
        ctx.quadraticCurveTo(tooltipX + tooltipWidth, tooltipY + tooltipHeight, tooltipX + tooltipWidth - radius, tooltipY + tooltipHeight);
        ctx.lineTo(tooltipX + radius, tooltipY + tooltipHeight);
        ctx.quadraticCurveTo(tooltipX, tooltipY + tooltipHeight, tooltipX, tooltipY + tooltipHeight - radius);
        ctx.lineTo(tooltipX, tooltipY + radius);
        ctx.quadraticCurveTo(tooltipX, tooltipY, tooltipX + radius, tooltipY);
        ctx.closePath();

        ctx.fill();
        ctx.stroke();

        // Draw tooltip text
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tooltipText, x, tooltipY + tooltipHeight / 2);
    }

    /**
     * Draw whale markers on the chart
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Array} bars - Chart bars
     * @param {Function} getYForPrice - Function to convert price to Y coordinate
     * @param {number} barWidth - Width of a bar
     * @param {number} viewOffset - View offset for scrolling
     * @param {number} mouseX - Mouse X coordinate (optional)
     * @param {number} mouseY - Mouse Y coordinate (optional)
     */
    drawMarkers(ctx, bars, getYForPrice, barWidth, viewOffset, mouseX, mouseY) {
        if (!this.enabled || !ctx || !bars || !getYForPrice) {
            return;
        }

        // Only draw markers if we have any
        if (this.markers.length === 0) {
            return;
        }

        // Check for hover
        let hoveredMarker = null;
        if (mouseX !== undefined && mouseY !== undefined) {
            hoveredMarker = this.checkMarkerHover(mouseX, mouseY, bars, getYForPrice, barWidth, viewOffset);
        }

        // Group markers by time and position (above/below)
        const groupedMarkers = new Map();

        // First, group markers by time and position
        this.markers.forEach(marker => {
            const key = `${marker.time}-${marker.position}`;
            if (!groupedMarkers.has(key)) {
                groupedMarkers.set(key, []);
            }
            groupedMarkers.get(key).push(marker);
        });

        // Process each group of markers
        groupedMarkers.forEach((markers, key) => {
            // Find the bar index for this marker's time (all markers in group have same time)
            const time = markers[0].time;
            const position = markers[0].position;

            // Find the bar with the exact time match
            const barIndex = bars.findIndex(bar => bar.time === time);
            if (barIndex === -1) {
                // If the bar is not found, it might be outside the visible range
                // or it might have been removed. We don't want to recalculate or move
                // the marker to a new candle, so we'll just skip drawing it for now.
                // This ensures markers stay anchored to their original candles.
                return; // Skip if bar not found
            }

            // Draw this marker group
            this.drawMarkerGroup(ctx, bars, getYForPrice, barWidth, viewOffset, barIndex, markers, position, hoveredMarker);
        });

        // Draw tooltip for hovered marker
        if (hoveredMarker) {
            this.drawTooltip(ctx, hoveredMarker);
        }
    }

    /**
     * Check if there's a liquidation arrow at a specific bar position
     * @param {number} barIndex - Index of the bar in the bars array
     * @param {string} position - Position ('belowBar' or 'aboveBar')
     * @returns {Object|boolean} - Object with liquidation info or false if no liquidation
     */
    checkForLiquidationArrow(barIndex, position) {
        // Early return if liquidation manager is not available
        if (!window.liquidationManager || !window.liquidationManager.markers) {
            return false;
        }

        // Convert whale watcher position to liquidation position
        const liquidationPosition = position === "belowBar" ? "below" : "above";

        // Check if there's a liquidation marker at this bar with the same position
        const barTime = Math.floor(window.bars[barIndex].time / (5 * 60 * 1000)) * (5 * 60 * 1000);

        // Find matching liquidation marker
        const liquidationMarker = window.liquidationManager.markers.find(marker => {
            return marker.time === barTime && marker.position === liquidationPosition;
        });

        if (liquidationMarker) {
            return {
                exists: true,
                side: liquidationMarker.side // 'Buy' or 'Sell'
            };
        }

        return false;
    }

    /**
     * Draw a group of markers at a specific bar position
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Array} bars - Chart bars
     * @param {Function} getYForPrice - Function to convert price to Y coordinate
     * @param {number} barWidth - Width of a bar
     * @param {number} viewOffset - View offset for scrolling
     * @param {number} barIndex - Index of the bar in the bars array
     * @param {Array} markers - Array of markers to draw
     * @param {string} position - Position ('belowBar' or 'aboveBar')
     * @param {Object} hoveredMarker - Currently hovered marker info
     */
    drawMarkerGroup(ctx, bars, getYForPrice, barWidth, viewOffset, barIndex, markers, position, hoveredMarker) {
        // Calculate X position (same for all markers in this group)
        const x = (barIndex - viewOffset) * barWidth + barWidth / 2;
        const bar = bars[barIndex];

        // Check if there's a liquidation arrow at this position
        const hasLiquidationArrow = this.checkForLiquidationArrow(barIndex, position);

        // Base Y position depends on whether markers are above or below bar
        // If there's a liquidation arrow, adjust the position to avoid overlap
        // Liquidations have priority, so we position bubbles above or below them
        let baseY;
        if (position === "belowBar") { // Buy bubbles (below bar)
            baseY = getYForPrice(bar.low) + 20; // Initial position below bar

            if (hasLiquidationArrow && hasLiquidationArrow.exists) {
                // For buy bubbles (below bar), always position them below liquidation arrows
                // Liquidation arrows are typically around 30-40px tall
                baseY += 60; // Add extra space to avoid overlap and make liquidations more prominent
            }
        } else { // aboveBar - Sell bubbles (above bar)
            baseY = getYForPrice(bar.high) - 20; // Initial position above bar

            if (hasLiquidationArrow && hasLiquidationArrow.exists) {
                // For sell bubbles (above bar), always position them above liquidation arrows
                baseY -= 60; // Add extra space to avoid overlap and make liquidations more prominent
            }
        }

        // Draw each marker in the group with proper stacking
        markers.forEach((marker, index) => {
            // Calculate Y position with stacking
            // For belowBar (buys), stack downward (increasing Y)
            // For aboveBar (sells), stack upward (decreasing Y)
            const spacing = marker.size * 2 + 2; // Space between markers based on size
            const y = position === "belowBar"
                ? baseY + (index * spacing) // Stack downward for buys
                : baseY - (index * spacing); // Stack upward for sells

            // Check if this is the hovered marker
            const isHovered = hoveredMarker && hoveredMarker.marker === marker;

            // Draw the bubble
            ctx.save();

            // Draw circle - semi-transparent
            ctx.beginPath();
            ctx.arc(x, y, marker.size, 0, Math.PI * 2);

            // Make the color semi-transparent
            const color = marker.color;
            // Extract RGB components and add alpha
            let semiTransparentColor;
            if (color.startsWith('#')) {
                // Handle hex color
                const r = parseInt(color.slice(1, 3), 16);
                const g = parseInt(color.slice(3, 5), 16);
                const b = parseInt(color.slice(5, 7), 16);
                // If this is the hovered marker, make it more opaque
                const alpha = isHovered ? 0.9 : 0.6;
                semiTransparentColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
            } else if (color.startsWith('rgb(')) {
                // Handle rgb color
                const rgb = color.match(/\d+/g);
                const alpha = isHovered ? 0.9 : 0.6;
                semiTransparentColor = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
            } else {
                // Fallback with opacity
                semiTransparentColor = color + (isHovered ? 'E6' : '99'); // 90% or 60% opacity
            }

            ctx.fillStyle = semiTransparentColor;
            ctx.fill();

            ctx.restore();
        });
    }

    /**
     * Fetch historical trades from Bitstamp API
     * This will load trades for the last 5 candles to show historical whale activity
     */
    fetchHistoricalTrades() {
        if (!this.enabled || !window.bars || window.bars.length === 0) {
            console.log('Whale Watcher: Cannot fetch historical trades - disabled or no bars available');
            return;
        }

        console.log('Whale Watcher: Fetching historical trades for the last 5 candles');

        // Get current coin symbol from coin manager
        let bitstampSymbol;
        if (window.coinManager) {
            bitstampSymbol = window.coinManager.getCurrentCoin().bitstampSymbol;
        } else {
            bitstampSymbol = 'btcusd'; // Default fallback
        }

        // Get the current interval in milliseconds
        const intervalMs = this.getChartIntervalMs();
        if (!intervalMs) {
            console.error('Whale Watcher: Cannot determine chart interval');
            return;
        }

        // Get the time of the last 5 candles
        const bars = window.bars;
        const lastBarIndex = bars.length - 1;
        const startBarIndex = Math.max(0, lastBarIndex - 4); // Last 5 candles (including current)

        if (lastBarIndex < 0 || startBarIndex < 0) {
            console.error('Whale Watcher: Invalid bar indices');
            return;
        }

        const startTime = bars[startBarIndex].time / 1000; // Convert to seconds for API
        const endTime = (bars[lastBarIndex].time + intervalMs) / 1000; // End time is the end of the last bar

        console.log(`Whale Watcher: Fetching trades from ${new Date(startTime * 1000).toISOString()} to ${new Date(endTime * 1000).toISOString()}`);

        // Fetch trades from Bitstamp API
        const url = `https://www.bitstamp.net/api/v2/transactions/${bitstampSymbol}/?time=hour`;

        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (!Array.isArray(data)) {
                    console.error('Whale Watcher: Invalid response from Bitstamp API', data);
                    return;
                }

                console.log(`Whale Watcher: Received ${data.length} historical trades from Bitstamp`);

                // Process each trade
                let whaleTradesCount = 0;

                data.forEach(trade => {
                    const timestamp = parseInt(trade.date) * 1000; // Convert to milliseconds

                    // Only process trades within our time window
                    if (timestamp >= startTime * 1000 && timestamp <= endTime * 1000) {
                        const price = parseFloat(trade.price);
                        const amount = parseFloat(trade.amount);
                        const value = price * amount;
                        const type = trade.type === '0' ? 'buy' : 'sell'; // 0 = buy, 1 = sell

                        // Process the trade
                        if (value >= this.threshold) {
                            this.processTrade({
                                price,
                                amount,
                                value,
                                type,
                                timestamp
                            }, true); // Mark as historical

                            whaleTradesCount++;
                        }
                    }
                });

                console.log(`Whale Watcher: Processed ${whaleTradesCount} historical whale trades`);
                this.historicalDataLoaded = true;

                // Trigger a chart redraw to show the historical markers
                if (window.drawChart) {
                    window.drawChart();
                }
            })
            .catch(error => {
                console.error('Whale Watcher: Error fetching historical trades', error);
            });
    }
}

// Create whale watcher instance immediately
console.log('Creating Whale Watcher instance...');
const whaleWatcher = new WhaleWatcher();

// Expose whale watcher instance and drawing function globally
window.whaleWatcher = whaleWatcher;

// Expose drawing function for script.js to use
window.drawWhaleMarkers = (ctx, bars, getYForPrice, barWidth, viewOffset, mouseX, mouseY) => {
    if (!whaleWatcher) {
        console.error('Whale watcher not available');
        return;
    }

    console.log('Drawing whale markers:', whaleWatcher.markers.length);
    whaleWatcher.drawMarkers(ctx, bars, getYForPrice, barWidth, viewOffset, mouseX, mouseY);
};
