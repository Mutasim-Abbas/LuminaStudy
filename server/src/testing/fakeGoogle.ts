import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { GOOGLE_JWKS_URL, GOOGLE_TOKEN_URL } from '../lib/google.js';

/**
 * A stand-in for Google's endpoints, for tests only. It signs ID tokens with
 * a real RSA key and publishes the matching public key, so verification runs
 * exactly as it does against Google — signature included.
 */
export function fakeGoogle(clientId: string) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'test-key-1';
  const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' }] };

  /** An ID token as Google would issue it; any claim can be overridden. */
  function idToken(
    claims: Record<string, unknown> = {},
    opts: { key?: KeyObject; kid?: string } = {},
  ): string {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      {
        iss: 'https://accounts.google.com',
        aud: clientId,
        sub: 'google-sub-1',
        email: 'grace@example.com',
        email_verified: true,
        name: 'Grace Hopper',
        iat: now,
        exp: now + 3600,
        ...claims,
      },
      opts.key ?? privateKey,
      { algorithm: 'RS256', keyid: opts.kid ?? kid },
    );
  }

  /** A fetch that answers the key and token endpoints like Google does. */
  function fetchImpl(tokenResponse: () => Response = () => Response.json({ id_token: idToken() })) {
    return async (input: string | URL | Request): Promise<Response> => {
      const url = String(input);
      if (url === GOOGLE_JWKS_URL) {
        return Response.json(jwks, { headers: { 'cache-control': 'public, max-age=3600' } });
      }
      if (url === GOOGLE_TOKEN_URL) return tokenResponse();
      throw new Error(`unexpected request to ${url}`);
    };
  }

  return { idToken, fetchImpl, kid };
}
