# Lenver

Encrypted environment variable vault that stores secrets on USB drives.

## Features

- **Encrypted Storage**: AES-256-GCM encryption with scrypt key derivation
- **USB Drive Support**: Automatically detects removable drives and stores vault files
- **Password Protection**: Secure vault access with password + optional hint
- **Export Support**: Export environment variables directly to shell
- **TUI Interface**: Interactive terminal UI for managing secrets

## Installation

```bash
bun install
```

## Usage

### Interactive Mode (TUI)

```bash
bun run vault.tsx
# or
bunx lenver
```

### Export Mode

Export secrets to current shell:

```bash
eval "$(bunx lenver --export)"
```

Select a specific drive:

```bash
bunx lenver --export --drive /media/usb
```

## Commands

- `--export, -e` - Export keys to stdout (for eval)
- `--drive, -d <path>` - Force vault directory

## Security

- **Encryption**: AES-256-GCM
- **Key Derivation**: scrypt (N=131072, r=8, p=1)
- **File Permissions**: Vault files are saved with 0o600 (owner read/write only)

## File Structure

- `vault.tsx` - CLI entry point
- `crypto.ts` - Encryption and drive detection
- `ui.tsx` - Terminal UI components

## License

MIT
