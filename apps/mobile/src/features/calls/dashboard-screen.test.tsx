import { describe, expect, it, vi } from "vitest";

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));
vi.mock("expo-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: "Animated.View" },
  FadeIn: { duration: () => ({}) }
}));

const mockUseSession = vi.fn();
const mockUseDashboardMetrics = vi.fn();
const mockUseCallsHistory = vi.fn();

vi.mock("../../auth/session", (): { useSession: () => unknown } => ({
  useSession: (): unknown => mockUseSession()
}));
vi.mock("./use-dashboard-metrics", (): { useDashboardMetrics: () => unknown } => ({
  useDashboardMetrics: (): unknown => mockUseDashboardMetrics()
}));
vi.mock("./use-calls-history", (): { useCallsHistory: () => unknown } => ({
  useCallsHistory: (): unknown => mockUseCallsHistory()
}));

import { render, screen } from "@testing-library/react-native/pure";
import type { CallListItem } from "@call-screener/contracts";
import { DashboardScreen } from "./dashboard-screen";

const sampleCall = {
  id: "00000000-0000-4000-8000-000000000001" as CallListItem["id"],
  callerNumber: "+14155550100",
  callerDisplayName: "Alex",
  category: "business",
  outcome: "connected",
  riskScore: 0.2,
  startedAt: "2026-08-30T10:00:00.000Z",
  durationSeconds: 90
} satisfies CallListItem;

const metrics = { screened: 4, connected: 2, blocked: 1, messages: 1 };

function mockSignedInSession() {
  mockUseSession.mockReturnValue({
    state: { kind: "signedIn" },
    clear: vi.fn().mockResolvedValue(undefined)
  });
}

describe("DashboardScreen", () => {
  it("renders the loading state", () => {
    mockSignedInSession();
    mockUseDashboardMetrics.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isLoading: true,
      isRefetching: false,
      refetch: vi.fn()
    });
    mockUseCallsHistory.mockReturnValue({
      data: undefined,
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isLoading: true,
      isRefetching: false,
      refetch: vi.fn()
    });

    render(<DashboardScreen />);

    expect(screen.getByText("Loading your dashboard…")).toBeTruthy();
  });

  it("renders the empty call history state", () => {
    mockSignedInSession();
    mockUseDashboardMetrics.mockReturnValue({
      data: metrics,
      error: null,
      isError: false,
      isLoading: false,
      isRefetching: false,
      refetch: vi.fn()
    });
    mockUseCallsHistory.mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null }] },
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isLoading: false,
      isRefetching: false,
      refetch: vi.fn()
    });

    render(<DashboardScreen />);

    expect(screen.getByText("No calls yet")).toBeTruthy();
    expect(screen.getByText("Screened")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("renders populated metrics and call rows", () => {
    mockSignedInSession();
    mockUseDashboardMetrics.mockReturnValue({
      data: metrics,
      error: null,
      isError: false,
      isLoading: false,
      isRefetching: false,
      refetch: vi.fn()
    });
    mockUseCallsHistory.mockReturnValue({
      data: { pages: [{ items: [sampleCall], nextCursor: null }] },
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isLoading: false,
      isRefetching: false,
      refetch: vi.fn()
    });

    render(<DashboardScreen />);

    expect(screen.getByText("Alex")).toBeTruthy();
    expect(screen.getAllByText("Connected").length).toBeGreaterThan(0);
    expect(screen.getByText("Risk estimate: 20%")).toBeTruthy();
  });

  it("renders a retryable error state", () => {
    mockSignedInSession();
    mockUseDashboardMetrics.mockReturnValue({
      data: undefined,
      error: { name: "ApiRequestError", status: 500, message: "Service unavailable" },
      isError: true,
      isLoading: false,
      isRefetching: false,
      refetch: vi.fn()
    });
    mockUseCallsHistory.mockReturnValue({
      data: undefined,
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isLoading: false,
      isRefetching: false,
      refetch: vi.fn()
    });

    render(<DashboardScreen />);

    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("Service unavailable")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("renders pagination loading in the footer", () => {
    mockSignedInSession();
    mockUseDashboardMetrics.mockReturnValue({
      data: metrics,
      error: null,
      isError: false,
      isLoading: false,
      isRefetching: false,
      refetch: vi.fn()
    });
    mockUseCallsHistory.mockReturnValue({
      data: { pages: [{ items: [sampleCall], nextCursor: "cursor-2" }] },
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: true,
      isError: false,
      isFetchingNextPage: true,
      isLoading: false,
      isRefetching: false,
      refetch: vi.fn()
    });

    render(<DashboardScreen />);

    expect(screen.getByText("Loading more calls…")).toBeTruthy();
  });

  it("shows redirect UI when the session is cleared", () => {
    mockUseSession.mockReturnValue({
      state: { kind: "signedOut" },
      clear: vi.fn().mockResolvedValue(undefined)
    });
    mockUseDashboardMetrics.mockReturnValue({
      data: undefined,
      error: { name: "ApiRequestError", status: 401, message: "Unauthorized" },
      isError: true,
      isLoading: false,
      isRefetching: false,
      refetch: vi.fn()
    });
    mockUseCallsHistory.mockReturnValue({
      data: undefined,
      error: null,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isLoading: false,
      isRefetching: false,
      refetch: vi.fn()
    });

    render(<DashboardScreen />);

    expect(screen.getByText("Redirecting to sign in…")).toBeTruthy();
    expect(screen.queryByText("No calls yet")).toBeNull();
  });
});
