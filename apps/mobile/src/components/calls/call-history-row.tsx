import type { CallListItem } from "@call-screener/contracts";
import { Link } from "expo-router";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { formatCallTimestamp, formatCallerLabel, formatDuration, formatRiskScore } from "../../features/calls/format";
import { callCategoryLabels, callOutcomeLabels } from "../../features/calls/labels";
import { colors, radii, spacing, typography } from "../../theme/tokens";

type CallHistoryRowProps = {
  call: CallListItem;
};

export function CallHistoryRow({ call }: CallHistoryRowProps) {
  const callerLabel = formatCallerLabel(call);
  const riskLabel = formatRiskScore(call.riskScore);

  return (
    <Link href={`/(app)/calls/${call.id}`} asChild>
      <Pressable style={styles.row}>
        <View style={styles.header}>
          <Text style={styles.caller} numberOfLines={1} selectable>{callerLabel}</Text>
          <Text style={styles.timestamp}>{formatCallTimestamp(call.startedAt)}</Text>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{callCategoryLabels[call.category]}</Text>
          </View>
          <Text style={styles.meta}>{callOutcomeLabels[call.outcome]}</Text>
          <Text style={styles.meta}>{formatDuration(call.durationSeconds)}</Text>
        </View>
        <Text style={styles.risk} selectable>Risk estimate: {riskLabel}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  badgeText: {
    color: colors.primary,
    fontSize: typography.caption,
    fontWeight: "600"
  },
  caller: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.body,
    fontWeight: "600"
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  meta: {
    color: colors.muted,
    fontSize: typography.caption
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  risk: {
    color: colors.muted,
    fontSize: typography.caption
  },
  row: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
    ...(Platform.OS === "ios"
      ? { shadowColor: colors.ink, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 }
      : { elevation: 1 })
  },
  timestamp: {
    color: colors.muted,
    fontSize: typography.caption
  }
});
