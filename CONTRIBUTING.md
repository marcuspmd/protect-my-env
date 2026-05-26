# Contributing to Protect My Env

Thank you for your interest in contributing! All kinds of contributions are welcome — bug reports, feature requests, documentation improvements, and code changes.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Running Tests](#running-tests)
- [Submitting Changes](#submitting-changes)
- [Coding Guidelines](#coding-guidelines)

## Code of Conduct

Be respectful and constructive. Harassment or abusive behavior of any kind will not be tolerated.

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/protect-my-env.git
   cd protect-my-env
   ```
3. **Install** dependencies:
   ```bash
   npm install
   ```

## Development Setup

### Prerequisites

- Node.js ≥ 18
- VS Code ≥ 1.75

### Build

```bash
npm run compile   # TypeScript compile
npm run watch     # Watch mode (rebuild on save)
```

### Launch Extension

Press **F5** in VS Code to open an Extension Development Host with the extension loaded.

## Running Tests

```bash
npm test                  # Run all unit tests
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
```

Tests live in `tests/unit/`. Each source file in `src/` has a corresponding test file. Please add or update tests whenever you change behaviour.

## Submitting Changes

1. Create a **feature branch** from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes and **commit** with a clear message following [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add option to mask values by length
   fix: reveal-all state not reset on file close
   docs: update configuration reference
   ```
3. **Push** to your fork and open a **Pull Request** against `main`.
4. Fill in the PR template and describe the motivation and approach.

### Pull Request Checklist

- [ ] Tests added or updated for changed behaviour
- [ ] `npm test` passes locally
- [ ] No new TypeScript errors (`npm run compile`)
- [ ] Description explains *why* the change is needed

## Coding Guidelines

- TypeScript strict mode is enforced — keep the code type-safe.
- Avoid external runtime dependencies unless strictly necessary.
- Keep extension activation fast; do not run heavy work on startup.
- Follow the existing file and naming conventions in `src/`.

## Reporting Bugs

Open an issue and include:
- VS Code version
- Extension version
- Steps to reproduce
- Expected vs actual behaviour
- Any relevant error output from the Developer Console (`Help → Toggle Developer Tools`)

## Requesting Features

Open an issue with the `enhancement` label. Describe the use-case and the proposed behaviour.
