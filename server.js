// server.js
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());

app.get('/events', (req, res) => {
  console.log('New client connected to SSE stream');
  let counter = 0;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const interval = setInterval(() => {
    counter++;
    const event = {
      event: 'message',
      time: new Date().toISOString(),
      counter,
    };

    console.log(`Sending event #${counter} at ${event.time}`);
    res.write(`id: ${counter}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }, 2000);

  req.on('close', () => {
    console.log('Client disconnected from SSE stream');
    clearInterval(interval);
    res.end();
  });
});

app.listen(PORT, () => console.log(`SSE server running on http://localhost:${PORT}`));
