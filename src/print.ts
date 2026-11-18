import type { PDFDocumentProxy } from "pdfjs-dist";

// Rendered at 144 dpi for a crisp printout.
const PRINT_DPI = 144;
const MAX_DIMENSION = 4096;

export function clearPrintView(): void {
  document.getElementById("print-container")?.replaceChildren();
}

/**
 * Renders every page into the hidden print container and hands the window to
 * the system print dialog. `window.print()` prints the live DOM, so an iframe
 * (which WebKit refuses to print) is no use here.
 */
export async function printDocument(
  doc: PDFDocumentProxy,
  onProgress?: (page: number, total: number) => void,
): Promise<void> {
  const container = document.getElementById("print-container");
  if (!container) throw new Error("Print container is missing");

  clearPrintView();

  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const unscaled = page.getViewport({ scale: 1 });
    const longestSide = Math.max(unscaled.width, unscaled.height);
    const scale = Math.min(PRINT_DPI / 72, MAX_DIMENSION / longestSide);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas 2D context is unavailable");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: context, viewport, intent: "print" }).promise;

    // The canvas keeps its 144 dpi pixel size. The print stylesheet scales it
    // down to the paper while preserving the aspect ratio, so the page lands
    // at the right physical size without rasterising it twice.
    const sheet = document.createElement("div");
    sheet.className = "print-page";
    sheet.append(canvas);
    container.append(sheet);

    onProgress?.(n, doc.numPages);
  }

  // Let the browser lay the sheets out before opening the dialog.
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  window.addEventListener("afterprint", () => container.replaceChildren(), { once: true });
  window.print();
}
