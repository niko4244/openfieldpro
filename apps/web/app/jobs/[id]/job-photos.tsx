"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

interface PhotoRecord {
  id: string;
  fileName: string | null;
  uploadedAt: string;
}

export function JobPhotos({ jobId }: { jobId: string }) {
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .jobPhotos(jobId)
      .then((p) => {
        if (!cancelled) setPhotos(p);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const photo = await api.uploadJobPhoto(jobId, file);
      setPhotos((prev) => [...prev, photo]);
      e.target.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setUploading(false);
    }
  };

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {photos.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {photos.map((p) => (
            <a
              key={p.id}
              href={`${apiBase}/api/photos/${p.id}/file`}
              target="_blank"
              rel="noopener noreferrer"
              className="block aspect-square rounded-lg overflow-hidden bg-surface-200 hover:ring-2 hover:ring-accent/50 transition-all"
            >
              <img
                src={`${apiBase}/api/photos/${p.id}/file`}
                alt={p.fileName ?? "Job photo"}
                className="w-full h-full object-cover"
              />
            </a>
          ))}
        </div>
      ) : (
        <div className="text-center py-6">
          <p className="text-sm text-fg-muted mb-1">No photos uploaded</p>
          <p className="text-xs text-fg-dim">Upload job site photos below.</p>
        </div>
      )}

      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent/90 transition-colors cursor-pointer">
        {uploading ? "Uploading..." : "+ Upload Photo"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUpload}
          disabled={uploading}
        />
      </label>
      <span className="text-xs text-fg-dim ml-3">
        {photos.length} photo{photos.length !== 1 ? "s" : ""}
      </span>
      {error && <p className="mt-2 text-xs text-red">{error}</p>}
    </div>
  );
}
