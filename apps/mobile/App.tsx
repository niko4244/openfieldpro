// OpenFieldPro technician app — sign-in, then a dashboard with stat cards,
// appointments, and job cards. Plan-aware: the free tier shows the sponsor
// banner; pro/business hide it (same open-core gate as the web app).
// Run: pnpm --filter @ofp/mobile dev  (requires Expo Go or a simulator).
import { useEffect, useState, useMemo, useRef } from "react";
import { StatusBar } from "expo-status-bar";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import type { JobDTO } from "@ofp/shared";
import { formatMoney } from "@ofp/shared";
import { StatCard } from "./components/StatCard";
import { JobCard } from "./components/JobCard";
import { AppointmentCard } from "./components/AppointmentCard";
import { LoginScreen } from "./components/LoginScreen";
import { SponsorBanner } from "./components/SponsorBanner";
import { SyncService } from "./src/sync";
import {
  API,
  api,
  getToken,
  hasToken,
  setToken,
  type AppointmentDTO,
  type InvoiceDTO,
  type SessionUser,
} from "./src/api";

export default function App() {
  const [authed, setAuthed] = useState(hasToken());
  const [user, setUser] = useState<SessionUser | null>(null);

  if (!authed) {
    return (
      <LoginScreen
        onLogin={(u) => {
          setUser(u);
          setAuthed(true);
        }}
      />
    );
  }
  return (
    <Dashboard
      user={user}
      onLogout={() => {
        setToken(null);
        setUser(null);
        setAuthed(false);
      }}
    />
  );
}

function Dashboard({ user, onLogout }: { user: SessionUser | null; onLogout: () => void }) {
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [appointments, setAppointments] = useState<AppointmentDTO[]>([]);
  const [invoices, setInvoices] = useState<InvoiceDTO[]>([]);
  const [plan, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const syncRef = useRef<SyncService | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [jr, ar, ir, org] = await Promise.all([
          api.jobs(),
          api.appointments(),
          api.invoices(),
          api.org(),
        ]);
        if (!cancelled) {
          setJobs(jr);
          setAppointments(ar);
          setInvoices(ir);
          setPlan(org?.plan ?? "free");
        }
      } catch (e) {
        if (!cancelled) setErr(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    // Init sync service and pull on mount + every 30s
    const orgId = process.env.EXPO_PUBLIC_ORG_ID ?? "";
    syncRef.current = new SyncService({ apiUrl: API, orgId, token: getToken() });

    const doSync = () => {
      syncRef.current
        ?.pull()
        .then((_res) => {
          setLastSync(new Date().toLocaleTimeString());
          // ponytail: results are logged but not applied to local mirror yet
          // Ceiling: when we add a real SQLite mirror, pipe res.results here
          // Upgrade: connect Mirror to expo-sqlite and upsert each result row
        })
        .catch((e) => setErr(String(e)));
    };

    doSync();
    const interval = setInterval(doSync, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // ── Computed metrics ──
  const stats = useMemo(() => {
    const active =
      jobs.filter((j) => j.status === "scheduled" || j.status === "in_progress")
        .length;
    const completed = jobs.filter((j) => j.status === "completed").length;
    const revenue = jobs
      .filter((j) => j.status === "completed")
      .reduce((a, j) => a + j.total, 0);

    const now = new Date();
    const todayAppts = appointments.filter(
      (a) => new Date(a.startsAt).toDateString() === now.toDateString(),
    ).length;

    const outstanding = invoices
      .filter((i) => i.status === "sent" || i.status === "draft")
      .reduce((a, i) => a + i.total, 0);

    return { active, completed, revenue, todayAppts, outstanding };
  }, [jobs, appointments, invoices]);

  // ── Upcoming appointments (future, next 7 days) ──
  const upcoming = useMemo(() => {
    const now = new Date();
    return appointments
      .filter((a) => new Date(a.startsAt) > now)
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      )
      .slice(0, 8);
  }, [appointments]);

  // ── Loading state ──
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b56b0" />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Dashboard</Text>
            <TouchableOpacity onPress={onLogout} hitSlop={8}>
              <Text style={styles.logout}>Sign out</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.headerSub}>
            {user ? `${user.name} · ` : ""}
            {jobs.length} jobs · {stats.active} active
            {lastSync && ` · synced ${lastSync}`}
          </Text>
        </View>

        {/* ── Open-core sponsor banner (free plan only) ── */}
        <View style={styles.bannerWrap}>
          <SponsorBanner plan={plan} />
        </View>

        {/* ── Error banner ── */}
        {err && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorIcon}>⚠</Text>
            <View style={styles.errorTextBlock}>
              <Text style={styles.errorTitle}>Couldn't load data</Text>
              <Text style={styles.errorMsg}>{err}</Text>
            </View>
          </View>
        )}

        {/* ── Stat cards (horizontal scroll) ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statRow}
          contentContainerStyle={styles.statRowContent}
        >
          <StatCard
            label="Active"
            value={String(stats.active)}
            color={stats.active > 0 ? "#7ab8ff" : undefined}
          />
          <StatCard
            label="Completed"
            value={String(stats.completed)}
            color={stats.completed > 0 ? "#86e29a" : undefined}
          />
          <StatCard label="Revenue" value={formatMoney(stats.revenue)} color="#86e29a" />
          <StatCard
            label="Today"
            value={String(stats.todayAppts)}
            color={stats.todayAppts > 0 ? "#e0b34f" : undefined}
          />
          <StatCard
            label="Outstanding"
            value={formatMoney(stats.outstanding)}
            color={stats.outstanding > 0 ? "#e0b34f" : undefined}
          />
        </ScrollView>

        {/* ── Upcoming appointments ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Upcoming Appointments</Text>
            <Text style={styles.sectionCount}>{upcoming.length}</Text>
          </View>
          {upcoming.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyTitle}>No upcoming appointments</Text>
              <Text style={styles.emptySub}>
                Scheduled jobs will appear here
              </Text>
            </View>
          ) : (
            upcoming.map((a) => {
              const job = jobs.find((j) => j.id === a.jobId);
              return <AppointmentCard key={a.id} appt={a} job={job} />;
            })
          )}
        </View>

        {/* ── All jobs ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>All Jobs</Text>
            <Text style={styles.sectionCount}>{jobs.length}</Text>
          </View>
          {jobs.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyTitle}>No jobs yet</Text>
              <Text style={styles.emptySub}>
                Jobs will appear here once created
              </Text>
            </View>
          ) : (
            jobs.map((job) => <JobCard key={job.id} job={job} />)
          )}
        </View>

        {/* Bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>

      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1020",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 60,
    paddingBottom: 20,
  },

  // ── Loading ──
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#8a97c2",
    fontSize: 14,
  },

  // ── Header ──
  header: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  headerTitle: {
    color: "#e6e9f0",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  headerSub: {
    color: "#8a97c2",
    fontSize: 13,
    marginTop: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logout: {
    color: "#6b7aa8",
    fontSize: 13,
    fontWeight: "600",
  },
  bannerWrap: {
    paddingHorizontal: 20,
  },

  // ── Error ──
  errorBanner: {
    backgroundColor: "rgba(255,128,128,0.08)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,128,128,0.2)",
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  errorIcon: {
    fontSize: 16,
    color: "#ff8080",
    marginTop: 1,
  },
  errorTextBlock: {
    flex: 1,
  },
  errorTitle: {
    color: "#ff8080",
    fontSize: 13,
    fontWeight: "600",
  },
  errorMsg: {
    color: "#8a97c2",
    fontSize: 11,
    marginTop: 2,
  },

  // ── Stat cards ──
  statRow: {
    marginBottom: 24,
  },
  statRowContent: {
    paddingLeft: 20,
    paddingRight: 10,
  },

  // ── Sections ──
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    color: "#e6e9f0",
    fontSize: 16,
    fontWeight: "600",
  },
  sectionCount: {
    color: "#6b7aa8",
    fontSize: 13,
    fontWeight: "600",
  },

  // ── Empty ──
  emptyBlock: {
    backgroundColor: "#141b33",
    borderRadius: 12,
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyTitle: {
    color: "#8a97c2",
    fontSize: 14,
    fontWeight: "600",
  },
  emptySub: {
    color: "#6b7aa8",
    fontSize: 12,
    marginTop: 4,
  },
});
