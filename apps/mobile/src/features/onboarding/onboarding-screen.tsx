import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { colors, radii, spacing, typography } from "../../theme/tokens";
import { ProfileForm } from "../../components/onboarding/profile-form";
import { VoiceConsentCard } from "../../components/onboarding/voice-consent-card";
import { RecordingControls } from "../../components/onboarding/recording-controls";
import { CloneProgressCard } from "../../components/onboarding/clone-progress-card";
import { VoicePreviewPlayer } from "../../components/onboarding/voice-preview-player";
import { StepIndicator } from "../../components/onboarding/step-indicator";
import { useOnboarding } from "./use-onboarding";

export function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    step,
    setStep,
    me,
    isLoadingMe,
    meError,
    loadMe,

    // Profile
    isSubmittingProfile,
    handleSaveProfile,

    // Consent
    hasConsent,
    setHasConsent,

    // Permission
    permissionState,
    requestMicPermission,

    // Recording
    isRecording,
    durationSeconds,
    recordingUri,
    durationError,
    handleStartRecording,
    handleStopRecording,
    handleResetRecording,

    // Clone
    cloneStatus,
    cloneError,
    isRetryable,
    handleUploadClone,

    // Preview
    previewData
  } = useOnboarding();

  const getStepIndex = (): number => {
    switch (step) {
      case "profile":
        return 0;
      case "voice_consent":
      case "voice_record":
      case "voice_cloning":
        return 1;
      case "voice_preview":
      case "complete":
        return 2;
    }
  };

  const handleFinishOnboarding = () => {
    router.replace("/(app)");
  };

  if (isLoadingMe) {
    return (
      <View style={styles.loadingContainer} testID="onboarding-loading-state">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading your onboarding setup...</Text>
      </View>
    );
  }

  if (meError && !me) {
    return (
      <View style={styles.errorContainer} testID="onboarding-error-state">
        <Text style={styles.errorTitle}>Could Not Load Onboarding</Text>
        <Text style={styles.errorBody}>{meError}</Text>
        <Pressable
          onPress={() => void loadMe()}
          style={({ pressed }) => [styles.retryButton, pressed ? styles.buttonPressed : null]}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const shieldNumber = me?.shieldNumber ?? "+14155550199";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
      testID="onboarding-screen"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.scrollContainer,
          {
            paddingTop: Math.max(insets.top + spacing.sm, spacing.md),
            paddingBottom: Math.max(insets.bottom + spacing.lg, spacing.xl)
          }
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Account Onboarding</Text>
          <Text style={styles.headerSubtitle}>
            Configure your Shield Number and set up your personalized voice agent
          </Text>
        </View>

        <StepIndicator currentStepIndex={getStepIndex()} />

        <Animated.View
          entering={FadeIn.duration(250).reduceMotion(ReduceMotion.System)}
          style={styles.contentSection}
          key={step}
        >
          {step === "profile" && (
            <ProfileForm
              shieldNumber={shieldNumber}
              initialDisplayName={me?.displayName}
              initialForwardingNumber={me?.forwardingNumber}
              onSubmit={handleSaveProfile}
              isSubmitting={isSubmittingProfile}
            />
          )}

          {step === "voice_consent" && (
            <VoiceConsentCard
              hasConsent={hasConsent}
              onConsentChange={setHasConsent}
              onContinue={() => setStep("voice_record")}
            />
          )}

          {step === "voice_record" && (
            <RecordingControls
              permissionState={permissionState}
              onRequestPermission={requestMicPermission}
              isRecording={isRecording}
              durationSeconds={durationSeconds}
              recordingUri={recordingUri}
              durationError={durationError}
              onStartRecording={handleStartRecording}
              onStopRecording={handleStopRecording}
              onResetRecording={handleResetRecording}
              onProceedToUpload={() => void handleUploadClone()}
            />
          )}

          {step === "voice_cloning" && (
            <CloneProgressCard
              status={cloneStatus}
              errorMessage={cloneError}
              isRetryable={isRetryable}
              onRetry={() => void handleUploadClone()}
              onReRecord={() => {
                handleResetRecording();
                setStep("voice_record");
              }}
            />
          )}

          {(step === "voice_preview" || step === "complete") && previewData && (
            <VoicePreviewPlayer
              preview={previewData}
              onComplete={handleFinishOnboarding}
            />
          )}
        </Animated.View>
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
    paddingHorizontal: spacing.md,
    gap: spacing.md
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl
  },
  loadingText: {
    color: colors.muted,
    fontSize: typography.body
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.xl
  },
  errorTitle: {
    fontSize: typography.title,
    fontWeight: "700",
    color: colors.ink
  },
  errorBody: {
    fontSize: typography.body,
    color: colors.muted,
    textAlign: "center"
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.sm,
    marginTop: spacing.md
  },
  retryButtonText: {
    color: colors.surface,
    fontWeight: "600",
    fontSize: typography.body
  },
  header: {
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.xs
  },
  headerTitle: {
    fontSize: typography.heading,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center"
  },
  headerSubtitle: {
    fontSize: typography.caption,
    color: colors.muted,
    textAlign: "center",
    maxWidth: 340,
    lineHeight: 18
  },
  contentSection: {
    flex: 1
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }]
  }
});
