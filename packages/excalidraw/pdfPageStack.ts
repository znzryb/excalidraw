import { arrayToMap } from "@excalidraw/common";

import {
  doBoundsIntersect,
  getElementBounds,
  isFrameElement,
  newElementWith,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawFrameElement,
  ExcalidrawImageElement,
  FileId,
  NonDeleted,
} from "@excalidraw/element/types";
import type { DataURL } from "./types";

type PdfPageData = {
  docId: string;
  pageIndex: number;
  gap: number;
};

type PdfPageBackgroundData = {
  docId: string;
  pageIndex: number;
};

export const PDF_MIME_TYPE = "application/pdf";
export const PDF_PAGE_GAP = 40;
export const PDF_PAGE_DISPLAY_WIDTH = 900;

const PDF_PAGE_NAME_PREFIX = "PDF page";

export const isPdfFile = (file: File) =>
  file.type === PDF_MIME_TYPE || file.name.toLowerCase().endsWith(".pdf");

export const getPdfPageData = (
  element: ExcalidrawElement | null | undefined,
): PdfPageData | null => {
  const pdfPage = element?.customData?.pdfPage;

  if (
    pdfPage &&
    typeof pdfPage.docId === "string" &&
    typeof pdfPage.pageIndex === "number" &&
    typeof pdfPage.gap === "number"
  ) {
    return pdfPage;
  }

  return null;
};

export const getPdfPageBackgroundData = (
  element: ExcalidrawElement | null | undefined,
): PdfPageBackgroundData | null => {
  const pdfPageBackground = element?.customData?.pdfPageBackground;

  if (
    pdfPageBackground &&
    typeof pdfPageBackground.docId === "string" &&
    typeof pdfPageBackground.pageIndex === "number"
  ) {
    return pdfPageBackground;
  }

  return null;
};

export const isPdfPageFrame = (
  element: ExcalidrawElement | null | undefined,
): element is NonDeleted<ExcalidrawFrameElement> =>
  !!element &&
  !element.isDeleted &&
  isFrameElement(element) &&
  !!getPdfPageData(element);

export const isPdfPageBackground = (
  element: ExcalidrawElement | null | undefined,
): element is NonDeleted<ExcalidrawImageElement> =>
  !!element &&
  !element.isDeleted &&
  element.type === "image" &&
  !!getPdfPageBackgroundData(element);

export const getPdfPageFrameForElement = (
  element: ExcalidrawElement | null | undefined,
  elements: readonly ExcalidrawElement[],
) => {
  if (isPdfPageFrame(element)) {
    return element;
  }

  if (!isPdfPageBackground(element)) {
    return null;
  }

  const elementsMap = arrayToMap(elements);
  const frame = element.frameId ? elementsMap.get(element.frameId) : null;

  return isPdfPageFrame(frame) ? frame : null;
};

export const makePdfPageCustomData = (
  docId: string,
  pageIndex: number,
  gap = PDF_PAGE_GAP,
) => ({
  pdfPage: {
    docId,
    pageIndex,
    gap,
  },
});

export const makePdfPageBackgroundCustomData = (
  docId: string,
  pageIndex: number,
) => ({
  pdfPageBackground: {
    docId,
    pageIndex,
  },
});

export const getPdfPageName = (pageIndex: number) =>
  `${PDF_PAGE_NAME_PREFIX} ${pageIndex + 1}`;

const getSortedPageFrames = (
  elements: readonly ExcalidrawElement[],
  docId: string,
) =>
  elements
    .filter((element): element is NonDeleted<ExcalidrawFrameElement> => {
      if (!isPdfPageFrame(element)) {
        return false;
      }
      const data = getPdfPageData(element);
      return data?.docId === docId;
    })
    .sort((a, b) => {
      const pageA = getPdfPageData(a)!.pageIndex;
      const pageB = getPdfPageData(b)!.pageIndex;
      return pageA - pageB || a.y - b.y;
    });

const isElementBoundToChangedContainer = (
  element: ExcalidrawElement,
  changedElementIds: Set<string>,
) =>
  "containerId" in element &&
  typeof element.containerId === "string" &&
  changedElementIds.has(element.containerId);

const intersectsFrame = (
  element: ExcalidrawElement,
  frame: ExcalidrawFrameElement,
  elements: readonly ExcalidrawElement[],
) => {
  const elementsMap = arrayToMap(elements);
  return doBoundsIntersect(
    getElementBounds(element, elementsMap),
    getElementBounds(frame, elementsMap),
  );
};

const collectElementsIntersectingFrame = (
  elements: readonly ExcalidrawElement[],
  frame: ExcalidrawFrameElement,
  excludedIds: Set<string>,
) => {
  const intersecting = new Set<string>();

  for (const element of elements) {
    if (
      element.isDeleted ||
      excludedIds.has(element.id) ||
      isPdfPageFrame(element) ||
      isPdfPageBackground(element)
    ) {
      continue;
    }

    if (intersectsFrame(element, frame, elements)) {
      intersecting.add(element.id);
    }
  }

  for (const element of elements) {
    if (isElementBoundToChangedContainer(element, intersecting)) {
      intersecting.add(element.id);
    }
  }

  return intersecting;
};

const getPageFramesAfter = (
  elements: readonly ExcalidrawElement[],
  pageFrame: ExcalidrawFrameElement,
) => {
  const pageData = getPdfPageData(pageFrame)!;
  return getSortedPageFrames(elements, pageData.docId).filter(
    (frame) => getPdfPageData(frame)!.pageIndex > pageData.pageIndex,
  );
};

const collectLaterPageElements = (
  elements: readonly ExcalidrawElement[],
  pageFrame: ExcalidrawFrameElement,
  excludedIds: Set<string>,
) => {
  const movedIds = new Set<string>();

  for (const frame of getPageFramesAfter(elements, pageFrame)) {
    movedIds.add(frame.id);

    for (const element of elements) {
      if (
        element.isDeleted ||
        excludedIds.has(element.id) ||
        element.id === frame.id
      ) {
        continue;
      }

      if (isPdfPageBackground(element) && element.frameId === frame.id) {
        movedIds.add(element.id);
        continue;
      }

      if (
        !isPdfPageFrame(element) &&
        !isPdfPageBackground(element) &&
        intersectsFrame(element, frame, elements)
      ) {
        movedIds.add(element.id);
      }
    }
  }

  for (const element of elements) {
    if (isElementBoundToChangedContainer(element, movedIds)) {
      movedIds.add(element.id);
    }
  }

  return movedIds;
};

const reindexPdfPages = (
  elements: readonly ExcalidrawElement[],
  docId: string,
) => {
  const frames = getSortedPageFrames(elements, docId);
  const pageIndexByFrameId = new Map<string, number>();

  frames.forEach((frame, pageIndex) => {
    pageIndexByFrameId.set(frame.id, pageIndex);
  });

  return elements.map((element) => {
    const pageData = getPdfPageData(element);
    if (
      isPdfPageFrame(element) &&
      pageData?.docId === docId &&
      pageIndexByFrameId.has(element.id)
    ) {
      const pageIndex = pageIndexByFrameId.get(element.id)!;
      return newElementWith(element, {
        name: getPdfPageName(pageIndex),
        customData: {
          ...element.customData,
          ...makePdfPageCustomData(docId, pageIndex, pageData.gap),
        },
      });
    }

    const backgroundData = getPdfPageBackgroundData(element);
    if (backgroundData?.docId === docId && element.frameId) {
      const pageIndex = pageIndexByFrameId.get(element.frameId);
      if (pageIndex != null) {
        return newElementWith(element, {
          customData: {
            ...element.customData,
            ...makePdfPageBackgroundCustomData(docId, pageIndex),
          },
        });
      }
    }

    return element;
  });
};

export const deletePdfPage = (
  elements: readonly ExcalidrawElement[],
  pageFrame: ExcalidrawFrameElement,
) => {
  const pageData = getPdfPageData(pageFrame);
  if (!pageData) {
    return elements;
  }

  const deletedIds = new Set<string>([pageFrame.id]);

  for (const element of elements) {
    if (isPdfPageBackground(element) && element.frameId === pageFrame.id) {
      deletedIds.add(element.id);
    }
  }

  for (const id of collectElementsIntersectingFrame(
    elements,
    pageFrame,
    deletedIds,
  )) {
    deletedIds.add(id);
  }

  for (const element of elements) {
    if (isElementBoundToChangedContainer(element, deletedIds)) {
      deletedIds.add(element.id);
    }
  }

  const movedIds = collectLaterPageElements(elements, pageFrame, deletedIds);
  const deltaY = -(pageFrame.height + pageData.gap);

  const nextElements = elements.map((element) => {
    if (deletedIds.has(element.id)) {
      return newElementWith(element, { isDeleted: true });
    }

    if (movedIds.has(element.id)) {
      return newElementWith(element, { y: element.y + deltaY });
    }

    return element;
  });

  return reindexPdfPages(nextElements, pageData.docId);
};

export const insertPdfPageAfter = (
  elements: readonly ExcalidrawElement[],
  pageFrame: ExcalidrawFrameElement,
  newFrame: ExcalidrawFrameElement,
  newBackground: ExcalidrawImageElement,
) => {
  const pageData = getPdfPageData(pageFrame);
  if (!pageData) {
    return elements;
  }

  const movedIds = collectLaterPageElements(elements, pageFrame, new Set());
  const deltaY = pageFrame.height + pageData.gap;

  const insertedFrame = newElementWith(newFrame, {
    x: pageFrame.x,
    y: pageFrame.y + deltaY,
    width: pageFrame.width,
    height: pageFrame.height,
    name: getPdfPageName(pageData.pageIndex + 1),
    customData: {
      ...newFrame.customData,
      ...makePdfPageCustomData(
        pageData.docId,
        pageData.pageIndex + 1,
        pageData.gap,
      ),
    },
  });

  const insertedBackground = newElementWith(newBackground, {
    x: insertedFrame.x,
    y: insertedFrame.y,
    width: insertedFrame.width,
    height: insertedFrame.height,
    frameId: insertedFrame.id,
    customData: {
      ...newBackground.customData,
      ...makePdfPageBackgroundCustomData(
        pageData.docId,
        pageData.pageIndex + 1,
      ),
    },
  });

  const nextElements = elements
    .map((element) =>
      movedIds.has(element.id)
        ? newElementWith(element, { y: element.y + deltaY })
        : element,
    )
    .concat(insertedFrame, insertedBackground);

  return reindexPdfPages(nextElements, pageData.docId);
};

export const getBlankPdfPageFileName = (docId: string, pageIndex: number) =>
  `${docId}-blank-page-${pageIndex + 1}.png`;

export const createPdfPageFileData = (
  fileId: FileId,
  dataURL: DataURL,
  created = Date.now(),
) => ({
  id: fileId,
  dataURL,
  mimeType: "image/png" as const,
  created,
  lastRetrieved: created,
});
