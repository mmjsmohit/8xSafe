import { Stack, useLocalSearchParams } from "expo-router";
import { CallDetailScreen } from "../../../src/features/calls/call-detail-screen";

export default function CallDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ headerLargeTitle: false, title: "Call details" }} />
      <CallDetailScreen callId={typeof id === "string" ? id : ""} />
    </>
  );
}
