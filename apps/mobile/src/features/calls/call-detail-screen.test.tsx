import { describe, expect, it, vi } from "vitest";
import { formatCallerLabel } from "./format";

vi.mock("../../components/calls/call-detail-sections", () => ({
  SummaryCard: () => null,
  TranscriptCard: () => null,
  TransferOutcomeCard: () => null
}));
vi.mock("../../components/calls/risk-evidence", () => ({
  EvidenceList: () => null,
  RiskAssessmentCard: () => null
}));
vi.mock("../../components/calls/state-views", () => ({
  ErrorState: ({ message }: { message: string }) => message,
  LoadingState: ({ label }: { label: string }) => label
}));
vi.mock("../../auth/session", () => ({
  useSession: () => ({ state: { kind: "signedIn" } })
}));
vi.mock("./use-call-detail", () => ({
  useCallDetail: () => ({
    data: {
      id: "00000000-0000-4000-8000-000000000001",
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
    },
    error: null,
    isError: false,
    isLoading: false,
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

describe("call-detail-screen", () => {
  it("formats caller labels for detail headers", () => {
    expect(formatCallerLabel({ callerDisplayName: "Alex", callerNumber: "+14155550100" })).toBe("Alex");
  });
});
