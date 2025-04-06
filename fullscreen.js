// Fullscreen button functionality
document.addEventListener('DOMContentLoaded', function() {
    initializeFullscreenButton();
});

// Also initialize on window load as a fallback
window.addEventListener('load', function() {
    initializeFullscreenButton();
    // Try again after a delay
    setTimeout(initializeFullscreenButton, 1000);
});

function initializeFullscreenButton() {
    console.log('Initializing fullscreen button...');
    const fullscreenButton = document.getElementById('fullscreen-button');

    if (!fullscreenButton) {
        console.error('Fullscreen button not found!');
        return;
    }

    // Add click event listener for fullscreen toggle
    fullscreenButton.addEventListener('click', toggleFullscreen);

    console.log('Fullscreen button initialized');
}

function toggleFullscreen() {
    console.log('Toggling fullscreen mode...');

    if (!document.fullscreenElement &&
        !document.mozFullScreenElement &&
        !document.webkitFullscreenElement &&
        !document.msFullscreenElement) {
        // Enter fullscreen
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.msRequestFullscreen) {
            document.documentElement.msRequestFullscreen();
        } else if (document.documentElement.mozRequestFullScreen) {
            document.documentElement.mozRequestFullScreen();
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
        }
        console.log('Entered fullscreen mode');
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
        console.log('Exited fullscreen mode');
    }
}
