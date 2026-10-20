import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createAuthRequest, GOOGLE_AUTH_URL } from './google.js';

const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const REDIRECT = 'https://lumina.example/api/auth/google/callback';

describe('createAuthRequest', () => {
  it('sends the browser to Google with state, nonce and a PKCE challenge', () => {
    const req = createAuthRequest(CLIENT_ID, REDIRECT);
    const url = new URL(req.url);
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTH_URL);

    const q = url.searchParams;
    expect(q.get('client_id')).toBe(CLIENT_ID);
    expect(q.get('redirect_uri')).toBe(REDIRECT);
    expect(q.get('response_type')).toBe('code');
    expect(q.get('scope')).toBe('openid email profile');
    expect(q.get('state')).toBe(req.state);
    expect(q.get('nonce')).toBe(req.nonce);
    expect(q.get('code_challenge_method')).toBe('S256');
    // Google gets the hash; the verifier itself never leaves the server.
    expect(q.get('code_challenge')).toBe(
      createHash('sha256').update(req.codeVerifier).digest('base64url'),
    );
    expect(req.url).not.toContain(req.codeVerifier);
  });

  it('uses fresh random values every time', () => {
    const a = createAuthRequest(CLIENT_ID, REDIRECT);
    const b = createAuthRequest(CLIENT_ID, REDIRECT);
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    // 32 random bytes each: long enough that guessing is not an attack.
    expect(a.state.length).toBeGreaterThanOrEqual(43);
  });
});
