import { newElement, newFrameElement } from "@excalidraw/element";

import { shouldClipElementToFrame } from "../renderer/frameClipping";
import { PDF_PAGE_GAP, makePdfPageCustomData } from "../pdfPageStack";

import type { ExcalidrawElement } from "@excalidraw/element/types";

const appState = {
  frameRendering: {
    enabled: true,
    clip: true,
  },
} as any;

const createElementsMap = (...elements: ExcalidrawElement[]) =>
  new Map(elements.map((element) => [element.id, element])) as any;

describe("PDF page frame clipping", () => {
  it("keeps regular frame clipping intact", () => {
    const frame = newFrameElement({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const note = newElement({
      type: "rectangle",
      x: 90,
      y: 40,
      width: 40,
      height: 20,
      frameId: frame.id,
    });
    const elementsMap = createElementsMap(frame, note);

    expect(shouldClipElementToFrame(note, frame, appState, elementsMap)).toBe(
      true,
    );
  });

  it("does not clip notes attached to PDF page frames", () => {
    const pdfPageFrame = newFrameElement({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      customData: makePdfPageCustomData("pdf-clip-test", 0, PDF_PAGE_GAP),
    });
    const note = newElement({
      type: "rectangle",
      x: 90,
      y: 40,
      width: 40,
      height: 20,
      frameId: pdfPageFrame.id,
    });
    const elementsMap = createElementsMap(pdfPageFrame, note);

    expect(
      shouldClipElementToFrame(note, pdfPageFrame, appState, elementsMap),
    ).toBe(false);
  });
});
