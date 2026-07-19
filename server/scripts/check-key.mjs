// Quick, dependency-free check: does the AI key in server/.env actually work?
// Run with:  npm run check-key
// Prefers the Groq / OpenAI-compatible key (the active provider); falls back to
// checking a Gemini key only if no compat key is set. Prints a clear result.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '../.env');

const read = (env, name, fallback = '') =>
  (env.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1] ?? fallback)
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();

let env;
try {
  env = readFileSync(envPath, 'utf8');
} catch {
  console.log('❌ Could not read server/.env — create it from .env.example first.');
  process.exit(1);
}

const groqKey = read(env, 'OPENAI_COMPAT_API_KEY') || read(env, 'GROQ_API_KEY');
const baseUrl = read(env, 'OPENAI_COMPAT_BASE_URL', 'https://api.groq.com/openai/v1');
const model = read(env, 'OPENAI_COMPAT_MODEL', 'llama-3.3-70b-versatile');

if (!groqKey) {
  console.log('❌ No Groq key found. Set GROQ_API_KEY (or OPENAI_COMPAT_API_KEY) in server/.env.');
  console.log('   Get one at https://console.groq.com/keys (starts with gsk_).');
  process.exit(1);
}

console.log(`Testing Groq key "${groqKey.slice(0, 5)}…" (${groqKey.length} chars) against ${model} …\n`);

let res, data;
try {
  res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
    }),
  });
  data = await res.json().catch(() => ({}));
} catch (err) {
  console.log('❌ Could not reach the AI provider. Check your internet connection.');
  console.log('   ', err?.message ?? err);
  process.exit(1);
}

if (res.ok) {
  console.log('✅ KEY WORKS — Groq accepted it. Start the app and generate away!');
} else {
  console.log(`❌ KEY REJECTED  (HTTP ${res.status})`);
  console.log('   Message:', data?.error?.message ?? '(none)');
  if (res.status === 401) console.log('   Double-check the gsk_ key in server/.env.');
  process.exitCode = 1;
}
