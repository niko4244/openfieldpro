"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

// Phase 7: foreground browser geolocation. The technician keeps this page
// open in their mobile browser; we ping POST /api/tech/location every
// 30 s (or sooner on > 50 m movement) while the tab is foreground.
// Background: when the tab backgrounds the watcher pauses on iOS/Android,
// so the dispatch board's freshness tier naturally fades to "stale".
//
// Online-toggle pings on visibility-flip use the lighter /api/tech/status
// endpoint so the dispatcher sees "Offline" within seconds of the tech
// backgrounding the tab (instead of waiting for the 30-min "dead" tier).
//
// ponytail: client-side throttle 30 s / 50 m + server's 5 s floor. The
//   server one is the safety net; the client one saves battery.
//   Ceiling: Significant Location Change API + native background pings
//   (deferred to a follow-up slice alongside Phase 9 cron work).

type PermissionStatus = "prompt" | "granted" | "denied" | "unknown";

interface PingState {
  lastSentAt: number;
  lastSentPos: { lat: number; lng: number } | null;
}

const MIN_INTERVAL_MS = 30_000;
const MIN_DISTANCE_M = 50;

function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000; // metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface TechTrackerProps {
  /** When true, the page already requested + received permission; skip the prompt. */
  initGranted?: boolean;
}

export function TechTracker({ initGranted = false }: TechTrackerProps) {
  const [permission, setPermission] = useState<PermissionStatus>(
    initGranted ? "granted" : "unknown",
  );
  const [sharing, setSharing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [lastPingAt, setLastPingAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<PingState>({ lastSentAt: 0, lastSentPos: null });

  // 1) Permission probe — best-effort. iOS Safari's Permissions API is
  //    inconsistent; we use it and fall back to "prompt" if not present.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
      setPermission(initGranted ? "granted" : "prompt");
      return;
    }
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" as any })
      .then((res) => {
        if (cancelled) return;
        setPermission(res.state as PermissionStatus);
        res.onchange = () => setPermission(res.state as PermissionStatus);
      })
      .catch(() => setPermission(initGranted ? "granted" : "prompt"));
    return () => {
      cancelled = true;
    };
  }, [initGranted]);

  // 2) Visibility handler.
  //    - hidden  : ping /api/tech/status with online:false so the dispatch
  //                board shows "Offline" within seconds.
  //    - visible : ping /api/tech/status with online:true so the dispatcher
  //                sees "I'm back" without waiting for the next position
  //                event (the watcher's `setSharing` auto-resume is separate).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => {
      setPaused(document.visibilityState !== "visible");
      if (document.visibilityState === "hidden") {
        void api.setSharingStatus(false).catch(() => {});
      } else {
        void api.setSharingStatus(true).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    onVis();
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // 3) Watcher setup — only after a Start tap (so we don't prompt until
  //    the user actually intends to share).
  const startSharing = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("This browser doesn't expose geolocation.");
      setPermission("denied");
      return;
    }
    setError(null);
    setSharing(true);
    const watcher = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracyM = pos.coords.accuracy;

        const now = Date.now();
        const st = stateRef.current;
        const tooSoon = now - st.lastSentAt < MIN_INTERVAL_MS;
        const tooClose =
          st.lastSentPos !== null &&
          haversineM(st.lastSentPos, { lat, lng }) < MIN_DISTANCE_M;
        if (tooSoon && tooClose) return;

        api
          .pingTechLocation({ lat, lng, accuracyM, online: true })
          .then(() => {
            stateRef.current.lastSentAt = now;
            stateRef.current.lastSentPos = { lat, lng };
            setLastPingAt(new Date(now));
            setPermission("granted");
          })
          .catch((e) => {
            // 429 is the server-side throttle kicking in; not an error
            // for the user — we just log and let the next event retry.
            if ((e as { status?: number }).status !== 429) {
              setError((e as Error).message ?? "ping failed");
            }
          });
      },
      (err) => {
        setError(err.message);
        if (err.code === err.PERMISSION_DENIED) setPermission("denied");
      },
      {
        enableHighAccuracy: true,
        timeout: 30_000,
        maximumAge: 60_000,
      },
    );
    return () => {
      navigator.geolocation.clearWatch(watcher);
    };
  };

  // Auto-start if already granted.
  useEffect(() => {
    if (permission === "granted" && !sharing) {
      const stop = startSharing();
      return stop;
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission]);

  const stopSharing = () => {
    setSharing(false);
    void api.setSharingStatus(false).catch(() => {});
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-fg">Tech Mode</h1>
        <p className="text-sm text-fg-muted mt-1">
          Keep this page open while you're in the field. Your live location
          appears on the dispatch board; closing the tab ends sharing.
        </p>
      </header>

      <div className="rounded-lg border border-border bg-surface-100 p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-fg">
              Sharing is {sharing ? "on" : "off"}
              {paused && sharing ? " · tab backgrounded" : ""}
            </p>
            <p className="text-xs text-fg-dim mt-1">
              {lastPingAt
                ? `Last ping at ${lastPingAt.toLocaleTimeString()}`
                : sharing
                  ? "Waiting for first GPS lock…"
                  : "Tap Start to share your location."}
            </p>
          </div>
          <div>
            {sharing ? (
              <button
                type="button"
                onClick={stopSharing}
                className="px-4 py-2 rounded-lg bg-fg-dim/20 text-fg hover:bg-fg-dim/30 transition-colors text-sm border-none cursor-pointer"
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={startSharing}
                disabled={permission === "denied"}
                className="px-4 py-2 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors text-sm border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Start sharing
              </button>
            )}
          </div>
        </div>

        {permission === "denied" ? (
          <p className="text-xs text-red rounded bg-red/5 p-2">
            Location access is denied in this browser. Open the site
            settings and allow location, then return here.
          </p>
        ) : null}
        {error && permission !== "denied" ? (
          <p className="text-xs text-fg-muted rounded bg-fg-dim/10 p-2">
            {error}
          </p>
        ) : null}
      </div>

      <div className="text-xs text-fg-dim">
        <p>
          We ping every 30 seconds (or sooner when you move more than 50 m).
          The dispatch board fades your dot as the freshness decays.
        </p>
      </div>
    </div>
  );
}
