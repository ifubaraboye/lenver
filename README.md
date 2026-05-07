# lenver

> An interactive CLI for scanning, organizing, and reviewing your `.env*` variables — without leaking secrets.

## What is lenver?

**lenver** scans your project's `.env*` files, discovers all environment variables, and stores them in a local JSON database so you can review them later — without ever exposing sensitive values.

It features a rich terminal UI built with [Ink](https://github.com/vadimdemedes/ink), complete with a mood-based doctor face mascot, live progress bars, and keyboard navigation.

## Features

- **Scan `.env*` files** — Automatically discovers `.env`, `.env.local`, `.env.production`, etc.
- **Sensitive-tier detection** — Production/staging env files are flagged; values are hidden by default
- **Values hidden by default** — All values render as `••••••••` unless you explicitly use `--show-values`
- **Interactive project selector** — Run `lenver` with no arguments to browse all projects
- **Keyboard navigation** — Arrow keys to move, Enter to select, `D` to delete, `Q` to exit
- **Doctor face mascot** — A happy/neutral/critical face that reacts to your project's health
- **No code scanning noise** — Only scans `.env*` files, not your entire codebase
- **Local JSON store** — Everything lives in `~/.config/lenver/projects/`

## Installation

```bash
# Clone and build
git clone https://github.com/oribi/lenver.git
cd lenver
bun install
bun run build

# Link globally
npm link

# Or run directly
bun run src/cli.tsx
```

## Usage

### Scan a project

```bash
cd ~/my-project
lenver scan
```

You'll see the doctor face appear as `.env` files are scanned live. Press Enter when done, then name your project.

### Browse all projects

```bash
lenver
```

Opens an interactive project selector with arrow-key navigation.

### Pull variables into a new directory

```bash
lenver init
```

Select a saved project and write its variables back to `.env*` files in the current directory.

### List current project

```bash
lenver list              # values hidden
lenver list --show-values  # show actual values
```

### Delete a project

```bash
lenver delete my-project
```

## Commands

| Command | Description |
|---|---|
| `lenver` | Open interactive project selector |
| `lenver scan` | Scan `.env*` files in current directory |
| `lenver init` | Pull variables from a saved project into this directory |
| `lenver list` | Show variables for current project |
| `lenver delete <name>` | Delete a project by name or ID |

## Flags

| Flag | Description |
|---|---|
| `--include-sensitive` | Store actual values from `.env.production` / `.env.staging` during scan |
| `--show-values` | Reveal actual values in `list` view |

## How it works

### Project identification

Projects are identified by:
1. **Git remote URL** — SHA-256 hash of `git remote get-url origin`
2. **Fallback** — SHA-256 hash of `process.cwd()` if no git remote exists

This gives each project a stable, deterministic ID.

### Storage

All data lives locally in `~/.config/lenver/projects/<id>.json`:

```json
{
  "id": "0bdc62c1ba8301ac",
  "name": "dinexpress",
  "cwd": "/home/oribi/Desktop/dev/dinexpress",
  "lastScanned": "2026-05-06T10:59:31.825Z",
  "vars": {
    "DATABASE_URL": {
      "value": "postgres://localhost:5432/db",
      "sources": [".env", ".env.local"],
      "referencedIn": [],
      "isSensitive": false
    },
    "SECRET_TOKEN": {
      "value": null,
      "sources": [".env.production"],
      "referencedIn": [],
      "isSensitive": true
    }
  },
  "unresolvedRefs": []
}
```

Values from sensitive-tier files (`.env.production`, `.env.staging`) are stored as `null` by default. Use `--include-sensitive` to override.

## Tech Stack

- **Runtime**: Bun / Node.js
- **UI**: Ink 7 + React 19
- **Language**: TypeScript
- **Parsing**: meow (args), fast-glob (file discovery)
- **Store**: Plain JSON files (no database)

## License

MIT
