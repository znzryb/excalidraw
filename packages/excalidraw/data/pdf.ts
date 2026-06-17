import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

import { newFrameElement, newImageElement } from "@excalidraw/element";

import {
  PDF_PAGE_DISPLAY_WIDTH,
  PDF_PAGE_GAP,
  createPdfPageFileData,
  getPdfPageName,
  makePdfPageBackgroundCustomData,
  makePdfPageCustomData,
} from "../pdfPageStack";

import { generateIdFromFile, getDataURL } from "./blob";

import type { BinaryFileData } from "../types";
import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const MAX_RENDERED_PAGE_WIDTH = 1800;

const canvasToPngFile = (canvas: HTMLCanvasElement, fileName: string) =>
  new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to render PDF page."));
        return;
      }

      resolve(new File([blob], fileName, { type: "image/png" }));
    }, "image/png");
  });

export const createBlankPdfPageFile = (
  width: number,
  height: number,
  fileName: string,
) => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Failed to create blank PDF page.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  return canvasToPngFile(canvas, fileName);
};

export const fileToBinaryFileData = async (
  file: File,
  generateIdForFile?: (file: File) => string | Promise<string>,
): Promise<BinaryFileData> => {
  const generatedId = await generateIdForFile?.(file);
  const fileId =
    (generatedId as FileId | undefined) || (await generateIdFromFile(file));
  const dataURL = await getDataURL(file);

  return createPdfPageFileData(fileId, dataURL);
};

export const renderPdfToPageStack = async (
  pdfFile: File,
  sceneX: number,
  sceneY: number,
  generateIdForFile?: (file: File) => string | Promise<string>,
) => {
  const pdf = await pdfjsLib.getDocument({
    data: await pdfFile.arrayBuffer(),
  }).promise;

  const docId = `pdf-${Date.now().toString(36)}`;
  const elements: ExcalidrawElement[] = [];
  const files: BinaryFileData[] = [];
  let cursorY = sceneY;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const displayWidth = PDF_PAGE_DISPLAY_WIDTH;
    const displayHeight =
      displayWidth * (unscaledViewport.height / unscaledViewport.width);
    const targetBitmapWidth = Math.min(
      MAX_RENDERED_PAGE_WIDTH,
      Math.max(
        displayWidth,
        Math.round(displayWidth * window.devicePixelRatio),
      ),
    );
    const renderScale = targetBitmapWidth / unscaledViewport.width;
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to render PDF page.");
    }

    await page.render({ canvasContext: context, viewport }).promise;

    const imageFile = await canvasToPngFile(
      canvas,
      `${pdfFile.name.replace(/\.pdf$/i, "")}-page-${pageNumber}.png`,
    );
    const binaryFile = await fileToBinaryFileData(imageFile, generateIdForFile);
    files.push(binaryFile);

    const pageIndex = pageNumber - 1;
    const frame = newFrameElement({
      x: sceneX,
      y: cursorY,
      width: displayWidth,
      height: displayHeight,
      name: getPdfPageName(pageIndex),
      customData: makePdfPageCustomData(docId, pageIndex, PDF_PAGE_GAP),
    });

    const image = newImageElement({
      type: "image",
      x: sceneX,
      y: cursorY,
      width: displayWidth,
      height: displayHeight,
      fileId: binaryFile.id,
      status: "saved",
      locked: true,
      frameId: frame.id,
      customData: makePdfPageBackgroundCustomData(docId, pageIndex),
    });

    elements.push(frame, image);
    cursorY += displayHeight + PDF_PAGE_GAP;
  }

  return { elements, files, docId };
};
