import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../../theme/tokens";

export function ShieldNumberBanner({ shieldNumber }: { shieldNumber: string }) {
  return (
    <View style={styles.container} testID="shield-number-banner">
      <View style={styles.headerRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Allocated Shield Number</Text>
        </View>
      </View>
      <Text style={styles.numberText} testID="shield-number-display" selectable>
        {shieldNumber}
      </Text>
      <Text style={styles.descriptionText}>
        Calls to this dedicated number are answered and screened by your personalized AI assistant
        before forwarding to your private phone.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#B8E2CC",
    gap: spacing.xs
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  badge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill
  },
  badgeText: {
    color: colors.surface,
    fontSize: typography.caption - 1,
    fontWeight: "700",
    letterSpacing: 0.3
  },
  numberText: {
    fontSize: typography.title + 2,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: 1,
    marginVertical: 2
  },
  descriptionText: {
    fontSize: typography.caption,
    color: colors.muted,
    lineHeight: 18
  }
});
