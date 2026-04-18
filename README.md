# Local Docs Viewer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A secure, fully client-side web application for viewing **local** documentation with a custom “Kindle Oasis” matte dark theme. It reads files directly from your device using the browser’s **File System Access API** — **nothing is uploaded**.

## Features

- **Client-side only**: No backend, no uploads, no server file processing.
- **Multi-format**: Supports `.md` / `.markdown`, `.txt`, and `.pdf`.
- **Persistent workspaces**: Stores directory handles in IndexedDB; after reload you can restore access with a single prompt.
- **PDFs via native viewer**: Uses `URL.createObjectURL()` + an `<iframe>` to rely on the browser’s built-in PDF viewer (no PDF.js).
- **Memory-safe PDF switching**: Revokes object URLs when you navigate away from a PDF to prevent leaks.
- **Security hardening**:
  - Strict URL handling for Markdown links.
  - Sanitizes HTML in syntax-highlighted code blocks (Shiki).
  - Mermaid runs with `securityLevel: 'antiscript'`.
  - Production CSP headers in `viewer/vercel.json`.
- **SEO landing page**: Optimized meta tags + JSON-LD for the root landing page (`viewer/index.html`).

## Live

- [https://md.fauzanfebriansyah.my.id](https://md.fauzanfebriansyah.my.id)

## Usage

1. Open the site.
2. Click **Open Folder** and select a local directory.
3. Grant read permission.
4. Use the sidebar to open `.md`, `.txt`, or `.pdf` documents.

## Local development

The File System Access API requires a secure context (HTTPS) or `localhost`.

```bash
npm install
npm run dev
```

## Deployment (Vercel)

- **Root Directory**: set the Vercel project root to `viewer/`.
- **CSP**: `viewer/vercel.json` sets production CSP headers. Note: the JSON-LD `<script type="application/ld+json">` in `index.html` is allowlisted via a SHA-256 hash in CSP.

## Notes / limitations

- **Browser support**: File System Access API is best supported in Chromium-based desktop browsers.
- **Indexing**: The crawler is recursive and skips heavy/system folders by name (see `DEFAULT_IGNORED_DIR_NAMES` in `src/lib/fsCrawl.ts`).
- **Privacy**: Workspace handles are stored in IndexedDB; permission can still revert to “prompt” after reload and must be re-granted by the user.

## Author

**Fauzan Febriansyah**  
Website: `https://fauzanfebriansyah.my.id`

## License

MIT. See `LICENSE`.
