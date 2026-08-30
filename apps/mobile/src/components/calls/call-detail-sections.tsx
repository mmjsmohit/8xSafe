import type { TranscriptTurn, TransferStatus } from "@call-screener/contracts";
import { StyleSheet, Text, View } from "react-native";
import { transferStatusLabels } from "../../features/calls/labels";
import { colors, radii, spacing, typography } from "../../theme/tokens";

type SummaryCardProps = {
  summary: string | null;
  reason: string | null;
  claimedCompany: string | null;
};

export function SummaryCard({ summary, reason, claimedCompany }: SummaryCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Summary</Text>
      <Text style={styles.body} selectable>
        {summary ?? "No summary is available yet."}
      </Text>
      {reason !== null ? (
        <>
          <Text style={styles.subheading}>Reason</Text>
          <Text style={styles.body} selectable>{reason}</Text>
        </>
      ) : null}
      {claimedCompany !== null ? (
        <>
          <Text style={styles.subheading}>Claimed company</Text>
          <Text style={styles.body} selectable>{claimedCompany}</Text>
        </>
      ) : null}
    </View>
  );
}

type TranscriptCardProps = {
  transcript: TranscriptTurn[];
};

export function TranscriptCard({ transcript }: TranscriptCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Transcript</Text>
      {transcript.length === 0 ? (
        <Text style={styles.body}>Transcript is not available yet.</Text>
      ) : (
        transcript.map((turn, index) => (
          <View key={`${turn.speaker}-${String(index)}`} style={styles.turn}>
            <Text style={styles.speaker}>{turn.speaker === "assistant" ? "Assistant" : "Caller"}</Text>
            <Text style={styles.body} selectable>{turn.text}</Text>
          </View>
        ))
      )}
    </View>
  );
}

type TransferOutcomeCardProps = {
  transferStatus: TransferStatus;
};

export function TransferOutcomeCard({ transferStatus }: TransferOutcomeCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Transfer outcome</Text>
      <Text style={styles.body} selectable>{transferStatusLabels[transferStatus]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    color: colors.ink,
    fontSize: typography.body
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  speaker: {
    color: colors.primary,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  subheading: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: "600",
    marginTop: spacing.sm
  },
  title: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: "600"
  },
  turn: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    paddingTop: spacing.sm
  }
});
