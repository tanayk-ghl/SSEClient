import { Request, Response } from 'express';

export interface SSEEvent {
    event: string;
    data: any;
    id?: number;
}
  
export interface SSEServerOptions {
    maxHistorySize?: number;
}
  
export class SSEServer {
    private eventHistory: Map<number, SSEEvent> = new Map();
    private globalCounter: number = 0;
    private options: Required<SSEServerOptions>;
  
    constructor(options: SSEServerOptions = {}) {
      this.options = {
        maxHistorySize: options.maxHistorySize ?? 1000,
      };
    }
  
    /**
     * Streams events to a single client (used in controller)
     */
    public async streamToClient(
      req: Request,
      res: Response,
      eventIterator: AsyncIterable<any>,
      allowedEvents: string[] = ['message', 'end', 'test']
    ): Promise<void> {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-transform, no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Cache-Control, Connection');
      res.flushHeaders?.();
  
      // Optionally: handle missed events if you want to support last-event-id
      const lastEventId = req.headers['last-event-id'] || req.query.lastEventId;
      if (lastEventId) {
        const lastId = parseInt(lastEventId as string);
        const missedEvents = this.getMissedEvents(lastId);
        for (const event of missedEvents) {
          this.sendEventToClient(res, event);
        }
      }
  
      try {
        for await (const event of eventIterator) {
          console.log('Received event:', event);
          console.log('Event type:', event.event);
          console.log('Allowed events:', allowedEvents);
          
          if (allowedEvents.includes(event.event)) {
            console.log('Event is allowed, processing...');
            const sseEvent = this.sendEvent({ event: event.event, data: event });
            this.sendEventToClient(res, sseEvent);
            
            // If this is the end event, close the connection
            if (event.event === 'end') {
              console.log('End event detected, closing connection');
              res.end();
              return;
            }
          } else {
            console.log('Event type not allowed:', event.event);
			res.end();
			return;
          }
        }
      } catch (error) {
        console.error('Error in streamToClient:', error);
        res.end();
        return;
      }
      res.end();
    }
  
    /**
     * Store event in history and assign an ID
     */
    private sendEvent(event: SSEEvent): SSEEvent {
      this.globalCounter++;
      const eventWithId: SSEEvent = {
        ...event,
        id: this.globalCounter,
      };
      this.eventHistory.set(this.globalCounter, eventWithId);
  
      // Clean up old events
      if (this.eventHistory.size > this.options.maxHistorySize) {
        const oldestKey = Math.min(...this.eventHistory.keys());
        this.eventHistory.delete(oldestKey);
      }
      return eventWithId;
    }
  
    /**
     * Get missed events for catch-up
     */
    private getMissedEvents(lastEventId: number): SSEEvent[] {
      const missedEvents: SSEEvent[] = [];
      if (lastEventId < this.globalCounter) {
        for (let i = lastEventId + 1; i <= this.globalCounter; i++) {
          const event = this.eventHistory.get(i);
          if (event) {
            missedEvents.push(event);
          }
        }
      }
      return missedEvents;
    }
  
    /**
     * Write an event to the response
     */
    private sendEventToClient(res: Response, event: SSEEvent): void {
      res.write(`id: ${event.id}\n`);
      res.write(`data: ${JSON.stringify(event.data)}\n\n`);
    }
} 