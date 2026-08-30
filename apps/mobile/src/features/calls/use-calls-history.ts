import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchCallsPage } from "./calls-api";
import { useAuthErrorHandler } from "./use-auth-error-handler";

const PAGE_SIZE = 20;

export function useCallsHistory() {
  const handleAuthError = useAuthErrorHandler();
  const query = useInfiniteQuery({
    queryKey: ["calls", "history"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchCallsPage(
      pageParam === undefined ? { limit: PAGE_SIZE } : { cursor: pageParam, limit: PAGE_SIZE }
    ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined
  });

  useEffect(() => {
    if (query.error !== null) handleAuthError(query.error);
  }, [handleAuthError, query.error]);

  return query;
}
