import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock matchMedia for components that use media queries
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock WebSocket
class MockWebSocket {
  readyState = WebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: Event) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
}

Object.defineProperty(window, 'WebSocket', {
  writable: true,
  value: MockWebSocket,
});

// Mock crypto.randomUUID
Object.defineProperty(crypto, 'randomUUID', {
  writable: true,
  value: () => 'test-uuid-' + Math.random().toString(36).substring(2, 9),
});
