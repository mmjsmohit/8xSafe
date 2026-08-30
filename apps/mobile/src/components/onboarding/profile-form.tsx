import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as Haptics from "expo-haptics";
import { colors, radii, spacing, typography } from "../../theme/tokens";
import { ShieldNumberBanner } from "./shield-number-banner";
import { validateProfileInput, type ProfileValidationResult } from "../../features/onboarding/validation";

export type ProfileFormValues = {
  displayName: string;
  forwardingNumber: string;
};

export type ProfileFormProps = {
  shieldNumber: string;
  initialDisplayName?: string | null | undefined;
  initialForwardingNumber?: string | null | undefined;
  onSubmit: (values: ProfileFormValues) => Promise<void>;
  isSubmitting?: boolean | undefined;
};

export function ProfileForm({
  shieldNumber,
  initialDisplayName,
  initialForwardingNumber,
  onSubmit,
  isSubmitting = false
}: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [forwardingNumber, setForwardingNumber] = useState(initialForwardingNumber ?? "+91 ");
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const formatPhoneNumber = (text: string) => {
    let cleaned = text.trim();
    if (!cleaned.startsWith("+") && cleaned.length > 0) {
      if (cleaned.startsWith("91") && cleaned.length > 2) {
        cleaned = "+" + cleaned;
      } else {
        cleaned = "+91" + cleaned;
      }
    }
    return cleaned;
  };

  const validate = (): ProfileFormValues | null => {
    setNameError(null);
    setPhoneError(null);
    setSubmitError(null);

    const result: ProfileValidationResult = validateProfileInput({
      displayName,
      forwardingNumber
    });

    if (!result.success) {
      if (result.errors.displayName) setNameError(result.errors.displayName);
      if (result.errors.forwardingNumber) setPhoneError(result.errors.forwardingNumber);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return null;
    }

    return result.data;
  };

  const handleSubmit = async () => {
    const validated = validate();
    if (!validated) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await onSubmit(validated);
    } catch (error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = error instanceof Error ? error.message : "Failed to update profile";
      setSubmitError(message);
    }
  };

  return (
    <View style={styles.card} testID="profile-form">
      <ShieldNumberBanner shieldNumber={shieldNumber} />

      {submitError ? (
        <View style={styles.errorBanner} testID="profile-form-error">
          <Text style={styles.errorBannerText} selectable>
            {submitError}
          </Text>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>Your Name / Display Name</Text>
        <TextInput
          testID="display-name-input"
          style={[styles.input, nameError ? styles.inputError : null]}
          placeholder="e.g. Rahul Sharma"
          placeholderTextColor={colors.muted}
          value={displayName}
          onChangeText={(val) => {
            setDisplayName(val);
            if (nameError) setNameError(null);
            if (submitError) setSubmitError(null);
          }}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
          editable={!isSubmitting}
        />
        {nameError ? (
          <Text style={styles.fieldError} testID="display-name-error">
            {nameError}
          </Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Forwarding Phone Number (India E.164)</Text>
        <Text style={styles.fieldHint}>
          When a screened call is approved, it will be forwarded to this private number.
        </Text>
        <TextInput
          testID="forwarding-number-input"
          style={[styles.input, phoneError ? styles.inputError : null]}
          placeholder="+919876543210"
          placeholderTextColor={colors.muted}
          value={forwardingNumber}
          onChangeText={(val) => {
            setForwardingNumber(val);
            if (phoneError) setPhoneError(null);
            if (submitError) setSubmitError(null);
          }}
          onBlur={() => {
            setForwardingNumber((curr) => formatPhoneNumber(curr));
          }}
          keyboardType="phone-pad"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          editable={!isSubmitting}
        />
        {phoneError ? (
          <Text style={styles.fieldError} testID="forwarding-number-error">
            {phoneError}
          </Text>
        ) : null}
      </View>

      <Pressable
        testID="profile-submit-button"
        onPress={handleSubmit}
        disabled={isSubmitting}
        style={({ pressed }) => [
          styles.button,
          pressed && !isSubmitting ? styles.buttonPressed : null,
          isSubmitting ? styles.buttonDisabled : null
        ]}
        accessibilityRole="button"
        accessibilityLabel="Save and Continue"
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.surface} size="small" />
        ) : (
          <Text style={styles.buttonText}>Save Profile & Continue</Text>
        )}
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
  errorBanner: {
    backgroundColor: "#FDE8E8",
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.sm
  },
  errorBannerText: {
    color: colors.danger,
    fontSize: typography.caption,
    fontWeight: "500"
  },
  field: {
    gap: spacing.xs
  },
  label: {
    fontSize: typography.caption,
    fontWeight: "600",
    color: colors.ink
  },
  fieldHint: {
    fontSize: typography.caption - 1,
    color: colors.muted,
    lineHeight: 16
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: typography.body,
    color: colors.ink
  },
  inputError: {
    borderColor: colors.danger
  },
  fieldError: {
    color: colors.danger,
    fontSize: typography.caption
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
    opacity: 0.6
  },
  buttonText: {
    color: colors.surface,
    fontSize: typography.body,
    fontWeight: "600"
  }
});
