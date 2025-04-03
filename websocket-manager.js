class WebSocketManager {
    constructor(url, exchange, name) {
        this.url = url;
        this.exchange = exchange;
        this.name = name;
        this.ws = null;
        this.handlers = {};
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.baseReconnectDelay = 1000;
        this.heartbeatInterval = null;
        this.connect();
    }

    connect() {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            const message = `${this.name} WebSocket (${this.exchange}) connected`;
            console.log(`%c${message}`, 'color: green; font-weight: bold');
            this.reconnectAttempts = 0;
            for (const channel in this.handlers) {
                this.sendSubscription(channel);
            }
            this.startHeartbeat();

            // Log connection status to console table
            this.logConnectionStatus('Connected');
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                let channel;
                if (this.exchange === 'bitstamp') {
                    channel = data.channel;
                } else if (this.exchange === 'bybit') {
                    channel = data.topic;
                }
                if (channel && this.handlers[channel]) {
                    this.handlers[channel].forEach(handler => handler(data));
                }
            } catch (error) {
                console.error(`${this.name} (${this.exchange}) message error:`, error);
            }
        };

        this.ws.onclose = () => {
            const message = `${this.name} (${this.exchange}) closed. Reconnecting...`;
            console.log(`%c${message}`, 'color: orange; font-weight: bold');
            this.logConnectionStatus('Disconnected - Reconnecting');
            this.cleanup();
            this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
            const message = `${this.name} (${this.exchange}) error`;
            console.error(`%c${message}`, 'color: red; font-weight: bold', error);
            this.logConnectionStatus('Error');
            this.ws.close();
        };

        // Initialize connection status tracking if not already done
        if (!window.wsConnections) {
            window.wsConnections = {};
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error(`${this.name} (${this.exchange}) max reconnect attempts reached`);
            return;
        }
        const delay = Math.min(
            this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000,
            30000
        );
        this.reconnectAttempts++;
        console.log(`${this.name} (${this.exchange}) reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);
        setTimeout(() => this.connect(), delay);
    }

    sendSubscription(channel) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const message = this.exchange === 'bitstamp'
                ? { event: 'bts:subscribe', data: { channel } }
                : { op: 'subscribe', args: [channel] };
            this.ws.send(JSON.stringify(message));
        }
    }

    subscribe(channel, handler) {
        if (!this.handlers[channel]) {
            this.handlers[channel] = [];
            this.sendSubscription(channel);
        }
        if (!this.handlers[channel].includes(handler)) {
            this.handlers[channel].push(handler);
        }
    }

    unsubscribe(channel, handler) {
        if (this.handlers[channel]) {
            this.handlers[channel] = this.handlers[channel].filter(h => h !== handler);
            if (this.handlers[channel].length === 0) {
                delete this.handlers[channel];
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    const message = this.exchange === 'bitstamp'
                        ? { event: 'bts:unsubscribe', data: { channel } }
                        : { op: 'unsubscribe', args: [channel] };
                    this.ws.send(JSON.stringify(message));
                }
            }
        }
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const pingMessage = this.exchange === 'bitstamp'
                    ? { event: 'bts:ping' }
                    : { op: 'ping' };
                this.ws.send(JSON.stringify(pingMessage));
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    cleanup() {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onclose = null;
            this.ws.onerror = null;
            if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                this.ws.close();
            }
            this.ws = null;
        }
    }

    disconnect() {
        this.cleanup();
        this.reconnectAttempts = this.maxReconnectAttempts;
        this.logConnectionStatus('Disconnected');
    }

    logConnectionStatus(status) {
        // Update connection status in global tracking object
        if (!window.wsConnections) {
            window.wsConnections = {};
        }

        const connectionId = `${this.exchange}-${this.name}`;
        window.wsConnections[connectionId] = {
            exchange: this.exchange,
            name: this.name,
            status: status,
            timestamp: new Date().toLocaleTimeString()
        };

        // Log all connections status to console
        console.groupCollapsed('WebSocket Connections Status');
        console.table(Object.values(window.wsConnections));
        console.groupEnd();

        // Update status in UI if we have more than one connection
        if (Object.keys(window.wsConnections).length >= 2) {
            const allConnected = Object.values(window.wsConnections)
                .every(conn => conn.status === 'Connected');

            // Update page title to indicate connection status
            const currentTitle = document.title;
            const baseTitleParts = currentTitle.split(' - ');
            const baseTitle = baseTitleParts[0];

            if (allConnected) {
                document.title = `${baseTitle} - ✅ All Connected`;
            } else {
                document.title = `${baseTitle} - ⚠️ Connection Issues`;
            }
        }
    }
}