import { newElement, newFrameElement } from "@excalidraw/element";
import { vi } from "vitest";

import {
  PDF_PAGE_DEBUG_STORAGE_KEY,
  pdfPageDebug,
} from "../pdfPageDebugLogger";
import { PDF_PAGE_GAP, makePdfPageCustomData } from "../pdfPageStack";

describe("pdfPageDebug", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not log while disabled", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    pdfPageDebug.log("disabled", { value: 1 });
    pdfPageDebug.group("disabled-group", { value: 1 });

    expect(debug).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it("logs with a stable PDF debug prefix while enabled", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    localStorage.setItem(PDF_PAGE_DEBUG_STORAGE_KEY, "1");

    pdfPageDebug.log("enabled", { value: 1 });

    expect(debug).toHaveBeenCalledWith("[PDF_PAGE_DEBUG]", "enabled", {
      value: 1,
    });
  });

  it("sanitizes elements before logging payloads", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    localStorage.setItem(PDF_PAGE_DEBUG_STORAGE_KEY, "1");
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

    pdfPageDebug.log("sanitize", { element: note, frame: pdfPageFrame });

    expect(debug).toHaveBeenCalledWith("[PDF_PAGE_DEBUG]", "sanitize", {
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
    expect(debug.mock.calls[0][2]).not.toHaveProperty("element.points");
    expect(debug.mock.calls[0][2]).not.toHaveProperty("element.file");
  });
});
