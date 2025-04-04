function drawCurrentPriceAndCountdown() {
    if (!ctx || !canvas || bars.length === 0) return;

    const chartWidth = canvas.width - priceScaleWidth;
    const chartHeight = canvas.height - timeScaleHeight;

    // Get current price from the last bar
    const currentPrice = bars[bars.length - 1].close;

    // Calculate Y position for current price
    const priceY = getYForPrice(currentPrice);

    // Draw horizontal line at current price
    ctx.strokeStyle = getColor('currentPriceLine', 'rgba(255, 255, 255, 0.5)');
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, priceY);
    ctx.lineTo(chartWidth, priceY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw current price tag inside price scale
    const priceTagWidth = 55;
    const priceTagHeight = 20;
    const priceTagX = canvas.width - priceScaleWidth/2; // Center in price scale
    const priceTagY = priceY - priceTagHeight / 2;

    // Ensure price tag stays within chart bounds
    const adjustedPriceTagY = Math.max(priceTagHeight/2, Math.min(chartHeight - priceTagHeight/2, priceTagY));

    // Get color based on price movement
    const prevBar = bars.length > 1 ? bars[bars.length - 2] : null;
    const priceChange = prevBar ? currentPrice - prevBar.close : 0;
    const priceColor = priceChange >= 0 ?
        getColor('bullishCandleBody', getColor('bullishCandle', '#26a69a')) : // Green for up
        getColor('bearishCandleBody', getColor('bearishCandle', '#ef5350')); // Red for down

    // Draw price tag background
    ctx.fillStyle = priceColor;
    ctx.fillRect(priceTagX - priceTagWidth / 2, adjustedPriceTagY, priceTagWidth, priceTagHeight);

    // Draw price text (black or white depending on background brightness)
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = isBrightColor(priceColor) ? '#000000' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(currentPrice.toFixed(2), priceTagX, adjustedPriceTagY + 14);

    // Draw countdown timer at the bottom of the chart
    const countdownTagWidth = 80;
    const countdownTagHeight = 20;
    const countdownTagX = chartWidth / 2 - countdownTagWidth / 2; // Center horizontally
    const countdownTagY = chartHeight + (timeScaleHeight - countdownTagHeight) / 2; // Center in time scale

    // Format countdown time
    const minutes = Math.floor(barCloseCountdown / 60);
    const seconds = barCloseCountdown % 60;
    const countdownText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    // Draw countdown background with more opacity
    ctx.fillStyle = 'rgba(31, 41, 55, 0.95)';
    ctx.fillRect(countdownTagX, countdownTagY, countdownTagWidth, countdownTagHeight);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(countdownTagX, countdownTagY, countdownTagWidth, countdownTagHeight);

    // Draw countdown text with bold font
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`${countdownText}`, countdownTagX + countdownTagWidth / 2, countdownTagY + 14);
}
