export class SSEClient {
    constructor(url, options = {}) {
        this.eventSource = null; // The EventSource connection
        this.listeners = new Map(); // Event listeners
        this.reconnectAttempts = 0; // Count of reconnect attempts
        this.heartbeatTimer = null; // Timer for sending heartbeats
        this.isClosed = false; // Track if client is intentionally closed
        this.url = url;
        this.options = options;
        this.lastEventIdKey = `sse-last-event-id-${btoa(this.url)}`; // Unique localStorage key
        this.options.lastEventId =
            this.options.lastEventId || this.loadLastEventId(); // Load last known ID
    }
    connect() {
        var _a;
        // Reset the closed flag when connecting
        this.isClosed = false;
        const urlWithParams = this.options.lastEventId
            ? `${this.url}${this.url.includes("?") ? "&" : "?"}lastEventId=${encodeURIComponent(this.options.lastEventId)}`
            : this.url;
        this.log(`Connecting to ${urlWithParams}`);
        this.eventSource = new EventSource(urlWithParams, {
            withCredentials: (_a = this.options.withCredentials) !== null && _a !== void 0 ? _a : false,
        });
        this.eventSource.onopen = () => {
            var _a, _b;
            this.reconnectAttempts = 0;
            this.log("Connection opened");
            (_b = (_a = this.options).onOpen) === null || _b === void 0 ? void 0 : _b.call(_a);
            this.startHeartbeat();
        };
        this.eventSource.onerror = (err) => {
            var _a, _b;
            this.log("Connection error", err);
            (_b = (_a = this.options).onError) === null || _b === void 0 ? void 0 : _b.call(_a, err);
            this.stopHeartbeat();
            this.tryReconnect();
        };
        this.eventSource.onmessage = (event) => {
            this.log("Message received", event.data);
            this.options.lastEventId = event.lastEventId;
            this.saveLastEventId(event.lastEventId);
            const parsedData = this.safeJsonParse(event.data);
            const defaultListener = this.listeners.get("message");
            if (defaultListener) {
                defaultListener(parsedData);
            }
        };
        for (const [event, handler] of this.listeners) {
            if (event !== "message") {
                this.eventSource.addEventListener(event, (e) => {
                    this.log(`Custom event received: ${event}`, e.data);
                    const parsedData = this.safeJsonParse(e.data);
                    handler(parsedData);
                });
            }
        }
    }
    on(event, handler) {
        this.log(`Registered listener for event: ${event}`);
        this.listeners.set(event, handler);
    }
    close() {
        // Set the closed flag to prevent reconnection
        this.isClosed = true;
        if (this.eventSource) {
            this.log("Closing connection");
            this.eventSource.close();
            this.eventSource = null;
            this.stopHeartbeat();
        }
    }
    safeJsonParse(data) {
        try {
            return JSON.parse(data);
        }
        catch (e) {
            return data;
        }
    }
    tryReconnect() {
        var _a, _b, _c, _d, _e;
        if (this.isClosed) {
            this.log("Reconnection cancelled - client is closed");
            return;
        }
        const maxRetries = (_a = this.options.maxRetryAttempts) !== null && _a !== void 0 ? _a : 10; // Default to 10 attempts
        if (this.reconnectAttempts >= maxRetries) {
            this.log(`Max retry attempts (${maxRetries}) exceeded, stopping reconnection`);
            (_c = (_b = this.options).onMaxRetriesExceeded) === null || _c === void 0 ? void 0 : _c.call(_b);
            this.close(); // Prevent further attempts
            return;
        }
        this.reconnectAttempts++;
        const baseInterval = this.options.reconnectInterval || 3000;
        const exponentialDelay = Math.min(baseInterval * Math.pow(2, this.reconnectAttempts - 1), 30000);
        const jitter = Math.random() * 1000;
        const interval = exponentialDelay + jitter;
        this.log(`Attempting to reconnect (#${this.reconnectAttempts}/${maxRetries}) in ${interval}ms`);
        (_e = (_d = this.options).onReconnectAttempt) === null || _e === void 0 ? void 0 : _e.call(_d, this.reconnectAttempts);
        setTimeout(() => {
            if (!this.isClosed) {
                this.connect();
            }
        }, interval);
    }
    startHeartbeat() {
        if (this.options.heartbeatInterval) {
            this.log("Starting heartbeat");
            this.heartbeatTimer = setInterval(() => {
                var _a;
                (_a = this.listeners.get("ping")) === null || _a === void 0 ? void 0 : _a({ timestamp: Date.now() });
            }, this.options.heartbeatInterval);
        }
    }
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            this.log("Stopping heartbeat");
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
    saveLastEventId(id) {
        try {
            localStorage.setItem(this.lastEventIdKey, id);
            this.log(`Saved lastEventId: ${id}`);
        }
        catch (_a) { }
    }
    loadLastEventId() {
        try {
            const id = localStorage.getItem(this.lastEventIdKey) || undefined;
            if (id)
                this.log(`Loaded lastEventId: ${id}`);
            return id;
        }
        catch (_a) {
            return undefined;
        }
    }
    log(message, data) {
        if (this.options.enableLogging) {
            console.log(`[SSEClient] ${message}`, data || "");
        }
    }
}
