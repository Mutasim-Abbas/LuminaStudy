import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';
import { requestForLog } from './logging.js';

function request(url: string): FastifyRequest {
  return {
    method: 'GET',
    url,
    host: 'lumina.example',
    ip: '203.0.113.7',
    socket: { remotePort: 51234 },
  } as unknown as FastifyRequest;
}

describe('requestForLog', () => {
  it('keeps the path but drops a query string carrying a one-time code', () => {
    const logged = requestForLog(request('/api/auth/google/callback?code=4/0AY-secret&state=abc'));
    expect(logged).toEqual({
      method: 'GET',
      url: '/api/auth/google/callback',
      host: 'lumina.example',
      remoteAddress: '203.0.113.7',
      remotePort: 51234,
    });
    expect(JSON.stringify(logged)).not.toContain('secret');
  });

  it('leaves a plain path as it is', () => {
    expect(requestForLog(request('/api/health')).url).toBe('/api/health');
  });
});
