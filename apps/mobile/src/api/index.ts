import { createApiClient } from "./client";
import { tokenStore } from "../auth/token-store";

const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export const api = createApiClient({ baseUrl, readAccessToken: tokenStore.readAccessToken });

