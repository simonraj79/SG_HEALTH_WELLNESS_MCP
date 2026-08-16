import type { PublicErrorShape } from "./contracts.js";

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(options: {
    message: string;
    code: string;
    status?: number;
    retryable?: boolean;
    retryAfterSeconds?: number;
    cause?: unknown;
  }) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.status = options.status ?? 500;
    this.retryable = options.retryable ?? false;
    if (options.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }
}

export function toPublicError(error: unknown): PublicErrorShape {
  if (error instanceof AppError) {
    return {
      error: error.message,
      code: error.code,
      retryable: error.retryable,
      status: error.status,
      ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }),
    };
  }

  return {
    error: "An unexpected internal error occurred.",
    code: "internal_error",
    retryable: false,
    status: 500,
  };
}

export function toToolErrorText(error: unknown): string {
  const publicError = toPublicError(error);
  const retry = publicError.retryable
    ? publicError.retryAfterSeconds === undefined
      ? " Try again shortly."
      : ` Try again in about ${publicError.retryAfterSeconds} seconds.`
    : "";
  return `Error [${publicError.code}]: ${publicError.error}${retry}`;
}
