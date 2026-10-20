import type { FastifyRequest } from 'fastify';

/**
 * How each request appears in the logs. Fastify's default logs the full URL,
 * query string included — and some query strings carry one-time credentials:
 * Google sends its authorization code back as `?code=…&state=…`. Logs are
 * kept and read far more widely than requests, so only the path is recorded.
 */
export function requestForLog(request: FastifyRequest) {
  return {
    method: request.method,
    url: request.url.split('?')[0],
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket?.remotePort,
  };
}
