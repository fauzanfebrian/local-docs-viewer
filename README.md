# Local Docs Viewer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A secure, fully client-side web application for viewing local documentation with a custom “Kindle Oasis” matte dark theme. It reads files directly from your device using the browser’s File System Access API—nothing is ever uploaded to a server.

## Quick Start

1. Visit [md.fauzanfebrian.my.id](https://md.fauzanfebrian.my.id)
2. Click **Open Folder** and select a local directory (e.g., your Obsidian vault or project docs).
3. Grant read permission when prompted by the browser.
4. Navigate and read your `.md`, `.txt`, and `.pdf` files.

## Features

- **Zero-Server Processing**: All parsing, rendering, and logic happen entirely in the browser.
- **Kindle Oasis Theme**: A carefully crafted matte dark theme optimized for long reading sessions.
- **Persistent Workspaces**: Uses IndexedDB to remember your folder handles across sessions.
- **Markdown Support**: GitHub Flavored Markdown, math notation, and Mermaid diagrams.
- **Native PDF Viewer**: Memory-efficient PDF viewing using browser primitives.
- **Security**: Strict CSP, HTML sanitization via DOMPurify, and zero telemetry.

## Tech Stack

- **Framework**: React 19 + Vite
- **Language**: TypeScript
- **Routing**: React Router 7
- **Rendering**: `react-markdown`, `shiki` (syntax highlighting), and `mermaid`
- **Storage**: `idb-keyval` (IndexedDB)
- **Styling**: Vanilla CSS

## Contributing

Contributions are welcome. You can help by fixing bugs, adding features, or improving the documentation.

### Prerequisites
- Node.js (v18 or later)
- npm

### Development Setup
```bash
# Clone the repository
git clone https://github.com/fauzanfebrian/local-docs-viewer.git

# Install dependencies
npm install

# Start the development server
npm run dev
```

### Project Structure
- `src/components/`: UI components and layout logic.
- `src/context/`: Global state management via `WorkspaceContext`.
- `src/lib/`: Core logic for file crawling, path resolution, and TOC parsing.
- `src/styles/`: Global styles and theme definitions.

### Workflow
1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/name`).
3. Commit your changes.
4. Push to the branch and open a Pull Request.

## Security and Privacy

This application is designed with a privacy-first architecture:
- **Local Only**: No backend component exists to handle or store your files.
- **CSP**: Strict Content Security Policy headers prevent unauthorized data exfiltration.
- **Sanitization**: Code blocks and diagrams are sanitized to prevent XSS.

## Limitations

- **Browser Support**: Requires the File System Access API, supported in Chromium-based desktop browsers (Chrome, Edge, Brave).
- **Permissions**: File system permissions are session-based. You will need to click "Restore Access" when returning to the site to re-authorize folder access.

## Author

**Muhammad Fauzan Febriansyah**  
Website: [https://fauzanfebrian.my.id](https://fauzanfebrian.my.id)

## License

MIT. See [LICENSE](LICENSE).
