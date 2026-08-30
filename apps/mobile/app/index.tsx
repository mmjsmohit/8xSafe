import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "../src/auth/session";
import { colors } from "../src/theme/tokens";

export default function EntryScreen() {
  const { state } = useSession();
  if (state.kind === "loading") {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>;
  }
  return <Redirect href={state.kind === "signedIn" ? "/(app)" : "/(auth)/login"} />;
}

