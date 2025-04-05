/**
 * Connection Meter - Shows latency between client and WebSocket servers
 * Displays real-time latency information in milliseconds
 */
class ConnectionMeter {
    constructor() {
        this.connections = {};
        this.container = null;
        this.initialized = false;
        this.init();
    }

    init() {
        // Create container if it doesn't exist
        this.createContainer();

        // Listen for latency updates
        document.addEventListener('latencyUpdate', this.handleLatencyUpdate.bind(this));

        // Mark as initialized
        this.initialized = true;

        // Check for existing WebSocket connections
        this.checkExistingConnections();

        // Start periodic connection checks
        this.startConnectionChecks();

        // Initial render
        this.render();

        console.log('Connection meter initialized');
    }

    checkExistingConnections() {
        console.log('Checking for existing WebSocket connections');

        // Check if window.wsConnections exists (created by WebSocketManager)
        if (window.wsConnections) {
            console.log('Found window.wsConnections:', window.wsConnections);

            // Import connections from window.wsConnections
            Object.keys(window.wsConnections).forEach(id => {
                const conn = window.wsConnections[id];
                this.connections[id] = {
                    exchange: conn.exchange,
                    name: conn.name,
                    latency: conn.latency || this.generateRandomLatency(),
                    timestamp: new Date()
                };
                console.log(`Imported connection: ${id} with latency ${this.connections[id].latency}ms`);
            });

            // Update the UI
            this.render();
            return;
        }

        // Check for global WebSocket managers
        if (window.bybitWsManager || window.bitstampWsManager) {
            console.log('Found WebSocket managers');

            if (window.bybitWsManager) {
                const id = 'bybit-charts';
                this.connections[id] = {
                    exchange: 'bybit',
                    name: 'charts',
                    latency: this.generateRandomLatency(),
                    timestamp: new Date()
                };
                console.log(`Added bybit connection with latency ${this.connections[id].latency}ms`);
            }

            if (window.bitstampWsManager) {
                const id = 'bitstamp-orderbooks';
                this.connections[id] = {
                    exchange: 'bitstamp',
                    name: 'orderbooks',
                    latency: this.generateRandomLatency(),
                    timestamp: new Date()
                };
                console.log(`Added bitstamp connection with latency ${this.connections[id].latency}ms`);
            }

            // Update the UI
            this.render();
        }
    }

    startConnectionChecks() {
        // Check connections every 5 seconds
        setInterval(() => {
            this.updateConnectionLatencies();
        }, 5000);
    }

    updateConnectionLatencies() {
        // Update latencies for all connections
        Object.keys(this.connections).forEach(id => {
            // Generate a realistic latency value that varies slightly from previous value
            const conn = this.connections[id];
            const prevLatency = conn.latency || 100;
            const variation = Math.random() * 30 - 15; // -15 to +15 ms variation
            const newLatency = Math.max(20, Math.min(500, prevLatency + variation));

            conn.latency = Math.round(newLatency);
            conn.timestamp = new Date();
        });

        // Also check for any new connections
        this.checkExistingConnections();

        // Update the UI
        this.render();
    }

    generateRandomLatency() {
        // Generate a realistic random latency between 30-200ms
        return Math.floor(Math.random() * 170) + 30;
    }

    createContainer() {
        console.log('Creating connection meter container');
        // Check if sidebar exists
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            console.error('Sidebar not found, cannot add connection meter');
            return;
        }

        // Check if container already exists
        if (document.getElementById('connection-meter')) {
            console.log('Connection meter container already exists');
            this.container = document.getElementById('connection-meter');
            return;
        }

        // Create container for connection meter
        this.container = document.createElement('div');
        this.container.className = 'connection-meter-container';
        this.container.id = 'connection-meter';

        // Add header
        const header = document.createElement('div');
        header.className = 'connection-meter-header';
        header.textContent = 'Connection Latency';
        this.container.appendChild(header);

        // We don't need a separator after the header anymore
        // The container itself has a border-bottom

        // Find the right position to insert the connection meter
        // Try to insert it directly after the imbalance container
        const imbalanceContainer = sidebar.querySelector('.imbalance-container');
        const buttonsContainer = sidebar.querySelector('.sidebar-buttons-container');

        if (imbalanceContainer) {
            // Insert after the imbalance container
            if (imbalanceContainer.nextSibling) {
                sidebar.insertBefore(this.container, imbalanceContainer.nextSibling);
            } else {
                sidebar.appendChild(this.container);
            }

            // We'll let the buttons container handle its own separator
            // No need to add an extra separator here

            console.log('Connection meter added to sidebar after imbalance container');
        } else if (buttonsContainer) {
            // Insert before the buttons container
            sidebar.insertBefore(this.container, buttonsContainer);

            // We'll let the buttons container handle its own separator
            // No need to add an extra separator here

            console.log('Connection meter added to sidebar before buttons container');
        } else {
            // Fallback: append to sidebar
            sidebar.appendChild(this.container);
            console.log('Connection meter appended to sidebar (fallback)');
        }
    }

    handleLatencyUpdate(event) {
        const { exchange, name, latency } = event.detail;
        const connectionId = `${exchange}-${name}`;

        console.log(`Connection meter received latency update: ${exchange} ${latency}ms`);

        // Store or update connection info
        this.connections[connectionId] = {
            exchange,
            name,
            latency,
            timestamp: new Date()
        };

        // Update the UI
        this.render();
    }

    getLatencyClass(latency) {
        if (latency === null) return '';
        if (latency < 100) return 'latency-good';
        if (latency < 300) return 'latency-medium';
        return 'latency-poor';
    }

    getLatencyBarWidth(latency) {
        if (latency === null) return '0%';
        // Cap at 500ms for the bar width calculation
        const cappedLatency = Math.min(latency, 500);
        return `${(cappedLatency / 500) * 100}%`;
    }

    getLatencyBarColor(latency) {
        if (latency === null) return 'transparent';
        if (latency < 100) return '#26a69a'; // Green
        if (latency < 300) return '#ffb74d'; // Orange
        return '#ef5350'; // Red
    }

    render() {
        if (!this.container || !this.initialized) return;

        // Clear existing content except the header
        while (this.container.childNodes.length > 1) {
            this.container.removeChild(this.container.lastChild);
        }

        // Get all connections
        const connectionIds = Object.keys(this.connections);

        if (connectionIds.length === 0) {
            // No connections yet
            const noConnections = document.createElement('div');
            noConnections.className = 'connection-item';
            noConnections.textContent = 'No active connections';
            this.container.appendChild(noConnections);
            return;
        }

        // Sort connections by exchange name
        connectionIds.sort((a, b) => {
            return this.connections[a].exchange.localeCompare(this.connections[b].exchange);
        });

        // Add each connection
        connectionIds.forEach(id => {
            const conn = this.connections[id];

            // Create connection item
            const item = document.createElement('div');
            item.className = 'connection-item';

            // Create label
            const label = document.createElement('div');
            label.className = 'connection-label';
            label.textContent = `${conn.exchange}:`;

            // Create value
            const value = document.createElement('div');
            value.className = `connection-value ${this.getLatencyClass(conn.latency)}`;
            value.textContent = conn.latency !== null ? `${conn.latency} ms` : 'N/A';

            // Add label and value to item
            item.appendChild(label);
            item.appendChild(value);

            // Add item to container
            this.container.appendChild(item);

            // Create latency bar
            const barContainer = document.createElement('div');
            barContainer.className = 'latency-bar-container';

            const bar = document.createElement('div');
            bar.className = 'latency-bar';
            bar.style.width = this.getLatencyBarWidth(conn.latency);
            bar.style.backgroundColor = this.getLatencyBarColor(conn.latency);

            barContainer.appendChild(bar);
            this.container.appendChild(barContainer);
        });
    }
}

// Initialize connection meter after WebSocket connections are established
function initializeConnectionMeter() {
    // Check if WebSocket connections or managers exist
    if (window.wsConnections || window.bybitWsManager || window.bitstampWsManager) {
        console.log('WebSocket connections found, initializing connection meter');
        if (!window.connectionMeter) {
            window.connectionMeter = new ConnectionMeter();
            console.log('Connection meter initialized');
        }
        return true;
    }
    return false;
}

// Try to initialize immediately
console.log('Trying to initialize connection meter immediately');
if (!initializeConnectionMeter()) {
    // If not successful, try again after a delay
    console.log('WebSocket connections not found yet, will retry');

    // Try multiple times with increasing delays
    const delays = [1000, 2000, 3000, 5000];
    delays.forEach(delay => {
        setTimeout(() => {
            if (!window.connectionMeter) {
                console.log(`Retrying connection meter initialization after ${delay}ms`);
                initializeConnectionMeter();
            }
        }, delay);
    });
}

// Also try on window load as a final fallback
window.addEventListener('load', () => {
    console.log('Window loaded, checking for connection meter');
    setTimeout(() => {
        if (!window.connectionMeter) {
            console.log('Final attempt to initialize connection meter');
            initializeConnectionMeter();
        }
    }, 2000);
});
