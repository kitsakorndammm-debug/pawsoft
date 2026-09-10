/**
 * Errors a service raises on purpose, as opposed to the ones that mean a bug.
 *
 * **Tests assert on `code`, never on `message`.** The Thai text is written for whoever
 * is looking at the screen and gets reworded; the code is what the rest of the system
 * agrees on. A test pinned to the wording fails the day somebody improves it.
 */

/** Every refusal this system can express. Add one here before using it. */
export const ERROR_CODE = {
  /** Asked for a row that is not there, or was soft-deleted. */
  NOT_FOUND: 'NOT_FOUND',
  /** A business key is already taken by a live row. */
  DUPLICATE: 'DUPLICATE',
  /** The request itself is malformed — a value out of range, a missing field. */
  INVALID: 'INVALID',
  /** Refused because something else still depends on this row. */
  IN_USE: 'IN_USE',
  /** Signed in, but not allowed to do this. */
  FORBIDDEN: 'FORBIDDEN',
  /** Not signed in, or the session is gone. */
  UNAUTHORIZED: 'UNAUTHORIZED',
} as const

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE]

/** Which HTTP status each code answers with. The route layer reads this; services do not. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  DUPLICATE: 409,
  INVALID: 400,
  IN_USE: 409,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
}

export class AppError extends Error {
  readonly code: ErrorCode
  /**
   * Anything the caller needs to act on the refusal — which field was duplicated,
   * which records are still using the row. Shown to the user through the route layer,
   * so keep it to values, not internals.
   */
  readonly detail: Record<string, unknown> | undefined

  constructor(code: ErrorCode, message: string, detail?: Record<string, unknown>) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.detail = detail
  }
}

export const notFound = (message: string, detail?: Record<string, unknown>) =>
  new AppError(ERROR_CODE.NOT_FOUND, message, detail)

export const duplicate = (message: string, detail?: Record<string, unknown>) =>
  new AppError(ERROR_CODE.DUPLICATE, message, detail)

export const invalid = (message: string, detail?: Record<string, unknown>) =>
  new AppError(ERROR_CODE.INVALID, message, detail)

export const inUse = (message: string, detail?: Record<string, unknown>) =>
  new AppError(ERROR_CODE.IN_USE, message, detail)

export const forbidden = (message: string, detail?: Record<string, unknown>) =>
  new AppError(ERROR_CODE.FORBIDDEN, message, detail)

export const unauthorized = (message: string, detail?: Record<string, unknown>) =>
  new AppError(ERROR_CODE.UNAUTHORIZED, message, detail)

export const isAppError = (e: unknown): e is AppError => e instanceof AppError
