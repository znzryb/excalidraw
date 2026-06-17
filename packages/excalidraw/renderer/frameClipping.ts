import { shouldApplyFrameClip } from "@excalidraw/element";

import type {
  ElementsMap,
  ExcalidrawElement,
  ExcalidrawFrameLikeElement,
} from "@excalidraw/element/types";

import { isPdfPageFrame } from "../pdfPageStack";

import type { StaticCanvasAppState } from "../types";

export const shouldClipElementToFrame = (
  element: ExcalidrawElement,
  frame: ExcalidrawFrameLikeElement,
  appState: StaticCanvasAppState,
  elementsMap: ElementsMap,
  checkedGroups?: Map<string, boolean>,
) => {
  if (isPdfPageFrame(frame)) {
    return false;
  }

  return shouldApplyFrameClip(
    element,
    frame,
    appState,
    elementsMap,
    checkedGroups,
  );
};
