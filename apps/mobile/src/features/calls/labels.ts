import type { CallCategory, CallOutcome, RiskSignalType, TransferStatus } from "@call-screener/contracts";

export const callCategoryLabels: Record<CallCategory, string> = {
  trusted: "Trusted",
  delivery: "Delivery",
  personal: "Personal",
  business: "Business",
  marketing: "Marketing",
  suspicious: "Suspicious",
  scam: "Scam",
  unknown: "Unknown"
};

export const callOutcomeLabels: Record<CallOutcome, string> = {
  direct_forward: "Forwarded",
  connected: "Connected",
  message_taken: "Message taken",
  blocked: "Blocked",
  ended: "Ended",
  missed_transfer: "Missed transfer",
  unavailable: "Unavailable",
  processing: "Processing"
};

export const transferStatusLabels: Record<TransferStatus, string> = {
  not_requested: "Not requested",
  initiated: "Initiated",
  ringing: "Ringing",
  answered: "Answered",
  completed: "Completed",
  busy: "Busy",
  rejected: "Rejected",
  failed: "Failed",
  no_answer: "No answer"
};

export const riskSignalLabels: Record<RiskSignalType, string> = {
  OTP_REQUEST: "OTP request",
  PASSWORD_REQUEST: "Password request",
  UPI_PIN_REQUEST: "UPI PIN request",
  CARD_CREDENTIAL_REQUEST: "Card credentials",
  REMOTE_ACCESS_REQUEST: "Remote access",
  SCREEN_SHARING_REQUEST: "Screen sharing",
  MONEY_REQUEST: "Money request",
  URGENCY_PRESSURE: "Urgency pressure",
  IDENTITY_MISMATCH: "Identity mismatch",
  UNSOLICITED_MARKETING: "Unsolicited marketing",
  VAGUE_PURPOSE: "Vague purpose",
  OTHER: "Other"
};
