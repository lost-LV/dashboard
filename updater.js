// updater.js - Simple auto-update system
class Updater {
    constructor(options = {}) {
        this.options = {
            repoOwner: options.repoOwner || 'your-github-username',
            repoName: options.repoName || 'your-repo-name',
            currentVersion: options.currentVersion || '1.0.0',
            checkInterval: options.checkInterval || 3600000, // Default: check every hour
            autoDownload: options.autoDownload !== undefined ? options.autoDownload : true,
            onUpdateAvailable: options.onUpdateAvailable || this.defaultOnUpdateAvailable,
            onUpdateDownloaded: options.onUpdateDownloaded || this.defaultOnUpdateDownloaded,
            onError: options.onError || this.defaultOnError
        };

        this.updateInfo = null;
        this.isChecking = false;
        this.lastCheckTime = 0;

        // Initialize
        this.init();
    }

    init() {
        console.log(`Updater initialized (current version: ${this.options.currentVersion})`);

        // Don't add the button initially - only show it when an update is available
        // this.addUpdateButton();

        // Check for updates on startup
        this.checkForUpdates();

        // Set up periodic checks
        setInterval(() => this.checkForUpdates(), this.options.checkInterval);
    }

    addUpdateButton() {
        console.log('Adding update button to DOM...');
        try {
            // Create the button
            const button = document.createElement('button');
            button.textContent = 'Update Available!';
            button.style.width = '100%';
            button.style.padding = '10px';
            button.style.backgroundColor = '#FF9800'; // Orange color for update notification
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '4px';
            button.style.cursor = 'pointer';
            button.style.marginTop = '15px';
            button.style.fontWeight = 'bold';
            button.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';

            // Add click event to download the update
            button.addEventListener('click', () => {
                this.downloadUpdate(); // Show update dialog
            });

            // Find the sidebar
            const sidebar = document.getElementById('sidebar');

            if (sidebar) {
                // Create a container for the button at the bottom of the sidebar
                const updateContainer = document.createElement('div');
                updateContainer.style.width = 'calc(100% - 20px)';
                updateContainer.style.padding = '10px';
                updateContainer.style.boxSizing = 'border-box';
                updateContainer.style.position = 'absolute';
                updateContainer.style.bottom = '10px';
                updateContainer.style.left = '10px';
                updateContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
                updateContainer.style.borderRadius = '4px';
                updateContainer.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';
                updateContainer.style.paddingTop = '15px';

                // Add version info
                const versionInfo = document.createElement('div');
                // Remove 'v' prefix if present in version
                const displayVersion = this.updateInfo ? this.updateInfo.version.replace(/^v/, '') : 'available';
                versionInfo.textContent = `New version: ${displayVersion}`;
                versionInfo.style.textAlign = 'center';
                versionInfo.style.marginBottom = '5px';
                versionInfo.style.fontSize = '12px';
                versionInfo.style.color = '#FFF';

                // Add elements to container
                updateContainer.appendChild(versionInfo);
                updateContainer.appendChild(button);

                // Add container to sidebar
                sidebar.appendChild(updateContainer);
                console.log('Update button added to sidebar successfully');

                // Store references
                this.updateButton = button;
                this.updateContainer = updateContainer;
            } else {
                console.error('Sidebar element not found');
                // Fallback to body if sidebar not found
                if (document.body) {
                    // Create a floating button in the corner as fallback
                    button.style.position = 'absolute';
                    button.style.bottom = '10px';
                    button.style.right = '10px';
                    button.style.zIndex = '9999';
                    button.style.width = 'auto';

                    document.body.appendChild(button);
                    console.log('Update button added to body as fallback');
                    this.updateButton = button;
                } else {
                    console.error('Document body not available yet');
                }
            }
        } catch (error) {
            console.error('Error adding update button:', error);
        }
    }

    async checkForUpdates(force = false) {
        console.log(`Checking for updates... (forced: ${force})`);

        // Prevent multiple simultaneous checks
        if (this.isChecking) {
            console.log('Update check already in progress, skipping');
            return;
        }

        // Don't check too frequently unless forced
        const now = Date.now();
        if (!force && now - this.lastCheckTime < 60000) { // 1 minute minimum between checks
            console.log('Skipping update check - checked recently');
            return;
        }

        this.isChecking = true;
        this.lastCheckTime = now;

        try {
            // Update button state
            if (this.updateButton) {
                this.updateButton.textContent = 'Checking...';
                this.updateButton.disabled = true;
            }

            // Fetch latest release info from GitHub
            console.log(`Fetching from GitHub API: https://api.github.com/repos/${this.options.repoOwner}/${this.options.repoName}/releases/latest`);
            let releaseInfo;
            try {
                const response = await fetch(`https://api.github.com/repos/${this.options.repoOwner}/${this.options.repoName}/releases/latest`);

                console.log('GitHub API response status:', response.status);

                if (!response.ok) {
                    throw new Error(`GitHub API error: ${response.status}`);
                }

                releaseInfo = await response.json();
                console.log('GitHub release info:', releaseInfo);
            } catch (error) {
                console.error('Error fetching from GitHub API:', error);
                throw error;
            }

            // Compare versions
            if (this.isNewerVersion(releaseInfo.tag_name, this.options.currentVersion)) {
                this.updateInfo = {
                    version: releaseInfo.tag_name,
                    releaseNotes: releaseInfo.body,
                    downloadUrl: releaseInfo.zipball_url,
                    publishedAt: releaseInfo.published_at
                };

                // Notify about update
                this.options.onUpdateAvailable(this.updateInfo);

                // Show the update button if it doesn't exist yet
                if (!this.updateButton) {
                    this.addUpdateButton();
                } else if (this.updateContainer) {
                    // Update version info if button already exists
                    const versionInfo = this.updateContainer.querySelector('div');
                    if (versionInfo) {
                        // Remove 'v' prefix if present in version
                        const displayVersion = this.updateInfo.version.replace(/^v/, '');
                        versionInfo.textContent = `New version: ${displayVersion}`;
                    }
                }

                // Auto-download if enabled
                if (this.options.autoDownload) {
                    this.downloadUpdate();
                }
            } else {
                // No update needed
                console.log('You have the latest version.');

                // If we already have an update button showing, don't remove it
                // This ensures the button stays visible once an update is detected
            }
        } catch (error) {
            this.options.onError(error);

            // Don't show or update the button on error
            // We only want to show the button when an update is available
        } finally {
            this.isChecking = false;
        }
    }

    isNewerVersion(latestVersion, currentVersion) {
        console.log(`Comparing versions - Latest: ${latestVersion}, Current: ${currentVersion}`);

        // Remove 'v' prefix if present
        latestVersion = latestVersion.replace(/^v/, '');
        currentVersion = currentVersion.replace(/^v/, '');

        console.log(`After prefix removal - Latest: ${latestVersion}, Current: ${currentVersion}`);

        const latest = latestVersion.split('.').map(Number);
        const current = currentVersion.split('.').map(Number);

        console.log('Parsed versions:', { latest, current });

        // Compare major, minor, patch
        for (let i = 0; i < Math.max(latest.length, current.length); i++) {
            const latestPart = latest[i] || 0;
            const currentPart = current[i] || 0;

            console.log(`Comparing part ${i}: ${latestPart} vs ${currentPart}`);

            if (latestPart > currentPart) {
                console.log('Latest version is newer');
                return true;
            } else if (latestPart < currentPart) {
                console.log('Current version is newer or same');
                return false;
            }
        }

        console.log('Versions are equal');
        return false; // Versions are equal
    }

    async downloadUpdate() {
        if (!this.updateInfo) return;

        try {
            // In a browser environment, we can't directly download and extract files
            // Instead, we'll show instructions to the user
            const updateNotification = document.createElement('div');
            updateNotification.style.position = 'fixed';
            updateNotification.style.top = '50%';
            updateNotification.style.left = '50%';
            updateNotification.style.transform = 'translate(-50%, -50%)';
            updateNotification.style.backgroundColor = '#fff';
            updateNotification.style.padding = '20px';
            updateNotification.style.borderRadius = '8px';
            updateNotification.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
            updateNotification.style.zIndex = '10000';
            updateNotification.style.maxWidth = '500px';
            updateNotification.style.width = '80%';

            // Remove 'v' prefix if present in version
            const displayVersion = this.updateInfo.version.replace(/^v/, '');

            updateNotification.innerHTML = `
                <h2 style="margin-top: 0; color: #333;">Update Available: ${displayVersion}</h2>
                <p style="margin-bottom: 15px;">A new version is available. Please download the latest version from GitHub.</p>
                <div style="max-height: 150px; overflow-y: auto; margin-bottom: 15px; padding: 10px; background-color: #f5f5f5; border-radius: 4px;">
                    <h3 style="margin-top: 0; font-size: 16px;">Release Notes:</h3>
                    <div style="white-space: pre-line;">${this.updateInfo.releaseNotes || 'No release notes available.'}</div>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <button id="update-download-btn" style="padding: 8px 16px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Download Update</button>
                    <button id="update-close-btn" style="padding: 8px 16px; background-color: #ccc; color: black; border: none; border-radius: 4px; cursor: pointer;">Close</button>
                </div>
            `;

            document.body.appendChild(updateNotification);

            // Add event listeners
            document.getElementById('update-download-btn').addEventListener('click', () => {
                window.open(`https://github.com/${this.options.repoOwner}/${this.options.repoName}/releases/latest`, '_blank');
                document.body.removeChild(updateNotification);
            });

            document.getElementById('update-close-btn').addEventListener('click', () => {
                document.body.removeChild(updateNotification);
            });

            // Notify that update is ready to download
            this.options.onUpdateDownloaded(this.updateInfo);
        } catch (error) {
            this.options.onError(error);
        }
    }

    // Default event handlers
    defaultOnUpdateAvailable(updateInfo) {
        console.log(`Update available: ${updateInfo.version}`);
    }

    defaultOnUpdateDownloaded(updateInfo) {
        console.log(`Update downloaded: ${updateInfo.version}`);
    }

    defaultOnError(error) {
        console.error('Update error:', error);
    }
}

// Export the Updater class
window.Updater = Updater;
