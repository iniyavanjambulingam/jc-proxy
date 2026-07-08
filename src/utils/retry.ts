const RETRYABLE_STATUSES = [429, 500, 502, 503, 504];

export function isRetryable(status: number): boolean {
  return RETRYABLE_STATUSES.includes(status);
}
