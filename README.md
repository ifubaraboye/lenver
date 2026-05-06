# lenver

> An interactive CLI for scanning, organizing, and reviewing your `.env` variables — without leaking secrets.

<p align="center">
  <img src="https://raw.githubusercontent.com/oribi/lenver/main/assets/demo.gif" alt="lenver demo" width="600">
</p>

## What is lenver?

**lenver** scans your project's `.env*` files, discovers all environment variables, and stores them in a local JSON database so you can review them later — without ever exposing sensitive values.

It features a rich terminal UI built with [Ink](https://github.com/vadimdemedes/ink), complete with a mood-based doctor face mascot, live progress bars, and keyboard navigation.

## Features

- **Scan `.env*` files** — Automatically discovers `.env`, `.env.local`, `.env.production`, etc.
- **Sensitive-tier detection** — Production/staging env files are flagged; values are hidden by default
- **Values hidden by default** — All values render as `••••••••` unless you explicitly use `--show-values`
- **Interactive project selector** — Run `lenver` with no arguments to browse all projects
- **Keyboard navigation** — Arrow keys to move, Enter to select, `D` to delete
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

```
  ┌────────────────────────────────────────┐
   ┌───────────┐  my-project
   │  ◠   ◠  │    5 / 5 vars
   │    ▽    │    ██████████████████████████████
   └───────────┘  ✓ all clean
  └────────────────────────────────────────┘

  ✓ DATABASE_URL = ••••••••     .env, .env.local
  ✓ API_KEY = ••••••••          .env
  ~ SECRET_TOKEN = [sensitive]  .env.production

Press Enter to save...
```

### Browse all projects

```bash
lenver
```

Opens an interactive project selector:

```
  ┌────────────────────────────────────────┐
   ┌───────────┐  lenver
   │  ×   ×  │    3 projects · 12 vars
   │    ▽    │    1 unresolved
   └───────────┘
  └────────────────────────────────────────┘

  › ✗ my-project  (5 vars, 1 unresolved)  5/6/2026
    ✓ api          (4 vars) 5/5/2026
    ✓ dashboard    (3 vars) 5/4/2026

  ↑↓ navigate · Enter to select · D to delete
```

### List current project

```bash
lenver list              # values hidden
lenver list --show-values  # show actual values
```

### Delete a project

```bash
lenver delete my-project
# or
lenver
# then press D on the selected project
```

## Commands

| Command | Description |
|---|---|
| `lenver` | Open interactive project selector |
| `lenver scan` | Scan `.env*` files in current directory |
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
## Architecture:

### Directory Structure:

```
lenver/
├── src/
│   ├── cli.tsx              # Entry point (meow + React renderer)
│   ├── commands/
│   │   ├── scan.tsx         # Scan command with live UI + doctor face
│   │   ├── list.tsx         # List current project's variables
│   │   ├── delete.tsx       # Delete project by name or ID
│   │   └── default.tsx      # Interactive project selector (no args)
│   ├── scanner/
│   │   ├── stream.ts        # Async generator — yields scan events in real-time
│   │   ├── dotenv.ts        # Parse .env* files, detect sensitive/example
│   │   ├── code.ts          # Regex scan for process.env / import.meta.env / etc.
│   │   └── index.ts         # Legacy orchestrator (batch mode)
│   ├── store/
│   │   ├── index.ts         # JSON read / write / delete projects
│   │   └── project.ts       # Project ID: git remote URL hash → fallback to cwd hash
│   └── ui/
│       ├── DoctorFace.tsx   # Mood mascot: ◠◠ / •• / ×× based on health
│       ├── ProjectView.tsx  # Variable list with hidden values + status icons
│       ├── FramedBox.tsx    # Bordered container (┌─┐│└┘)
│       ├── ScoreBar.tsx     # 50-char block progress bar █░
│       ├── AnimatedList.tsx  # Staggered reveal (40ms per item)
│       ├── ConfirmPrompt.tsx # One-line Y/n confirmation
│       └── ScoreHeader.tsx  # Legacy header (replaced by DoctorFace)
├── dist/
│   └── cli.js               # Compiled output (bun build)
├── package.json
├── tsconfig.json
└── README.md
```

### Data Flow:

```
User runs: lenver scan
    │
    ▼
cli.tsx (meow parses args)
    │
    ▼
ScanCommand (Ink component)
    │
    ├── ConfirmPrompt ("Scan env files in /path? [Y/n]")
    │
    ▼ (user presses Y)
    │
    ▼
scanStream() async generator
    │
    ├── yield { type: "file", file }      ← progress bar updates
    ├── yield { type: "var", var }        ← animated list reveals
    └── yield { type: "done", totalFiles }
    │
    ▼
mergeScanIntoSnapshot() → writeProject()
    │
    ▼
ProjectView (doctor face + variable list + naming prompt)
```

### Storage Schema:

Projects stored at `~/.config/lenver/projects/<sha256-id>.json`:

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
      "referencedIn": ["src/config.ts"],
      "isSensitive": false
    },
    "SECRET_TOKEN": {
      "value": null,
      "sources": [".env.production"],
      "referencedIn": [],
      "isSensitive": true
    }
  },
  "unresolvedRefs": ["CLERK_JWT_ISSUER_DOMAIN"]
}
```

Values from sensitive-tier files (`.env.production`, `.env.staging`) are stored as `null` by default. Use `--include-sensitive` to override.

### Key Design Decisions:

| Decision | Rationale |
|---|---|
| **Async generator** (`scanStream`) | Enables real-time UI updates as files are parsed |
| **Values hidden by default** | `••••••` shown instead of secrets; opt-in via `--show-values` |
| **Sensitive-tier detection** | `.env.production`, `.env.staging` values → `null` unless `--include-sensitive` |
| **Git remote → SHA-256** | Stable project ID that survives directory moves |
| **No database** | Plain JSON files in `~/.config/lenver/` — zero dependencies |
| **Ink + React** | Rich terminal UI with doctor face, progress bars, keyboard nav |
