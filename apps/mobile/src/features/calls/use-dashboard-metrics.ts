import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchDashboardMetrics } from "./calls-api";
import { useAuthErrorHandler } from "./use-auth-error-handler";

export function useDashboardMetrics() {
  const handleAuthError = useAuthErrorHandler();
  const query = useQuery({
    queryKey: ["dashboard", "metrics"],
    queryFn: fetchDashboardMetrics
  });

  useEffect(() => {
    if (query.error !== null) handleAuthError(query.error);
  }, [handleAuthError, query.error]);

  return query;
}
