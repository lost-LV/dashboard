// ...existing code...

function addCandleTimes(candles) {
    const startTime = new Date(); // Get the user's computer time
    const timeInterval = 5 * 60 * 1000; // 5 minutes in milliseconds

    return candles.map((candle, index) => {
        const candleTime = new Date(startTime.getTime() + index * timeInterval);
        return {
            ...candle,
            time: candleTime.toLocaleTimeString(), // Format time as HH:MM:SS
        };
    });
}

// Example usage:
const candles = [
    { open: 100, close: 105, high: 110, low: 95 },
    { open: 105, close: 102, high: 108, low: 101 },
    // ...existing candles...
];

const candlesWithTime = addCandleTimes(candles);
console.log(candlesWithTime);

// Ensure the chart rendering function uses the `time` property to display the time for each candle
function renderChart(candles) {
    candles.forEach((candle) => {
        console.log(`Candle Time: ${candle.time}, Open: ${candle.open}, Close: ${candle.close}`);
        // Add logic to render the candle on the chart with its time
    });
}

renderChart(candlesWithTime);

// ...existing code...
