type ApiErrorLike = {
  name: string;
  status: number;
  message: string;
};

function asApiError(error: unknown): ApiErrorLike | null {
  if (typeof error !== "object" || error === null) return null;
  if (!("status" in error) || !("message" in error)) return null;
  const candidate = error as { status: unknown; message: unknown; name?: unknown };
  if (typeof candidate.status !== "number" || typeof candidate.message !== "string") return null;
  return {
    name: typeof candidate.name === "string" ? candidate.name : "ApiRequestError",
    message: candidate.message,
    status: candidate.status
  };
}

export function isSessionExpiredError(error: unknown): boolean {
  return asApiError(error)?.status === 401;
}

export function getRetryableErrorMessage(error: unknown): string {
  const apiError = asApiError(error);
  if (apiError?.status === 401) return "Your session expired. Sign in again to continue.";
  if (apiError !== null) return apiError.message;
  if (error instanceof Error) return error.message;
  return "Unable to load data right now.";
}

export function shouldShowRetry(error: unknown, isSignedIn: boolean): boolean {
  if (!isSignedIn) return false;
  if (isSessionExpiredError(error)) return false;
  return true;
}
