import type { CallDetail } from "@call-screener/contracts";
import { StyleSheet, Text, View } from "react-native";
import { formatConfidence, formatRiskScore } from "../../features/calls/format";
import { riskSignalLabels } from "../../features/calls/labels";
import { colors, radii, spacing, typography } from "../../theme/tokens";

type RiskSignal = CallDetail["signals"][number];

type RiskAssessmentCardProps = {
  riskScore: number | null;
  confidence: number | null;
};

export function RiskAssessmentCard({ riskScore, confidence }: RiskAssessmentCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Model risk estimate</Text>
      <Text style={styles.value} selectable>{formatRiskScore(riskScore)}</Text>
      <Text style={styles.caption}>Risk score</Text>
      <Text style={styles.secondary} selectable>Confidence: {formatConfidence(confidence)}</Text>
    </View>
  );
}

type EvidenceListProps = {
  signals: RiskSignal[];
};

export function EvidenceList({ signals }: EvidenceListProps) {
  if (signals.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Evidence</Text>
        <Text style={styles.empty}>No risk signals recorded for this call.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Evidence</Text>
      {signals.map((signal, index) => (
        <View key={`${signal.type}-${String(index)}`} style={styles.signal}>
          <Text style={styles.signalTitle}>{riskSignalLabels[signal.type]}</Text>
          <Text style={styles.signalMeta} selectable>
            Confidence {formatConfidence(signal.confidence)} · {signal.evidence}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    color: colors.muted,
    fontSize: typography.caption
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md
  },
  empty: {
    color: colors.muted,
    fontSize: typography.body
  },
  secondary: {
    color: colors.muted,
    fontSize: typography.body
  },
  signal: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    paddingTop: spacing.sm
  },
  signalMeta: {
    color: colors.muted,
    fontSize: typography.body
  },
  signalTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "600"
  },
  title: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: "600"
  },
  value: {
    color: colors.primary,
    fontSize: typography.heading,
    fontWeight: "700"
  }
});
