import type { ExcalidrawElement } from "@excalidraw/element/types";

import { isPdfPageBackground, isPdfPageFrame } from "./pdfPageStack";

export const PDF_PAGE_DEBUG_STORAGE_KEY = "ac-ladder:pdf-page-debug";
const PDF_PAGE_DEBUG_PREFIX = "[PDF_PAGE_DEBUG]";
const MAX_ARRAY_ITEMS = 30;
const MAX_OBJECT_KEYS = 30;
const MAX_DEPTH = 4;

type Jsonish =
  | string
  | number
  | boolean
  | null
  | undefined
  | Jsonish[]
  | { [key: string]: Jsonish };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object";

const canUseLocalStorage = () =>
  typeof window !== "undefined" && !!window.localStorage;

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

export const pdfPageDebug = {
  isEnabled() {
    try {
      return (
        canUseLocalStorage() &&
        window.localStorage.getItem(PDF_PAGE_DEBUG_STORAGE_KEY) === "1"
      );
    } catch {
      return false;
    }
  },

  log(eventName: string, payload?: unknown) {
    if (!this.isEnabled()) {
      return;
    }

    console.debug(PDF_PAGE_DEBUG_PREFIX, eventName, sanitizeValue(payload));
  },

  group(eventName: string, payload?: unknown) {
    if (!this.isEnabled()) {
      return;
    }

    console.groupCollapsed?.(PDF_PAGE_DEBUG_PREFIX, eventName);
    console.debug(sanitizeValue(payload));
    console.groupEnd?.();
  },
};
