// Screenshot and Fullscreen functionality

// Define the initialization function
function initScreenshotModule() {
    console.log('Screenshot module initialization started');

    // Get the buttons
    const screenshotButton = document.getElementById('screenshot-button');
    const fullscreenButton = document.getElementById('fullscreen-button');

    console.log('Screenshot button found:', !!screenshotButton);
    console.log('Fullscreen button found:', !!fullscreenButton);

    // Add event listeners
    if (screenshotButton) {
        // Remove any existing listeners to prevent duplicates
        screenshotButton.removeEventListener('click', takeScreenshot);
        // Add the listener
        screenshotButton.addEventListener('click', takeScreenshot);
        console.log('Screenshot event listener added');

        // Make sure the button is visible
        screenshotButton.style.display = 'flex';
    } else {
        console.warn('Screenshot button not found in the DOM');
    }

    if (fullscreenButton) {
        // Remove any existing listeners to prevent duplicates
        fullscreenButton.removeEventListener('click', toggleFullscreen);
        // Add the listener
        fullscreenButton.addEventListener('click', toggleFullscreen);
    }
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Screenshot module loaded (DOMContentLoaded)');
    initScreenshotModule();
});

// Also initialize on window load as a fallback
window.addEventListener('load', function() {
    console.log('Screenshot module loaded (window.load)');
    initScreenshotModule();

    // Try again after a short delay to ensure all elements are fully loaded
    setTimeout(initScreenshotModule, 1000);
});

// Function to take a screenshot and copy to clipboard without popup
function takeScreenshot() {
    console.log('takeScreenshot function called');

    // Get the screenshot button (in case this is called directly)
    const screenshotButton = document.getElementById('screenshot-button');
    if (!screenshotButton) {
        console.error('Screenshot button not found');
        return;
    }

    // Set default background color if not already set
    if (!screenshotButton.style.backgroundColor) {
        screenshotButton.style.backgroundColor = 'rgba(40, 40, 40, 0.8)';
    }

    // Flash the screenshot button to indicate action
    const originalBackgroundColor = screenshotButton.style.backgroundColor;
    screenshotButton.style.backgroundColor = 'rgba(100, 100, 100, 0.8)';
    setTimeout(() => {
        screenshotButton.style.backgroundColor = originalBackgroundColor;
    }, 300);

    try {
        // Use the html2canvas library directly from the global scope
        if (typeof html2canvas !== 'function') {
            console.error('html2canvas library not found');
            screenshotButton.style.backgroundColor = 'rgba(239, 83, 80, 0.8)';
            setTimeout(() => {
                screenshotButton.style.backgroundColor = originalBackgroundColor;
            }, 500);
            return;
        }

        // Take screenshot of the entire document
        html2canvas(document.documentElement, {
            allowTaint: true,
            useCORS: true,
            scale: 1,
            backgroundColor: '#131722', // Match chart background
            logging: false,
            foreignObjectRendering: false,
            removeContainer: true,
            x: window.scrollX,
            y: window.scrollY,
            width: window.innerWidth,
            height: window.innerHeight
        }).then(function(canvas) {
            console.log('html2canvas completed');

            // Try to copy to clipboard
            try {
                // Convert canvas to blob
                canvas.toBlob(function(blob) {
                    console.log('Canvas converted to blob, size:', blob.size);

                    // Try clipboard API first
                    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
                        const clipboardItem = new ClipboardItem({ 'image/png': blob });

                        navigator.clipboard.write([clipboardItem])
                            .then(function() {
                                console.log('Screenshot copied to clipboard successfully');
                                // Flash green to indicate success
                                screenshotButton.style.backgroundColor = 'rgba(38, 166, 154, 0.8)';
                                setTimeout(() => {
                                    screenshotButton.style.backgroundColor = originalBackgroundColor;
                                }, 500);
                            })
                            .catch(function(error) {
                                console.error('Clipboard API error:', error);
                                // Fall back to download
                                downloadImage(blob, screenshotButton, originalBackgroundColor);
                            });
                    } else {
                        console.log('Clipboard API not available, falling back to download');
                        // Fall back to download
                        downloadImage(blob, screenshotButton, originalBackgroundColor);
                    }
                }, 'image/png', 1.0);
            } catch (error) {
                console.error('Error processing canvas:', error);
                screenshotButton.style.backgroundColor = 'rgba(239, 83, 80, 0.8)';
                setTimeout(() => {
                    screenshotButton.style.backgroundColor = originalBackgroundColor;
                }, 500);
            }
        }).catch(function(error) {
            console.error('html2canvas error:', error);
            screenshotButton.style.backgroundColor = 'rgba(239, 83, 80, 0.8)';
            setTimeout(() => {
                screenshotButton.style.backgroundColor = originalBackgroundColor;
            }, 500);
        });
    } catch (error) {
        console.error('Error taking screenshot:', error);
        screenshotButton.style.backgroundColor = 'rgba(239, 83, 80, 0.8)';
        setTimeout(() => {
            screenshotButton.style.backgroundColor = originalBackgroundColor;
        }, 500);
    }
}

// Fallback function to download the image if clipboard fails
function downloadImage(blob, screenshotButton, originalBackgroundColor) {
    console.log('Attempting to download image as fallback');

    // If button not provided, try to get it
    if (!screenshotButton) {
        screenshotButton = document.getElementById('screenshot-button');
        if (!screenshotButton) {
            console.error('Screenshot button not found for download fallback');
            return;
        }
    }

    // If original background color not provided, get current
    if (!originalBackgroundColor) {
        originalBackgroundColor = screenshotButton.style.backgroundColor || 'rgba(40, 40, 40, 0.8)';
    }

    try {
        // Create a download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'chart-screenshot-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
        a.style.display = 'none';
        document.body.appendChild(a);

        // Flash the button yellow to indicate download instead of clipboard
        screenshotButton.style.backgroundColor = 'rgba(255, 193, 7, 0.8)';

        // Trigger download
        a.click();

        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            screenshotButton.style.backgroundColor = originalBackgroundColor;
            console.log('Image download completed');
        }, 500);
    } catch (error) {
        console.error('Failed to download image:', error);
        // Flash the button red to indicate failure
        screenshotButton.style.backgroundColor = 'rgba(239, 83, 80, 0.8)';
        setTimeout(() => {
            screenshotButton.style.backgroundColor = originalBackgroundColor;
        }, 500);
    }
}



// Function to toggle fullscreen
function toggleFullscreen() {
    // Get the fullscreen button (in case this is called directly)
    const fullscreenButton = document.getElementById('fullscreen-button');
    if (!fullscreenButton) {
        console.error('Fullscreen button not found');
        return;
    }

    if (!document.fullscreenElement) {
        // Enter fullscreen
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.mozRequestFullScreen) { // Firefox
            document.documentElement.mozRequestFullScreen();
        } else if (document.documentElement.webkitRequestFullscreen) { // Chrome, Safari and Opera
            document.documentElement.webkitRequestFullscreen();
        } else if (document.documentElement.msRequestFullscreen) { // IE/Edge
            document.documentElement.msRequestFullscreen();
        }

        // Update icon to exit fullscreen
        updateFullscreenIcon(true);
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.mozCancelFullScreen) { // Firefox
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) { // Chrome, Safari and Opera
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { // IE/Edge
            document.msExitFullscreen();
        }

        // Update icon to enter fullscreen
        updateFullscreenIcon(false);
    }
}

// Function to update fullscreen icon based on state
function updateFullscreenIcon(isFullscreen) {
    const fullscreenButton = document.getElementById('fullscreen-button');
    if (!fullscreenButton) {
        console.error('Fullscreen button not found for icon update');
        return;
    }

    if (isFullscreen) {
        fullscreenButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 14h6m0 0v6m0-6l-7 7m17-11h-6m0 0V4m0 6l7-7"></path>
            </svg>
        `;
        fullscreenButton.title = "Exit Fullscreen";
    } else {
        fullscreenButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
            </svg>
        `;
        fullscreenButton.title = "Enter Fullscreen";
    }
}

// Add fullscreen change event listeners
function addFullscreenChangeListeners() {
    // Listen for fullscreen change events
    document.addEventListener('fullscreenchange', function() {
        updateFullscreenIcon(!!document.fullscreenElement);
    });
    document.addEventListener('webkitfullscreenchange', function() {
        updateFullscreenIcon(!!document.webkitFullscreenElement);
    });
    document.addEventListener('mozfullscreenchange', function() {
        updateFullscreenIcon(!!document.mozFullscreenElement);
    });
    document.addEventListener('MSFullscreenChange', function() {
        updateFullscreenIcon(!!document.msFullscreenElement);
    });
}

// Add fullscreen change listeners when the module initializes
addFullscreenChangeListeners();
