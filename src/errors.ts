export type ErrorCode = 'INVALID_INPUT' | 'AUTH_REQUIRED' | 'ACCESS_DENIED' | 'RATE_LIMITED' |
  'UPSTREAM_BLOCKED' | 'UPSTREAM_TIMEOUT' | 'UPSTREAM_ERROR' | 'PARSE_ERROR' |
  'NOT_FOUND' | 'UNSUPPORTED' | 'NOT_CONFIGURED' | 'UNAUTHORIZED' | 'INTERNAL_ERROR';
export class CorpixError extends Error {
  constructor(public code: ErrorCode, message: string, public statusCode = 502) { super(message); }
}
export function fail(code: ErrorCode, message: string, status = 502): never {
  throw new CorpixError(code, message, status);
}
