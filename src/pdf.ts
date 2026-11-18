import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// `web/pdf_viewer.mjs` is a prebuilt bundle that reads the whole API off
// `globalThis.pdfjsLib` instead of importing it, so the namespace has to exist
// before that module is evaluated. A dynamic import makes the order explicit;
// static import order is not something bundlers guarantee.
(globalThis as unknown as { pdfjsLib?: typeof pdfjs }).pdfjsLib = pdfjs;
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjs };
export const viewer = await import("pdfjs-dist/web/pdf_viewer.mjs");
