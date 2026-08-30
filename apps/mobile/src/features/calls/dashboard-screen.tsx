import type { CallListItem } from "@call-screener/contracts";
import Animated, { FadeIn } from "react-native-reanimated";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CallHistoryRow } from "../../components/calls/call-history-row";
import { MetricsGrid } from "../../components/calls/metrics-grid";
import { EmptyState, ErrorState, LoadingState } from "../../components/calls/state-views";
import { getRetryableErrorMessage, shouldShowRetry } from "./error-helpers";
import { useSession } from "../../auth/session";
import { useCallsHistory } from "./use-calls-history";
import { useDashboardMetrics } from "./use-dashboard-metrics";
import { colors, spacing, typography } from "../../theme/tokens";

export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const session = useSession();
  const metricsQuery = useDashboardMetrics();
  const callsQuery = useCallsHistory();
  const calls = callsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const isInitialLoading = metricsQuery.isLoading || callsQuery.isLoading;
  const hasBlockingError =
    (metricsQuery.isError && shouldShowRetry(metricsQuery.error, session.state.kind === "signedIn")) ||
    (callsQuery.isError && shouldShowRetry(callsQuery.error, session.state.kind === "signedIn"));
  const isRefreshing = metricsQuery.isRefetching || callsQuery.isRefetching;

  const refresh = () => {
    void Promise.all([metricsQuery.refetch(), callsQuery.refetch()]);
  };

  const renderItem = ({ item }: { item: CallListItem }) => <CallHistoryRow call={item} />;

  if (isInitialLoading) {
    return <LoadingState label="Loading your dashboard…" />;
  }

  if (hasBlockingError) {
    const error = metricsQuery.error ?? callsQuery.error;
    return (
      <ErrorState
        message={getRetryableErrorMessage(error)}
        onRetry={refresh}
      />
    );
  }

  return (
    <FlatList
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + spacing.lg, paddingTop: insets.top + spacing.md }
      ]}
      data={calls}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <EmptyState
          message="Screened calls will appear here once your shield number starts receiving traffic."
          title="No calls yet"
        />
      }
      ListFooterComponent={
        callsQuery.isFetchingNextPage ? (
          <View style={styles.footer}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.footerLabel}>Loading more calls…</Text>
          </View>
        ) : null
      }
      ListHeaderComponent={
        <Animated.View entering={FadeIn.duration(180)} style={styles.headerBlock}>
          <Text style={styles.heading}>Shield Call</Text>
          <Text style={styles.subheading}>Recent activity from your AI screener</Text>
          {metricsQuery.data ? <MetricsGrid metrics={metricsQuery.data} /> : null}
          <Text style={styles.sectionTitle}>Call history</Text>
        </Animated.View>
      }
      onEndReached={() => {
        if (callsQuery.hasNextPage && !callsQuery.isFetchingNextPage) {
          void callsQuery.fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.4}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.primary} />}
      renderItem={renderItem}
      {...(Platform.OS === "ios" ? { contentInsetAdjustmentBehavior: "automatic" as const } : {})}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingHorizontal: spacing.md
  },
  footer: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg
  },
  footerLabel: {
    color: colors.muted,
    fontSize: typography.caption
  },
  headerBlock: {
    gap: spacing.md,
    marginBottom: spacing.sm
  },
  heading: {
    color: colors.ink,
    fontSize: typography.heading,
    fontWeight: "700"
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: "600"
  },
  subheading: {
    color: colors.muted,
    fontSize: typography.body
  }
});
