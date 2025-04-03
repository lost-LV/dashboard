// init-updater.js - Initialize the updater
document.addEventListener('DOMContentLoaded', function() {
    // Make sure version info is available
    if (window.appVersion && window.Updater) {
        console.log('Initializing updater with version:', window.appVersion.version);
        
        // Create the updater instance
        window.appUpdater = new window.Updater({
            repoOwner: 'lost-LV',
            repoName: 'dashboard',
            currentVersion: window.appVersion.version,
            checkInterval: 3600000, // Check every hour
            onUpdateAvailable: (updateInfo) => {
                console.log(`New version available: ${updateInfo.version}`);
            }
        });
        
        console.log('Updater initialized successfully');
    } else {
        console.error('Cannot initialize updater: required components missing');
        console.log('appVersion available:', !!window.appVersion);
        console.log('Updater class available:', !!window.Updater);
    }
});
