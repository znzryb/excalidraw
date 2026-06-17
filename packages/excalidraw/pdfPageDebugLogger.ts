import type { ExcalidrawElement } from "@excalidraw/element/types";

import { isPdfPageBackground, isPdfPageFrame } from "./pdfPageStack";

export const PDF_PAGE_DEBUG_CONFIG_KEY =
  "ac-ladder:pdf-page-debug-config";

const LEGACY_PDF_PAGE_DEBUG_STORAGE_KEY = "ac-ladder:pdf-page-debug";
const PDF_PAGE_DEBUG_DB_NAME = "ac-ladder-pdf-debug";
const PDF_PAGE_DEBUG_STORE_NAME = "logs";
const PDF_PAGE_DEBUG_DB_VERSION = 1;
const PDF_PAGE_DEBUG_PREFIX = "[PDF_PAGE_DEBUG]";
const MAX_ARRAY_ITEMS = 30;
const MAX_OBJECT_KEYS = 30;
const MAX_DEPTH = 4;

export const PDF_PAGE_DEBUG_LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
] as const;

export type PdfPageDebugLevel = (typeof PDF_PAGE_DEBUG_LEVELS)[number];

type Jsonish =
  | string
  | number
  | boolean
  | null
  | undefined
  | Jsonish[]
  | { [key: string]: Jsonish };

export type PdfPageDebugConfig = {
  enabled: boolean;
  level: PdfPageDebugLevel;
  console: boolean;
  maxEntries: number;
};

export type PdfPageDebugLogEntry = {
  id: string;
  timestamp: number;
  sessionId: string;
  level: PdfPageDebugLevel;
  eventName: string;
  payload?: Jsonish;
};

export type PdfPageDebugDumpOptions = {
  level?: PdfPageDebugLevel;
  eventName?: string;
  limit?: number;
};

type PartialConfig = Partial<PdfPageDebugConfig>;

const DEFAULT_CONFIG: PdfPageDebugConfig = {
  enabled: false,
  level: "debug",
  console: false,
  maxEntries: 1000,
};

const levelRank = Object.fromEntries(
  PDF_PAGE_DEBUG_LEVELS.map((level, index) => [level, index]),
) as Record<PdfPageDebugLevel, number>;

const sessionId = `pdf-debug-${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2)}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object";

const canUseWindow = () => typeof window !== "undefined";

const canUseLocalStorage = () =>
  canUseWindow() && !!window.localStorage;

const canUseIndexedDB = () =>
  canUseWindow() && typeof window.indexedDB !== "undefined";

const isValidLevel = (level: unknown): level is PdfPageDebugLevel =>
  typeof level === "string" &&
  PDF_PAGE_DEBUG_LEVELS.includes(level as PdfPageDebugLevel);

const shouldIncludeLevel = (
  entryLevel: PdfPageDebugLevel,
  threshold: PdfPageDebugLevel,
) => levelRank[entryLevel] >= levelRank[threshold];

const looksLikeElement = (
  value: Record<string, unknown>,
): value is ExcalidrawElement =>
  typeof value.id === "string" &&
  typeof value.type === "string" &&
  typeof value.x === "number" &&
  typeof value.y === "number";

const sanitizeElement = (element: ExcalidrawElement) => ({
  id: element.id,
  type: element.type,
  frameId: element.frameId,
  locked: element.locked,
  isPdfPageFrame: isPdfPageFrame(element),
  isPdfPageBackground: isPdfPageBackground(element),
  x: element.x,
  y: element.y,
  width: element.width,
  height: element.height,
});

const sanitizeValue = (
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): Jsonish => {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value !== "object") {
    return String(value);
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (typeof Blob !== "undefined" && value instanceof Blob) {
    const isFile = typeof File !== "undefined" && value instanceof File;

    return {
      kind: isFile ? "File" : "Blob",
      name: isFile ? value.name : undefined,
      type: value.type,
      size: value.size,
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, seen, depth + 1));
  }

  if (depth >= MAX_DEPTH) {
    return "[MaxDepth]";
  }

  if (isRecord(value) && looksLikeElement(value)) {
    return sanitizeElement(value);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_OBJECT_KEYS)
      .map(([key, item]) => [key, sanitizeValue(item, seen, depth + 1)]),
  );
};

const makeId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
};

const parseStoredConfig = (raw: string | null): PartialConfig => {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const normalizeConfig = (config: PartialConfig): PdfPageDebugConfig => ({
  enabled:
    typeof config.enabled === "boolean"
      ? config.enabled
      : DEFAULT_CONFIG.enabled,
  level: isValidLevel(config.level) ? config.level : DEFAULT_CONFIG.level,
  console:
    typeof config.console === "boolean"
      ? config.console
      : DEFAULT_CONFIG.console,
  maxEntries:
    typeof config.maxEntries === "number" && config.maxEntries > 0
      ? Math.floor(config.maxEntries)
      : DEFAULT_CONFIG.maxEntries,
});

const readConfig = (): PdfPageDebugConfig => {
  if (!canUseLocalStorage()) {
    return DEFAULT_CONFIG;
  }

  const stored = parseStoredConfig(
    window.localStorage.getItem(PDF_PAGE_DEBUG_CONFIG_KEY),
  );
  const legacyEnabled =
    window.localStorage.getItem(LEGACY_PDF_PAGE_DEBUG_STORAGE_KEY) === "1";

  return normalizeConfig({
    ...(legacyEnabled ? { enabled: true } : null),
    ...stored,
  });
};

const writeConfig = (config: PdfPageDebugConfig) => {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(
    PDF_PAGE_DEBUG_CONFIG_KEY,
    JSON.stringify(config),
  );
};

const requestToPromise = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });

const openDatabase = () =>
  new Promise<IDBDatabase | null>((resolve, reject) => {
    if (!canUseIndexedDB()) {
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(
      PDF_PAGE_DEBUG_DB_NAME,
      PDF_PAGE_DEBUG_DB_VERSION,
    );

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PDF_PAGE_DEBUG_STORE_NAME)) {
        const store = db.createObjectStore(PDF_PAGE_DEBUG_STORE_NAME, {
          keyPath: "id",
        });
        store.createIndex("timestamp", "timestamp");
        store.createIndex("level", "level");
        store.createIndex("eventName", "eventName");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore, transaction: IDBTransaction) => Promise<T>,
) => {
  const db = await openDatabase();
  if (!db) {
    return null;
  }

  try {
    const transaction = db.transaction(PDF_PAGE_DEBUG_STORE_NAME, mode);
    const store = transaction.objectStore(PDF_PAGE_DEBUG_STORE_NAME);
    const result = await callback(store, transaction);
    await transactionDone(transaction);
    return result;
  } finally {
    db.close();
  }
};

const readEntries = async () =>
  (await withStore("readonly", async (store) =>
    requestToPromise<PdfPageDebugLogEntry[]>(store.getAll()),
  )) ?? [];

const trimEntries = async (maxEntries: number) => {
  await withStore("readwrite", async (store) => {
    const entries = await requestToPromise<PdfPageDebugLogEntry[]>(
      store.getAll(),
    );
    const excess = entries.length - maxEntries;
    if (excess <= 0) {
      return;
    }

    const idsToDelete = entries
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, excess)
      .map((entry) => entry.id);

    for (const id of idsToDelete) {
      store.delete(id);
    }
  });
};

const mirrorToConsole = (entry: PdfPageDebugLogEntry) => {
  const logger =
    entry.level === "error"
      ? console.error
      : entry.level === "warn"
      ? console.warn
      : console.debug;

  logger(PDF_PAGE_DEBUG_PREFIX, entry.level, entry.eventName, entry.payload);
};

const saveEntry = async (
  eventName: string,
  payload: unknown,
  level: PdfPageDebugLevel,
) => {
  const config = readConfig();
  if (
    !config.enabled ||
    !shouldIncludeLevel(level, config.level) ||
    !canUseIndexedDB()
  ) {
    return;
  }

  const entry: PdfPageDebugLogEntry = {
    id: makeId(),
    timestamp: Date.now(),
    sessionId,
    level,
    eventName,
    payload: sanitizeValue(payload),
  };

  await withStore("readwrite", async (store) => {
    store.put(entry);
  });
  await trimEntries(config.maxEntries);

  if (config.console) {
    mirrorToConsole(entry);
  }
};

const downloadJson = (entries: PdfPageDebugLogEntry[]) => {
  if (!canUseWindow() || typeof Blob === "undefined") {
    return;
  }

  const blob = new Blob([JSON.stringify(entries, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `pdf-page-debug-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const pdfPageDebug = {
  getConfig() {
    return readConfig();
  },

  configure(config: PartialConfig) {
    const nextConfig = normalizeConfig({
      ...readConfig(),
      ...config,
    });
    writeConfig(nextConfig);
    return nextConfig;
  },

  enable(config: PartialConfig = {}) {
    return this.configure({ ...config, enabled: true });
  },

  disable() {
    return this.configure({ enabled: false });
  },

  isEnabled() {
    return readConfig().enabled;
  },

  async log(
    eventName: string,
    payload?: unknown,
    level: PdfPageDebugLevel = "debug",
  ) {
    await saveEntry(eventName, payload, level);
  },

  async group(
    eventName: string,
    payload?: unknown,
    level: PdfPageDebugLevel = "debug",
  ) {
    await saveEntry(eventName, payload, level);
  },

  async dump(options: PdfPageDebugDumpOptions = {}) {
    const threshold = options.level ?? "trace";
    const entries = (await readEntries())
      .filter((entry) => shouldIncludeLevel(entry.level, threshold))
      .filter((entry) =>
        options.eventName ? entry.eventName === options.eventName : true,
      )
      .sort((a, b) => b.timestamp - a.timestamp);

    return typeof options.limit === "number"
      ? entries.slice(0, Math.max(0, Math.floor(options.limit)))
      : entries;
  },

  async clear() {
    await withStore("readwrite", async (store) => {
      store.clear();
    });
  },

  async export(options: PdfPageDebugDumpOptions = {}) {
    const entries = await this.dump(options);
    downloadJson(entries);
    return entries;
  },
};

export type PdfPageDebugApi = typeof pdfPageDebug;

declare global {
  interface Window {
    acPdfPageDebug?: PdfPageDebugApi;
  }
}

if (canUseWindow()) {
  window.acPdfPageDebug = pdfPageDebug;
}
