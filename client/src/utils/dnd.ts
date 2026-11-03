export type DragPayload =
  | { kind: 'library-assets'; assetIds: string[] }
  | { kind: 'group-clip'; fromGroupId: string; clipId: string; fromIndex: number }
  | { kind: 'group-row'; groupId: string; fromIndex: number }
  | { kind: 'matrix-slot'; slotId: string; fromIndex: number }
  | { kind: 'matrix-slot-asset'; fromSlotId: string; assetId: string; fromIndex: number };

let activePayload: DragPayload | null = null;

const MIME = 'application/x-flowcut-dnd';

export function setDragPayload(e: React.DragEvent, payload: DragPayload) {
  activePayload = payload;
  try {
    e.dataTransfer.setData(MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'copyMove';
  } catch {
    // ignore
  }
}

export function peekDragPayload(): DragPayload | null {
  return activePayload;
}

export function readDragPayload(e: React.DragEvent): DragPayload | null {
  if (activePayload) return activePayload;
  try {
    const raw = e.dataTransfer.getData(MIME);
    if (raw) return JSON.parse(raw) as DragPayload;
  } catch {
    // ignore
  }
  return null;
}

export function clearDragPayload() {
  activePayload = null;
}
