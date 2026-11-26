/**
 * ATLAS Field Persistent Offline Outbox Queue
 * Persists queued messages, field alerts, field reports, status updates, and acknowledgments
 * in IndexedDB (with localStorage fallback) across app refresh, restart, and network loss.
 * Implements exponential backoff + jitter, retry caps, FIFO ordering, and idempotent client_id.
 */
import { api } from './api';
import { networkMonitor } from './networkMonitor';

export type QueueItemKind =
  | 'mission_message'
  | 'field_alert'
  | 'field_report'
  | 'assignment_status'
  | 'message_ack';

export type DeliveryState = 'QUEUED' | 'SENDING' | 'SENT' | 'ACKNOWLEDGED' | 'FAILED';

export interface QueuedOperation {
  id: string; // Idempotent client_id
  kind: QueueItemKind;
  missionId?: string;
  incidentId?: string;
  sender?: string;
  recipient?: string;
  summary: string;
  payload: Record<string, any>;
  deliveryState: DeliveryState;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

const DB_NAME = 'atlas_field_offline_db';
const STORE_NAME = 'outbox_queue';
const LS_FALLBACK_KEY = 'atlas_outbox_queue_fallback';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readAllItems(): Promise<QueuedOperation[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result || []) as QueuedOperation[];
        items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = localStorage.getItem(LS_FALLBACK_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
}

async function putItem(item: QueuedOperation): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    const existing = await readAllItems();
    const idx = existing.findIndex(x => x.id === item.id);
    if (idx >= 0) existing[idx] = item;
    else existing.push(item);
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(existing));
  }
}

let flushInFlight = false;
type Listener = (items: QueuedOperation[]) => void;
const listeners = new Set<Listener>();

async function notify() {
  const items = await readAllItems();
  listeners.forEach(fn => fn(items));
}

export const offlineQueue = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    readAllItems().then(fn);
    return () => listeners.delete(fn);
  },

  async list(): Promise<QueuedOperation[]> {
    return readAllItems();
  },

  async enqueue(params: {
    id?: string;
    kind: QueueItemKind;
    missionId?: string;
    incidentId?: string;
    sender?: string;
    recipient?: string;
    summary: string;
    payload: Record<string, any>;
  }): Promise<QueuedOperation> {
    const now = new Date().toISOString();
    const prefix =
      params.kind === 'field_alert' ? 'ALT-Q' :
      params.kind === 'mission_message' ? 'MSG-Q' :
      params.kind === 'field_report' ? 'REP-Q' : 'OP-Q';
    const id = params.id || `${prefix}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const item: QueuedOperation = {
      id,
      kind: params.kind,
      missionId: params.missionId,
      incidentId: params.incidentId,
      sender: params.sender,
      recipient: params.recipient,
      summary: params.summary,
      payload: { ...params.payload, client_id: id },
      deliveryState: 'QUEUED',
      retryCount: 0,
      maxRetries: 8,
      nextRetryAt: 0,
      createdAt: now,
      updatedAt: now,
    };

    await putItem(item);
    await notify();
    return item;
  },

  async retryFailed(id: string): Promise<void> {
    const items = await readAllItems();
    const target = items.find(i => i.id === id);
    if (!target) return;
    target.deliveryState = 'QUEUED';
    target.retryCount = 0;
    target.nextRetryAt = 0;
    target.updatedAt = new Date().toISOString();
    await putItem(target);
    await notify();
    await this.flush(true);
  },

  async clearCompleted(): Promise<void> {
    const items = await readAllItems();
    const keep = items.filter(i => i.deliveryState === 'QUEUED' || i.deliveryState === 'SENDING' || i.deliveryState === 'FAILED');
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        keep.forEach(k => store.put(k));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(keep));
    }
    await notify();
  },

  async flush(force = false): Promise<{ sent: number; failed: number }> {
    if (flushInFlight) return { sent: 0, failed: 0 };
    if (typeof navigator !== 'undefined' && navigator.onLine === false && !force) {
      return { sent: 0, failed: 0 };
    }

    const items = await readAllItems();
    const now = Date.now();
    const pending = items.filter(
      i => (i.deliveryState === 'QUEUED' || i.deliveryState === 'SENDING') && (force || i.nextRetryAt <= now)
    );
    if (pending.length === 0) return { sent: 0, failed: 0 };

    flushInFlight = true;
    networkMonitor.setSyncing(true);
    let sent = 0;
    let failed = 0;

    try {
      for (const item of pending) {
        item.deliveryState = 'SENDING';
        item.updatedAt = new Date().toISOString();
        await putItem(item);
        await notify();

        try {
          if (item.kind === 'mission_message') {
            await api.sendMissionMessage(item.missionId || 'ASG-01', item.payload as any);
          } else if (item.kind === 'field_alert') {
            await api.submitFieldAlert(item.payload as any);
          } else if (item.kind === 'field_report') {
            await api.submitFieldReport(item.payload as any);
          } else if (item.kind === 'assignment_status') {
            await api.updateAssignment(item.payload.assignment_id, item.payload.status);
          } else if (item.kind === 'message_ack') {
            await api.acknowledgeMessage(item.payload.message_id);
          }

          item.deliveryState = item.kind === 'message_ack' ? 'ACKNOWLEDGED' : 'SENT';
          item.lastError = undefined;
          item.updatedAt = new Date().toISOString();
          await putItem(item);
          sent += 1;
          networkMonitor.recordSuccess(150);
        } catch (err: any) {
          networkMonitor.recordFailure();
          item.retryCount += 1;
          const backoffMs = Math.min(60000, Math.pow(2, item.retryCount) * 1000);
          const jitterMs = Math.floor(Math.random() * 800);
          item.nextRetryAt = Date.now() + backoffMs + jitterMs;
          item.lastError = err?.message || 'Network delivery failed';
          item.deliveryState = item.retryCount >= item.maxRetries ? 'FAILED' : 'QUEUED';
          item.updatedAt = new Date().toISOString();
          await putItem(item);
          failed += 1;
        }
        await notify();
      }
    } finally {
      flushInFlight = false;
      networkMonitor.setSyncing(false);
    }

    return { sent, failed };
  }
};
