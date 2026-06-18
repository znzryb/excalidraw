import {
  newFrameElement,
  newImageElement,
  newElement,
} from "@excalidraw/element";

import {
  PDF_PAGE_GAP,
  deletePdfPage,
  getPdfPageData,
  insertPdfPageAfter,
  makePdfPageBackgroundCustomData,
  makePdfPageCustomData,
  movePdfDocument,
} from "../pdfPageStack";

import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";

const DOC_ID = "pdf-test";

const createPage = (pageIndex: number, y: number, docId = DOC_ID) => {
  const frame = newFrameElement({
    x: 0,
    y,
    width: 100,
    height: 100,
    name: `PDF page ${pageIndex + 1}`,
    customData: makePdfPageCustomData(docId, pageIndex, PDF_PAGE_GAP),
  });
  const background = newImageElement({
    type: "image",
    x: 0,
    y,
    width: 100,
    height: 100,
    fileId: `file-${pageIndex}` as FileId,
    status: "saved",
    locked: true,
    frameId: frame.id,
    customData: makePdfPageBackgroundCustomData(docId, pageIndex),
  });

  return { frame, background };
};

const createNote = (y: number) =>
  newElement({
    type: "rectangle",
    x: 10,
    y,
    width: 20,
    height: 20,
  });

describe("pdfPageStack", () => {
  it("deletes a page and notes intersecting it, then moves later pages up", () => {
    const page1 = createPage(0, 0);
    const page2 = createPage(1, 140);
    const page3 = createPage(2, 280);
    const noteOnDeletedPage = createNote(150);
    const noteOnLaterPage = createNote(290);
    const outsideNote = createNote(500);
    const elements: ExcalidrawElement[] = [
      page1.frame,
      page1.background,
      page2.frame,
      page2.background,
      page3.frame,
      page3.background,
      noteOnDeletedPage,
      noteOnLaterPage,
      outsideNote,
    ];

    const nextElements = deletePdfPage(elements, page2.frame);
    const get = (id: string) => nextElements.find((el) => el.id === id)!;

    expect(get(page2.frame.id).isDeleted).toBe(true);
    expect(get(page2.background.id).isDeleted).toBe(true);
    expect(get(noteOnDeletedPage.id).isDeleted).toBe(true);
    expect(get(page3.frame.id).y).toBe(140);
    expect(get(page3.background.id).y).toBe(140);
    expect(get(noteOnLaterPage.id).y).toBe(150);
    expect(get(outsideNote.id).y).toBe(500);
    expect(getPdfPageData(get(page3.frame.id))?.pageIndex).toBe(1);
  });

  it("moves a later note only once even if it intersects multiple later pages", () => {
    const page1 = createPage(0, 0);
    const page2 = createPage(1, 140);
    const page3 = createPage(2, 280);
    const largeNote = newElement({
      type: "rectangle",
      x: 10,
      y: 250,
      width: 20,
      height: 180,
    });
    const elements: ExcalidrawElement[] = [
      page1.frame,
      page1.background,
      page2.frame,
      page2.background,
      page3.frame,
      page3.background,
      largeNote,
    ];

    const nextElements = deletePdfPage(elements, page1.frame);
    const movedNote = nextElements.find((el) => el.id === largeNote.id)!;

    expect(movedNote.y).toBe(110);
  });

  it("inserts a blank page after the selected page and moves later content down", () => {
    const page1 = createPage(0, 0);
    const page2 = createPage(1, 140);
    const noteOnPage2 = createNote(150);
    const insertedFrame = newFrameElement({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    const insertedBackground = newImageElement({
      type: "image",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fileId: "blank-file" as FileId,
      status: "saved",
      locked: true,
      frameId: insertedFrame.id,
    });
    const elements: ExcalidrawElement[] = [
      page1.frame,
      page1.background,
      page2.frame,
      page2.background,
      noteOnPage2,
    ];

    const nextElements = insertPdfPageAfter(
      elements,
      page1.frame,
      insertedFrame,
      insertedBackground,
    );
    const get = (id: string) => nextElements.find((el) => el.id === id)!;

    expect(get(insertedFrame.id).y).toBe(140);
    expect(get(insertedBackground.id).frameId).toBe(insertedFrame.id);
    expect(get(page2.frame.id).y).toBe(280);
    expect(get(page2.background.id).y).toBe(280);
    expect(get(noteOnPage2.id).y).toBe(290);
    expect(getPdfPageData(get(insertedFrame.id))?.pageIndex).toBe(1);
    expect(getPdfPageData(get(page2.frame.id))?.pageIndex).toBe(2);
  });

  it("moves an entire PDF document and notes intersecting its pages", () => {
    const page1 = createPage(0, 0);
    const page2 = createPage(1, 140);
    const otherPdfPage = createPage(0, 400, "other-pdf");
    const noteOnPage2 = createNote(150);
    const outsideNote = createNote(700);
    const elements: ExcalidrawElement[] = [
      page1.frame,
      page1.background,
      page2.frame,
      page2.background,
      noteOnPage2,
      outsideNote,
      otherPdfPage.frame,
      otherPdfPage.background,
    ];

    const nextElements = movePdfDocument(elements, elements, page1.frame, {
      x: 30,
      y: 50,
    });
    const get = (id: string) => nextElements.find((el) => el.id === id)!;

    expect(get(page1.frame.id)).toMatchObject({ x: 30, y: 50 });
    expect(get(page1.background.id)).toMatchObject({ x: 30, y: 50 });
    expect(get(page2.frame.id)).toMatchObject({ x: 30, y: 190 });
    expect(get(page2.background.id)).toMatchObject({ x: 30, y: 190 });
    expect(get(noteOnPage2.id)).toMatchObject({ x: 40, y: 200 });
    expect(get(outsideNote.id)).toMatchObject({ x: 10, y: 700 });
    expect(get(otherPdfPage.frame.id)).toMatchObject({ x: 0, y: 400 });
    expect(get(otherPdfPage.background.id)).toMatchObject({ x: 0, y: 400 });
  });
});
