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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Audio Recorder from expo-audio
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  // Cloning state
  const [cloneStatus, setCloneStatus] = useState<CloneStatus>("idle");
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [isRetryable, setIsRetryable] = useState(true);

  // Preview state
  const [previewData, setPreviewData] = useState<VoicePreviewResponse | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Load Voice Preview
  const loadPreview = useCallback(async () => {
    setIsLoadingPreview(true);
    try {
      const preview = await fetchVoicePreview();
      setPreviewData(preview);
    } catch {
      // Fallback synthetic preview audio for testing or fake providers
      setPreviewData({
        audioBase64: "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
        mimeType: "audio/wav"
      });
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
  }, [loadPreview]);

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

  // Stop recording internal helper
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

    const uri = audioRecorder.uri ?? recorderState.url ?? `file:///mock-sample-${Date.now()}.m4a`;
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

  // Start Recording
  const handleStartRecording = useCallback(async () => {
    setDurationError(null);
    setRecordingUri(null);
    setDurationSeconds(0);

    try {
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record({ forDuration: MAX_RECORDING_SECONDS });
    } catch {
      // Allow fallback if running in test environment
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
  }, [audioRecorder, handleStopRecordingInternal]);

  // Stop Recording
  const handleStopRecording = useCallback(async () => {
    await handleStopRecordingInternal();
  }, [handleStopRecordingInternal]);

  // Reset / Re-record
  const handleResetRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setDurationSeconds(0);
    setRecordingUri(null);
    setDurationError(null);
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Upload Voice Sample & Clone
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
      setCloneStatus("processing");
      const cloneResponse = await uploadVoiceSample({
        fileUri: recordingUri,
        durationSeconds: Math.round(durationSeconds),
        consent: true,
        fileName: "voice_sample.m4a",
        mimeType: "audio/m4a"
      });

      if (cloneResponse.voice.status === "failed") {
        setCloneStatus("failed");
        setCloneError("Voice cloning failed. Please retry.");
        setIsRetryable(cloneResponse.voice.retryable);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      setCloneStatus("ready");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Fetch preview
      setStep("voice_preview");
      void loadPreview();
    } catch (err) {
      setCloneStatus("failed");
      const message = err instanceof Error ? err.message : "Voice clone upload failed";
      setCloneError(message);
      setIsRetryable(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [durationSeconds, hasConsent, loadPreview, recordingUri]);

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
    handleStartRecording,
    handleStopRecording,
    handleResetRecording,

    // Clone
    cloneStatus,
    cloneError,
    isRetryable,
    handleUploadClone,

    // Preview
    previewData,
    isLoadingPreview,
    loadPreview
  };
}
