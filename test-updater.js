// test-updater.js - Simple script to test the auto-update functionality

// Wait for the page to fully load
window.addEventListener('load', function() {
    console.log('Page loaded, testing updater...');

    // Wait a bit to make sure everything is initialized
    setTimeout(function() {
        console.log('Current app version:', window.appVersion ? window.appVersion.version : 'unknown');

        // Check if updater is available
        if (window.appUpdater) {
            console.log('Updater found, forcing update check...');
            window.appUpdater.checkForUpdates(true);
        } else {
            console.error('Updater not found! Check if it was properly initialized.');

            // Try to initialize it manually
            if (window.Updater && window.appVersion) {
                console.log('Attempting to initialize updater manually...');
                window.appUpdater = new window.Updater({
                    repoOwner: 'lost-LV',
                    repoName: 'dashboard',
                    currentVersion: window.appVersion.version,
                    checkInterval: 3600000,
                    onUpdateAvailable: (updateInfo) => {
                        console.log(`New version available: ${updateInfo.version}`);
                    }
                });
                console.log('Manual initialization complete. Update button will appear if a new version is available.');

                // Force an update check
                setTimeout(() => {
                    if (window.appUpdater) {
                        window.appUpdater.checkForUpdates(true);
                    }
                }, 1000);
            } else {
                console.error('Cannot initialize updater: required components missing.');
            }
        }
    }, 2000);
});
