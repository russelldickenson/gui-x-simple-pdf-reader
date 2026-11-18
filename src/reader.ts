import type { PDFDocumentProxy } from "pdfjs-dist";

import { pdfjs, viewer } from "./pdf";

const { EventBus, PDFFindController, PDFLinkService, PDFViewer } = viewer;

// Copied into the bundle by the vite config (see vite.config.ts).
const ASSETS = `${import.meta.env.BASE_URL}pdfjs/`;

export type OutlineNode = {
  title: string;
  dest: string | unknown[] | null;
  url: string | null;
  children: OutlineNode[];
};

export type OpenResult = {
  doc: PDFDocumentProxy;
  pages: number;
  outline: OutlineNode[];
};

type RawOutlineItem = {
  title: string;
  dest?: string | unknown[] | null;
  url?: string | null;
  items?: RawOutlineItem[];
};

function mapOutline(items: RawOutlineItem[] | null): OutlineNode[] {
  if (!items) return [];
  return items.map((item) => ({
    title: item.title,
    dest: item.dest ?? null,
    url: item.url ?? null,
    children: mapOutline(item.items ?? null),
  }));
}

/** Owns the PDF.js document, viewer and find controller for one window. */
export class Reader {
  onPageChange: (page: number, total: number) => void = () => {};
  onScaleChange: (scale: number) => void = () => {};
  onFindResult: (current: number, total: number, state: number) => void = () => {};

  private readonly eventBus = new EventBus();
  private readonly linkService: InstanceType<typeof PDFLinkService>;
  private readonly findController: InstanceType<typeof PDFFindController>;
  private readonly viewer: InstanceType<typeof PDFViewer>;
  private doc: PDFDocumentProxy | null = null;
  private loadingTask: ReturnType<typeof pdfjs.getDocument> | null = null;

  constructor(container: HTMLDivElement) {
    const viewerElement = document.createElement("div");
    viewerElement.className = "pdfViewer";
    container.append(viewerElement);

    this.linkService = new PDFLinkService({ eventBus: this.eventBus });
    this.findController = new PDFFindController({
      eventBus: this.eventBus,
      linkService: this.linkService,
      updateMatchesCountOnProgress: true,
    });
    this.viewer = new PDFViewer({
      container,
      viewer: viewerElement,
      eventBus: this.eventBus,
      linkService: this.linkService,
      findController: this.findController,
      annotationMode: pdfjs.AnnotationMode.ENABLE,
    });
    this.linkService.setViewer(this.viewer);

    this.eventBus.on("pagesinit", () => {
      this.viewer.currentScaleValue = "page-width";
    });
    this.eventBus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
      this.onPageChange(pageNumber, this.viewer.pagesCount);
    });
    this.eventBus.on("scalechanging", ({ scale }: { scale: number }) => {
      this.onScaleChange(scale);
    });
    this.eventBus.on("updatefindmatchescount", ({ matchesCount }: { matchesCount: { current: number; total: number } }) => {
      this.onFindResult(matchesCount.current, matchesCount.total, -1);
    });
    this.eventBus.on(
      "updatefindcontrolstate",
      ({ state, matchesCount }: { state: number; matchesCount: { current: number; total: number } }) => {
        this.onFindResult(matchesCount.current, matchesCount.total, state);
      },
    );
  }

  async open(data: Uint8Array): Promise<OpenResult> {
    const task = pdfjs.getDocument({
      data,
      cMapUrl: `${ASSETS}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${ASSETS}standard_fonts/`,
      wasmUrl: `${ASSETS}wasm/`,
    });

    // Load into a new task first, so a malformed file leaves the current
    // document untouched.
    let doc: PDFDocumentProxy;
    try {
      doc = await task.promise;
    } catch (error) {
      await task.destroy().catch(() => {});
      throw error;
    }
    const previousTask = this.loadingTask;

    this.loadingTask = task;
    this.doc = doc;

    this.findController.setDocument(doc);
    this.linkService.setDocument(doc, null);
    this.viewer.setDocument(doc);

    if (previousTask) await previousTask.destroy().catch(() => {});

    const outline = mapOutline((await doc.getOutline().catch(() => null)) as RawOutlineItem[] | null);
    return { doc, pages: doc.numPages, outline };
  }

  async close(): Promise<void> {
    const task = this.loadingTask;
    this.loadingTask = null;
    this.doc = null;

    this.viewer.setDocument(null as unknown as PDFDocumentProxy);
    this.linkService.setDocument(null);
    this.findController.setDocument(null as unknown as PDFDocumentProxy);

    if (task) {
      await task.destroy().catch(() => {});
    }
  }

  get pagesCount(): number {
    return this.viewer.pagesCount;
  }

  get currentPage(): number {
    return this.viewer.currentPageNumber;
  }

  goToPage(page: number): void {
    if (!this.doc) return;
    const target = Math.min(Math.max(Math.round(page), 1), this.doc.numPages);
    this.viewer.currentPageNumber = target;
  }

  nextPage(): void {
    this.viewer.nextPage();
  }

  previousPage(): void {
    this.viewer.previousPage();
  }

  zoomIn(): void {
    if (this.doc) this.viewer.increaseScale();
  }

  zoomOut(): void {
    if (this.doc) this.viewer.decreaseScale();
  }

  actualSize(): void {
    if (this.doc) this.viewer.currentScale = 1;
  }

  /** Re-applies the current zoom preset, e.g. after the sidebar changed the viewport width. */
  refreshScale(): void {
    if (this.doc) this.viewer.currentScaleValue = this.viewer.currentScaleValue;
  }

  find(query: string, options: { again?: boolean; previous?: boolean } = {}): void {
    if (!this.doc) return;
    this.eventBus.dispatch("find", {
      source: this,
      type: options.again ? "again" : "",
      query,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      matchDiacritics: false,
      findPrevious: Boolean(options.previous),
    });
  }

  clearFind(): void {
    this.eventBus.dispatch("findbarclose", { source: this });
  }

  async goToDestination(dest: string | unknown[]): Promise<void> {
    await this.linkService.goToDestination(dest);
  }
}
