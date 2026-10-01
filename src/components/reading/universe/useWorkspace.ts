'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  applyProgress,
  changeTopic,
  type Progress,
  type UniverseDataset,
  type TopicStatus,
} from '@/lib/reading/universe/model';
import { demoDataset } from '@/lib/reading/universe/demo';
import { readProgress, storageKey, validateDataset } from '@/lib/reading/universe/validate';
const IMPORT_KEY = 'prism-research-universe:import:v1';
export default function useWorkspace() {
  const [mode, setMode] = useState<'demo' | 'imported'>('demo');
  const [base, setBase] = useState<UniverseDataset | null>(null);
  const [progress, setProgress] = useState<Progress>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('prism-research-universe:mode');
      // Retire the remote source without touching any saved topic progress or imports.
      setMode(saved === 'imported' ? 'imported' : 'demo');
    } catch {
      /* Source preference is optional; content failures are reported below. */
    }
    if (new URLSearchParams(location.search).get('demo') === '1') setMode('demo');
    setInitialized(true);
  }, []);
  useEffect(() => {
    if (initialized) {
      try {
        localStorage.setItem('prism-research-universe:mode', mode);
      } catch {
        /* Optional preference. */
      }
    }
  }, [mode, initialized]);
  useEffect(() => {
    if (!initialized) return;
    setLoading(true);
    setError('');
    setBase(null);
    setProgress({});
    setNotice('');
    try {
      const data =
        mode === 'demo'
          ? demoDataset
          : validateDataset(JSON.parse(localStorage.getItem(IMPORT_KEY) ?? 'null'));
      let updates: Progress = {};
      try {
        updates = readProgress(localStorage.getItem(storageKey(data)));
      } catch {
        setNotice('storage-read');
      }
      setBase(data);
      setProgress(updates);
    } catch {
      setError('import');
    } finally {
      setLoading(false);
    }
  }, [mode, revision, initialized]);
  const dataset = useMemo(() => (base ? applyProgress(base, progress) : null), [base, progress]);
  function update(id: string, status: TopicStatus, notes: string) {
    const topic = dataset?.topics.find((t) => t.id === id);
    if (!topic || !base) return;
    const next = { ...progress, [id]: changeTopic(topic, status, notes) };
    setProgress(next);
    try {
      localStorage.setItem(storageKey(base), JSON.stringify(next));
      setNotice('saved');
    } catch {
      setNotice('storage-write');
    }
  }
  function importData(data: UniverseDataset) {
    try {
      localStorage.setItem(IMPORT_KEY, JSON.stringify(data));
      // Imported backup contains the intended status/notes; avoid stale overlays on restoration.
      localStorage.removeItem(storageKey(data));
      setMode('imported');
      setRevision((r) => r + 1);
      return true;
    } catch {
      setNotice('storage-write');
      return false;
    }
  }
  return {
    mode,
    setMode,
    dataset,
    loading,
    error,
    notice,
    setNotice,
    update,
    importData,
    retry: () => setRevision((r) => r + 1),
  };
}
