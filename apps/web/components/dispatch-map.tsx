"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { DispatchJobDTO, TechPresenceDTO } from "@ofp/shared";

interface DispatchMapProps {
  techs: TechPresenceDTO[];
  jobs: DispatchJobDTO[];
}

// Colour palette keyed by freshness/status. Pure CSS hex so CircleMarker
// doesn't need a sprite sheet (default Leaflet markers break under
// bundlers because their icon URLs are bare /marker-icon.png).
function colorForFreshness(tier: string): string {
  if (tier === "live") return "#22c55e"; // green
  if (tier === "recent") return "#f59e0b"; // amber
  if (tier === "stale") return "#9ca3af"; // gray
  return "#404040"; // dead
}

function colorForStatus(status: string): string {
  if (status === "completed") return "#22c55e";
  if (status === "in_progress") return "#3b82f6";
  if (status === "scheduled") return "#a855f7";
  if (status === "canceled") return "#404040";
  return "#9ca3af"; // lead
}

// Ponytail: the map is initialised in a single useEffect and we re-render
//   markers via a second useEffect keyed to [techs, jobs]. No state for
//   map instance \u2014 ref holds it across renders; cleanup removes it.
//   Ceiling: clustering; router/directions; pin-on-click side panel.
export function DispatchMap(props: DispatchMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Use a loose `any` so we don't pin to Leaflet's deep type imports.
  // The runtime type comes from the dynamic import below.
  const mapRef = useRef<any>(null);
  const techLayerRef = useRef<any>(null);
  const jobLayerRef = useRef<any>(null);

  // 1) Init the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;
      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView([39.5, -98.35], 4); // continental US centre
      L.tileLayer(
        // NEXT_PUBLIC_MAP_TILE_URL lets prod point at MapTiler/Maptiler-with-key.
        // Dev falls back to OSM (their tile server is fine for low-volume use).
        process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        },
      ).addTo(map);
      techLayerRef.current = L.layerGroup().addTo(map);
      jobLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      techLayerRef.current = null;
      jobLayerRef.current = null;
    };
  }, []);

  // 2) Re-render markers whenever the data changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapRef.current) return;

      techLayerRef.current?.clearLayers();
      jobLayerRef.current?.clearLayers();

      for (const t of props.techs) {
        const ll = t.lastLocation;
        if (!ll) continue; // tech offline \u2014 skip the marker
        L.circleMarker([ll.lat, ll.lng], {
          radius: 8,
          color: colorForFreshness(t.freshness),
          fillColor: colorForFreshness(t.freshness),
          fillOpacity: 0.7,
          weight: 2,
        })
          .bindTooltip(`${t.name} \u00b7 ${t.freshness}`)
          .addTo(techLayerRef.current);
      }

      for (const j of props.jobs) {
        if (j.lat == null || j.lng == null) continue;
        L.circleMarker([j.lat, j.lng], {
          radius: 5,
          color: colorForStatus(j.status),
          fillColor: colorForStatus(j.status),
          fillOpacity: 0.5,
          weight: 2,
        })
          .bindTooltip(`${j.title} \u00b7 ${j.status}${j.address ? " \u00b7 " + j.address : ""}`)
          .addTo(jobLayerRef.current);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.techs, props.jobs]);

  return (
    <div
      ref={containerRef}
      className="h-[560px] w-full rounded-lg border border-border bg-surface-100"
      aria-label="live dispatch map"
    />
  );
}
