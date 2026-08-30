import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../../theme/tokens";

export type StepIndicatorProps = {
  currentStepIndex: number; // 0 = profile, 1 = voice, 2 = preview
};

const STEPS = ["Profile", "Voice Sample", "Preview"];

export function StepIndicator({ currentStepIndex }: StepIndicatorProps) {
  return (
    <View style={styles.container} testID="onboarding-step-indicator">
      {STEPS.map((label, index) => {
        const isCompleted = index < currentStepIndex;
        const isCurrent = index === currentStepIndex;

        return (
          <View key={label} style={styles.stepWrapper}>
            <View style={styles.stepRow}>
              <View
                style={[
                  styles.circle,
                  isCompleted ? styles.circleCompleted : null,
                  isCurrent ? styles.circleCurrent : null
                ]}
                testID={`step-circle-${index}`}
              >
                <Text
                  style={[
                    styles.circleText,
                    isCompleted || isCurrent ? styles.circleTextActive : null
                  ]}
                >
                  {isCompleted ? "✓" : index + 1}
                </Text>
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  isCurrent ? styles.stepLabelCurrent : null,
                  isCompleted ? styles.stepLabelCompleted : null
                ]}
              >
                {label}
              </Text>
            </View>

            {index < STEPS.length - 1 ? (
              <View
                style={[
                  styles.connector,
                  index < currentStepIndex ? styles.connectorActive : null
                ]}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md
  },
  stepWrapper: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1
  },
  stepRow: {
    alignItems: "center",
    gap: spacing.xs
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center"
  },
  circleCurrent: {
    borderColor: colors.primary,
    backgroundColor: colors.surface
  },
  circleCompleted: {
    borderColor: colors.primary,
    backgroundColor: colors.primary
  },
  circleText: {
    fontSize: typography.caption - 1,
    fontWeight: "700",
    color: colors.muted
  },
  circleTextActive: {
    color: colors.surface
  },
  stepLabel: {
    fontSize: typography.caption - 2,
    color: colors.muted,
    fontWeight: "500",
    textAlign: "center"
  },
  stepLabelCurrent: {
    color: colors.ink,
    fontWeight: "700"
  },
  stepLabelCompleted: {
    color: colors.primary,
    fontWeight: "600"
  },
  connector: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xs,
    marginBottom: spacing.md
  },
  connectorActive: {
    backgroundColor: colors.primary
  }
});
