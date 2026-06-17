import { THEME } from "@excalidraw/common";
import {
  newElement,
  newFrameElement,
  newImageElement,
} from "@excalidraw/element";

import { EraserTrail } from "../eraser";
import {
  PDF_PAGE_GAP,
  makePdfPageBackgroundCustomData,
  makePdfPageCustomData,
} from "../pdfPageStack";

import type { FileId, NonDeleted } from "@excalidraw/element/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";

const DOC_ID = "pdf-eraser-test";

const createFakeApp = (elements: readonly NonDeleted<ExcalidrawElement>[]) =>
  ({
    visibleElements: elements,
    state: {
      scrollX: 0,
      scrollY: 0,
      theme: THEME.LIGHT,
      zoom: { value: 1 },
    },
    scene: {
      getNonDeletedElementsMap: () =>
        new Map(elements.map((element) => [element.id, element])),
    },
  } as any);

describe("eraser PDF page handling", () => {
  it("does not mark PDF page frames or backgrounds for erasure", () => {
    const pageFrame = newFrameElement({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      customData: makePdfPageCustomData(DOC_ID, 0, PDF_PAGE_GAP),
    });
    const pageBackground = newImageElement({
      type: "image",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fileId: "pdf-page-background" as FileId,
      status: "saved",
      frameId: pageFrame.id,
      customData: makePdfPageBackgroundCustomData(DOC_ID, 0),
    });
    const note = newElement({
      type: "rectangle",
      x: 10,
      y: 10,
      width: 20,
      height: 20,
    });
    const eraser = new EraserTrail(
      createFakeApp([pageFrame, pageBackground, note]),
    );

    eraser.startPath(5, 5);
    const elementsToErase = eraser.addPointToPath(30, 30);

    expect(elementsToErase).toContain(note.id);
    expect(elementsToErase).not.toContain(pageFrame.id);
    expect(elementsToErase).not.toContain(pageBackground.id);
  });
});
