import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import * as Haptics from "expo-haptics";
import { colors, radii, spacing, typography } from "../../theme/tokens";
import type { CloneStatus } from "../../features/onboarding/types";

export type CloneProgressCardProps = {
  status: CloneStatus;
  errorMessage: string | null;
  isRetryable?: boolean;
  onRetry: () => void;
  onReRecord: () => void;
};

export function CloneProgressCard({
  status,
  errorMessage,
  isRetryable = true,
  onRetry,
  onReRecord
}: CloneProgressCardProps) {
  const isFailed = status === "failed";

  const handleRetry = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRetry();
  };

  const handleReRecord = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onReRecord();
  };

  return (
    <View style={styles.card} testID="clone-progress-card">
      {isFailed ? (
        <View style={styles.failedContainer} testID="clone-failed-view">
          <View style={styles.errorIconCircle}>
            <Text style={{ fontSize: 24 }}>⚠️</Text>
          </View>
          <Text style={styles.title}>Voice Cloning Failed</Text>
          <Text style={styles.errorMessage} testID="clone-failure-message" selectable>
            {errorMessage ?? "Failed to create voice clone. Please check your connection and try again."}
          </Text>

          <View style={styles.buttonGroup}>
            {isRetryable ? (
              <Pressable
                testID="clone-retry-button"
                onPress={handleRetry}
                style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
                accessibilityRole="button"
                accessibilityLabel="Retry Voice Clone Upload"
              >
                <Text style={styles.buttonText}>Retry Clone Upload</Text>
              </Pressable>
            ) : null}

            <Pressable
              testID="clone-rerecord-button"
              onPress={handleReRecord}
              style={({ pressed }) => [styles.secondaryButton, pressed ? styles.buttonPressed : null]}
              accessibilityRole="button"
              accessibilityLabel="Record New Audio Sample"
            >
              <Text style={styles.secondaryButtonText}>Record New Sample</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.progressContainer} testID="clone-loading-view">
          <View style={styles.spinnerWrapper}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
          <Text style={styles.title}>
            {status === "uploading" ? "Uploading Voice Sample..." : "Generating Voice Clone..."}
          </Text>
          <Text style={styles.bodyText}>
            {status === "uploading"
              ? "Sending your audio sample securely to train your personal screener."
              : "Creating your unique voice model. This usually takes just a few seconds."}
          </Text>
          <View style={styles.progressPill}>
            <Text style={styles.progressPillText}>DO NOT CLOSE THE APP</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)"
  },
  progressContainer: {
    alignItems: "center",
    gap: spacing.sm,
    width: "100%"
  },
  failedContainer: {
    alignItems: "center",
    gap: spacing.sm,
    width: "100%"
  },
  spinnerWrapper: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs
  },
  errorIconCircle: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: "#FDE8E8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs
  },
  title: {
    fontSize: typography.title,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center"
  },
  bodyText: {
    fontSize: typography.body,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300
  },
  errorMessage: {
    fontSize: typography.caption,
    color: colors.danger,
    textAlign: "center",
    lineHeight: 18,
    backgroundColor: "#FDE8E8",
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.sm,
    width: "100%"
  },
  progressPill: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    marginTop: spacing.sm
  },
  progressPillText: {
    fontSize: typography.caption - 2,
    fontWeight: "700",
    color: colors.muted,
    letterSpacing: 0.8
  },
  buttonGroup: {
    width: "100%",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    width: "100%"
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    width: "100%"
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }]
  },
  buttonText: {
    color: colors.surface,
    fontSize: typography.body,
    fontWeight: "600"
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "600"
  }
});
