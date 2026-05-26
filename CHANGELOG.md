# Changelog

All notable changes to **Protect My Env** are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Removed the legacy CodeLens and text-editor decoration masking flow so **Open as text** opens a plain VS Code editor without Protect My Env overlays.
- Moved optional comment masking into the secure custom editor.

## [0.1.0] - 2024-01-01

### Added

- Secure custom editor that opens `.env` and `.env.*` files masked from the first paint, preventing plaintext flash.
- Mask all values (`all` mode) or only keys matching glob patterns (`pattern` mode).
- Per-key **Reveal** / **Hide** CodeLens actions.
- Global **Reveal All Values** and **Hide All Values** toolbar commands.
- Optional comment masking (`protectComments` setting).
- Configurable mask character and fixed or value-length masking.
- Inline search and sortable Key column in the secure editor view.
- **Open as text** button to fall back to the standard VS Code text editor.
