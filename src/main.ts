import "./compat";

// PDF.js' stylesheet has to come first: it is compiled with the same
// specificity as the overrides in styles.css, so the order decides.
import "pdfjs-dist/web/pdf_viewer.css";
import "./styles.css";

import type { PDFDocumentProxy } from "pdfjs-dist";

import { viewer } from "./pdf";
import * as platform from "./platform";
import { clearPrintView, printDocument } from "./print";
import { Reader, type OutlineNode } from "./reader";

const { FindState } = viewer;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

const ui = {
  sidebar: el("sidebar"),
  outline: el("outline"),
  viewer: el<HTMLDivElement>("viewer-container"),
  empty: el("empty"),
  openButton: el<HTMLButtonElement>("btn-open"),
  emptyOpenButton: el<HTMLButtonElement>("btn-empty-open"),
  tocButton: el<HTMLButtonElement>("btn-toc"),
  findButton: el<HTMLButtonElement>("btn-find"),
  printButton: el<HTMLButtonElement>("btn-print"),
  zoomIn: el<HTMLButtonElement>("btn-zoom-in"),
  zoomOut: el<HTMLButtonElement>("btn-zoom-out"),
  zoomReset: el<HTMLButtonElement>("btn-zoom-reset"),
  zoomLabel: el("zoom-label"),
  pageInput: el<HTMLInputElement>("page-input"),
  pageTotal: el("page-total"),
  findbar: el<HTMLFormElement>("findbar"),
  findInput: el<HTMLInputElement>("find-input"),
  findCount: el("find-count"),
  findPrev: el<HTMLButtonElement>("btn-find-prev"),
  findNext: el<HTMLButtonElement>("btn-find-next"),
  findClose: el<HTMLButtonElement>("btn-find-close"),
  dropOverlay: el("drop-overlay"),
  toast: el("toast"),
};

const reader = new Reader(ui.viewer);
let doc: PDFDocumentProxy | null = null;
let findVisible = false;
let tocVisible = false;

if (platform.isTauri && platform.isMac) document.documentElement.classList.add("mac");

// Keep http(s) links out of the app webview.
window.open = ((url?: string | URL) => {
  if (typeof url === "string") void platform.openExternal(url);
  return null;
}) as typeof window.open;

/* ---------------------------------------------------------------- toasts */

let toastTimer = 0;

function showToast(text: string, persist = false): void {
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  window.clearTimeout(toastTimer);
  if (!persist) {
    toastTimer = window.setTimeout(() => {
      ui.toast.hidden = true;
    }, 3200);
  }
}

function hideToast(): void {
  window.clearTimeout(toastTimer);
  ui.toast.hidden = true;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

/* ---------------------------------------------------------------- reader */

reader.onPageChange = (page, total) => {
  ui.pageTotal.textContent = String(total);
  if (document.activeElement !== ui.pageInput) ui.pageInput.value = String(page);
};

reader.onScaleChange = (scale) => {
  ui.zoomLabel.textContent = `${Math.round(scale * 100)}%`;
};

reader.onFindResult = (current, total, state) => {
  if (!ui.findInput.value.trim()) {
    setFindCount("");
    return;
  }
  if (state === FindState.NOT_FOUND) {
    setFindCount("No results", true);
  } else if (total > 0) {
    setFindCount(`${current} of ${total}`);
  } else {
    setFindCount("…");
  }
};

function setFindCount(text: string, missing = false): void {
  ui.findCount.textContent = text;
  ui.findCount.dataset.state = missing ? "none" : "";
}

/* ------------------------------------------------------------ file open */

async function openFile(file: platform.OpenedFile): Promise<void> {
  showToast(`Opening ${file.name}…`, true);
  try {
    const result = await reader.open(file.data);
    doc = result.doc;

    clearPrintView();
    renderOutline(result.outline);

    ui.empty.hidden = true;
    ui.printButton.disabled = false;
    ui.tocButton.disabled = false;
    ui.findButton.disabled = false;
    ui.zoomIn.disabled = false;
    ui.zoomOut.disabled = false;
    ui.zoomReset.disabled = false;
    ui.pageInput.disabled = false;
    ui.pageInput.value = "1";
    ui.pageTotal.textContent = String(result.pages);

    await platform.setWindowTitle(file.name);

    if (findVisible && ui.findInput.value.trim()) {
      reader.find(ui.findInput.value);
    }
    hideToast();
  } catch (error) {
    showToast(`Could not open ${file.name}: ${describeError(error)}`);
  }
}

async function openFromDialog(): Promise<void> {
  try {
    const file = await platform.pickPdf();
    if (file) await openFile(file);
  } catch (error) {
    showToast(`Could not open the file: ${describeError(error)}`);
  }
}

/* ------------------------------------------------------------------ toc */

function appendOutline(nodes: OutlineNode[], parent: HTMLElement, depth: number): void {
  for (const node of nodes) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "outline-link";
    button.textContent = node.title;
    button.title = node.title;
    button.style.paddingLeft = `${8 + depth * 12}px`;
    button.addEventListener("click", () => {
      if (node.url) {
        void platform.openExternal(node.url);
      } else if (node.dest) {
        void reader.goToDestination(node.dest);
      }
    });
    parent.append(button);
    appendOutline(node.children, parent, depth + 1);
  }
}

function renderOutline(nodes: OutlineNode[]): void {
  ui.outline.replaceChildren();

  if (nodes.length === 0) {
    const empty = document.createElement("p");
    empty.className = "outline-empty";
    empty.textContent = "This document has no contents.";
    ui.outline.append(empty);
    return;
  }

  appendOutline(nodes, ui.outline, 0);
}

function toggleSidebar(show?: boolean): void {
  const next = show ?? !tocVisible;
  tocVisible = next;
  ui.sidebar.hidden = !next;
  ui.tocButton.setAttribute("aria-pressed", String(next));
  if (next) {
    requestAnimationFrame(() => reader.refreshScale());
  } else {
    reader.refreshScale();
  }
}

/* ----------------------------------------------------------------- find */

function showFind(visible: boolean): void {
  findVisible = visible;
  ui.findbar.hidden = !visible;
  ui.findButton.setAttribute("aria-pressed", String(visible));
  if (visible) {
    ui.findInput.focus();
    ui.findInput.select();
    if (ui.findInput.value.trim()) reader.find(ui.findInput.value);
  } else {
    reader.clearFind();
    setFindCount("");
  }
}

/* ---------------------------------------------------------------- print */

async function doPrint(): Promise<void> {
  if (!doc) return;
  ui.printButton.disabled = true;
  showToast("Preparing to print…", true);
  try {
    await printDocument(doc, (page, total) => {
      showToast(`Preparing page ${page} of ${total}…`, true);
    });
  } catch (error) {
    showToast(`Printing failed: ${describeError(error)}`);
  } finally {
    ui.printButton.disabled = false;
    hideToast();
  }
}

/* --------------------------------------------------------------- wiring */

ui.openButton.addEventListener("click", () => void openFromDialog());
ui.emptyOpenButton.addEventListener("click", () => void openFromDialog());
ui.tocButton.addEventListener("click", () => toggleSidebar());
ui.findButton.addEventListener("click", () => showFind(!findVisible));
ui.printButton.addEventListener("click", () => void doPrint());

ui.zoomIn.addEventListener("click", () => reader.zoomIn());
ui.zoomOut.addEventListener("click", () => reader.zoomOut());
ui.zoomReset.addEventListener("click", () => reader.actualSize());

ui.pageInput.addEventListener("focus", () => ui.pageInput.select());
ui.pageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitPageInput();
    ui.pageInput.blur();
  } else if (event.key === "Escape") {
    ui.pageInput.value = String(reader.currentPage);
    ui.pageInput.blur();
  }
});
ui.pageInput.addEventListener("change", commitPageInput);

function commitPageInput(): void {
  const page = Number.parseInt(ui.pageInput.value, 10);
  if (Number.isFinite(page)) reader.goToPage(page);
  ui.pageInput.value = String(reader.currentPage);
}

ui.findInput.addEventListener("input", () => {
  const query = ui.findInput.value;
  if (query.trim()) {
    reader.find(query);
  } else {
    reader.clearFind();
    setFindCount("");
  }
});
ui.findInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const query = ui.findInput.value;
    if (query.trim()) reader.find(query, { again: true, previous: event.shiftKey });
  } else if (event.key === "Escape") {
    event.preventDefault();
    showFind(false);
  }
});
ui.findNext.addEventListener("click", () => reader.find(ui.findInput.value, { again: true }));
ui.findPrev.addEventListener("click", () => reader.find(ui.findInput.value, { again: true, previous: true }));
ui.findClose.addEventListener("click", () => showFind(false));

platform.onFileDrop({
  onHover: (active) => {
    ui.dropOverlay.hidden = !active;
  },
  onDrop: (file) => void openFile(file),
});

void platform.onMenu((command) => {
  switch (command) {
    case "open":
      void openFromDialog();
      break;
    case "print":
      void doPrint();
      break;
    case "find":
      showFind(true);
      break;
    case "toggle-toc":
      toggleSidebar();
      break;
    case "zoom-in":
      reader.zoomIn();
      break;
    case "zoom-out":
      reader.zoomOut();
      break;
    case "actual-size":
      reader.actualSize();
      break;
  }
});

window.addEventListener("keydown", (event) => {
  const mod = platform.isMac ? event.metaKey : event.ctrlKey;

  if (mod && event.key.toLowerCase() === "g") {
    event.preventDefault();
    if (findVisible) reader.find(ui.findInput.value, { again: true, previous: event.shiftKey });
    return;
  }

  // The native application menu handles these inside Tauri; this keeps the
  // browser preview usable too.
  if (mod && !platform.isTauri && ["f", "o", "p"].includes(event.key.toLowerCase())) {
    event.preventDefault();
    if (event.key.toLowerCase() === "f") showFind(true);
    return;
  }

  if (event.key === "Escape") {
    if (findVisible) showFind(false);
    return;
  }

  if (event.target instanceof HTMLInputElement || !doc) return;

  switch (event.key) {
    case "PageDown":
      event.preventDefault();
      reader.nextPage();
      break;
    case "PageUp":
      event.preventDefault();
      reader.previousPage();
      break;
    case "Home":
      event.preventDefault();
      reader.goToPage(1);
      break;
    case "End":
      event.preventDefault();
      reader.goToPage(reader.pagesCount);
      break;
  }
});
