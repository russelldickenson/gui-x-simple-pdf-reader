# Simple PDF Viewer

A small, quiet PDF reader for macOS and Windows, built with Tauri 2 and PDF.js.

- Reads the document in one continuous, scrollable pane.
- Table of contents in a left sidebar, hidden until toggled.
- Find bar with match highlighting, match count and next/previous navigation.
- Print, with pages laid out at their physical size.
- Opens files from the toolbar, <kbd>⌘O</kbd> / <kbd>Ctrl</kbd>+<kbd>O</kbd>, or by dropping them onto the window.
- Follows the system light/dark appearance.

Everything runs locally: no network calls, no telemetry.

## Requirements

- Node 20+ and Rust (stable) to build.
- macOS 13+ (Tauri needs WKWebView; `window.print()` needs macOS 14+) or Windows 10/11 with the WebView2 runtime, which ships with Windows 11 and current Windows 10.

## Run

```bash
npm install
npm run tauri dev
```

`npm run dev` alone serves the frontend in a browser, where the file picker falls back to a plain `<input type="file">`. Useful for UI work; the native menu and drag-and-drop are Tauri-only.

## Build

```bash
./build.sh
```

which is `npm run tauri build` plus a check that dependencies are installed and a listing of the resulting bundles. Artifacts land in `src-tauri/target/release/bundle/`: a `.dmg`/`.app` on macOS, an `.msi` and `.exe` installer on Windows. Cross-compiling for Windows from macOS is possible with `--target x86_64-pc-windows-msvc` if the MSVC toolchain and NSIS/WiX are set up, but building on Windows is simpler.

The version is defined once, in `src-tauri/Cargo.toml`. Tauri derives the bundle version and the in-app About dialog from it, so neither `package.json` nor `tauri.conf.json` carries a version field.

Unsigned builds trigger Gatekeeper ("damaged"/"unidentified developer") on macOS and SmartScreen on Windows. Signing and notarization are out of scope here; see Tauri's code-signing guide when you get there.

### Bundle size

A release build is about 5.4 MB on macOS (3.6 MB as a .dmg). Three things keep it there:

- `src-tauri/Cargo.toml` sets a release profile with `lto`, `opt-level = "s"`, `codegen-units = 1` and `strip = true`. Without it the binary is more than twice as large.
- `vite.config.ts` copies only the PDF.js assets that are actually used: the CMaps, the standard fonts, and the three wasm modules for JPEG2000, JBIG2 and ICC profiles. PDF.js 6 no longer runs JavaScript from PDFs, so its `quickjs-eval` module is left out, as are the "no wasm" fallbacks.
- The frontend is embedded in the binary and compressed by Tauri, so the .dmg is noticeably smaller than the .app.

Two further cuts are possible if you want them: dropping `standard_fonts` (1 MB, macOS and Windows supply the standard 14 themselves, but symbol fonts can then fall back to a generic face) and dropping the wasm modules entirely (0.5 MB, at the cost of JPEG2000 and JBIG2 images). The CMaps (1.6 MB) are what make legacy CJK encodings work and are worth keeping.

## Layout

```
index.html            markup for the toolbar, sidebar, viewer, find bar
src/main.ts           UI wiring: toolbar, find bar, outline, menu commands
src/reader.ts         PDF.js document, viewer, find controller
src/print.ts          renders pages into the hidden print container
src/platform.ts       Tauri glue (dialog, drag & drop, menu) + browser fallbacks
src/pdf.ts            PDF.js bootstrap, incl. load order for the viewer bundle
src-tauri/src/lib.rs  open-file command, application menu
```

### Notes on the implementation

- **Rendering** uses `pdfjs-dist`'s prebuilt web viewer (`PDFViewer`, `PDFFindController`) with a hand-written chrome. That is why `src/pdf.ts` sets `globalThis.pdfjsLib` before dynamically importing `web/pdf_viewer.mjs`: the viewer bundle reads its API off the global, and static import order is not something bundlers guarantee.
- **Search** dispatches PDF.js `find`/`again` events and listens for `updatefindmatchescount`/`updatefindcontrolstate` to fill the count. Highlights come from the text layer.
- **Print** cannot use an iframe: WebKit refuses to print child frames. Instead every page is rendered to a canvas at 144 dpi into a hidden container, which print CSS shows in place of the app; `window.print()` then opens the system dialog.
- **Opening files** goes through a small Rust command (`read_pdf`) that returns raw bytes rather than a JSON array of numbers, so large documents transfer cheaply. The dialog plugin supplies the path; the fs plugin and its scope configuration are not needed.
- CMaps, standard fonts and the PDF.js wasm modules are copied into the bundle at build time by `vite-plugin-static-copy`, so CJK text, non-embedded standard fonts and JPEG2000 images render offline.
- PDF.js 6 officially targets Safari 18; `src/compat.ts` shims the two APIs that would otherwise break on older macOS WebKit releases.
- WebKit pauses `requestAnimationFrame` while the window is occluded, and PDF.js schedules its canvas drawing through rAF. A document therefore finishes rendering when the window comes back to the front — the reader does not need to do anything about it.
- `vite.config.ts` pins the dev server to `127.0.0.1`. Vite listens on IPv6 only by default, and WKWebView resolves `localhost` to IPv4, which leaves the window blank in development.
- `styles.css` keeps `box-sizing: content-box` on `.pdfViewer .page`. PDF.js sizes the page with `width: <scale> * pageWidth`, which assumes a content box; with the usual `border-box` reset the 9px transparent page border would eat into that width, squeezing the canvas while the text layer keeps the unsqueezed scale, and the search highlights would drift off the text by ~1.5%.
- `pdfjs-dist/web/pdf_viewer.css` is imported before `styles.css`. PDF.js compiles `.highlight` under `.textLayer`, the same specificity as the overrides in `styles.css`, so the later stylesheet wins.

## Not implemented

Deliberately out of scope for a minimal reader: tabs/multiple documents, recent files, page thumbnails, text selection actions beyond copy, annotations, form filling, file associations ("Open with"), and remembering window size or zoom between launches.
