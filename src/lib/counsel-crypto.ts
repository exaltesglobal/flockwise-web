// Counselling notes are encrypted here, in the pastor's browser, with a key made from their
// passphrase (PBKDF2-SHA256, then AES-GCM). The passphrase and the key never leave the browser; the
// server keeps only the salt, a check value and ciphertext.
const CHECK = 'flockwise-counsel-v1';
const ROUNDS = 310_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ROUNDS }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function seal(key: CryptoKey, value: unknown): Promise<{ iv: string; data: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
  return { iv: toB64(iv), data: toB64(data) };
}

export async function unseal<T>(key: CryptoKey, iv: string, data: string): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) as BufferSource }, key, fromB64(data) as BufferSource);
  return JSON.parse(dec.decode(plain)) as T;
}

/** A new passphrase: the key to use now, and what the server keeps to check it next time. */
export async function newPassphrase(passphrase: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await derive(passphrase, salt);
  const { iv, data } = await seal(key, CHECK);
  return { key, salt: toB64(salt), iv, check: data };
}

/** The key for this passphrase, or null if it is not the right one. */
export async function unlock(passphrase: string, saved: { salt: string; iv: string; check: string }): Promise<CryptoKey | null> {
  const key = await derive(passphrase, fromB64(saved.salt));
  try {
    return (await unseal<string>(key, saved.iv, saved.check)) === CHECK ? key : null;
  } catch {
    return null;
  }
}
