# Excalidraw PDF Page Stack Plan

## Summary

PDF import should keep Excalidraw as an infinite whiteboard while adding a page stack semantics for imported PDF pages. Users can right-click or long-press a PDF page to delete that page or insert a blank page after it. Deleting a page removes the page background and notes intersecting that page, then moves later pages and their notes upward. Areas outside pages remain normal whiteboard space.

## Key Changes

- Add `pdfjs-dist` and render PDF pages to raster images that reuse Excalidraw's existing image/file cache.
- Add PDF import support through drag-and-drop and an `Import PDF...` menu action, without changing the existing `Ctrl+O / Load Scene` behavior.
- Model PDF pages as special frame-backed elements:
  - Page frame: a normal `frame` element with `customData.pdfPage = { docId, pageIndex, gap }`.
  - Page background: a locked image element with `frameId = pageFrame.id` and `customData.pdfPageBackground = { docId, pageIndex }`.
  - Inserted blank pages use same-sized white backgrounds and do not copy page notes.
- Add context menu actions `deletePdfPage` and `insertPdfPageAfter`, visible only for PDF page frames or PDF page backgrounds.

## Page Operations

- Import PDF:
  - Stack pages vertically from the drop/click position, with a default `40` scene-unit gap.
  - Preserve each PDF page aspect ratio and scale pages to a consistent display width.
  - Select the imported page stack after insertion.
- Delete page:
  - Delete the selected page frame, page background, and every non-page element whose bounds intersect the page frame.
  - Move later pages from the same `docId` upward by `deletedPage.height + gap`.
  - Move notes intersecting later pages by the same offset, once per element.
  - Renumber later page metadata and frame names.
- Insert page:
  - Insert a same-sized blank page after the selected page.
  - Move later pages and their intersecting notes downward by `page.height + gap`.
  - Renumber later page metadata and frame names.

## Tests

- Unit tests for PDF page stack utilities:
  - Detect PDF page frames/backgrounds from `customData`.
  - Delete page 2 and move page 3 plus its intersecting notes upward.
  - Delete notes intersecting the deleted page while preserving outside elements.
  - Move an element intersecting multiple later pages only once.
  - Insert a blank page and move later pages/notes downward.
- Interaction tests:
  - PDF page frame/background context menu shows PDF page actions.
  - Normal frames and normal whiteboard elements do not show PDF page actions.
  - Normal frame delete behavior stays unchanged.
- Smoke checks:
  - `yarn test:typecheck`
  - Imported PDF page custom data survives save/restore.

## Assumptions

- v1 uses raster images for PDF pages.
- Note ownership uses any bounding-box intersection with a page.
- Inserted pages are blank and same-sized.
- No PDF export/re-authoring is included in v1.
