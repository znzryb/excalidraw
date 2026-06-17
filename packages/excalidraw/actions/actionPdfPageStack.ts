import {
  CaptureUpdateAction,
  fixBindingsAfterDeletion,
  getSelectedElements,
  newFrameElement,
  newImageElement,
  syncInvalidIndices,
} from "@excalidraw/element";

import { createBlankPdfPageFile, fileToBinaryFileData } from "../data/pdf";
import {
  deletePdfPage,
  getBlankPdfPageFileName,
  getPdfPageData,
  getPdfPageFrameForElement,
  insertPdfPageAfter,
} from "../pdfPageStack";
import { pdfPageDebug } from "../pdfPageDebugLogger";

import { register } from "./register";

import type { AppClassProperties, AppState } from "../types";
import type { ExcalidrawElement } from "@excalidraw/element/types";

const getSelectedPdfPageFrame = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  app: AppClassProperties,
) => {
  const selectedElement = getSelectedElements(elements, appState, {
    includeElementsInFrames: true,
  }).at(0);

  return getPdfPageFrameForElement(
    selectedElement,
    app.scene.getElementsIncludingDeleted(),
  );
};

const logPdfPageActionPredicate = (
  actionName: string,
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  app: AppClassProperties,
) => {
  const pageFrame = getSelectedPdfPageFrame(elements, appState, app);

  pdfPageDebug.log(`actionPredicate:${actionName}`, {
    result: !!pageFrame,
    pageFrame,
    selectedElementIds: appState.selectedElementIds,
  });

  return !!pageFrame;
};

const clearPdfPageSelection = (appState: AppState) => ({
  ...appState,
  selectedElementIds: {},
  selectedGroupIds: {},
  selectedLinearElement: null,
  activeEmbeddable: null,
  contextMenu: null,
});

export const actionDeletePdfPage = register({
  name: "deletePdfPage",
  label: "labels.deletePdfPage",
  trackEvent: { category: "element", action: "deletePdfPage" },
  predicate: (elements, appState, _, app) =>
    logPdfPageActionPredicate("deletePdfPage", elements, appState, app),
  perform: (elements, appState, _, app) => {
    const pageFrame = getSelectedPdfPageFrame(elements, appState, app);

    if (!pageFrame) {
      return false;
    }

    const nextElements = deletePdfPage(elements, pageFrame);

    fixBindingsAfterDeletion(
      nextElements,
      nextElements.filter((element) => element.isDeleted),
    );

    return {
      elements: nextElements,
      appState: clearPdfPageSelection(appState),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});

export const actionInsertPdfPageAfter = register({
  name: "insertPdfPageAfter",
  label: "labels.insertPdfPageAfter",
  trackEvent: { category: "element", action: "insertPdfPageAfter" },
  predicate: (elements, appState, _, app) =>
    logPdfPageActionPredicate("insertPdfPageAfter", elements, appState, app),
  perform: async (elements, appState, _, app) => {
    const pageFrame = getSelectedPdfPageFrame(elements, appState, app);
    const pageData = getPdfPageData(pageFrame);

    if (!pageFrame || !pageData) {
      return false;
    }

    const blankPageFile = await createBlankPdfPageFile(
      pageFrame.width,
      pageFrame.height,
      getBlankPdfPageFileName(pageData.docId, pageData.pageIndex + 1),
    );
    const binaryFile = await fileToBinaryFileData(
      blankPageFile,
      app.props.generateIdForFile,
    );
    const insertedFrame = newFrameElement({
      x: pageFrame.x,
      y: pageFrame.y,
      width: pageFrame.width,
      height: pageFrame.height,
    });
    const insertedBackground = newImageElement({
      type: "image",
      x: pageFrame.x,
      y: pageFrame.y,
      width: pageFrame.width,
      height: pageFrame.height,
      fileId: binaryFile.id,
      status: "saved",
      locked: true,
      frameId: insertedFrame.id,
    });
    const nextElements = syncInvalidIndices(
      insertPdfPageAfter(
        elements,
        pageFrame,
        insertedFrame,
        insertedBackground,
      ),
    );

    return {
      elements: nextElements,
      files: { [binaryFile.id]: binaryFile },
      appState: {
        ...clearPdfPageSelection(appState),
        selectedElementIds: { [insertedFrame.id]: true },
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    };
  },
});
