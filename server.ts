import express from 'express';
import cors from 'cors';
import { SSEServer } from './SSEServer';

const app = express();
const PORT = 3001;

// Enable CORS
app.use(cors());

// Create and configure the SSE server
const sseServer = new SSEServer({
  maxHistorySize: 1000
});

// Example middleware function
const logRequest = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
};

// Example async event generator
async function* generateEvents() {
  for (let i = 0; i < 5; i++) {
    yield { 
      event: 'message', 
      data: { 
        time: new Date().toISOString(),
        message: `Event #${i + 1}` 
      } 
    };
    await new Promise(resolve => setTimeout(resolve, 1000));
  }


  yield {
    event: 'test',
    data: {
      time: new Date().toISOString(),
      message: 'test event'
    }
  };
  // Send an end event to signal stream completion
  console.log("sending last event...")
  yield {
    event: 'end',
    data: {
      time: new Date().toISOString(),
      message: 'Stream complete'
    }
  };
}

// Controller for SSE endpoint
async function sseController(req: express.Request, res: express.Response) {
  try {
    // Stream events to this specific client
    await sseServer.streamToClient(req, res, generateEvents(), ['message', 'end', 'test']);
  } catch (error) {
    console.error('Error in SSE controller:', error);
    res.status(500).end();
  }
}

// Attach the controller to the SSE endpoint
app.get('/events', logRequest, sseController);

// Start the server
app.listen(PORT, () => {
  console.log(`SSE server running on http://localhost:${PORT}`);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('Stopping server...');
  process.exit(0);
}); 