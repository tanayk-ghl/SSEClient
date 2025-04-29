# SSEClient Documentation

A robust TypeScript implementation of a Server-Sent Events (SSE) client with auto-reconnect, heartbeat handling, event ID persistence, and logging capabilities.

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

```typescript
// Import the SSEClient and its options interface
import { SSEClient, SSEOptions } from './SSEClient';
```

## Usage

### Basic Implementation

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

### Advanced Implementation

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

// Later, to stop the connection:
client.close();
```

## API Reference

### `SSEOptions` Interface

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

### `SSEClient` Class Methods

#### `constructor(url: string, options?: SSEOptions)`
Creates a new SSE client instance.
```typescript
const client = new SSEClient('http://api.example.com/events', {
    enableLogging: true
});
```

#### `connect(): void`
Establishes the SSE connection.
```typescript
client.connect();
```

#### `on(event: string, handler: (data: any) => void): void`
Registers an event listener.
```typescript
client.on('message', (data) => {
    console.log(data);
});
```

#### `close(): void`
Closes the SSE connection and stops reconnection attempts.
```typescript
client.close();
```

## Internal Features

### Automatic Reconnection
- Implements exponential backoff strategy
- Reconnection interval = `reconnectInterval * attemptNumber`
- Maintains reconnection count
- Can be cancelled via `close()`

### Event ID Persistence
- Automatically stores last event ID in localStorage
- Uses base64 encoded URL as storage key
- Resumes connection from last known event

### Heartbeat Mechanism
- Sends periodic ping events at specified interval
- Helps maintain connection health
- Automatically managed with connection lifecycle

### Logging System
- Comprehensive debug logging when enabled
- Logs connection events, messages, and errors
- Configurable via `enableLogging` option

## Error Handling

The client handles various error scenarios:
- Connection failures
- JSON parsing errors
- localStorage access errors
- Event source errors

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

## Demo Implementation

This repository includes a complete demo showing how to implement the SSEClient with a basic server and web client.

### Server Implementation (server.js)

A simple Express server that demonstrates SSE endpoint implementation:

```javascript
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());

app.get('/events', (req, res) => {
    // Set SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ message: 'Connected to event stream' })}\n\n`);

    // Send periodic updates
    const intervalId = setInterval(() => {
        const data = {
            timestamp: new Date().toISOString(),
            value: Math.random()
        };
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    }, 3000);

    // Clean up on client disconnect
    req.on('close', () => {
        clearInterval(intervalId);
    });
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`SSE Demo server running on port ${PORT}`);
});
```

### Client Implementation (client.html)

A demo webpage that shows how to use the SSEClient in the browser:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>SSEClient Demo</title>
    <style>
        body { font-family: sans-serif; padding: 2rem; }
        #events { margin-top: 1rem; }
    </style>
</head>
<body>
    <h1>SSE Event Stream</h1>
    <button id="start">Start Stream</button>
    <button id="stop">Stop Stream</button>
    <div id="events"></div>

    <script type="module">
        import { SSEClient } from './SSEClient.js';

        const log = (msg) => {
            const div = document.getElementById('events');
            const p = document.createElement('p');
            p.textContent = msg;
            div.appendChild(p);
        };

        let sseClient = null;

        document.getElementById('start').onclick = () => {
            sseClient = new SSEClient('http://localhost:3001/events', {
                enableLogging: true,
                reconnectInterval: 2000,
                heartbeatInterval: 15000,
                onOpen: () => log('✔ Connected'),
                onError: () => log('❌ Error occurred'),
                onReconnectAttempt: (n) => log(`🔁 Reconnecting (#${n})`)
            });

            sseClient.on('message', (data) => {
                log(`📥 Event: ${JSON.stringify(data)}`);
            });

            sseClient.on('ping', () => {
                log(`🫀 Heartbeat received`);
            });

            sseClient.connect();
        };

        document.getElementById('stop').onclick = () => {
            if (sseClient) {
                sseClient.close();
                log('⛔ Stream stopped');
            }
        };
    </script>
</body>
</html>
```

### Running the Demo

1. **Install Dependencies**
   ```bash
   npm install express cors
   ```

2. **Start the Server**
   ```bash
   node server.js
   ```

3. **Serve the Client**
   - Use any static file server to serve the client files
   - For example, using Python's built-in server:
     ```bash
     python -m http.server 8000
     ```
   - Or using Node's `http-server`:
     ```bash
     npx http-server
     ```

4. **Access the Demo**
   - Open your browser and navigate to `http://localhost:8000/client.html`
   - Click "Start Stream" to begin receiving events
   - Click "Stop Stream" to end the connection
   - Watch the console for detailed logs
