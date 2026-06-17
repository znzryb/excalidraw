import { newElement, newFrameElement } from "@excalidraw/element";
import { vi } from "vitest";

// @ts-expect-error fake-indexeddb v3 ships without TypeScript declarations.
import FDBFactory from "fake-indexeddb/lib/FDBFactory";

import {
  PDF_PAGE_DEBUG_CONFIG_KEY,
  pdfPageDebug,
} from "../pdfPageDebugLogger";
import { PDF_PAGE_GAP, makePdfPageCustomData } from "../pdfPageStack";

const resetIndexedDB = () => {
  Object.defineProperty(window, "indexedDB", {
    value: new FDBFactory(),
    configurable: true,
  });
};

describe("pdfPageDebug", () => {
  beforeEach(async () => {
    localStorage.clear();
    resetIndexedDB();
    vi.restoreAllMocks();
    await pdfPageDebug.clear();
  });

  it("does not persist logs while disabled", async () => {
    await pdfPageDebug.log("disabled", { value: 1 }, "error");

    expect(await pdfPageDebug.dump()).toEqual([]);
  });

  it("persists logs after enable", async () => {
    pdfPageDebug.enable();

    await pdfPageDebug.log("enabled", { value: 1 }, "debug");
    const entries = await pdfPageDebug.dump();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: "debug",
      eventName: "enabled",
      payload: { value: 1 },
    });
    expect(entries[0].id).toEqual(expect.any(String));
    expect(entries[0].timestamp).toEqual(expect.any(Number));
    expect(entries[0].sessionId).toEqual(expect.any(String));
  });

  it("filters writes below the configured level", async () => {
    pdfPageDebug.enable({ level: "warn" });

    await pdfPageDebug.log("debug-event", { value: 1 }, "debug");
    await pdfPageDebug.log("warn-event", { value: 2 }, "warn");
    await pdfPageDebug.log("error-event", { value: 3 }, "error");

    expect((await pdfPageDebug.dump()).map((entry) => entry.eventName)).toEqual([
      "error-event",
      "warn-event",
    ]);
  });

  it("filters dumps by level and event name", async () => {
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

  it("clears persisted logs", async () => {
    pdfPageDebug.enable();
    await pdfPageDebug.log("entry", { value: 1 }, "debug");

    await pdfPageDebug.clear();

    expect(await pdfPageDebug.dump()).toEqual([]);
  });

  it("trims old logs over maxEntries", async () => {
    pdfPageDebug.enable({ maxEntries: 2 });

    await pdfPageDebug.log("one", null, "debug");
    await pdfPageDebug.log("two", null, "debug");
    await pdfPageDebug.log("three", null, "debug");

    expect((await pdfPageDebug.dump()).map((entry) => entry.eventName)).toEqual([
      "three",
      "two",
    ]);
  });

  it("sanitizes elements before persisting payloads", async () => {
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
    const [entry] = await pdfPageDebug.dump();

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
    expect(entry.payload).not.toHaveProperty("element.points");
    expect(entry.payload).not.toHaveProperty("element.file");
  });

  it("stores runtime config in localStorage", () => {
    const config = pdfPageDebug.enable({
      level: "trace",
      console: true,
      maxEntries: 5,
    });

    expect(config).toMatchObject({
      enabled: true,
      level: "trace",
      console: true,
      maxEntries: 5,
    });
    expect(
      JSON.parse(localStorage.getItem(PDF_PAGE_DEBUG_CONFIG_KEY)!),
    ).toMatchObject(config);
  });
});
