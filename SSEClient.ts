/**
 * Configuration options for the SSEClient.
 * @interface SSEOptions
 */
export interface SSEOptions {
  /** Optional custom headers to include in the SSE request */
  headers?: Record<string, string>;
  /** Whether to include credentials in CORS requests */
  withCredentials?: boolean;
  /** Callback function called when the connection is established */
  onOpen?: () => void;
  /** Callback function called when a connection error occurs */
  onError?: (err: Event) => void;
  /** Callback function called before each reconnection attempt */
  onReconnectAttempt?: (attempt: number) => void;
  /** Last received event ID for resuming the connection */
  lastEventId?: string;
  /** Interval in milliseconds for sending heartbeat pings */
  heartbeatInterval?: number;
  /** Base interval in milliseconds for reconnection attempts */
  reconnectInterval?: number;
  /** Whether to enable internal logging */
  enableLogging?: boolean;
  /** Maximum number of reconnection attempts before giving up */
  maxRetryAttempts?: number;
  /** Callback function called when max retry attempts are exceeded */
  onMaxRetriesExceeded?: () => void;
  /** Callback function called when the stream ends normally */
  onStreamEnd?: () => void;
}

/**
 * A robust Server-Sent Events (SSE) client implementation with automatic reconnection,
 * event tracking, and heartbeat support.
 * 
 * Features:
 * - Automatic reconnection with configurable exponential backoff
 * - Event ID tracking and resumption
 * - Customizable heartbeat mechanism
 * - Comprehensive error handling
 * - Support for custom headers and credentials
 * - Event listener management
 * - Configurable logging
 * - Maximum retry attempts with callback
 * 
 * @class SSEClient
 */
export class SSEClient {
  /** The EventSource instance for the SSE connection */
  private eventSource: EventSource | null = null;
  /** The target SSE URL */
  private url: string;
  /** Configuration options for the client */
  private options: SSEOptions;
  /** Registry of event listeners */
  private listeners: Map<string, (data: any) => void> = new Map();
  /** Current number of reconnection attempts */
  private reconnectAttempts: number = 0;
  /** Timer for heartbeat pings */
  private heartbeatTimer: any = null;
  /** Storage key for the last event ID */
  private lastEventIdKey: string;
  /** Whether the client has been manually closed */
  private isClosed: boolean = false;

  /**
   * Creates a new SSEClient instance.
   * @param {string} url - The SSE endpoint URL
   * @param {SSEOptions} [options={}] - Configuration options
   */
  constructor(url: string, options: SSEOptions = {}) {
    this.url = url;
    this.options = options;
    this.lastEventIdKey = `sse-last-event-id-${btoa(this.url)}`;
    this.options.lastEventId = this.options.lastEventId || this.loadLastEventId();
  }

  /**
   * Establishes the SSE connection. If the connection is lost, it will automatically
   * attempt to reconnect using an exponential backoff strategy with jitter.
   * 
   * The reconnection strategy:
   * 1. Base delay starts at the configured `reconnectInterval` (default: 3000ms)
   * 2. Each subsequent attempt doubles the delay (exponential backoff)
   * 3. A random jitter is added to prevent thundering herd problems
   * 4. Maximum delay is capped at 30 seconds
   * 5. After `maxRetryAttempts` (default: 10), the connection is permanently closed
   * 
   * @public
   */
  public connect() {
    this.isClosed = false;

    // Clean up any existing connection
    if (this.eventSource) {
      this.log('Cleaning up existing connection');
      this.eventSource.close();
      this.eventSource = null;
    }

    // Get the last event ID from storage
    const lastEventId = this.loadLastEventId();
    const urlWithParams = lastEventId
      ? `${this.url}${this.url.includes('?') ? '&' : '?'}lastEventId=${encodeURIComponent(lastEventId)}`
      : this.url;

    this.log(`Connecting to ${urlWithParams}${lastEventId ? ` (resuming from event ${lastEventId})` : ''}`);

    this.eventSource = new EventSource(urlWithParams, {
      withCredentials: this.options.withCredentials ?? false,
    });

    this.registerEventHandlers();
  }

  /**
   * Registers an event listener for a specific event type.
   * @param {string} event - The event type to listen for
   * @param {(data: any) => void} handler - The callback function to handle the event
   * @public
   */
  public on(event: string, handler: (data: any) => void) {
    this.log(`Registered listener for event: ${event}`);
    this.listeners.set(event, handler);
  }

  /**
   * Closes the SSE connection and stops any reconnection attempts.
   * @public
   */
  public close() {
    this.isClosed = true;
    if (this.eventSource) {
      this.log('Closing connection');
      this.eventSource.close();
      this.eventSource = null;
      this.stopHeartbeat();
    }
  }

  /**
   * Attempts to reconnect the SSE connection after max retries have been exceeded.
   * This will reset the reconnection attempts counter and re-establish the connection.
   * @public
   */
  public reconnect() {
    this.log('Attempting to reconnect after max retries exceeded');
    this.reconnectAttempts = 0; // Reset the counter
    this.isClosed = false; // Reset the closed state
    this.connect(); // Start a new connection
  }

  /**
   * Registers event handlers for the EventSource instance.
   * @private
   */
  private registerEventHandlers() {
    if (!this.eventSource) return;

    // Handle all events in the onmessage handler
    this.eventSource.onmessage = (event) => {
      this.log('Message received', event.data);
      
      // Store the last event ID
      if (event.lastEventId) {
        this.saveLastEventId(event.lastEventId);
      }

      const parsedData = this.safeJsonParse(event.data);
      
      // Get the event type from the event object
      const eventType = parsedData.event;
      console.log("eventType", eventType);
      
      // Call the appropriate handler based on event type
      const handler = this.listeners.get(eventType);
      if (handler) {
        console.log("calling handler for eventType", eventType);
        handler(parsedData);
      }
    };

    // Handle connection opened
    this.eventSource.onopen = () => {
      this.reconnectAttempts = 0;
      this.log('Connection opened');
      this.options.onOpen?.();
      this.startHeartbeat();
    };

    // Handle connection errors
    this.eventSource.onerror = (err) => {
      this.log('Connection error', err);
      this.options.onError?.(err);
      this.stopHeartbeat();
      
      // Check if the connection was closed by the server (readyState 2)
      // if (this.eventSource?.readyState === EventSource.CLOSED) {
      //   this.log('Stream ended normally');
      //   this.options.onStreamEnd?.();
      //   return;
      // }
      
      if (!this.retryLimitExceeded()) {
        this.tryReconnect();
      }
    };
  }

  /**
   * Safely parses JSON data, returning the original string if parsing fails.
   * @param {string} data - The JSON string to parse
   * @returns {any} The parsed data or original string
   * @private
   */
  private safeJsonParse(data: any): any {
    try {
      return JSON.parse(data);
    } catch (e) {
      return data;
    }
  }

  private retryLimitExceeded() {
    return this.reconnectAttempts >= (this.options?.maxRetryAttempts ?? 10);
  }

  /**
   * Attempts to reconnect using an exponential backoff strategy with jitter.
   * @private
   */
  private tryReconnect() { 
    if (this.isClosed) {
      this.log('Reconnection cancelled - client is closed');
      return;
    }

    const maxRetries = this.options.maxRetryAttempts ?? 10;
    if (this.reconnectAttempts >= maxRetries) {
      this.log(`Max retry attempts (${maxRetries}) exceeded, stopping reconnection`);
      this.options.onMaxRetriesExceeded?.();
      this.stopHeartbeat();
      return;
    }

    this.reconnectAttempts++;
    const base = this.options.reconnectInterval || 3000;
    const maxDelay = 30000;
    const expDelay = Math.min(base * Math.pow(2, this.reconnectAttempts - 1), maxDelay);
    const jitter = Math.random() * expDelay;
    const delay = Math.floor(jitter);

    this.log(`Attempting to reconnect (#${this.reconnectAttempts}/${maxRetries}) in ${delay}ms`);
    this.options.onReconnectAttempt?.(this.reconnectAttempts);

    setTimeout(() => {
      if (!this.isClosed) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Starts the heartbeat mechanism if configured.
   * @private
   */
  private startHeartbeat() {
    if (this.options.heartbeatInterval) {
      this.log('Starting heartbeat');
      this.heartbeatTimer = setInterval(() => {
        this.listeners.get('ping')?.({ timestamp: Date.now() });
      }, this.options.heartbeatInterval);
    }
  }

  /**
   * Stops the heartbeat mechanism.
   * @private
   */
  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      this.log('Stopping heartbeat');
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Saves the last event ID to localStorage.
   * @param {string} id - The event ID to save
   * @private
   */
  private saveLastEventId(id: string) {
    try {
      localStorage.setItem(this.lastEventIdKey, id);
      this.log(`Saved lastEventId: ${id}`);
    } catch {}
  }

  /**
   * Loads the last event ID from localStorage.
   * @returns {string | undefined} The last event ID or undefined if not found
   * @private
   */
  private loadLastEventId(): string | undefined {
    try {
      const id = localStorage.getItem(this.lastEventIdKey) || undefined;
      if (id) this.log(`Loaded lastEventId: ${id}`);
      return id;
    } catch {
      return undefined;
    }
  }

  /**
   * Logs a message if logging is enabled.
   * @param {string} message - The message to log
   * @param {any} [data] - Optional data to log
   * @private
   */
  private log(message: string, data?: any) {
    if (this.options.enableLogging) {
      console.log(`[SSEClient] ${message}`, data || '');
    }
  }
}
