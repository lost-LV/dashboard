// Custom slider implementation
class CustomSlider {
    constructor(options) {
        this.options = Object.assign({
            container: null,
            min: 25,
            max: 1000,
            value: 400,
            step: 25, // Default step size of 25k
            onChange: null,
            onComplete: null
        }, options);

        this.isDragging = false;
        this.container = null;
        this.track = null;
        this.trackFill = null;
        this.thumb = null;
        this.input = null;
        this.value = this.options.value;

        this.init();
    }

    init() {
        // Don't replace the existing slider container, just clear it
        if (this.options.container) {
            this.options.container.innerHTML = '';
        }

        // Create slider container
        this.container = document.createElement('div');
        this.container.className = 'custom-slider-container';
        this.container.style.position = 'relative';
        this.container.style.width = '100%';
        this.container.style.height = '8px';
        this.container.style.backgroundColor = '#2a2e39';
        this.container.style.borderRadius = '4px';
        this.container.style.margin = '0 10px';
        this.container.style.cursor = 'pointer';
        this.container.style.zIndex = '20';

        // Create min label (using original style)
        const minLabel = document.createElement('span');
        minLabel.className = 'slider-delimiter min';
        minLabel.style.position = 'absolute';
        minLabel.style.left = '0';
        minLabel.style.top = '-22px';
        minLabel.style.fontSize = '10px';
        minLabel.style.color = '#aaa';
        minLabel.style.backgroundColor = '#1e222d';
        minLabel.style.padding = '2px 4px';
        minLabel.style.borderRadius = '2px';
        minLabel.style.transform = 'translateX(-50%)';
        minLabel.style.zIndex = '25';
        minLabel.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.2)';
        minLabel.textContent = `${this.options.min}k`;

        // Create max label (using original style)
        const maxLabel = document.createElement('span');
        maxLabel.className = 'slider-delimiter max';
        maxLabel.style.position = 'absolute';
        maxLabel.style.right = '0';
        maxLabel.style.top = '-22px';
        maxLabel.style.fontSize = '10px';
        maxLabel.style.color = '#aaa';
        maxLabel.style.backgroundColor = '#1e222d';
        maxLabel.style.padding = '2px 4px';
        maxLabel.style.borderRadius = '2px';
        maxLabel.style.transform = 'translateX(50%)';
        maxLabel.style.zIndex = '25';
        maxLabel.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.2)';
        // Format max value: show as "1M" instead of "1000k" if it's 1000
        maxLabel.textContent = this.options.max === 1000 ? '1M' : `${this.options.max}k`;

        // Add labels to container
        this.container.appendChild(minLabel);
        this.container.appendChild(maxLabel);

        // Add container to parent
        if (this.options.container) {
            this.options.container.appendChild(this.container);
        }

        // Store references to labels for updating
        this.minLabel = minLabel;
        this.maxLabel = maxLabel;

        // Add min/max vertical lines
        this.addMinMaxLines();

        // Create track (background)
        this.track = document.createElement('div');
        this.track.className = 'custom-slider-track';
        this.track.style.position = 'absolute';
        this.track.style.left = '0';
        this.track.style.top = '0';
        this.track.style.width = '100%';
        this.track.style.height = '100%';
        this.track.style.backgroundColor = '#2a2e39';
        this.track.style.borderRadius = '4px';
        this.track.style.pointerEvents = 'none';
        this.track.style.zIndex = '21';
        this.track.style.boxShadow = 'inset 0 1px 2px rgba(0, 0, 0, 0.1)';

        // Create track fill (progress)
        this.trackFill = document.createElement('div');
        this.trackFill.className = 'custom-slider-track-fill';
        this.trackFill.style.position = 'absolute';
        this.trackFill.style.left = '0';
        this.trackFill.style.top = '0';
        this.trackFill.style.height = '100%';
        this.trackFill.style.backgroundColor = 'var(--bullish-candle-color, #26a69a)';
        this.trackFill.style.borderRadius = '4px 0 0 4px'; // Round only the left corners
        this.trackFill.style.pointerEvents = 'none';
        this.trackFill.style.zIndex = '22';
        this.trackFill.style.boxShadow = '0 0 2px var(--bullish-candle-color, #26a69a)'; // Subtle glow

        // Create thumb
        this.thumb = document.createElement('div');
        this.thumb.className = 'custom-slider-thumb';
        this.thumb.style.position = 'absolute';
        this.thumb.style.top = '50%';
        this.thumb.style.width = '16px';
        this.thumb.style.height = '16px';
        this.thumb.style.backgroundColor = 'var(--bullish-candle-color, #26a69a)';
        this.thumb.style.borderRadius = '50%';
        this.thumb.style.transform = 'translate(-50%, -50%)';
        this.thumb.style.cursor = 'pointer';
        this.thumb.style.zIndex = '23';
        this.thumb.style.boxShadow = '0 0 5px var(--bullish-candle-color, #26a69a), 0 0 0 2px var(--bullish-candle-color, #26a69a)';
        this.thumb.style.border = '2px solid white';

        // Add elements to container
        this.container.appendChild(this.track);
        this.container.appendChild(this.trackFill);
        this.container.appendChild(this.thumb);

        // Add step markers
        this.addStepMarkers();

        // Add container to parent
        if (this.options.container) {
            this.options.container.appendChild(this.container);
        }

        // Set initial value
        this.setValue(this.options.value);

        // Add event listeners
        this.addEventListeners();
    }

    addEventListeners() {
        // Mouse down on container
        this.container.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            document.body.style.cursor = 'pointer';

            // Calculate percentage based on click position
            const rect = this.container.getBoundingClientRect();
            const percentage = ((e.clientX - rect.left) / rect.width) * 100;

            // Update slider
            this.updateFromPercentage(percentage);

            // Prevent text selection during drag
            e.preventDefault();
        });

        // Mouse move for dragging
        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            // Calculate percentage based on mouse position
            const rect = this.container.getBoundingClientRect();
            const percentage = ((e.clientX - rect.left) / rect.width) * 100;

            // Update slider
            this.updateFromPercentage(percentage);
        });

        // Mouse up to stop dragging
        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                document.body.style.cursor = 'default';

                // Call onComplete callback
                if (this.options.onComplete) {
                    this.options.onComplete(this.value);
                }
            }
        });

        // Mouse leave to stop dragging if mouse leaves the window
        document.addEventListener('mouseleave', () => {
            if (this.isDragging) {
                this.isDragging = false;
                document.body.style.cursor = 'default';

                // Call onComplete callback
                if (this.options.onComplete) {
                    this.options.onComplete(this.value);
                }
            }
        });
    }

    updateFromPercentage(percentage) {
        // Clamp percentage between 0 and 100
        percentage = Math.max(0, Math.min(100, percentage));

        // Calculate raw value based on percentage
        const rawValue = this.options.min + (percentage / 100) * (this.options.max - this.options.min);

        // Round to nearest step
        const step = this.options.step || 25;
        const value = Math.round(rawValue / step) * step;

        // Recalculate percentage based on stepped value
        const steppedPercentage = ((value - this.options.min) / (this.options.max - this.options.min)) * 100;

        // Update slider visuals
        this.trackFill.style.width = `${steppedPercentage}%`;
        this.thumb.style.left = `${steppedPercentage}%`;

        // Update value
        this.value = value;

        // Call onChange callback
        if (this.options.onChange) {
            this.options.onChange(value);
        }
    }

    setValue(value) {
        // Clamp value between min and max
        value = Math.max(this.options.min, Math.min(this.options.max, value));

        // Round to nearest step
        const step = this.options.step || 25;
        value = Math.round(value / step) * step;

        // Calculate percentage
        const percentage = ((value - this.options.min) / (this.options.max - this.options.min)) * 100;

        // Update slider visuals
        this.trackFill.style.width = `${percentage}%`;
        this.thumb.style.left = `${percentage}%`;

        // Update value
        this.value = value;
    }

    getValue() {
        return this.value;
    }

    setMin(min) {
        this.options.min = min;

        // Update min label
        if (this.minLabel) {
            this.minLabel.textContent = `${min}k`;
        }

        this.setValue(this.value);
    }

    setMax(max) {
        this.options.max = max;

        // Update max label
        if (this.maxLabel) {
            // Format max value: show as "1M" instead of "1000k" if it's 1000
            this.maxLabel.textContent = max === 1000 ? '1M' : `${max}k`;
        }

        this.setValue(this.value);
    }

    setOptions(options) {
        const oldMin = this.options.min;
        const oldMax = this.options.max;

        this.options = Object.assign(this.options, options);

        // Update min/max labels if they changed
        if (this.minLabel && this.options.min !== oldMin) {
            this.minLabel.textContent = `${this.options.min}k`;
        }

        if (this.maxLabel && this.options.max !== oldMax) {
            // Format max value: show as "1M" instead of "1000k" if it's 1000
            this.maxLabel.textContent = this.options.max === 1000 ? '1M' : `${this.options.max}k`;
        }

        this.setValue(this.value);
    }

    // Add min and max vertical lines
    addMinMaxLines() {
        // Create a container for the min/max lines
        const linesContainer = document.createElement('div');
        linesContainer.className = 'min-max-lines-container';
        linesContainer.style.position = 'absolute';
        linesContainer.style.top = '-4px'; // Extend slightly above the slider
        linesContainer.style.left = '0';
        linesContainer.style.width = '100%';
        linesContainer.style.height = '16px'; // Extend slightly below the slider
        linesContainer.style.pointerEvents = 'none';
        linesContainer.style.zIndex = '18';

        // Create min line (left)
        const minLine = document.createElement('div');
        minLine.className = 'min-line';
        minLine.style.position = 'absolute';
        minLine.style.top = '-4px';
        minLine.style.left = '0';
        minLine.style.width = '2px';
        minLine.style.height = '16px';
        minLine.style.backgroundColor = 'var(--bullish-candle-color, #26a69a)'; // Use bullish candle color
        minLine.style.borderRadius = '1px';

        // Create max line (right)
        const maxLine = document.createElement('div');
        maxLine.className = 'max-line';
        maxLine.style.position = 'absolute';
        maxLine.style.top = '-4px';
        maxLine.style.right = '0';
        maxLine.style.width = '2px';
        maxLine.style.height = '16px';
        maxLine.style.backgroundColor = 'var(--bullish-candle-color, #26a69a)'; // Use bullish candle color
        maxLine.style.borderRadius = '1px';

        // Add lines to container
        linesContainer.appendChild(minLine);
        linesContainer.appendChild(maxLine);

        // Add container to slider
        this.container.appendChild(linesContainer);
    }

    // Add visual markers for each step
    addStepMarkers() {
        const min = this.options.min;
        const max = this.options.max;
        const step = this.options.step || 25;
        const totalSteps = Math.floor((max - min) / step);

        // Create a container for the markers
        const markersContainer = document.createElement('div');
        markersContainer.className = 'step-markers-container';
        markersContainer.style.position = 'absolute';
        markersContainer.style.top = '0';
        markersContainer.style.left = '0';
        markersContainer.style.width = '100%';
        markersContainer.style.height = '100%';
        markersContainer.style.pointerEvents = 'none';
        markersContainer.style.zIndex = '19';

        // Add markers for each step (but not too many to avoid cluttering)
        const markerInterval = Math.max(1, Math.floor(totalSteps / 10)); // Show at most 10 markers

        for (let i = 0; i <= totalSteps; i += markerInterval) {
            if (i === 0) continue; // Skip the first marker (min value)
            if (i === totalSteps) continue; // Skip the last marker (max value)

            const value = min + (i * step);
            const percentage = ((value - min) / (max - min)) * 100;

            const marker = document.createElement('div');
            marker.className = 'step-marker';
            marker.style.position = 'absolute';
            marker.style.top = '0';
            marker.style.left = `${percentage}%`;
            marker.style.width = '1px';
            marker.style.height = '8px';
            marker.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
            marker.style.transform = 'translateX(-50%)';

            markersContainer.appendChild(marker);
        }

        this.container.appendChild(markersContainer);
    }
}

// Function to update slider colors based on CSS variables
function updateSliderColors() {
    // Get all custom sliders
    const sliders = document.querySelectorAll('.custom-slider-container');

    // Get the bullish candle color from CSS variable
    const bullishColor = getComputedStyle(document.documentElement).getPropertyValue('--bullish-candle-color').trim() || '#26a69a';

    sliders.forEach(slider => {
        // Update track fill color
        const trackFill = slider.querySelector('.custom-slider-track-fill');
        if (trackFill) {
            trackFill.style.backgroundColor = bullishColor;
            trackFill.style.boxShadow = `0 0 2px ${bullishColor}`;
        }

        // Update thumb color
        const thumb = slider.querySelector('.custom-slider-thumb');
        if (thumb) {
            thumb.style.backgroundColor = bullishColor;
            thumb.style.boxShadow = `0 0 5px ${bullishColor}, 0 0 0 2px ${bullishColor}`;
        }

        // Update min/max lines
        const minLine = slider.querySelector('.min-line');
        if (minLine) {
            minLine.style.backgroundColor = bullishColor;
        }

        const maxLine = slider.querySelector('.max-line');
        if (maxLine) {
            maxLine.style.backgroundColor = bullishColor;
        }
    });
}

// Listen for color updates
document.addEventListener('colorsUpdated', updateSliderColors);

// Also update colors on window load
window.addEventListener('load', () => {
    // Wait a bit for CSS variables to be set
    setTimeout(updateSliderColors, 500);
});

// Make the CustomSlider class globally available
window.CustomSlider = CustomSlider;
