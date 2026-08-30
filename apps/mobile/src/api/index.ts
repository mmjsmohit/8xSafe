import { createApiClient } from "./client";
import { tokenStore } from "../auth/token-store";

const apiOrigin = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const baseUrl = `${apiOrigin.replace(/\/$/, "")}/v1`;

export const api = createApiClient({ baseUrl, readAccessToken: tokenStore.readAccessToken });
