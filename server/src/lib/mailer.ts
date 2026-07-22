import { env } from '../env.js';

/**
 * Outbound email, currently only used for password resets.
 *
 * Delivery goes through Resend's HTTP API rather than SMTP: no extra
 * dependency, and nothing to configure beyond one key. When no key is set the
 * message is written to the server log instead of being sent, so a fresh clone
 * can exercise the whole reset flow without signing up for anything. That
 * fallback is deliberately *not* available in production — a silently
 * unsent reset email there would look like a working feature while leaving
 * users stranded.
 */

export type Delivery = 'email' | 'console';

export class MailError extends Error {}

interface Message {
  to: string;
  subject: string;
  text: string;
}

/**
 * Test helper: the last message handed to `send`. Only ever populated under
 * NODE_ENV=test — a reset link is a live credential, and holding one in memory
 * on a real server would be a needless place for it to leak from.
 */
let lastMessage: (Message & { delivery: Delivery }) | null = null;

export function peekLastEmail(): (Message & { delivery: Delivery }) | null {
  return lastMessage;
}

function record(message: Message, delivery: Delivery): Delivery {
  if (env.NODE_ENV === 'test') lastMessage = { ...message, delivery };
  return delivery;
}

async function send(message: Message): Promise<Delivery> {
  if (!env.mailEnabled) {
    if (env.NODE_ENV === 'production') {
      throw new MailError('Email is not configured on this server.');
    }
    // Dev fallback: the operator reads the link out of the console.
    console.info(
      `\n────────── EMAIL (not sent — no RESEND_API_KEY) ──────────\n` +
        `To:      ${message.to}\n` +
        `Subject: ${message.subject}\n\n` +
        `${message.text}\n` +
        `──────────────────────────────────────────────────────────\n`,
    );
    return record(message, 'console');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
  });

  if (!res.ok) {
    // The provider's response can quote the key back in an error; never let
    // that reach a caller that might surface it.
    const detail = await res.text().catch(() => '');
    throw new MailError(`Email provider rejected the message (HTTP ${res.status}). ${detail.slice(0, 200)}`);
  }
  return record(message, 'email');
}

/**
 * The reset link is the secret — it is not stored anywhere in recoverable form,
 * so this is the only time it exists outside the user's inbox.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string, minutes: number): Promise<Delivery> {
  return send({
    to,
    subject: 'Reset your Lumina Study password',
    text:
      `Someone asked to reset the password for this Lumina Study account.\n\n` +
      `Open this link to choose a new one:\n${resetUrl}\n\n` +
      `The link works once and expires in ${minutes} minutes.\n\n` +
      `If this wasn't you, ignore this email — your password stays as it is.`,
  });
}
