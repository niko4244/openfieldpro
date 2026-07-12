"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { currentUser, logout } from "@/lib/api";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "owner" | "dispatcher" | "technician";
}

interface SessionContextValue {
  user: SessionUser | null;
  loading: boolean;
  signingOut: boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    currentUser()
      .then((nextUser) => {
        if (active) setUser(nextUser as SessionUser);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setUser(null);
      router.replace("/login");
      router.refresh();
      setSigningOut(false);
    }
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, signingOut, signOut }),
    [user, loading, signingOut, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessionUser() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSessionUser must be used inside SessionProvider");
  }
  return context;
}
