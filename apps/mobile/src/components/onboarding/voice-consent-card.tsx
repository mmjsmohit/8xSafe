import { Host, Switch } from "@expo/ui";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../../theme/tokens";

export type VoiceConsentCardProps = {
  hasConsent: boolean;
  onConsentChange: (consent: boolean) => void;
  onContinue: () => void;
};

export function VoiceConsentCard({
  hasConsent,
  onConsentChange,
  onContinue
}: VoiceConsentCardProps) {
  const toggleConsent = () => {
    void Haptics.selectionAsync();
    onConsentChange(!hasConsent);
  };

  const handleContinue = () => {
    if (!hasConsent) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onContinue();
  };

  return (
    <View style={styles.card} testID="voice-consent-card">
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>🎙️</Text>
        </View>
        <Text style={styles.title}>Voice Clone Consent</Text>
        <Text style={styles.subtitle}>
          Shield Call uses an AI clone of your voice so that when screening incoming calls, your assistant speaks with your authentic voice.
        </Text>
      </View>

      <View style={styles.noticeBox}>
        <Text style={styles.noticeHeading}>Important Privacy Commitments:</Text>
        <Text style={styles.noticeItem}>• Raw voice audio is used solely to generate the clone model and is never stored permanently.</Text>
        <Text style={styles.noticeItem}>• The voice clone is only activated for screening calls directed to your Shield Number.</Text>
        <Text style={styles.noticeItem}>• You can revoke consent and delete the voice clone at any time.</Text>
      </View>

      <Pressable
        onPress={toggleConsent}
        style={styles.toggleRow}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: hasConsent }}
        testID="voice-consent-row"
      >
        <Host style={styles.switchHost}>
          <Switch
            value={hasConsent}
            onValueChange={(val) => {
              void Haptics.selectionAsync();
              onConsentChange(val);
            }}
            testID="voice-consent-switch"
          />
        </Host>
        <Text style={styles.toggleText}>
          I explicitly consent to recording my voice and creating an AI voice clone for call screening.
        </Text>
      </Pressable>

      <Pressable
        testID="consent-continue-button"
        onPress={handleContinue}
        disabled={!hasConsent}
        style={({ pressed }) => [
          styles.button,
          pressed && hasConsent ? styles.buttonPressed : null,
          !hasConsent ? styles.buttonDisabled : null
        ]}
        accessibilityRole="button"
        accessibilityLabel="Continue to Voice Recording"
      >
        <Text style={styles.buttonText}>Continue to Voice Recording</Text>
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
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs
  },
  iconText: {
    fontSize: 24
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
  noticeBox: {
    backgroundColor: colors.background,
    borderRadius: radii.sm,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border
  },
  noticeHeading: {
    fontSize: typography.caption,
    fontWeight: "700",
    color: colors.ink
  },
  noticeItem: {
    fontSize: typography.caption - 1,
    color: colors.muted,
    lineHeight: 16
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs
  },
  switchHost: {
    width: 52,
    height: 32,
    justifyContent: "center"
  },
  toggleText: {
    flex: 1,
    fontSize: typography.caption,
    color: colors.ink,
    lineHeight: 18,
    fontWeight: "500"
  },
  button: {
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
    opacity: 0.5
  },
  buttonText: {
    color: colors.surface,
    fontSize: typography.body,
    fontWeight: "600"
  }
});
