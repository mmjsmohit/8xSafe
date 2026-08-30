import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchCallDetail } from "./calls-api";
import { useAuthErrorHandler } from "./use-auth-error-handler";

export function useCallDetail(callId: string) {
  const handleAuthError = useAuthErrorHandler();
  const query = useQuery({
    queryKey: ["calls", "detail", callId],
    queryFn: () => fetchCallDetail(callId),
    enabled: callId.length > 0
  });

  useEffect(() => {
    if (query.error !== null) handleAuthError(query.error);
  }, [handleAuthError, query.error]);

  return query;
}
