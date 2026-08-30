import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "shield-call.access-token";
const REFRESH_TOKEN_KEY = "shield-call.refresh-token";

export const tokenStore = {
  readAccessToken: () => SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
  readRefreshToken: () => SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  async save(input: { accessToken: string; refreshToken: string }) {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, input.accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, input.refreshToken)
    ]);
  },
  async clear() {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
    ]);
  }
};

