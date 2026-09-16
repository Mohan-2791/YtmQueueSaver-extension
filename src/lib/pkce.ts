/**
 * PKCE (RFC 7636) helper functions for the OAuth Authorization Code flow.
 *
 * PKCE lets a public client — this extension, which has no client secret
 * and can't safely keep one — prove that the app which started the
 * authorization request is the same app redeeming the resulting code,
 * without a shared secret. This is what makes it safe to move off the
 * implicit flow (`response_type=token`), which handed a usable access
 * token straight back in a browser-visible URL fragment.
 *
 * Both functions run in the background service worker, which has access
 * to the Web Crypto API (`crypto.getRandomValues`, `crypto.subtle`) the
 * same way a normal page does.
 */

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  // btoa() produces standard base64; PKCE requires the URL-safe variant
  // with no padding (RFC 7636 §4.2).
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A high-entropy, single-use secret this extension keeps in memory only. */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/** The value sent up-front; Google can check the eventual verifier against it without ever seeing the verifier itself until the token exchange. */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}
