# SSEClient Documentation

A robust TypeScript implementation of a Server-Sent Events (SSE) client and server with auto-reconnect, heartbeat handling, event ID persistence, and logging capabilities.

## Features

### 🔄 Automatic Reconnection with Exponential Backoff
Essential for maintaining reliable real-time connections in unreliable network conditions. The exponential backoff strategy prevents overwhelming servers during outages by gradually increasing retry intervals, while also helping distribute reconnection attempts from multiple clients over time. This is crucial for applications requiring consistent data streams, as it handles network interruptions gracefully without developer intervention.

### 💓 Heartbeat Mechanism
Critical for early detection of connection issues and preventing timeout disconnections, especially with proxy servers or load balancers. The heartbeat system actively monitors connection health by sending periodic ping events, allowing both client and server to verify the connection is alive. This proactive monitoring helps maintain long-lived connections and enables quick recovery from "silent failures" where the connection appears alive but is actually stale.

### 📝 Event ID Persistence
Ensures message delivery reliability by maintaining the last processed event ID across sessions. This feature is vital for applications where missing events is not acceptable (e.g., financial transactions, critical updates). By persisting the last event ID in localStorage, the client can request missed events after reconnection, preventing data loss during network interruptions or browser refreshes.

### 📊 Comprehensive Logging System
Invaluable for debugging and monitoring SSE connections in production environments. The logging system provides detailed insights into connection lifecycle events, message flow, and error conditions. This visibility is crucial for developers to understand connection behavior, troubleshoot issues, and monitor application health in real-world deployments.

### 🔐 CORS Credentials Support
Essential for secure cross-origin communications, particularly in distributed systems where the event source is on a different domain. This feature enables authenticated SSE connections, allowing the client to maintain session cookies and authorization headers. Critical for applications requiring secure, authenticated real-time updates.

### 🎯 Custom Event Handling
Provides flexibility in handling different types of server events through a simple yet powerful event registration system. This feature allows applications to organize and process different types of real-time updates independently, making it easier to maintain clean, modular code while handling various real-time data streams.

### 🔍 Error Handling and Connection Monitoring
Robust error handling and connection monitoring are fundamental for production-ready applications. This feature provides comprehensive error detection, reporting, and recovery mechanisms, ensuring that applications can gracefully handle and recover from various failure scenarios while keeping developers informed of connection health.

## Installation

```bash
npm install
```

## API Reference

### SSEClient

#### `SSEOptions` Interface

Configuration options for the SSE client.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `headers` | `Record<string, string>` | `undefined` | Custom headers for the SSE connection |
| `withCredentials` | `boolean` | `false` | Enable CORS credentials |
| `onOpen` | `() => void` | `undefined` | Callback when connection opens |
| `onError` | `(err: Event) => void` | `undefined` | Callback on connection error |
| `onReconnectAttempt` | `(attempt: number) => void` | `undefined` | Callback on reconnection attempts |
| `lastEventId` | `string` | `undefined` | Last received event ID for resuming |
| `heartbeatInterval` | `number` | `undefined` | Interval for heartbeat pings (ms) |
| `reconnectInterval` | `number` | `3000` | Base reconnect interval (ms) |
| `enableLogging` | `boolean` | `false` | Enable internal logging |

#### Methods

##### `constructor(url: string, options?: SSEOptions)`
Creates a new SSE client instance.
```typescript
const client = new SSEClient('http://api.example.com/events', {
    enableLogging: true
});
```

##### `connect(): void`
Establishes the SSE connection.
```typescript
client.connect();
```

##### `on(event: string, handler: (data: any) => void): void`
Registers an event listener.
```typescript
client.on('message', (data) => {
    console.log(data);
});
```

##### `close(): void`
Closes the SSE connection and stops reconnection attempts.
```typescript
client.close();
```

### SSEServer

#### `SSEServerOptions` Interface

Configuration options for the SSE server.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxHistorySize` | `number` | `1000` | Maximum number of events to keep in history |

#### Methods

##### `constructor(options: SSEServerOptions = {})`
Creates a new SSE server instance.
```typescript
const server = new SSEServer({ maxHistorySize: 1000 });
```

##### `streamToClient(req: Request, res: Response, eventIterator: AsyncIterable<any>, allowedEvents: string[] = ['message', 'end', 'test']): Promise<void>`
Streams events to a client connection.
```typescript
await server.streamToClient(req, res, generateEvents(), ['message', 'custom']);
```

## Usage Examples

### Basic Client Implementation

```typescript
const client = new SSEClient('http://your-sse-endpoint.com/events', {
    enableLogging: true,
    reconnectInterval: 2000,
    heartbeatInterval: 15000
});

client.on('message', (data) => {
    console.log('Received message:', data);
});

client.connect();
```

### Advanced Client Implementation

```typescript
const client = new SSEClient('http://your-sse-endpoint.com/events', {
    enableLogging: true,
    reconnectInterval: 2000,
    heartbeatInterval: 15000,
    withCredentials: true,
    onOpen: () => console.log('Connected!'),
    onError: (err) => console.error('Connection error:', err),
    onReconnectAttempt: (attempt) => console.log(`Reconnection attempt #${attempt}`)
});

// Handle default messages
client.on('message', (data) => {
    console.log('Received message:', data);
});

// Handle custom events
client.on('userUpdate', (data) => {
    console.log('User updated:', data);
});

// Handle heartbeat
client.on('ping', (data) => {
    console.log('Heartbeat received:', data.timestamp);
});

client.connect();
```

### Server Implementation

```typescript
import express from 'express';
import cors from 'cors';
import { SSEServer } from './SSEServer';

const app = express();
const PORT = 3001;

app.use(cors());

// Create SSE server instance
const sseServer = new SSEServer({ maxHistorySize: 1000 });

// Logging middleware
const logRequest = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
};

// Example event generator
async function* generateEvents() {
    for (let i = 0; i < 5; i++) {
        yield { event: 'message', data: { msg: `Event #${i + 1}` } };
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
}

// SSE endpoint handler
app.get('/events', logRequest, async (req, res) => {
    await sseServer.streamToClient(req, res, generateEvents(), ['message']);
});

app.listen(PORT, () => {
    console.log(`SSE server running on http://localhost:${PORT}`);
});
```

## Running the Demo

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build the Project**
   ```bash
   npm run build  
   ```

3. **Start the Server**
   ```bash
   npm run dev
   ```

4. **Serve the Client**
   - Use any static file server to serve the client files
   - For example, using Python's built-in server:
     ```bash
     python -m http.server 8000
     ```
   - Or using Node's `http-server`:
     ```bash
     npx http-server
     ```

5. **Access the Demo**
   - Start the client.html file using the [Live Server VS Code extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer)
   - Click "Start Stream" to begin receiving events
   - Click "Stop Stream" to end the connection
   - Watch the console for detailed logs

## Best Practices

1. **Always implement error handling:**
```typescript
client.on('error', (error) => {
    console.error('SSE Error:', error);
});
```

2. **Use heartbeat for connection monitoring:**
```typescript
const options = {
    heartbeatInterval: 15000,  // 15 seconds
};
```

3. **Implement reconnection feedback:**
```typescript
const options = {
    onReconnectAttempt: (attempt) => {
        console.log(`Reconnecting... Attempt ${attempt}`);
    }
};
```

4. **Clean up resources:**
```typescript
// When done with the connection
client.close();
```

## Browser Compatibility

Works with browsers that support:
- EventSource API
- localStorage
- Promise
- Map
- ES2015+ features
