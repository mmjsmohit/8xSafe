import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionStatus } from "expo";
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState
} from "expo-audio";
import * as Haptics from "expo-haptics";
import type { MeResponse, OnboardingProfileRequest } from "@call-screener/contracts";
import {
  fetchOwnerMe,
  fetchVoicePreview,
  submitOnboardingProfile,
  uploadVoiceSample,
  type VoicePreviewResponse
} from "./onboarding-api";
import {
  MAX_RECORDING_SECONDS,
  type CloneStatus,
  type MicPermissionState,
  type OnboardingStep
} from "./types";
import {
  validateVoiceCloneInput,
  validateVoiceRecordingDuration
} from "./validation";

async function deleteLocalAudioFile(uri: string | null): Promise<void> {
  if (!uri || !uri.startsWith("file://")) return;
  try {
    const FileSystem = await import("expo-file-system/legacy");
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // Ignore local cleanup error
  }
}

export function useOnboarding() {
  const [step, setStep] = useState<OnboardingStep>("profile");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [isLoadingMe, setIsLoadingMe] = useState(true);
  const [meError, setMeError] = useState<string | null>(null);

  // Profile Form state
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);

  // Voice Consent
  const [hasConsent, setHasConsent] = useState(false);

  // Microphone Permission
  const [permissionState, setPermissionState] = useState<MicPermissionState>("undetermined");

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [durationError, setDurationError] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const recordingUriRef = useRef<string | null>(null);

  // Audio Recorder from expo-audio
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  // Cloning state
  const [cloneStatus, setCloneStatus] = useState<CloneStatus>("idle");
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [isRetryable, setIsRetryable] = useState(true);

  // Preview state
  const [previewData, setPreviewData] = useState<VoicePreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Completion state
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  // Keep recordingUriRef in sync for cleanup
  useEffect(() => {
    recordingUriRef.current = recordingUri;
  }, [recordingUri]);

  // Clean up recording file on unmount
  useEffect(() => {
    return () => {
      if (recordingUriRef.current) {
        void deleteLocalAudioFile(recordingUriRef.current);
      }
    };
  }, []);

  // Load Voice Preview - fails closed, never substitutes synthetic audio
  const loadPreview = useCallback(async () => {
    setIsLoadingPreview(true);
    setPreviewError(null);
    try {
      const preview = await fetchVoicePreview();
      setPreviewData(preview);
    } catch (err) {
      setPreviewData(null);
      const msg = err instanceof Error ? err.message : "Failed to load voice preview";
      setPreviewError(msg);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  // Check initial permissions
  useEffect(() => {
    void (async () => {
      try {
        const result = await getRecordingPermissionsAsync();
        if (result.status === PermissionStatus.GRANTED) {
          setPermissionState("granted");
          try {
            await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
          } catch {
            // ignore audio mode errors in dev/testing
          }
        } else if (result.status === PermissionStatus.DENIED) {
          setPermissionState("denied");
        } else {
          setPermissionState("undetermined");
        }
      } catch {
        setPermissionState("undetermined");
      }
    })();
  }, []);

  // Request Microphone Permission
  const requestMicPermission = useCallback(async () => {
    try {
      const result = await requestRecordingPermissionsAsync();
      if (result.granted || result.status === PermissionStatus.GRANTED) {
        setPermissionState("granted");
        try {
          await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
        } catch {
          // ignore
        }
      } else {
        setPermissionState("denied");
      }
    } catch {
      setPermissionState("denied");
    }
  }, []);

  // Fetch initial profile & shield number
  const loadMe = useCallback(async () => {
    setIsLoadingMe(true);
    setMeError(null);
    try {
      const data = await fetchOwnerMe();
      setMe(data);

      // Derive initial step from onboarding status
      if (data.onboarding.status === "profile_required") {
        setStep("profile");
      } else if (data.onboarding.status === "voice_required") {
        if (data.voice.status === "ready") {
          setStep("voice_preview");
          void loadPreview();
        } else if (data.voice.status === "failed") {
          setStep("voice_cloning");
          setCloneStatus("failed");
          setCloneError("Previous voice clone failed. Please retry or record a new sample.");
        } else if (data.voice.status === "processing") {
          setStep("voice_cloning");
          setCloneStatus("processing");
          void pollVoiceStatus();
        } else {
          setStep("voice_consent");
        }
      } else {
        setStep("complete");
      }
    } catch (err) {
      setMeError(err instanceof Error ? err.message : "Failed to load owner profile");
    } finally {
      setIsLoadingMe(false);
    }
  }, [loadPreview]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  // Handle Profile Save
  const handleSaveProfile = useCallback(async (values: OnboardingProfileRequest) => {
    setIsSubmittingProfile(true);
    try {
      const updated = await submitOnboardingProfile(values);
      setMe(updated);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (updated.onboarding.status === "voice_required") {
        setStep("voice_consent");
      } else {
        setStep("complete");
      }
    } finally {
      setIsSubmittingProfile(false);
    }
  }, []);

  // Stop recording internal helper - fails closed, never fabricates a URI
  const handleStopRecordingInternal = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);

    try {
      await audioRecorder.stop();
    } catch {
      // Ignore stop errors if already stopped
    }

    const finalDuration = Math.round(
      Math.max(
        (Date.now() - startTimeRef.current) / 1000,
        recorderState.durationMillis / 1000,
        durationSeconds
      )
    );
    setDurationSeconds(finalDuration);

    const uri = audioRecorder.uri ?? recorderState.url;
    if (!uri) {
      setRecordingUri(null);
      setDurationError("Failed to access recorded audio file. Please try recording again.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setRecordingUri(uri);

    // Validate duration: 60s to 180s
    const durationCheck = validateVoiceRecordingDuration(finalDuration);
    if (!durationCheck.isValid) {
      setDurationError(durationCheck.errorMessage);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      setDurationError(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [audioRecorder, durationSeconds, recorderState.durationMillis, recorderState.url]);

  // Start Recording - fails closed if prepare or record fails
  const handleStartRecording = useCallback(async () => {
    setDurationError(null);
    setRecordingError(null);
    if (recordingUri) {
      void deleteLocalAudioFile(recordingUri);
      setRecordingUri(null);
    }
    setDurationSeconds(0);

    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record({ forDuration: MAX_RECORDING_SECONDS });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start microphone recording";
      setRecordingError(msg);
      setIsRecording(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsRecording(true);
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setDurationSeconds(elapsed);

      // Auto-stop at 180s
      if (elapsed >= MAX_RECORDING_SECONDS) {
        void handleStopRecordingInternal();
      }
    }, 250);
  }, [audioRecorder, handleStopRecordingInternal, recordingUri]);

  // Stop Recording
  const handleStopRecording = useCallback(async () => {
    await handleStopRecordingInternal();
  }, [handleStopRecordingInternal]);

  // Reset / Re-record with safe local cleanup
  const handleResetRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setDurationSeconds(0);
    if (recordingUri) {
      void deleteLocalAudioFile(recordingUri);
    }
    setRecordingUri(null);
    setDurationError(null);
    setRecordingError(null);
  }, [recordingUri]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Poll voice processing status with bounded retries
  const pollVoiceStatus = useCallback(
    async (maxAttempts = 30, intervalMs = 1000) => {
      setCloneStatus("processing");
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        try {
          const currentMe = await fetchOwnerMe();
          setMe(currentMe);

          if (currentMe.voice.status === "ready") {
            setCloneStatus("ready");
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setStep("voice_preview");
            await loadPreview();
            return;
          }

          if (currentMe.voice.status === "failed") {
            setCloneStatus("failed");
            setCloneError("Voice clone processing failed on server. Please retry.");
            setIsRetryable(currentMe.voice.retryable);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return;
          }
        } catch {
          // ignore transient poll error and retry next cycle
        }
      }

      // Timed out
      setCloneStatus("failed");
      setCloneError("Voice clone processing timed out. Please retry.");
      setIsRetryable(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    [loadPreview]
  );

  // Upload Voice Sample & Clone - handles processing polling and failure cleanly
  const handleUploadClone = useCallback(async () => {
    if (!recordingUri) {
      setDurationError("No recording found. Please record a voice sample first.");
      return;
    }

    const check = validateVoiceCloneInput({
      consent: hasConsent,
      durationSeconds
    });

    if (!check.success) {
      setDurationError(check.error);
      return;
    }

    setStep("voice_cloning");
    setCloneStatus("uploading");
    setCloneError(null);

    try {
      const cloneResponse = await uploadVoiceSample({
        fileUri: recordingUri,
        durationSeconds: Math.round(durationSeconds),
        consent: true,
        fileName: "voice_sample.m4a",
        mimeType: "audio/m4a"
      });

      if (cloneResponse.voice.status === "failed") {
        setCloneStatus("failed");
        setCloneError("Voice clone generation failed. Please retry.");
        setIsRetryable(cloneResponse.voice.retryable);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      if (cloneResponse.voice.status === "processing") {
        await pollVoiceStatus();
        return;
      }

      if (cloneResponse.voice.status === "ready") {
        setCloneStatus("ready");
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setStep("voice_preview");
        await loadPreview();
      }
    } catch (err) {
      setCloneStatus("failed");
      const message = err instanceof Error ? err.message : "Voice clone upload failed";
      setCloneError(message);
      setIsRetryable(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [durationSeconds, hasConsent, loadPreview, pollVoiceStatus, recordingUri]);

  // Complete onboarding with server confirmation
  const completeOnboarding = useCallback(async (): Promise<boolean> => {
    if (!previewData || !previewData.audioBase64) {
      setFinishError("Cannot complete onboarding: voice preview has not loaded.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return false;
    }

    setIsFinishing(true);
    setFinishError(null);

    try {
      const currentMe = await fetchOwnerMe();
      setMe(currentMe);

      if (currentMe.voice.status !== "ready" && currentMe.onboarding.status !== "complete") {
        setFinishError(
          "Cannot complete onboarding: server has not confirmed your voice clone is ready."
        );
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return false;
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (recordingUri) {
        void deleteLocalAudioFile(recordingUri);
      }
      return true;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to verify onboarding completion with server";
      setFinishError(msg);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return false;
    } finally {
      setIsFinishing(false);
    }
  }, [previewData, recordingUri]);

  return {
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
    recordingError,
    handleStartRecording,
    handleStopRecording,
    handleResetRecording,

    // Clone
    cloneStatus,
    cloneError,
    isRetryable,
    handleUploadClone,
    pollVoiceStatus,

    // Preview
    previewData,
    previewError,
    isLoadingPreview,
    loadPreview,

    // Finish
    completeOnboarding,
    isFinishing,
    finishError
  };
}
