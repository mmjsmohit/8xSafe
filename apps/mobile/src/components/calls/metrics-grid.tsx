import { StyleSheet, Text, View } from "react-native";
import type { DashboardMetrics } from "../../features/calls/calls-api";
import { colors, radii, spacing, typography } from "../../theme/tokens";

const metricItems = [
  { key: "screened", label: "Screened" },
  { key: "connected", label: "Connected" },
  { key: "blocked", label: "Blocked" },
  { key: "messages", label: "Messages" }
] as const satisfies ReadonlyArray<{ key: keyof DashboardMetrics; label: string }>;

type MetricsGridProps = {
  metrics: DashboardMetrics;
};

export function MetricsGrid({ metrics }: MetricsGridProps) {
  return (
    <View style={styles.grid}>
      {metricItems.map((item) => (
        <View key={item.key} style={styles.card}>
          <Text style={styles.value}>{String(metrics[item.key])}</Text>
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    gap: spacing.xs,
    padding: spacing.md
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  label: {
    color: colors.muted,
    fontSize: typography.caption
  },
  value: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: "700"
  }
});
