import { describe, expect, it, vi } from "vitest";

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: "Animated.View" },
  FadeIn: { duration: () => ({}) }
}));

const mockUseSession = vi.fn();
const mockUseCallDetail = vi.fn();

vi.mock("../../auth/session", (): { useSession: () => unknown } => ({
  useSession: (): unknown => mockUseSession()
}));
vi.mock("./use-call-detail", (): { useCallDetail: () => unknown } => ({
  useCallDetail: (): unknown => mockUseCallDetail()
}));

import { render, screen } from "@testing-library/react-native/pure";
import type { CallDetail } from "@call-screener/contracts";
import { CallDetailScreen } from "./call-detail-screen";

const sampleCall = {
  id: "00000000-0000-4000-8000-000000000001" as CallDetail["id"],
  callerNumber: "+14155550100",
  callerDisplayName: "Alex",
  category: "business",
  outcome: "connected",
  riskScore: 0.2,
  startedAt: "2026-08-30T10:00:00.000Z",
  durationSeconds: 90,
  claimedCompany: "Acme",
  reason: "Follow-up",
  summary: "Caller asked about an invoice.",
  confidence: 0.8,
  signals: [],
  transcript: [],
  transferStatus: "completed",
  completedAt: "2026-08-30T10:01:30.000Z"
} satisfies CallDetail;

function mockSignedInSession() {
  mockUseSession.mockReturnValue({
    state: { kind: "signedIn" },
    clear: vi.fn().mockResolvedValue(undefined)
  });
}

describe("CallDetailScreen", () => {
  it("renders the loading state", () => {
    mockSignedInSession();
    mockUseCallDetail.mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      isLoading: true,
      refetch: vi.fn()
    });

    render(<CallDetailScreen callId={sampleCall.id} />);

    expect(screen.getByText("Loading call details…")).toBeTruthy();
  });

  it("renders populated call detail content", () => {
    mockSignedInSession();
    mockUseCallDetail.mockReturnValue({
      data: sampleCall,
      error: null,
      isError: false,
      isLoading: false,
      refetch: vi.fn()
    });

    render(<CallDetailScreen callId={sampleCall.id} />);

    expect(screen.getByText("Alex")).toBeTruthy();
    expect(screen.getByText("Summary")).toBeTruthy();
    expect(screen.getByText("Caller asked about an invoice.")).toBeTruthy();
    expect(screen.getByText("Model risk estimate")).toBeTruthy();
  });

  it("renders a retryable error state", () => {
    mockSignedInSession();
    mockUseCallDetail.mockReturnValue({
      data: undefined,
      error: { name: "ApiRequestError", status: 500, message: "Service unavailable" },
      isError: true,
      isLoading: false,
      refetch: vi.fn()
    });

    render(<CallDetailScreen callId={sampleCall.id} />);

    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByText("Service unavailable")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("shows redirect UI when the session expires", () => {
    mockUseSession.mockReturnValue({
      state: { kind: "signedOut" },
      clear: vi.fn().mockResolvedValue(undefined)
    });
    mockUseCallDetail.mockReturnValue({
      data: undefined,
      error: { name: "ApiRequestError", status: 401, message: "Unauthorized" },
      isError: true,
      isLoading: false,
      refetch: vi.fn()
    });

    render(<CallDetailScreen callId={sampleCall.id} />);

    expect(screen.getByText("Redirecting to sign in…")).toBeTruthy();
    expect(screen.queryByText("Loading call details…")).toBeNull();
  });
});
