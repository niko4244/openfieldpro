export function dispatchBucket(status: string, appointmentId?: string | null) {
  if (status === "completed") return "completed";
  if (status === "in_progress") return "inProgress";
  if (appointmentId || status === "scheduled") return "scheduled";
  return "unscheduled";
}

export function toNumber(value?: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export function dayWindow(dateText?: string) {
  const base = dateText ? new Date(`${dateText}T00:00:00.000Z`) : new Date();
  const start = new Date(base);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}
