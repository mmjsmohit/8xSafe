import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loginRequestSchema } from "@call-screener/contracts";
import { useSession } from "../../auth/session";
import { colors, radii, spacing, typography } from "../../theme/tokens";
import { loginOwner } from "./auth-api";
import { fetchOwnerMe } from "../onboarding/onboarding-api";

export function LoginScreen() {
  const router = useRouter();
  const { establish } = useSession();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    let isValid = true;
    setEmailError(null);
    setPasswordError(null);
    setGeneralError(null);

    const parsed = loginRequestSchema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "email" && !emailError) {
          setEmailError("Please enter a valid email address");
          isValid = false;
        }
        if (issue.path[0] === "password" && !passwordError) {
          setPasswordError("Password must be between 8 and 200 characters");
          isValid = false;
        }
      }
      if (isValid) {
        setGeneralError("Please check your email and password");
        isValid = false;
      }
    }
    return isValid;
  };

  const handleLogin = async () => {
    if (!validate()) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSubmitting(true);
    setGeneralError(null);

    try {
      const session = await loginOwner({
        email: email.trim(),
        password
      });

      await establish({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Check onboarding state to navigate to the correct destination
      try {
        const me = await fetchOwnerMe();
        if (me.onboarding.status === "complete") {
          router.replace("/(app)");
        } else {
          router.replace("/(app)/onboarding");
        }
      } catch {
        router.replace("/(app)/onboarding");
      }
    } catch (error) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = error instanceof Error ? error.message : "Failed to sign in. Please try again.";
      setGeneralError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
      testID="login-screen"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.scrollContainer,
          {
            paddingTop: Math.max(insets.top + spacing.lg, spacing.xl),
            paddingBottom: Math.max(insets.bottom + spacing.lg, spacing.xl)
          }
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Shield Call</Text>
          </View>
          <Text style={styles.title}>Sign in to your account</Text>
          <Text style={styles.subtitle}>
            Manage your AI call screener, voice clone, and incoming calls
          </Text>
        </View>

        <View style={styles.card}>
          {generalError ? (
            <View style={styles.errorBanner} testID="login-error-message">
              <Text style={styles.errorBannerText} selectable>
                {generalError}
              </Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              testID="login-email-input"
              style={[styles.input, emailError ? styles.inputError : null]}
              placeholder="owner@example.com"
              placeholderTextColor={colors.muted}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (emailError) setEmailError(null);
                if (generalError) setGeneralError(null);
              }}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="next"
              editable={!isSubmitting}
            />
            {emailError ? (
              <Text style={styles.fieldError} testID="login-email-error">
                {emailError}
              </Text>
            ) : null}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              testID="login-password-input"
              style={[styles.input, passwordError ? styles.inputError : null]}
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (passwordError) setPasswordError(null);
                if (generalError) setGeneralError(null);
              }}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!isSubmitting}
            />
            {passwordError ? (
              <Text style={styles.fieldError} testID="login-password-error">
                {passwordError}
              </Text>
            ) : null}
          </View>

          <Pressable
            testID="login-submit-button"
            onPress={handleLogin}
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.button,
              pressed && !isSubmitting ? styles.buttonPressed : null,
              isSubmitting ? styles.buttonDisabled : null
            ]}
            accessibilityRole="button"
            accessibilityLabel="Sign In"
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.surface} size="small" />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.md
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.lg
  },
  badge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    marginBottom: spacing.sm
  },
  badgeText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: typography.caption,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  title: {
    fontSize: typography.heading,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
    marginBottom: spacing.xs
  },
  subtitle: {
    fontSize: typography.body,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 320
  },
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
