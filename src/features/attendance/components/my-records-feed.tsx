// "Riwayat absen bulan ini": 10 data pertama sudah dirender server (initial);
// sisanya dimuat per 10 saat daftar di-scroll sampai dekat ujung bawah, lewat
// Server Action loadMoreMyRecords. Supaya halaman tetap ringan walau absen sudah banyak.

"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { loadMoreMyRecords } from "../records-actions";

type Chunk = { offset: number; items: ReactNode };

export function MyRecordsFeed({
  initial,
  period,
  initialHasMore,
  pageSize,
}: {
  initial: ReactNode;
  period: string;
  initialHasMore: boolean;
  pageSize: number;
}) {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const offsetRef = useRef(pageSize);
  const busyRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const offset = offsetRef.current;
      const result = await loadMoreMyRecords(period, offset);
      if (!result) throw new Error("tidak ada hasil");
      offsetRef.current = result.nextOffset;
      setChunks((current) => [...current, { offset, items: result.items }]);
      setHasMore(result.hasMore);
    } catch {
      setFailed(true);
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || failed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // chunks.length: setelah satu batch masuk, amati ulang agar batch berikutnya
    // ikut terpicu bila penanda masih terlihat.
  }, [hasMore, failed, loadMore, chunks.length]);

  return (
    <div className="flex flex-col gap-3">
      {initial}
      {chunks.map((chunk) => (
        <div key={chunk.offset}>{chunk.items}</div>
      ))}
      {hasMore && (
        <div ref={sentinelRef} className="flex min-h-10 items-center justify-center text-sm text-muted-foreground">
          {failed ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void loadMore()}>
              Gagal memuat, coba lagi
            </Button>
          ) : (
            loading && (
              <span className="inline-flex items-center gap-2">
                <LoaderCircleIcon className="size-4 animate-spin" />
                Memuat...
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
}
