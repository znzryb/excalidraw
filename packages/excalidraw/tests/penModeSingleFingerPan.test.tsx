import React from "react";

import { Excalidraw } from "../index";

import { API } from "./helpers/api";
import { Pointer, UI } from "./helpers/ui";
import { render } from "./test-utils";

const { h } = window;

describe("pen mode single-finger pan (AC-ladder)", () => {
  beforeEach(async () => {
    await render(<Excalidraw />);
  });

  it("penMode + freedraw + single-finger touch pans the canvas", () => {
    API.setAppState({ penMode: true });
    UI.clickTool("freedraw");

    const finger = new Pointer("touch");
    const { scrollX: startScrollX, scrollY: startScrollY } = h.state;

    finger.downAt(50, 50);
    finger.moveTo(80, 90);
    finger.upAt();

    expect(h.state.scrollX).not.toEqual(startScrollX);
    expect(h.state.scrollY).not.toEqual(startScrollY);
    // no element should be created — the gesture was a pan, not a stroke
    expect(h.elements).toHaveLength(0);
  });

  it("penMode + freedraw + Apple Pencil still draws (no pan)", () => {
    API.setAppState({ penMode: true });
    UI.clickTool("freedraw");

    const pen = new Pointer("pen");
    const { scrollX: startScrollX, scrollY: startScrollY } = h.state;

    pen.downAt(50, 50);
    pen.moveTo(60, 70);
    pen.upAt();

    expect(h.state.scrollX).toEqual(startScrollX);
    expect(h.state.scrollY).toEqual(startScrollY);
    expect(h.elements.length).toBeGreaterThan(0);
    expect(h.elements[0].type).toBe("freedraw");
  });

  it("penMode + selection + single-finger touch does NOT pan", () => {
    // selection is in the existing pen-mode touch whitelist; new pan branch
    // only activates for freedraw, so selection should keep its old behavior.
    API.setAppState({ penMode: true });
    UI.clickTool("selection");

    const finger = new Pointer("touch");
    const { scrollX: startScrollX, scrollY: startScrollY } = h.state;

    finger.downAt(50, 50);
    finger.moveTo(80, 90);
    finger.upAt();

    expect(h.state.scrollX).toEqual(startScrollX);
    expect(h.state.scrollY).toEqual(startScrollY);
  });

  it("without penMode, freedraw + touch still draws (regression guard)", () => {
    // pan branch requires penMode === true; with pen mode off, finger drawing
    // (the iPhone / no-pencil case) must keep working.
    UI.clickTool("freedraw");

    const finger = new Pointer("touch");
    const { scrollX: startScrollX, scrollY: startScrollY } = h.state;

    finger.downAt(50, 50);
    finger.moveTo(60, 70);
    finger.upAt();

    expect(h.state.scrollX).toEqual(startScrollX);
    expect(h.state.scrollY).toEqual(startScrollY);
    expect(h.elements.length).toBeGreaterThan(0);
    expect(h.elements[0].type).toBe("freedraw");
  });

  it("penMode + eraser + single-finger touch pans the canvas", () => {
    API.setAppState({ penMode: true });
    UI.clickTool("eraser");

    const finger = new Pointer("touch");
    const { scrollX: startScrollX, scrollY: startScrollY } = h.state;

    finger.downAt(50, 50);
    finger.moveTo(80, 90);
    finger.upAt();

    expect(h.state.scrollX).not.toEqual(startScrollX);
    expect(h.state.scrollY).not.toEqual(startScrollY);
  });

  it("penMode + eraser + Apple Pencil still erases (no pan)", () => {
    API.setAppState({ penMode: true });
    UI.clickTool("eraser");

    const pen = new Pointer("pen");
    const { scrollX: startScrollX, scrollY: startScrollY } = h.state;

    pen.downAt(50, 50);
    pen.moveTo(60, 70);
    pen.upAt();

    expect(h.state.scrollX).toEqual(startScrollX);
    expect(h.state.scrollY).toEqual(startScrollY);
  });

  it("without penMode, eraser + touch does NOT pan (regression guard)", () => {
    // pan branch requires penMode === true; with pen mode off, the eraser
    // branch should not engage either — keeps the no-pencil iPhone case clean.
    UI.clickTool("eraser");

    const finger = new Pointer("touch");
    const { scrollX: startScrollX, scrollY: startScrollY } = h.state;

    finger.downAt(50, 50);
    finger.moveTo(80, 90);
    finger.upAt();

    expect(h.state.scrollX).toEqual(startScrollX);
    expect(h.state.scrollY).toEqual(startScrollY);
  });
});
