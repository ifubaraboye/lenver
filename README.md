# Lenver

Encrypted environment variable vault that stores secrets on USB drives or explicit folders.

## Features

- **Encrypted Storage**: AES-256-GCM encryption with scrypt key derivation
- **USB Drive Support**: Automatically detects removable drives on Linux and stores vault files
- **Password Protection**: Secure vault access with password + optional hint
- **Export Support**: Export environment variables directly to shell
- **TUI Interface**: Interactive terminal UI for managing secrets

## Quick Start

1. **Install dependencies:**
   ```bash
   bun install
   ```

2. **Run the interactive TUI to create your vault:**
   ```bash
   bun run vault.tsx
   ```

3. **Add your secrets** (API keys, passwords, tokens, etc.)

4. **Export to your shell:**
   ```bash
   eval "$(bun run vault.tsx --export)"
   ```

5. **Add to your shell config** (`.bashrc`, `.zshrc`, etc.) for automatic loading:
   ```bash
   eval "$(bunx lenver --export)"
   ```

## Installation

### From source

```bash
bun install
bunx lenver
```

### Global install

```bash
bun add -g lenver
lenver
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

## Examples

### Adding secrets in TUI

Run the interactive interface to add, view, edit, or delete secrets:

```bash
bun run vault.tsx
```

### Exporting all secrets

```bash
eval "$(bunx lenver --export)"
```

### Using a specific USB drive

```bash
eval "$(bunx lenver --export --drive /media/usb)"
```

### Using with a specific vault file

```bash
eval "$(bunx lenver --export --drive /path/to/custom/vault)"
```

### Common shell integrations

**Bash (.bashrc):**
```bash
# Load Lenver vault on shell startup
eval "$(lenver --export 2>/dev/null)"
```

**Zsh (.zshrc):**
```bash
# Load Lenver vault on shell startup
eval "$(lenver --export 2>/dev/null)"
```

**Fish (config.fish):**
```fish
# Load Lenver vault on shell startup
eval (lenver --export 2>/dev/null)
```

### Environment-specific vaults

Use different drives for different projects:

```bash
# Project A vault
eval "$(lenver --export --drive /media/usb-a)"

# Project B vault  
eval "$(lenver --export --drive /media/usb-b)"
```

## Platform Support

- **Linux**: supported for automatic removable-drive detection
- **macOS / other Unix-like systems**: best-effort manual mount scanning plus `--drive`
- **Windows**: not supported in this pass

## Security

- **Encryption**: AES-256-GCM
- **Key Derivation**: scrypt (N=131072, r=8, p=1)
- **File Permissions**: Vault files are saved with 0o600 (owner read/write only)

## File Structure

- `vault.tsx` - CLI entry point
- `crypto.ts` - Vault manager and compatibility exports
- `vault-format.ts` - Encryption, schema validation, and export formatting
- `drive-detection.ts` - Drive detection helpers
- `config-paths.ts` - Config migration and last-vault lookup
- `ui.tsx` - Terminal UI components

## License

MIT
