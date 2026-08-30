import { describe, expect, it, vi } from "vitest";
import { getRetryableErrorMessage } from "./error-helpers";

vi.mock("../../components/calls/call-history-row", () => ({ CallHistoryRow: () => null }));
vi.mock("../../components/calls/metrics-grid", () => ({ MetricsGrid: () => null }));
vi.mock("../../components/calls/state-views", () => ({
  EmptyState: () => null,
  ErrorState: ({ message }: { message: string }) => message,
  LoadingState: ({ label }: { label: string }) => label
}));
vi.mock("../../auth/session", () => ({
  useSession: () => ({ state: { kind: "signedIn" } })
}));
vi.mock("./use-dashboard-metrics", () => ({
  useDashboardMetrics: () => ({
    data: { screened: 4, connected: 2, blocked: 1, messages: 1 },
    error: null,
    isError: false,
    isLoading: false,
    isRefetching: false,
    refetch: vi.fn()
  })
}));
vi.mock("./use-calls-history", () => ({
  useCallsHistory: () => ({
    data: { pages: [{ items: [], nextCursor: null }] },
    error: null,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isError: false,
    isFetchingNextPage: false,
    isLoading: false,
    isRefetching: false,
    refetch: vi.fn()
  })
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: "Animated.View" },
  FadeIn: { duration: () => undefined }
}));

describe("dashboard-screen", () => {
  it("surfaces retryable errors through the shared helper", () => {
    expect(getRetryableErrorMessage(new Error("offline"))).toBe("offline");
  });
});
