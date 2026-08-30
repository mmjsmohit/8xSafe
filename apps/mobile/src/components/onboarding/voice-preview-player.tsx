import { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import * as Haptics from "expo-haptics";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { colors, radii, spacing, typography } from "../../theme/tokens";
import type { VoicePreviewResponse } from "../../features/onboarding/onboarding-api";

export type VoicePreviewPlayerProps = {
  preview: VoicePreviewResponse;
  onComplete: () => void;
  isCompleting?: boolean | undefined;
};

function formatSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function VoicePreviewPlayer({
  preview,
  onComplete,
  isCompleting = false
}: VoicePreviewPlayerProps) {
  const audioSource = useMemo(() => ({
    uri: `data:${preview.mimeType};base64,${preview.audioBase64}`
  }), [preview.mimeType, preview.audioBase64]);

  const player = useAudioPlayer(audioSource);
  const status = useAudioPlayerStatus(player);

  const isPlaying = status.playing;
  const currentTime = status.currentTime;
  const duration = status.duration > 0 ? status.duration : 1;
  const progressPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

  const togglePlayback = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isPlaying) {
      player.pause();
    } else {
      if (status.didJustFinish) {
        void player.seekTo(0);
      }
      player.play();
    }
  };

  const handleFinish = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onComplete();
  };

  return (
    <View style={styles.card} testID="voice-preview-player">
      <View style={styles.header}>
        <View style={styles.successBadge}>
          <Text style={styles.successBadgeText}>✓ VOICE CLONE READY</Text>
        </View>
        <Text style={styles.title}>Listen to Your Voice Preview</Text>
        <Text style={styles.subtitle}>
          Shield Call generated this sample using your trained voice model. This is how you will sound to incoming callers.
        </Text>
      </View>

      <View style={styles.playerContainer}>
        <Pressable
          testID="preview-play-pause-button"
          onPress={togglePlayback}
          style={({ pressed }) => [
            styles.playButton,
            pressed ? styles.playButtonPressed : null
          ]}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause Preview" : "Play Preview"}
        >
          <Text style={styles.playButtonIcon}>{isPlaying ? "⏸" : "▶"}</Text>
        </Pressable>

        <View style={styles.waveformSection}>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressBar, { width: `${progressPercent}%` }]}
              testID="preview-progress-bar"
            />
          </View>
          <View style={styles.timeRow}>
            <Text style={styles.timeText} testID="preview-current-time">
              {formatSeconds(currentTime)}
            </Text>
            <Text style={styles.timeText}>
              {formatSeconds(status.duration)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.confirmationBox}>
        <Text style={styles.confirmationText}>
          Your Shield Number is active and configured with this voice profile.
        </Text>
      </View>

      <Pressable
        testID="complete-onboarding-button"
        onPress={handleFinish}
        disabled={isCompleting}
        style={({ pressed }) => [
          styles.completeButton,
          pressed && !isCompleting ? styles.buttonPressed : null,
          isCompleting ? styles.buttonDisabled : null
        ]}
        accessibilityRole="button"
        accessibilityLabel="Finish Onboarding"
      >
        <Text style={styles.completeButtonText}>Finish Onboarding</Text>
      </Pressable>
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
  header: {
    alignItems: "center",
    gap: spacing.xs
  },
  successBadge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    marginBottom: spacing.xs
  },
  successBadgeText: {
    color: colors.primary,
    fontSize: typography.caption - 1,
    fontWeight: "700",
    letterSpacing: 0.5
  },
  title: {
    fontSize: typography.title,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center"
  },
  subtitle: {
    fontSize: typography.caption,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 18
  },
  playerContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  playButton: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  playButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }]
  },
  playButtonIcon: {
    color: colors.surface,
    fontSize: 22
  },
  waveformSection: {
    flex: 1,
    gap: spacing.xs
  },
  progressTrack: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    overflow: "hidden"
  },
  progressBar: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: radii.pill
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  timeText: {
    fontSize: typography.caption - 2,
    color: colors.muted,
    fontVariant: ["tabular-nums"]
  },
  confirmationBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#B8E2CC"
  },
  confirmationText: {
    color: colors.primary,
    fontSize: typography.caption,
    textAlign: "center",
    fontWeight: "500"
  },
  completeButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }]
  },
  buttonDisabled: {
    opacity: 0.6
  },
  completeButtonText: {
    color: colors.surface,
    fontSize: typography.body,
    fontWeight: "600"
  }
});
