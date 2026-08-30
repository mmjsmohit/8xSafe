import { useCallback } from "react";
import { ApiRequestError } from "../../api/client";
import { useSession } from "../../auth/session";

export function useAuthErrorHandler() {
  const session = useSession();

  return useCallback((error: unknown) => {
    if (error instanceof ApiRequestError && error.status === 401) {
      void session.clear();
    }
  }, [session]);
}
