import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

// PDF.js needs its CMaps, standard fonts and wasm modules at runtime.
// They are copied into the bundle so the reader works offline.
// `stripBase: 2` drops the `node_modules/pdfjs-dist` part of the path, so the
// files land in dist/pdfjs/<dir>/ where src/reader.ts expects them.
//
// The wasm folder also ships quickjs-eval (PDF JavaScript, unused by PDF.js 6)
// and the "no wasm" fallbacks (only needed by browsers without wasm support);
// neither is worth the space.
const pdfjsAssets = [
  { src: "node_modules/pdfjs-dist/cmaps/*" },
  { src: "node_modules/pdfjs-dist/standard_fonts/*" },
  {
    src: [
      "node_modules/pdfjs-dist/wasm/*",
      "!node_modules/pdfjs-dist/wasm/quickjs-eval.*",
      "!node_modules/pdfjs-dist/wasm/*_nowasm_fallback.js",
    ],
  },
];

export default defineConfig({
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "safari16",
  },
  plugins: [
    viteStaticCopy({
      targets: pdfjsAssets.map((asset) => ({
        src: asset.src,
        dest: "pdfjs",
        rename: { stripBase: 2 },
      })),
    }),
  ],
});
