import { HttpErrorResponse } from '@angular/common/http';

/** The reason the backend gave for refusing a request, from its RFC 7807 problem details. */
export function problemDetail(error: unknown): string | undefined {
  if (!(error instanceof HttpErrorResponse) || typeof error.error !== 'object' || error.error === null) return undefined;
  const detail: unknown = (error.error as Record<string, unknown>)['detail'];
  return typeof detail === 'string' && detail.length > 0 ? detail : undefined;
}

/** The HTTP status of a failed request; undefined for anything else, e.g. an error thrown in the browser. */
export function httpStatus(error: unknown): number | undefined {
  return error instanceof HttpErrorResponse ? error.status : undefined;
}
