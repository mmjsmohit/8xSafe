import { useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import { ApiRequestError } from "../../api/client";
import { useSession } from "../../auth/session";

export function useAuthErrorHandler() {
  const session = useSession();
  const router = useRouter();
  const handledRef = useRef(false);

  return useCallback((error: unknown) => {
    if (!(error instanceof ApiRequestError) || error.status !== 401 || handledRef.current) {
      return;
    }
    handledRef.current = true;
    void session.clear().finally(() => {
      router.replace("/(auth)/login");
    });
  }, [router, session]);
}
