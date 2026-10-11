import { beforeEach, describe, expect, it } from 'vitest';
import { database } from '../db.js';
import { createCaptcha, peekCaptchaAnswer, verifyCaptcha } from './captcha.js';

beforeEach(async () => {
  await database.exec('DELETE FROM captcha_challenges');
});

describe('CAPTCHA challenges', () => {
  it('can be spent only once, even by two checks at the same moment', async () => {
    const now = Date.now();
    const { token } = await createCaptcha(now);
    const answer = (await peekCaptchaAnswer(token))!;

    // Both start before either finishes, as on two instances at once.
    const results = await Promise.all([
      verifyCaptcha(token, answer, now),
      verifyCaptcha(token, answer, now),
    ]);
    expect(results.sort()).toEqual([false, true]);
  });

  it('is spent by a wrong answer too, so guesses need a new image each time', async () => {
    const now = Date.now();
    const { token } = await createCaptcha(now);
    const answer = (await peekCaptchaAnswer(token))!;
    expect(await verifyCaptcha(token, 'wrong', now)).toBe(false);
    expect(await verifyCaptcha(token, answer, now)).toBe(false);
  });

  it('expires after five minutes', async () => {
    const now = Date.now();
    const { token } = await createCaptcha(now);
    const answer = (await peekCaptchaAnswer(token))!;
    expect(await verifyCaptcha(token, answer, now + 5 * 60 * 1000 + 1)).toBe(false);
  });

  it('accepts the answer in any letter case, with stray spaces', async () => {
    const now = Date.now();
    const { token } = await createCaptcha(now);
    const answer = (await peekCaptchaAnswer(token))!;
    expect(await verifyCaptcha(token, ` ${answer.toUpperCase()} `, now)).toBe(true);
  });

  it('clears out challenges nobody answered in time', async () => {
    const start = Date.now();
    await createCaptcha(start);
    await createCaptcha(start + 5 * 60 * 1000 + 1); // the first has expired by now
    expect(await database.get('SELECT COUNT(*) AS n FROM captcha_challenges')).toEqual({ n: 1 });
  });
});
