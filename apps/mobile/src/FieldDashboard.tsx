import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { JobDTO } from "@ofp/shared";
import {
  NativeRequestError,
  nativeRequest,
  type NativeSession,
} from "./auth";
import { SyncService, type FieldPackage } from "./sync";

interface Appointment {
  id: string;
  jobId: string;
  technicianId: string | null;
  startsAt: string;
  endsAt: string;
}

interface DiagnosticListItem {
  session: {
    id: string;
    jobId: string;
    status: string;
    customerComplaint?: string | null;
    updatedAt: string;
  };
  equipment: {
    id: string;
    type: string;
    make?: string | null;
    model?: string | null;
    serialNumber?: string | null;
  };
  workflow: {
    id: string;
    name: string;
    supportStatus: string;
  } | null;
}

interface FieldDashboardProps {
  apiUrl: string;
  session: NativeSession;
  onSessionExpired: (message: string) => void;
  onSignOut: () => void;
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function statusColor(status: string) {
  if (["blocked", "escalated", "suspended"].includes(status)) return "#ff8080";
  if (["diagnosed", "completed"].includes(status)) return "#86e29a";
  if (["testing", "workflow_ready"].includes(status)) return "#7ab8ff";
  return "#e0b34f";
}

function packageToDiagnostic(fieldPackage: FieldPackage): DiagnosticListItem | null {
  if (!fieldPackage.session || !fieldPackage.equipment) return null;
  return {
    session: fieldPackage.session as unknown as DiagnosticListItem["session"],
    equipment: fieldPackage.equipment as unknown as DiagnosticListItem["equipment"],
    workflow: fieldPackage.workflow
      ? (fieldPackage.workflow as unknown as DiagnosticListItem["workflow"])
      : null,
  };
}

function packageToAppointment(fieldPackage: FieldPackage): Appointment | null {
  const job = fieldPackage.job as Partial<JobDTO> & { scheduledAt?: string | null };
  if (!job.id || !job.scheduledAt) return null;
  const start = new Date(job.scheduledAt);
  if (Number.isNaN(start.getTime())) return null;
  return {
    id: `cached-${job.id}`,
    jobId: job.id,
    technicianId: null,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 90 * 60 * 1000).toISOString(),
  };
}

export function FieldDashboard({
  apiUrl,
  session,
  onSessionExpired,
  onSignOut,
}: FieldDashboardProps) {
  const [jobs, setJobs] = useState<JobDTO[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [queuedWrites, setQueuedWrites] = useState(0);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    let active = true;
    const service = new SyncService({ apiUrl, ...session });

    const applyPackages = async (packages: FieldPackage[]) => {
      if (!active) return false;
      if (!packages.length) return false;
      setJobs(packages.map((item) => item.job as unknown as JobDTO));
      setAppointments(
        packages.flatMap((item) => {
          const appointment = packageToAppointment(item);
          return appointment ? [appointment] : [];
        }),
      );
      setDiagnostics(
        packages.flatMap((item) => {
          const diagnostic = packageToDiagnostic(item);
          return diagnostic ? [diagnostic] : [];
        }),
      );
      setQueuedWrites(await service.queuedCount());
      setOffline(true);
      return true;
    };

    const loadCached = async () => applyPackages(await service.listCachedPackages());

    const loadRemote = async () => {
      const diagnosticsRequest = nativeRequest<DiagnosticListItem[]>(
        apiUrl,
        session,
        "/api/diagnostics/sessions",
      ).catch((caught) => {
        if (caught instanceof NativeRequestError && caught.terminalAuthenticationFailure) throw caught;
        return [];
      });
      const [jobRows, appointmentRows, diagnosticRows] = await Promise.all([
        nativeRequest<JobDTO[]>(apiUrl, session, "/api/jobs"),
        nativeRequest<Appointment[]>(apiUrl, session, "/api/appointments"),
        diagnosticsRequest,
      ]);
      if (!active) return;
      setJobs(jobRows);
      setAppointments(appointmentRows);
      setDiagnostics(diagnosticRows);
      setOffline(false);
      setError(null);
      setQueuedWrites(await service.queuedCount());
    };

    const handleFailure = async (caught: unknown) => {
      if (caught instanceof NativeRequestError && caught.terminalAuthenticationFailure) {
        if (active) onSessionExpired("Your field session expired or is no longer authorized. Sign in again.");
        return;
      }
      const restored = await loadCached();
      if (!active) return;
      setError(
        restored
          ? "Offline mode — showing your downloaded field packages. New readings remain queued until synchronization succeeds."
          : caught instanceof Error
            ? caught.message
            : String(caught),
      );
    };

    const synchronize = async () => {
      try {
        if (active) setError(null);
        const result = await service.pull();
        if (!active) return;
        setLastSync(new Date().toLocaleTimeString());
        setQueuedWrites(Math.max(0, result.queuedBeforeFlush - result.flushed));
        await loadRemote();
      } catch (caught) {
        await handleFailure(caught);
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    refreshRef.current = synchronize;
    void synchronize();
    const interval = setInterval(() => void synchronize(), 30_000);

    return () => {
      active = false;
      clearInterval(interval);
      refreshRef.current = async () => undefined;
      void service.close();
    };
  }, [apiUrl, onSessionExpired, session]);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const todayAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => {
          const starts = new Date(appointment.startsAt);
          return starts >= todayStart && starts < tomorrowStart;
        })
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [appointments, todayStart.getTime(), tomorrowStart.getTime()],
  );

  const activeDiagnostics = useMemo(
    () =>
      diagnostics.filter((item) =>
        ["identification_required", "workflow_ready", "testing", "blocked", "escalated"].includes(
          item.session.status,
        ),
      ),
    [diagnostics],
  );

  const nextAppointment = todayAppointments.find(
    (appointment) => new Date(appointment.endsAt) > now,
  );
  const nextJob = nextAppointment ? jobs.find((job) => job.id === nextAppointment.jobId) : null;
  const nextDiagnostic = nextAppointment
    ? diagnostics.find((item) => item.session.jobId === nextAppointment.jobId)
    : null;

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#22c55e" />
          <Text style={styles.loadingText}>Loading {session.user.name}’s field work…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void refreshRef.current();
            }}
            tintColor="#22c55e"
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerStatusRow}>
            <Text style={styles.eyebrow}>OPENFIELDPRO FIELD</Text>
            <Text style={[styles.connectivity, { color: offline ? "#e0b34f" : "#86e29a" }]}>
              {offline ? "OFFLINE" : "ONLINE"}
            </Text>
          </View>
          <View style={styles.identityRow}>
            <View style={styles.flexOne}>
              <Text style={styles.headerTitle}>Today</Text>
              <Text style={styles.identityText}>
                {session.user.name} · {humanize(session.user.role)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out of OpenFieldPro Field"
              onPress={onSignOut}
              style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}
            >
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
          <Text style={styles.headerSub}>
            {todayAppointments.length} visit{todayAppointments.length === 1 ? "" : "s"} · {activeDiagnostics.length} active diagnostic{activeDiagnostics.length === 1 ? "" : "s"}
            {queuedWrites ? ` · ${queuedWrites} queued` : ""}
            {lastSync ? ` · synced ${lastSync}` : ""}
          </Text>
        </View>

        {error && (
          <View style={[styles.errorBanner, offline && styles.offlineBanner]}>
            <Text style={[styles.errorTitle, offline && styles.offlineTitle]}>
              {offline ? "Working from your downloaded field packages" : "Field data needs attention"}
            </Text>
            <Text style={styles.errorMessage}>{error}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Next action</Text>
          {nextAppointment ? (
            <View style={styles.primaryCard}>
              <View style={styles.rowBetween}>
                <View style={styles.timeBlock}>
                  <Text style={styles.timeText}>
                    {new Date(nextAppointment.startsAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Text>
                  <Text style={styles.timeLabel}>arrival</Text>
                </View>
                <View style={styles.flexOne}>
                  <Text style={styles.cardTitle}>{nextJob?.title ?? "Assigned service job"}</Text>
                  <Text style={styles.cardMeta}>
                    {nextJob?.status ? humanize(nextJob.status) : "scheduled"}
                  </Text>
                </View>
              </View>

              {nextDiagnostic ? (
                <View style={styles.appliancePanel}>
                  <View style={styles.rowBetween}>
                    <View style={styles.flexOne}>
                      <Text style={styles.applianceTitle}>
                        {[nextDiagnostic.equipment.make, nextDiagnostic.equipment.model]
                          .filter(Boolean)
                          .join(" ") || nextDiagnostic.equipment.type}
                      </Text>
                      <Text style={styles.cardMeta}>
                        {nextDiagnostic.workflow?.name ?? "Coverage required"}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusPill,
                        { borderColor: statusColor(nextDiagnostic.session.status) },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          { color: statusColor(nextDiagnostic.session.status) },
                        ]}
                      >
                        {humanize(nextDiagnostic.session.status)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.complaintText}>
                    {nextDiagnostic.session.customerComplaint || "Customer complaint not recorded"}
                  </Text>
                </View>
              ) : (
                <View style={styles.warningPanel}>
                  <Text style={styles.warningTitle}>Diagnostic not started</Text>
                  <Text style={styles.cardMeta}>
                    Confirm the exact model and serial, then select the applicable validated workflow.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No remaining appointments today</Text>
              <Text style={styles.emptyText}>
                Check Jobs for unscheduled work, parts returns, and incomplete diagnostic sessions.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Diagnostic attention</Text>
            <Text style={styles.sectionCount}>{activeDiagnostics.length}</Text>
          </View>
          {activeDiagnostics.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No active diagnostic sessions</Text>
              <Text style={styles.emptyText}>
                New sessions appear after the work order is linked to the exact appliance.
              </Text>
            </View>
          ) : (
            activeDiagnostics.slice(0, 8).map((item) => (
              <View key={item.session.id} style={styles.listCard}>
                <View style={styles.rowBetween}>
                  <View style={styles.flexOne}>
                    <Text style={styles.listTitle}>
                      {[item.equipment.make, item.equipment.model].filter(Boolean).join(" ") ||
                        item.equipment.type}
                    </Text>
                    <Text style={styles.cardMeta}>
                      {item.workflow?.name ?? "Unsupported / unresolved"}
                    </Text>
                  </View>
                  <Text style={[styles.smallStatus, { color: statusColor(item.session.status) }]}>
                    {humanize(item.session.status)}
                  </Text>
                </View>
                <Text style={styles.complaintText} numberOfLines={2}>
                  {item.session.customerComplaint || "Complaint not recorded"}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Today’s route</Text>
            <Text style={styles.sectionCount}>{todayAppointments.length}</Text>
          </View>
          {todayAppointments.map((appointment) => {
            const job = jobs.find((item) => item.id === appointment.jobId);
            const diagnostic = diagnostics.find((item) => item.session.jobId === appointment.jobId);
            return (
              <View key={appointment.id} style={styles.routeCard}>
                <Text style={styles.routeTime}>
                  {new Date(appointment.startsAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
                <View style={styles.flexOne}>
                  <Text style={styles.listTitle}>{job?.title ?? "Service job"}</Text>
                  <Text style={styles.cardMeta}>
                    {diagnostic ? humanize(diagnostic.session.status) : "diagnostic not started"}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b1020" },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 58, paddingBottom: 24 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: "#8a97c2", fontSize: 14 },
  header: { paddingHorizontal: 20, marginBottom: 22 },
  headerStatusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 4 },
  eyebrow: { color: "#22c55e", fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  connectivity: { fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  headerTitle: { color: "#e6e9f0", fontSize: 32, fontWeight: "800", letterSpacing: -0.8 },
  identityText: { color: "#aab4d0", fontSize: 11, marginTop: 2 },
  headerSub: { color: "#8a97c2", fontSize: 12, marginTop: 7 },
  signOutButton: { borderRadius: 999, borderWidth: 1, borderColor: "#2a3555", paddingHorizontal: 13, paddingVertical: 8 },
  signOutText: { color: "#aab4d0", fontSize: 11, fontWeight: "700" },
  pressed: { opacity: 0.7 },
  errorBanner: { marginHorizontal: 20, marginBottom: 18, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,128,128,.28)", backgroundColor: "rgba(255,128,128,.08)", padding: 14 },
  offlineBanner: { borderColor: "rgba(224,179,79,.28)", backgroundColor: "rgba(224,179,79,.08)" },
  errorTitle: { color: "#ff8080", fontSize: 13, fontWeight: "700" },
  offlineTitle: { color: "#e0b34f" },
  errorMessage: { color: "#8a97c2", fontSize: 11, marginTop: 4 },
  section: { paddingHorizontal: 20, marginBottom: 24 },
  sectionTitle: { color: "#e6e9f0", fontSize: 16, fontWeight: "700", marginBottom: 11 },
  sectionCount: { color: "#6b7aa8", fontSize: 12, fontWeight: "700", marginBottom: 11 },
  primaryCard: { borderRadius: 18, borderWidth: 1, borderColor: "rgba(34,197,94,.35)", backgroundColor: "#141b33", padding: 16 },
  rowBetween: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  flexOne: { flex: 1, minWidth: 0 },
  timeBlock: { width: 72, borderRadius: 12, backgroundColor: "#0f1630", paddingVertical: 9, alignItems: "center" },
  timeText: { color: "#e6e9f0", fontSize: 16, fontWeight: "800" },
  timeLabel: { color: "#6b7aa8", fontSize: 9, marginTop: 2, textTransform: "uppercase" },
  cardTitle: { color: "#e6e9f0", fontSize: 17, fontWeight: "700" },
  cardMeta: { color: "#8a97c2", fontSize: 11, marginTop: 3 },
  appliancePanel: { marginTop: 14, borderRadius: 13, backgroundColor: "#0f1630", padding: 13 },
  applianceTitle: { color: "#e6e9f0", fontSize: 14, fontWeight: "700" },
  statusPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  statusText: { fontSize: 9, fontWeight: "800", textTransform: "uppercase" },
  complaintText: { color: "#aab4d0", fontSize: 12, lineHeight: 17, marginTop: 10 },
  warningPanel: { marginTop: 14, borderRadius: 13, backgroundColor: "rgba(224,179,79,.08)", padding: 13 },
  warningTitle: { color: "#e0b34f", fontSize: 13, fontWeight: "700" },
  emptyCard: { borderRadius: 14, backgroundColor: "#141b33", paddingVertical: 28, paddingHorizontal: 18, alignItems: "center" },
  emptyTitle: { color: "#8a97c2", fontSize: 14, fontWeight: "700", textAlign: "center" },
  emptyText: { color: "#6b7aa8", fontSize: 11, lineHeight: 16, marginTop: 5, textAlign: "center" },
  listCard: { borderRadius: 14, backgroundColor: "#141b33", borderWidth: 1, borderColor: "#1d2440", padding: 14, marginBottom: 9 },
  listTitle: { color: "#e6e9f0", fontSize: 13, fontWeight: "700" },
  smallStatus: { fontSize: 9, fontWeight: "800", textTransform: "uppercase" },
  routeCard: { flexDirection: "row", alignItems: "center", gap: 13, borderRadius: 13, backgroundColor: "#141b33", padding: 13, marginBottom: 8 },
  routeTime: { width: 70, color: "#7ab8ff", fontSize: 13, fontWeight: "800" },
});
