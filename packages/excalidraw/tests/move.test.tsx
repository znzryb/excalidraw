import React from "react";
import { vi } from "vitest";
import { KEYS, reseed } from "@excalidraw/common";
import {
  bindBindingElement,
  newFrameElement,
  newImageElement,
} from "@excalidraw/element";
import "@excalidraw/utils/test-utils";

import type {
  ExcalidrawArrowElement,
  FileId,
  NonDeleted,
} from "@excalidraw/element/types";

import { Excalidraw } from "../index";
import {
  PDF_PAGE_GAP,
  makePdfPageBackgroundCustomData,
  makePdfPageCustomData,
} from "../pdfPageStack";
import * as InteractiveCanvas from "../renderer/interactiveScene";
import * as StaticScene from "../renderer/staticScene";

import { API } from "./helpers/api";
import { UI, Pointer, Keyboard } from "./helpers/ui";
import { render, fireEvent, act, unmountComponent } from "./test-utils";

unmountComponent();

const renderInteractiveScene = vi.spyOn(
  InteractiveCanvas,
  "renderInteractiveScene",
);
const renderStaticScene = vi.spyOn(StaticScene, "renderStaticScene");

beforeEach(() => {
  localStorage.clear();
  renderInteractiveScene.mockClear();
  renderStaticScene.mockClear();
  reseed(7);
});

const { h } = window;
const PDF_MOVE_DOC_ID = "pdf-move-test";

const createPdfPage = (pageIndex: number, y: number) => {
  const pageFrame = newFrameElement({
    x: 100,
    y,
    width: 200,
    height: 120,
    name: `PDF page ${pageIndex + 1}`,
    customData: makePdfPageCustomData(
      PDF_MOVE_DOC_ID,
      pageIndex,
      PDF_PAGE_GAP,
    ),
  });
  const pageBackground = newImageElement({
    type: "image",
    x: 100,
    y,
    width: 200,
    height: 120,
    fileId: `pdf-page-background-${pageIndex}` as FileId,
    status: "saved",
    locked: true,
    frameId: pageFrame.id,
    customData: makePdfPageBackgroundCustomData(PDF_MOVE_DOC_ID, pageIndex),
  });

  return { pageFrame, pageBackground };
};

describe("move element", () => {
  it("does not drag PDF page frames or backgrounds", async () => {
    await render(<Excalidraw />);

    const { pageFrame, pageBackground } = createPdfPage(0, 80);

    API.setElements([pageFrame, pageBackground]);
    API.setSelectedElements([pageFrame]);

    const mouse = new Pointer("mouse");
    mouse.downAt(150, 110);
    mouse.moveTo(240, 190);
    mouse.upAt(240, 190);

    expect(API.getElement(pageFrame)).toEqual(
      expect.objectContaining({ x: 100, y: 80 }),
    );
    expect(API.getElement(pageBackground)).toEqual(
      expect.objectContaining({ x: 100, y: 80 }),
    );
  });

  it("moves all pages from a PDF document when PDF document move mode is enabled", async () => {
    await render(<Excalidraw />);

    const page1 = createPdfPage(0, 80);
    const page2 = createPdfPage(1, 240);
    const noteOnPage2 = API.createElement({
      type: "rectangle",
      x: 120,
      y: 260,
      width: 40,
      height: 40,
    });
    const outsideNote = API.createElement({
      type: "rectangle",
      x: 120,
      y: 500,
      width: 40,
      height: 40,
    });

    API.setElements([
      page1.pageFrame,
      page1.pageBackground,
      page2.pageFrame,
      page2.pageBackground,
      noteOnPage2,
      outsideNote,
    ]);
    API.setSelectedElements([page1.pageFrame]);
    API.setAppState({ pdfPageMoveDocId: PDF_MOVE_DOC_ID });

    const mouse = new Pointer("mouse");
    mouse.downAt(150, 110);
    mouse.moveTo(240, 190);
    mouse.upAt(240, 190);

    expect(API.getElement(page1.pageFrame)).toEqual(
      expect.objectContaining({ x: 190, y: 160 }),
    );
    expect(API.getElement(page1.pageBackground)).toEqual(
      expect.objectContaining({ x: 190, y: 160 }),
    );
    expect(API.getElement(page2.pageFrame)).toEqual(
      expect.objectContaining({ x: 190, y: 320 }),
    );
    expect(API.getElement(page2.pageBackground)).toEqual(
      expect.objectContaining({ x: 190, y: 320 }),
    );
    expect(API.getElement(noteOnPage2)).toEqual(
      expect.objectContaining({ x: 210, y: 340 }),
    );
    expect(API.getElement(outsideNote)).toEqual(
      expect.objectContaining({ x: 120, y: 500 }),
    );
    expect(h.state.pdfPageMoveDocId).toBeNull();
  });

  it("rectangle", async () => {
    const { getByToolName, container } = await render(<Excalidraw />);
    const canvas = container.querySelector("canvas.interactive")!;

    {
      // create element
      const tool = getByToolName("rectangle");
      fireEvent.click(tool);
      fireEvent.pointerDown(canvas, { clientX: 30, clientY: 20 });
      fireEvent.pointerMove(canvas, { clientX: 60, clientY: 70 });
      fireEvent.pointerUp(canvas);

      expect(renderInteractiveScene.mock.calls.length).toMatchInlineSnapshot(
        `5`,
      );
      expect(renderStaticScene.mock.calls.length).toMatchInlineSnapshot(`5`);
      expect(h.state.selectionElement).toBeNull();
      expect(h.elements.length).toEqual(1);
      expect(h.state.selectedElementIds[h.elements[0].id]).toBeTruthy();
      expect([h.elements[0].x, h.elements[0].y]).toEqual([30, 20]);

      renderInteractiveScene.mockClear();
      renderStaticScene.mockClear();
    }

    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 20 });
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 40 });
    fireEvent.pointerUp(canvas);

    expect(renderInteractiveScene.mock.calls.length).toMatchInlineSnapshot(`3`);
    expect(renderStaticScene.mock.calls.length).toMatchInlineSnapshot(`2`);
    expect(h.state.selectionElement).toBeNull();
    expect(h.elements.length).toEqual(1);
    expect([h.elements[0].x, h.elements[0].y]).toEqual([0, 40]);

    h.elements.forEach((element) => expect(element).toMatchSnapshot());
  });

  it("rectangles with binding arrow", async () => {
    await render(<Excalidraw handleKeyboardGlobally={true} />);

    // create elements
    const rectA = UI.createElement("rectangle", { size: 100 });
    const rectB = UI.createElement("rectangle", { x: 200, y: 0, size: 300 });
    const arrow = UI.createElement("arrow", { x: 105, y: 50, size: 88 });

    act(() => {
      // bind line to two rectangles
      bindBindingElement(
        arrow.get() as NonDeleted<ExcalidrawArrowElement>,
        rectA.get(),
        "orbit",
        "start",
        h.app.scene,
      );
      bindBindingElement(
        arrow.get() as NonDeleted<ExcalidrawArrowElement>,
        rectB.get(),
        "orbit",
        "end",
        h.app.scene,
      );
    });

    // select the second rectangle
    new Pointer("mouse").clickOn(rectB);

    expect(renderInteractiveScene.mock.calls.length).toMatchInlineSnapshot(
      `16`,
    );
    expect(renderStaticScene.mock.calls.length).toMatchInlineSnapshot(`15`);
    expect(h.state.selectionElement).toBeNull();
    expect(h.elements.length).toEqual(3);
    expect(h.state.selectedElementIds[rectB.id]).toBeTruthy();
    expect([rectA.x, rectA.y]).toEqual([0, 0]);
    expect([rectB.x, rectB.y]).toEqual([200, 0]);
    expect([[arrow.x, arrow.y]]).toCloselyEqualPoints(
      [[106.00000000000001, 55.6867741935484]],
      0,
    );
    expect([[arrow.width, arrow.height]]).toCloselyEqualPoints([[88, 88]], 0);

    renderInteractiveScene.mockClear();
    renderStaticScene.mockClear();

    // Move selected rectangle
    Keyboard.keyDown(KEYS.ARROW_RIGHT);
    Keyboard.keyDown(KEYS.ARROW_DOWN);
    Keyboard.keyDown(KEYS.ARROW_DOWN);

    // Check that the arrow size has been changed according to moving the rectangle
    expect(renderInteractiveScene.mock.calls.length).toMatchInlineSnapshot(`3`);
    expect(renderStaticScene.mock.calls.length).toMatchInlineSnapshot(`3`);
    expect(h.state.selectionElement).toBeNull();
    expect(h.elements.length).toEqual(3);
    expect(h.state.selectedElementIds[rectB.id]).toBeTruthy();
    expect([rectA.x, rectA.y]).toEqual([0, 0]);
    expect([rectB.x, rectB.y]).toEqual([201, 2]);
    expect([[arrow.x, arrow.y]]).toCloselyEqualPoints(
      [[106, 55.6867741935484]],
      0,
    );
    expect([[arrow.width, arrow.height]]).toCloselyEqualPoints([[89, 90]], 0);

    h.elements.forEach((element) => expect(element).toMatchSnapshot());
  });
});

describe("duplicate element on move when ALT is clicked", () => {
  it("rectangle", async () => {
    const { getByToolName, container } = await render(<Excalidraw />);
    const canvas = container.querySelector("canvas.interactive")!;

    {
      // create element
      const tool = getByToolName("rectangle");
      fireEvent.click(tool);
      fireEvent.pointerDown(canvas, { clientX: 30, clientY: 20 });
      fireEvent.pointerMove(canvas, { clientX: 60, clientY: 70 });
      fireEvent.pointerUp(canvas);

      expect(renderInteractiveScene.mock.calls.length).toMatchInlineSnapshot(
        `5`,
      );
      expect(renderStaticScene.mock.calls.length).toMatchInlineSnapshot(`5`);
      expect(h.state.selectionElement).toBeNull();
      expect(h.elements.length).toEqual(1);
      expect(h.state.selectedElementIds[h.elements[0].id]).toBeTruthy();
      expect([h.elements[0].x, h.elements[0].y]).toEqual([30, 20]);

      renderInteractiveScene.mockClear();
      renderStaticScene.mockClear();
    }

    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 20 });
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 40, altKey: true });

    // firing another pointerMove event with alt key pressed should NOT trigger
    // another duplication
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 40, altKey: true });
    fireEvent.pointerMove(canvas, { clientX: 10, clientY: 60 });
    fireEvent.pointerUp(canvas);

    expect(renderInteractiveScene.mock.calls.length).toMatchInlineSnapshot(`4`);
    expect(renderStaticScene.mock.calls.length).toMatchInlineSnapshot(`3`);
    expect(h.state.selectionElement).toBeNull();
    expect(h.elements.length).toEqual(2);

    // previous element should stay intact
    expect([h.elements[0].x, h.elements[0].y]).toEqual([30, 20]);
    expect([h.elements[1].x, h.elements[1].y]).toEqual([-10, 60]);

    h.elements.forEach((element) => expect(element).toMatchSnapshot());
  });
});
