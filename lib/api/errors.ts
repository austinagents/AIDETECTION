export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "OPENAI_ERROR"
  | "OPENAI_JSON_ERROR"
  | "SUPABASE_ERROR"
  | "SUPABASE_SCHEMA_ERROR"
  | "STORAGE_ERROR"
  | "SERVER_ERROR";

export class AppError extends Error {
  code: ApiErrorCode;
  status: number;
  details?: string;

  constructor(code: ApiErrorCode, message: string, status = 500, details?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function publicError(error: unknown) {
  if (isAppError(error)) {
    return {
      status: error.status,
      body: {
        ok: false,
        code: error.code,
        error: error.message,
        details: error.details
      }
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      code: "SERVER_ERROR" as ApiErrorCode,
      error: "The server hit an unexpected error while processing the request."
    }
  };
}

export function classifyStorageError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("does not exist") || lower.includes("schema cache") || lower.includes("relation")) {
    return new AppError(
      "SUPABASE_SCHEMA_ERROR",
      "Supabase is configured, but the expected tables were not found. Run the migration SQL in Supabase.",
      500,
      safeDetails(message)
    );
  }

  if (lower.includes("invalid input syntax for type uuid") || lower.includes("foreign key")) {
    return new AppError(
      "SUPABASE_ERROR",
      "Supabase rejected the local session record. Check the users table and migration state.",
      500,
      safeDetails(message)
    );
  }

  return new AppError("STORAGE_ERROR", "The analysis completed, but saving or reading storage failed.", 500, safeDetails(message));
}

export function safeDetails(message: string) {
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/service_role[=:]\s*[A-Za-z0-9._-]+/gi, "service_role=[redacted]")
    .slice(0, 500);
}
