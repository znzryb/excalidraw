import type { ExcalidrawElement } from "@excalidraw/element/types";

import { isPdfPageBackground, isPdfPageFrame } from "./pdfPageStack";

const PDF_PAGE_DEBUG_ENDPOINT = "/__ac_pdf_debug/log";
const PDF_PAGE_DEBUG_DUMP_ENDPOINT = "/__ac_pdf_debug/logs";
const PDF_PAGE_DEBUG_PREFIX = "[PDF_PAGE_DEBUG]";
const MAX_ARRAY_ITEMS = 30;
const MAX_OBJECT_KEYS = 30;
const MAX_DEPTH = 4;
const DEFAULT_MEMORY_LIMIT = 1000;

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
  sequence: number;
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

const PDF_PAGE_DEBUG_CODE_CONFIG: PdfPageDebugConfig = {
  enabled: false,
  level: "debug",
  console: false,
  maxEntries: DEFAULT_MEMORY_LIMIT,
};

const levelRank = Object.fromEntries(
  PDF_PAGE_DEBUG_LEVELS.map((level, index) => [level, index]),
) as Record<PdfPageDebugLevel, number>;

const sessionId = `pdf-debug-${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2)}`;

let sequence = 0;
let runtimeOverride: PartialConfig = {};
const memoryEntries: PdfPageDebugLogEntry[] = [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object";

const canUseWindow = () => typeof window !== "undefined";

const isValidLevel = (level: unknown): level is PdfPageDebugLevel =>
  typeof level === "string" &&
  PDF_PAGE_DEBUG_LEVELS.includes(level as PdfPageDebugLevel);

const shouldIncludeLevel = (
  entryLevel: PdfPageDebugLevel,
  threshold: PdfPageDebugLevel,
) => levelRank[entryLevel] >= levelRank[threshold];

const parseBooleanEnv = (value: unknown) =>
  value === true || value === "1" || value === "true";

const envConfig = (): PartialConfig => {
  const env = (import.meta.env ?? {}) as Record<string, unknown>;
  const level = env.VITE_AC_PDF_DEBUG_LEVEL;
  const maxEntries = Number(env.VITE_AC_PDF_DEBUG_MAX_ENTRIES);

  return {
    ...(env.VITE_AC_PDF_DEBUG === undefined
      ? null
      : { enabled: parseBooleanEnv(env.VITE_AC_PDF_DEBUG) }),
    ...(isValidLevel(level) ? { level } : null),
    ...(env.VITE_AC_PDF_DEBUG_CONSOLE === undefined
      ? null
      : { console: parseBooleanEnv(env.VITE_AC_PDF_DEBUG_CONSOLE) }),
    ...(Number.isFinite(maxEntries) && maxEntries > 0
      ? { maxEntries: Math.floor(maxEntries) }
      : null),
  };
};

const normalizeConfig = (config: PartialConfig): PdfPageDebugConfig => ({
  enabled:
    typeof config.enabled === "boolean"
      ? config.enabled
      : PDF_PAGE_DEBUG_CODE_CONFIG.enabled,
  level: isValidLevel(config.level)
    ? config.level
    : PDF_PAGE_DEBUG_CODE_CONFIG.level,
  console:
    typeof config.console === "boolean"
      ? config.console
      : PDF_PAGE_DEBUG_CODE_CONFIG.console,
  maxEntries:
    typeof config.maxEntries === "number" && config.maxEntries > 0
      ? Math.floor(config.maxEntries)
      : PDF_PAGE_DEBUG_CODE_CONFIG.maxEntries,
});

const readConfig = (): PdfPageDebugConfig =>
  normalizeConfig({
    ...PDF_PAGE_DEBUG_CODE_CONFIG,
    ...runtimeOverride,
    ...envConfig(),
  });

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

const mirrorToConsole = (entry: PdfPageDebugLogEntry) => {
  const logger =
    entry.level === "error"
      ? console.error
      : entry.level === "warn"
      ? console.warn
      : console.debug;

  logger(PDF_PAGE_DEBUG_PREFIX, entry.level, entry.eventName, entry.payload);
};

const rememberEntry = (
  entry: PdfPageDebugLogEntry,
  maxEntries: number,
) => {
  memoryEntries.push(entry);
  const excess = memoryEntries.length - maxEntries;
  if (excess > 0) {
    memoryEntries.splice(0, excess);
  }
};

const postEntry = async (entry: PdfPageDebugLogEntry) => {
  if (!canUseWindow() || typeof fetch !== "function") {
    return;
  }

  await fetch(PDF_PAGE_DEBUG_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(entry),
    keepalive: true,
  });
};

const saveEntry = async (
  eventName: string,
  payload: unknown,
  level: PdfPageDebugLevel,
) => {
  const config = readConfig();
  if (!config.enabled || !shouldIncludeLevel(level, config.level)) {
    return;
  }

  const entry: PdfPageDebugLogEntry = {
    id: makeId(),
    timestamp: Date.now(),
    sessionId,
    sequence: ++sequence,
    level,
    eventName,
    payload: sanitizeValue(payload),
  };

  rememberEntry(entry, config.maxEntries);

  if (config.console) {
    mirrorToConsole(entry);
  }

  try {
    await postEntry(entry);
  } catch (error) {
    if (config.console) {
      console.warn(PDF_PAGE_DEBUG_PREFIX, "file sink failed", error);
    }
  }
};

const readServerEntries = async (options: PdfPageDebugDumpOptions) => {
  if (!canUseWindow() || typeof fetch !== "function") {
    return null;
  }

  const searchParams = new URLSearchParams();
  if (options.level) {
    searchParams.set("level", options.level);
  }
  if (options.eventName) {
    searchParams.set("eventName", options.eventName);
  }
  if (typeof options.limit === "number") {
    searchParams.set("limit", String(Math.max(0, Math.floor(options.limit))));
  }

  const response = await fetch(`${PDF_PAGE_DEBUG_DUMP_ENDPOINT}?${searchParams}`);
  if (!response.ok) {
    return null;
  }

  return (await response.json()) as PdfPageDebugLogEntry[];
};

const readMemoryEntries = (options: PdfPageDebugDumpOptions = {}) => {
  const threshold = options.level ?? "trace";
  const entries = memoryEntries
    .filter((entry) => shouldIncludeLevel(entry.level, threshold))
    .filter((entry) =>
      options.eventName ? entry.eventName === options.eventName : true,
    )
    .sort((a, b) => b.timestamp - a.timestamp || b.sequence - a.sequence);

  return typeof options.limit === "number"
    ? entries.slice(0, Math.max(0, Math.floor(options.limit)))
    : entries;
};

export const pdfPageDebug = {
  getConfig() {
    return readConfig();
  },

  configure(config: PartialConfig) {
    runtimeOverride = {
      ...runtimeOverride,
      ...normalizeConfig({
        ...readConfig(),
        ...config,
      }),
    };
    return readConfig();
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
    try {
      const entries = await readServerEntries(options);
      if (entries) {
        return entries;
      }
    } catch {
      // Fall back to the in-page ring buffer when the dev server endpoint is absent.
    }

    return readMemoryEntries(options);
  },

  async clear() {
    memoryEntries.splice(0, memoryEntries.length);
    if (!canUseWindow() || typeof fetch !== "function") {
      return;
    }

    await fetch(PDF_PAGE_DEBUG_DUMP_ENDPOINT, {
      method: "DELETE",
    });
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
