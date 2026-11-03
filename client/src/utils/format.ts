export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00.0';
  const mins = Math.floor(sec / 60);
  const rem = sec - mins * 60;
  const wholeSec = Math.floor(rem);
  const tenths = Math.floor((rem - wholeSec + 1e-6) * 10);
  return `${String(mins).padStart(2, '0')}:${String(wholeSec).padStart(2, '0')}.${tenths}`;
}

export function formatShortSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0.0s';
  return `${sec.toFixed(1)}s`;
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
