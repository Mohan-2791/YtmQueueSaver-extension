import { useCallback, useEffect, useState } from 'react';
import { sendExtensionMessage } from '../lib/chromeMessage';
import { logger } from '../lib/logger';
import type { ApiResponse, Category, PlaylistSnapshot } from '../types';

export type SnapshotFilterCategory = Category | 'ALL';

interface UseSnapshotsResult {
  snapshots: PlaylistSnapshot[];
  loading: boolean;
  error: string | null;
  restoringId: number | null;
  refresh: () => void;
  restore: (id: number) => Promise<boolean>;
  remove: (id: number) => Promise<boolean>;
}

/**
 * Owns data-fetching and state management for snapshots.
 * Supports filtering by SESSION_WIPE, ARCHIVE_HISTORY, or ALL (total history).
 */
export function useSnapshots(filterCategory: SnapshotFilterCategory): UseSnapshotsResult {
  const [snapshots, setSnapshots] = useState<PlaylistSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);

    if (filterCategory === 'ALL') {
      // Fetch both categories concurrently and merge
      Promise.all([
        sendExtensionMessage<ApiResponse<PlaylistSnapshot[]>>({
          action: 'FETCH_SNAPSHOTS',
          category: 'SESSION_WIPE',
        }),
        sendExtensionMessage<ApiResponse<PlaylistSnapshot[]>>({
          action: 'FETCH_SNAPSHOTS',
          category: 'ARCHIVE_HISTORY',
        }),
      ])
        .then(([res1, res2]) => {
          const list1 = res1?.status === 'success' && Array.isArray(res1.data) ? res1.data : [];
          const list2 = res2?.status === 'success' && Array.isArray(res2.data) ? res2.data : [];

          // Deduplicate by id and sort descending by created_at
          const combined = [...list1, ...list2];
          const map = new Map<number, PlaylistSnapshot>();
          for (const s of combined) {
            map.set(s.id, s);
          }

          const sorted = Array.from(map.values()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          );
          setSnapshots(sorted);
        })
        .catch((err) => {
          logger.error('Failed to fetch all snapshots', err);
          setError('Could not load snapshot history.');
        })
        .finally(() => setLoading(false));
    } else {
      sendExtensionMessage<ApiResponse<PlaylistSnapshot[]>>({
        action: 'FETCH_SNAPSHOTS',
        category: filterCategory,
      })
        .then((response) => {
          if (response?.status === 'success' && Array.isArray(response.data)) {
            setSnapshots(response.data);
          } else {
            setSnapshots([]);
            setError(response?.message || 'Could not load saved queues.');
          }
        })
        .catch((err) => {
          logger.error('FETCH_SNAPSHOTS failed', err);
          setSnapshots([]);
          setError(err instanceof Error ? err.message : 'Could not load saved queues.');
        })
        .finally(() => setLoading(false));
    }
  }, [filterCategory]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const restore = useCallback(async (id: number): Promise<boolean> => {
    setRestoringId(id);
    try {
      // Restore can take a while for large playlists (playlist creation +
      // adding every track). The 10s default used everywhere else is too
      // short here and was causing the UI to report "failed" on restores
      // that were actually still succeeding in the background. 50s gives
      // headroom above the 45s backend-call timeout in handlers.ts.
      const response = await sendExtensionMessage<ApiResponse>(
        {
          action: 'RESTORE_SNAPSHOT',
          snapshotId: id,
        },
        50000,
      );
      return response?.status === 'success';
    } catch (err) {
      logger.error('RESTORE_SNAPSHOT failed', err);
      return false;
    } finally {
      setRestoringId(null);
    }
  }, []);

  const remove = useCallback(async (id: number): Promise<boolean> => {
    try {
      await sendExtensionMessage<ApiResponse>({
        action: 'DELETE_SNAPSHOT',
        snapshotId: id,
      });
      setSnapshots((prev) => prev.filter((s) => s.id !== id));
      return true;
    } catch (err) {
      logger.error('DELETE_SNAPSHOT failed', err);
      return false;
    }
  }, []);

  return { snapshots, loading, error, restoringId, refresh, restore, remove };
}