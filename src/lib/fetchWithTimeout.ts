export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface FetchJsonOptions extends RequestInit {
  /** Abort the request after this many ms. Default 8s. */
  timeoutMs?: number;
  /** Number of retry attempts after the first try. Default 2. */
  retries?: number;
}

/**
 * fetch() wrapper with a request timeout (AbortController), bounded
 * exponential-backoff retries for transient/network failures, and no
 * retries on 4xx client errors (retrying a bad request just wastes time
 * and hammers the backend for no benefit).
 */
export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { timeoutMs = 8000, retries = 2, ...init } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        throw new ApiError(`Request failed with status ${res.status}`, res.status);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;

      const isClientError = err instanceof ApiError && !!err.status && err.status < 500;
      const isLastAttempt = attempt === retries;
      if (isClientError || isLastAttempt) break;

      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 300));
    }
  }

  if (lastError instanceof DOMException && lastError.name === 'AbortError') {
    throw new ApiError('Request timed out — check the backend URL in Settings.');
  }
  throw lastError instanceof Error ? lastError : new ApiError('Unknown network error');
}
