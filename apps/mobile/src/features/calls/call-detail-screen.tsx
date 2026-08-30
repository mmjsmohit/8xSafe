import Animated, { FadeIn } from "react-native-reanimated";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  SummaryCard,
  TranscriptCard,
  TransferOutcomeCard
} from "../../components/calls/call-detail-sections";
import { EvidenceList, RiskAssessmentCard } from "../../components/calls/risk-evidence";
import { ErrorState, LoadingState } from "../../components/calls/state-views";
import { formatCallTimestamp, formatCallerLabel, formatDuration } from "./format";
import { getRetryableErrorMessage, shouldShowRetry } from "./error-helpers";
import { callCategoryLabels, callOutcomeLabels } from "./labels";
import { useSession } from "../../auth/session";
import { useCallDetail } from "./use-call-detail";
import { colors, spacing, typography } from "../../theme/tokens";

type CallDetailScreenProps = {
  callId: string;
};

export function CallDetailScreen({ callId }: CallDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const session = useSession();
  const query = useCallDetail(callId);

  if (query.isLoading) {
    return <LoadingState label="Loading call details…" />;
  }

  if (query.isError && shouldShowRetry(query.error, session.state.kind === "signedIn")) {
    return (
      <ErrorState
        message={getRetryableErrorMessage(query.error)}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  }

  if (!query.data) {
    return <LoadingState label="Loading call details…" />;
  }

  const call = query.data;
  const callerLabel = formatCallerLabel(call);

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + spacing.lg, paddingTop: spacing.md }
      ]}
      {...(Platform.OS === "ios" ? { contentInsetAdjustmentBehavior: "automatic" as const } : {})}
    >
      <Animated.View entering={FadeIn.duration(180)} style={styles.stack}>
        <View style={styles.hero}>
          <Text style={styles.caller} selectable>{callerLabel}</Text>
          <Text style={styles.meta} selectable>
            {formatCallTimestamp(call.startedAt)} · {callCategoryLabels[call.category]} · {callOutcomeLabels[call.outcome]} · {formatDuration(call.durationSeconds)}
          </Text>
        </View>
        <SummaryCard claimedCompany={call.claimedCompany} reason={call.reason} summary={call.summary} />
        <RiskAssessmentCard confidence={call.confidence} riskScore={call.riskScore} />
        <EvidenceList signals={call.signals} />
        <TranscriptCard transcript={call.transcript} />
        <TransferOutcomeCard transferStatus={call.transferStatus} />
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  caller: {
    color: colors.ink,
    fontSize: typography.heading,
    fontWeight: "700"
  },
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.md
  },
  hero: {
    gap: spacing.xs
  },
  meta: {
    color: colors.muted,
    fontSize: typography.body
  },
  stack: {
    gap: spacing.md
  }
});
