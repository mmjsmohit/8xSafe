import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { tokenStore } from "./token-store";

type SessionState =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "signedIn" };

type SessionContextValue = {
  state: SessionState;
  establish: (tokens: { accessToken: string; refreshToken: string }) => Promise<void>;
  clear: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SessionState>({ kind: "loading" });

  useEffect(() => {
    void tokenStore.readRefreshToken().then((token) => {
      setState(token === null ? { kind: "signedOut" } : { kind: "signedIn" });
    });
  }, []);

  const value = useMemo<SessionContextValue>(() => ({
    state,
    async establish(tokens) {
      await tokenStore.save(tokens);
      setState({ kind: "signedIn" });
    },
    async clear() {
      await tokenStore.clear();
      setState({ kind: "signedOut" });
    }
  }), [state]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error("useSession must be called inside SessionProvider");
  return value;
}

