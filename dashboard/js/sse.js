/**
 * SSEClient — connects to /api/events and dispatches events to handlers
 */
const SSEClient = (() => {
  let source   = null;
  let handlers = {};

  const ALL_EVENTS = [
    'connected',
    'coordinator:initialized', 'coordinator:stopped',
    'agent:initialized', 'agent:thinking', 'agent:result', 'agent:stopped',
    'round:started', 'round:complete',
    'stats:update', 'loop:started', 'session:complete'
  ];

  function connect(url = '/api/events') {
    if (source) source.close();

    source = new EventSource(url);

    ALL_EVENTS.forEach(event => {
      source.addEventListener(event, e => {
        try {
          const data = JSON.parse(e.data);
          handlers[event]?.(data);
        } catch (err) {
          console.warn('[SSE] Failed to parse event:', event, err);
        }
      });
    });

    source.onerror = err => {
      handlers['error']?.(err);
      // Auto-reconnect if connection drops
      if (source.readyState === EventSource.CLOSED) {
        setTimeout(() => connect(url), 3000);
      }
    };
  }

  function on(event, fn) {
    handlers[event] = fn;
    return SSEClient; // chainable
  }

  function off(event) {
    delete handlers[event];
    return SSEClient;
  }

  function disconnect() {
    if (source) { source.close(); source = null; }
  }

  return { connect, on, off, disconnect };
})();
