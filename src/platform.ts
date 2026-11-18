import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

/** True inside the Tauri webview; false when running in a plain browser (dev). */
export const isTauri = "__TAURI_INTERNALS__" in window;
export const isMac = /Mac/i.test(navigator.userAgent);

export type OpenedFile = {
  name: string;
  data: Uint8Array;
};

function fileName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

async function readFile(path: string): Promise<OpenedFile> {
  const buffer = await invoke<ArrayBuffer>("read_pdf", { path });
  return { name: fileName(path), data: new Uint8Array(buffer) };
}

function pickInBrowser(): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.hidden = true;
    document.body.append(input);
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
        return;
      }
      resolve({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) });
    });
    input.click();
  });
}

export async function pickPdf(): Promise<OpenedFile | null> {
  if (!isTauri) return pickInBrowser();

  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (typeof selected !== "string") return null;
  return readFile(selected);
}

export function onFileDrop(handlers: {
  onHover: (active: boolean) => void;
  onDrop: (file: OpenedFile) => void;
}): void {
  if (isTauri) {
    void getCurrentWebview().onDragDropEvent(async (event) => {
      const payload = event.payload;
      if (payload.type === "enter" || payload.type === "over") {
        handlers.onHover(true);
      } else if (payload.type === "leave") {
        handlers.onHover(false);
      } else if (payload.type === "drop") {
        handlers.onHover(false);
        const path = payload.paths.find((p) => p.toLowerCase().endsWith(".pdf"));
        if (path) handlers.onDrop(await readFile(path));
      }
    });
    return;
  }

  // Browser fallback, enough to preview the UI during development.
  let depth = 0;
  window.addEventListener("dragenter", (event) => {
    event.preventDefault();
    depth += 1;
    handlers.onHover(true);
  });
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) handlers.onHover(false);
  });
  window.addEventListener("drop", async (event) => {
    event.preventDefault();
    depth = 0;
    handlers.onHover(false);
    const file = event.dataTransfer?.files[0];
    if (file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) {
      handlers.onDrop({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) });
    }
  });
}

export async function onMenu(handler: (command: string) => void): Promise<void> {
  if (!isTauri) return;
  await listen<string>("menu", (event) => handler(event.payload));
}

export async function setWindowTitle(title: string): Promise<void> {
  if (isTauri) await getCurrentWindow().setTitle(title);
}

export async function openExternal(url: string): Promise<void> {
  if (isTauri) {
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
