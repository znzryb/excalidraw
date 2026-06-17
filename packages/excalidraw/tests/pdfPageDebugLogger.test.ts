import { newElement, newFrameElement } from "@excalidraw/element";
import { vi } from "vitest";

import { pdfPageDebug } from "../pdfPageDebugLogger";
import { PDF_PAGE_GAP, makePdfPageCustomData } from "../pdfPageStack";

const makeFetchResponse = (body: unknown, ok = true) =>
  ({
    ok,
    json: async () => body,
  } as Response);

const setDebugEnv = (env: Record<string, string | undefined>) => {
  const previous = Object.fromEntries(
    Object.keys(env).map((key) => [key, import.meta.env[key]]),
  );

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete import.meta.env[key];
    } else {
      import.meta.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete import.meta.env[key];
      } else {
        import.meta.env[key] = value as string;
      }
    }
  };
};

describe("pdfPageDebug", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let restoreEnv: () => void;

  beforeEach(async () => {
    restoreEnv = setDebugEnv({
      VITE_AC_PDF_DEBUG: undefined,
      VITE_AC_PDF_DEBUG_LEVEL: undefined,
      VITE_AC_PDF_DEBUG_CONSOLE: undefined,
      VITE_AC_PDF_DEBUG_MAX_ENTRIES: undefined,
    });
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/__ac_pdf_debug/logs")) {
        return makeFetchResponse([], false);
      }

      return makeFetchResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.restoreAllMocks();
    pdfPageDebug.disable();
    await pdfPageDebug.clear();
    fetchMock.mockClear();
  });

  afterEach(() => {
    restoreEnv();
    vi.unstubAllGlobals();
  });

  it("does not send logs while disabled", async () => {
    await pdfPageDebug.log("disabled", { value: 1 }, "error");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await pdfPageDebug.dump()).toEqual([]);
  });

  it("sends sanitized logs after enable", async () => {
    pdfPageDebug.enable();

    await pdfPageDebug.log("enabled", { value: 1 }, "debug");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/__ac_pdf_debug/log",
      expect.objectContaining({
        method: "POST",
        body: expect.any(String),
      }),
    );

    const [, options] = fetchMock.mock.calls[0];
    const entry = JSON.parse(options.body);
    expect(entry).toMatchObject({
      level: "debug",
      eventName: "enabled",
      payload: { value: 1 },
      sequence: expect.any(Number),
    });
    expect(entry.id).toEqual(expect.any(String));
    expect(entry.timestamp).toEqual(expect.any(Number));
    expect(entry.sessionId).toEqual(expect.any(String));
  });

  it("filters writes below the configured level", async () => {
    pdfPageDebug.enable({ level: "warn" });

    await pdfPageDebug.log("debug-event", { value: 1 }, "debug");
    await pdfPageDebug.log("warn-event", { value: 2 }, "warn");
    await pdfPageDebug.log("error-event", { value: 3 }, "error");

    const eventNames = fetchMock.mock.calls.map(([, options]) =>
      JSON.parse(options.body).eventName,
    );
    expect(eventNames).toEqual(["warn-event", "error-event"]);
  });

  it("lets compile-time env disable runtime enable", async () => {
    restoreEnv();
    restoreEnv = setDebugEnv({
      VITE_AC_PDF_DEBUG: "0",
      VITE_AC_PDF_DEBUG_LEVEL: undefined,
      VITE_AC_PDF_DEBUG_CONSOLE: undefined,
      VITE_AC_PDF_DEBUG_MAX_ENTRIES: undefined,
    });

    pdfPageDebug.enable();
    await pdfPageDebug.log("env-disabled", { value: 1 }, "error");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses compile-time env level as the highest-priority level", async () => {
    restoreEnv();
    restoreEnv = setDebugEnv({
      VITE_AC_PDF_DEBUG: "1",
      VITE_AC_PDF_DEBUG_LEVEL: "error",
      VITE_AC_PDF_DEBUG_CONSOLE: undefined,
      VITE_AC_PDF_DEBUG_MAX_ENTRIES: undefined,
    });

    pdfPageDebug.enable({ level: "trace" });
    await pdfPageDebug.log("warn-event", { value: 1 }, "warn");
    await pdfPageDebug.log("error-event", { value: 2 }, "error");

    const eventNames = fetchMock.mock.calls.map(([, options]) =>
      JSON.parse(options.body).eventName,
    );
    expect(eventNames).toEqual(["error-event"]);
  });

  it("filters memory dumps by level and event name", async () => {
    pdfPageDebug.enable({ level: "trace" });

    await pdfPageDebug.log("mapped", { value: 1 }, "trace");
    await pdfPageDebug.log("drag", { value: 2 }, "debug");
    await pdfPageDebug.log("drag", { value: 3 }, "warn");

    expect(
      (await pdfPageDebug.dump({ level: "debug" })).map(
        (entry) => entry.eventName,
      ),
    ).toEqual(["drag", "drag"]);
    expect(
      (await pdfPageDebug.dump({ eventName: "mapped" })).map(
        (entry) => entry.level,
      ),
    ).toEqual(["trace"]);
  });

  it("clears in-memory logs and server logs", async () => {
    pdfPageDebug.enable();
    await pdfPageDebug.log("entry", { value: 1 }, "debug");
    fetchMock.mockClear();

    await pdfPageDebug.clear();

    expect(await pdfPageDebug.dump()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith("/__ac_pdf_debug/logs", {
      method: "DELETE",
    });
  });

  it("trims old in-memory logs over maxEntries", async () => {
    pdfPageDebug.enable({ maxEntries: 2 });

    await pdfPageDebug.log("one", null, "debug");
    await pdfPageDebug.log("two", null, "debug");
    await pdfPageDebug.log("three", null, "debug");

    expect((await pdfPageDebug.dump()).map((entry) => entry.eventName)).toEqual([
      "three",
      "two",
    ]);
  });

  it("sanitizes elements before sending payloads", async () => {
    pdfPageDebug.enable();
    const pdfPageFrame = newFrameElement({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      customData: makePdfPageCustomData("pdf-debug-test", 0, PDF_PAGE_GAP),
    });
    const note = {
      ...newElement({
        type: "rectangle",
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        frameId: pdfPageFrame.id,
      }),
      points: [[1, 2]],
      file: new Blob(["large"], { type: "text/plain" }),
    };

    await pdfPageDebug.log("sanitize", { element: note, frame: pdfPageFrame });

    const [, options] = fetchMock.mock.calls[0];
    const entry = JSON.parse(options.body);
    expect(entry.payload).toEqual({
      element: expect.objectContaining({
        id: note.id,
        type: "rectangle",
        frameId: pdfPageFrame.id,
        locked: false,
        isPdfPageFrame: false,
        isPdfPageBackground: false,
        x: 10,
        y: 10,
        width: 20,
        height: 20,
      }),
      frame: expect.objectContaining({
        id: pdfPageFrame.id,
        type: "frame",
        isPdfPageFrame: true,
      }),
    });
    expect(entry.payload.element).not.toHaveProperty("points");
    expect(entry.payload.element).not.toHaveProperty("file");
  });
});
