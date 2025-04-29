// Optimized SSEClient class with auto-reconnect, heartbeat handling, last-event-id persistence, and logging
export interface SSEOptions {
  headers?: Record<string, string>; // Optional custom headers
  withCredentials?: boolean; // Allow credentials for CORS requests
  onOpen?: () => void; // Callback when connection opens
  onError?: (err: Event) => void; // Callback on connection error
  onReconnectAttempt?: (attempt: number) => void; // Callback on reconnect attempt
  lastEventId?: string; // Last received event ID for resuming
  heartbeatInterval?: number; // Interval for heartbeat pings (ms)
  reconnectInterval?: number; // Base reconnect interval (ms)
  enableLogging?: boolean; // Enable or disable internal logging
  maxRetryAttempts?: number; // Maximum number of retry attempts before giving up
  onMaxRetriesExceeded?: () => void; // Callback when max retries are exceeded
}

export class SSEClient {
  private eventSource: EventSource | null = null; // The EventSource connection
  private url: string; // Endpoint URL
  private options: SSEOptions; // User options
  private listeners: Map<string, (data: any) => void> = new Map(); // Event listeners
  private reconnectAttempts: number = 0; // Count of reconnect attempts
  private heartbeatTimer: any = null; // Timer for sending heartbeats
  private lastEventIdKey: string; // Key for persisting lastEventId in localStorage
  private isClosed: boolean = false; // Track if client is intentionally closed

  constructor(url: string, options: SSEOptions = {}) {
    this.url = url;
    this.options = options;
    this.lastEventIdKey = `sse-last-event-id-${btoa(this.url)}`; // Unique localStorage key
    this.options.lastEventId =
      this.options.lastEventId || this.loadLastEventId(); // Load last known ID
  }

  public connect() {
    // Reset the closed flag when connecting
    this.isClosed = false;

    const urlWithParams = this.options.lastEventId
      ? `${this.url}${
          this.url.includes("?") ? "&" : "?"
        }lastEventId=${encodeURIComponent(this.options.lastEventId)}`
      : this.url;

    this.log(`Connecting to ${urlWithParams}`);

    this.eventSource = new EventSource(urlWithParams, {
      withCredentials: this.options.withCredentials ?? false,
    });

    this.eventSource.onopen = () => {
      this.reconnectAttempts = 0;
      this.log("Connection opened");
      this.options.onOpen?.();
      this.startHeartbeat();
    };

    this.eventSource.onerror = (err) => {
      this.log("Connection error", err);
      this.options.onError?.(err);
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
        this.eventSource.addEventListener(event, (e: MessageEvent) => {
          this.log(`Custom event received: ${event}`, e.data);
          const parsedData = this.safeJsonParse(e.data);
          handler(parsedData);
        });
      }
    }
  }

  public on(event: string, handler: (data: any) => void) {
    this.log(`Registered listener for event: ${event}`);
    this.listeners.set(event, handler);
  }

  public close() {
    // Set the closed flag to prevent reconnection
    this.isClosed = true;
    
    if (this.eventSource) {
      this.log("Closing connection");
      this.eventSource.close();
      this.eventSource = null;
      this.stopHeartbeat();
    }
  }

  private safeJsonParse(data: string): any {
    try {
      return JSON.parse(data);
    } catch (e) {
      return data;
    }
  }

  private tryReconnect() {
    if (this.isClosed) {
      this.log("Reconnection cancelled - client is closed");
      return;
    }

    const maxRetries = this.options.maxRetryAttempts ?? 10; // Default to 10 attempts
    
    if (this.reconnectAttempts >= maxRetries) {
      this.log(`Max retry attempts (${maxRetries}) exceeded, stopping reconnection`);
      this.options.onMaxRetriesExceeded?.();
      this.close(); // Prevent further attempts
      return;
    }

    this.reconnectAttempts++;
    const baseInterval = this.options.reconnectInterval || 3000;
    const exponentialDelay = Math.min(
      baseInterval * Math.pow(2, this.reconnectAttempts - 1),
      30000
    );
    const jitter = Math.random() * 1000;
    const interval = exponentialDelay + jitter;

    this.log(
      `Attempting to reconnect (#${this.reconnectAttempts}/${maxRetries}) in ${interval}ms`
    );
    this.options.onReconnectAttempt?.(this.reconnectAttempts);

    setTimeout(() => {
      if (!this.isClosed) {
        this.connect();
      }
    }, interval);
  }

  private startHeartbeat() {
    if (this.options.heartbeatInterval) {
      this.log("Starting heartbeat");
      this.heartbeatTimer = setInterval(() => {
        this.listeners.get("ping")?.({ timestamp: Date.now() });
      }, this.options.heartbeatInterval);
    }
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      this.log("Stopping heartbeat");
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private saveLastEventId(id: string) {
    try {
      localStorage.setItem(this.lastEventIdKey, id);
      this.log(`Saved lastEventId: ${id}`);
    } catch {}
  }

  private loadLastEventId(): string | undefined {
    try {
      const id = localStorage.getItem(this.lastEventIdKey) || undefined;
      if (id) this.log(`Loaded lastEventId: ${id}`);
      return id;
    } catch {
      return undefined;
    }
  }

  private log(message: string, data?: any) {
    if (this.options.enableLogging) {
      console.log(`[SSEClient] ${message}`, data || "");
    }
  }
}
