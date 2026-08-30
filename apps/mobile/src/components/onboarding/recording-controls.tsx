import { useEffect } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  useReducedMotion
} from "react-native-reanimated";
import { colors, radii, spacing, typography } from "../../theme/tokens";
import {
  MAX_RECORDING_SECONDS,
  MIN_RECORDING_SECONDS,
  type MicPermissionState
} from "../../features/onboarding/types";

export type RecordingControlsProps = {
  permissionState: MicPermissionState;
  onRequestPermission: () => Promise<void>;
  isRecording: boolean;
  durationSeconds: number;
  recordingUri: string | null;
  durationError: string | null;
  onStartRecording: () => Promise<void>;
  onStopRecording: () => Promise<void>;
  onResetRecording: () => void;
  onProceedToUpload: () => void;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function RecordingControls({
  permissionState,
  onRequestPermission,
  isRecording,
  durationSeconds,
  recordingUri,
  durationError,
  onStartRecording,
  onStopRecording,
  onResetRecording,
  onProceedToUpload
}: RecordingControlsProps) {
  const reducedMotion = useReducedMotion();
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    if (isRecording && !reducedMotion) {
      pulseOpacity.value = withRepeat(withTiming(0.3, { duration: 600 }), -1, true);
    } else {
      pulseOpacity.value = 1;
    }
  }, [isRecording, reducedMotion, pulseOpacity]);

  const animatedPulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value
  }));

  const progressPercent = Math.min(100, (durationSeconds / MAX_RECORDING_SECONDS) * 100);
  const hasMinDuration = durationSeconds >= MIN_RECORDING_SECONDS;
  const isFinished = !isRecording && recordingUri !== null;

  if (permissionState === "denied") {
    return (
      <View style={styles.card} testID="mic-permission-denied-view">
        <View style={styles.errorIcon}>
          <Text style={{ fontSize: 24 }}>🚫</Text>
        </View>
        <Text style={styles.title}>Microphone Permission Denied</Text>
        <Text style={styles.bodyText} testID="mic-permission-denied-message">
          Microphone access is required to record your voice sample for call screening.
          Please grant permission to continue.
        </Text>
        <Pressable
          testID="request-mic-permission-button"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            void onRequestPermission();
          }}
          style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Grant Microphone Permission</Text>
        </Pressable>
      </View>
    );
  }

  if (permissionState === "undetermined") {
    return (
      <View style={styles.card} testID="mic-permission-prompt-view">
        <View style={styles.iconCircle}>
          <Text style={{ fontSize: 24 }}>🎙️</Text>
        </View>
        <Text style={styles.title}>Microphone Access Required</Text>
        <Text style={styles.bodyText}>
          Shield Call needs access to your microphone to record a 60 to 180 second sample of your voice.
        </Text>
        <Pressable
          testID="enable-mic-button"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            void onRequestPermission();
          }}
          style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Enable Microphone</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card} testID="recording-controls">
      <View style={styles.timerSection}>
        <View style={styles.timerHeader}>
          {isRecording ? (
            <Animated.View style={[styles.recordingBadge, animatedPulseStyle]}>
              <View style={styles.redDot} />
              <Text style={styles.recordingBadgeText}>RECORDING</Text>
            </Animated.View>
          ) : (
            <Text style={styles.timerLabel}>Voice Sample Duration</Text>
          )}
        </View>

        <Text style={styles.timerDisplay} testID="recording-duration-timer">
          {formatTime(durationSeconds)}
          <Text style={styles.timerTotal}> / 03:00</Text>
        </Text>

        {/* Progress Bar with 60s milestone */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${progressPercent}%`,
                backgroundColor: hasMinDuration ? colors.primary : colors.warning
              }
            ]}
          />
          {/* Milestone marker at 60s (33.3%) */}
          <View style={styles.milestoneMarker} />
        </View>

        <View style={styles.progressLabels}>
          <Text style={styles.progressSubtext}>0s</Text>
          <Text style={[styles.progressSubtext, styles.milestoneText]}>60s min</Text>
          <Text style={styles.progressSubtext}>180s max</Text>
        </View>

        {durationError ? (
          <View style={styles.errorBox} testID="duration-error-banner">
            <Text style={styles.errorText} testID="duration-error-message">
              {durationError}
            </Text>
          </View>
        ) : null}

        {isRecording ? (
          <Text style={styles.recordingStatusText}>
            {hasMinDuration
              ? "✓ Minimum duration met! You can stop now or continue recording."
              : `Keep speaking... ${Math.max(0, MIN_RECORDING_SECONDS - Math.floor(durationSeconds))}s needed for minimum`}
          </Text>
        ) : null}
      </View>

      {!isRecording && !isFinished ? (
        <View style={styles.guidanceBox}>
          <Text style={styles.guidanceTitle}>Recording Tips:</Text>
          <Text style={styles.guidanceItem}>• Speak naturally at a steady pace in a quiet room.</Text>
          <Text style={styles.guidanceItem}>• Sample script: "Hello, thank you for calling. You have reached my personal call screener. Please state your name and reason for calling, and I will connect you if available."</Text>
          <Text style={styles.guidanceItem}>• Minimum requirement: 60 seconds. Maximum: 180 seconds.</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {isRecording ? (
          <Pressable
            testID="stop-recording-button"
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              void onStopRecording();
            }}
            style={({ pressed }) => [styles.stopButton, pressed ? styles.buttonPressed : null]}
            accessibilityRole="button"
            accessibilityLabel="Stop Recording"
          >
            <View style={styles.stopIconSquare} />
            <Text style={styles.stopButtonText}>Stop Recording</Text>
          </Pressable>
        ) : isFinished ? (
          <View style={styles.finishedButtonGroup}>
            {hasMinDuration && !durationError ? (
              <Pressable
                testID="proceed-clone-button"
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onProceedToUpload();
                }}
                style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
                accessibilityRole="button"
                accessibilityLabel="Upload and Clone Voice"
              >
                <Text style={styles.buttonText}>Upload & Clone Voice</Text>
              </Pressable>
            ) : null}

            <Pressable
              testID="rerecord-button"
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onResetRecording();
              }}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.buttonPressed : null
              ]}
              accessibilityRole="button"
              accessibilityLabel="Record Again"
            >
              <Text style={styles.secondaryButtonText}>Record Again</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            testID="start-recording-button"
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              void onStartRecording();
            }}
            style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
            accessibilityRole="button"
            accessibilityLabel="Start Recording"
          >
            <Text style={styles.buttonText}>Start Recording (60-180s)</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)"
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center"
  },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: "#FDE8E8",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center"
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
    lineHeight: 22
  },
  timerSection: {
    alignItems: "center",
    gap: spacing.xs
  },
  timerHeader: {
    height: 24,
    justifyContent: "center"
  },
  timerLabel: {
    fontSize: typography.caption,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  recordingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FDE8E8",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    gap: 6
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger
  },
  recordingBadgeText: {
    fontSize: typography.caption - 2,
    fontWeight: "700",
    color: colors.danger,
    letterSpacing: 0.5
  },
  timerDisplay: {
    fontSize: 40,
    fontWeight: "700",
    color: colors.ink,
    fontVariant: ["tabular-nums"]
  },
  timerTotal: {
    fontSize: 20,
    color: colors.muted,
    fontWeight: "400"
  },
  progressTrack: {
    width: "100%",
    height: 8,
    backgroundColor: colors.background,
    borderRadius: radii.pill,
    overflow: "hidden",
    marginTop: spacing.xs,
    position: "relative"
  },
  progressBar: {
    height: "100%",
    borderRadius: radii.pill
  },
  milestoneMarker: {
    position: "absolute",
    left: "33.33%",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.border
  },
  progressLabels: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 2
  },
  progressSubtext: {
    fontSize: typography.caption - 2,
    color: colors.muted
  },
  milestoneText: {
    fontWeight: "600",
    color: colors.ink
  },
  recordingStatusText: {
    fontSize: typography.caption,
    color: colors.primary,
    fontWeight: "500",
    marginTop: spacing.xs,
    textAlign: "center"
  },
  errorBox: {
    backgroundColor: "#FDE8E8",
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.sm,
    width: "100%",
    marginTop: spacing.xs
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.caption,
    fontWeight: "500",
    textAlign: "center"
  },
  guidanceBox: {
    backgroundColor: colors.background,
    borderRadius: radii.sm,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border
  },
  guidanceTitle: {
    fontSize: typography.caption,
    fontWeight: "700",
    color: colors.ink
  },
  guidanceItem: {
    fontSize: typography.caption - 1,
    color: colors.muted,
    lineHeight: 16
  },
  actions: {
    marginTop: spacing.xs
  },
  finishedButtonGroup: {
    gap: spacing.sm
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center"
  },
  stopButton: {
    backgroundColor: colors.danger,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm
  },
  stopIconSquare: {
    width: 14,
    height: 14,
    backgroundColor: colors.surface,
    borderRadius: 2
  },
  stopButtonText: {
    color: colors.surface,
    fontSize: typography.body,
    fontWeight: "600"
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: "600"
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }]
  },
  buttonText: {
    color: colors.surface,
    fontSize: typography.body,
    fontWeight: "600"
  }
});
