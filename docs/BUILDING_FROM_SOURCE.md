# Building Cyrus from Source

This guide walks you through building and running Cyrus from the source repository instead of installing the published npm package.

---

## Prerequisites

Before building from source, ensure you have:

- **Node.js** v18 or higher
- **pnpm** v10.11.0 or higher
- **jq** (required for Claude Code parsing)
- **Git**

### Install Prerequisites

**macOS:**
```bash
# Install Homebrew if not already installed
# See https://brew.sh

# Install dependencies
brew install jq gh node pnpm

# Verify installations
node --version    # Should be v18+
pnpm --version    # Should be v10.11.0+
jq --version      # Should show version like jq-1.7
```

**Linux/Ubuntu:**
```bash
# Install Node.js (via nvm recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18

# Install pnpm
npm install -g pnpm@10.11.0

# Install other dependencies
sudo apt install -y gh git jq

# Verify installations
node --version    # Should be v18+
pnpm --version    # Should be v10.11.0+
jq --version      # Should show version like jq-1.7
```

**Windows (WSL):**
Follow the Linux instructions above in your WSL terminal.

---

## Step 1: Clone the Repository

```bash
# Clone the repository
git clone https://github.com/ceedaragents/cyrus.git
cd cyrus

# Or if you've already cloned it
cd /path/to/cyrus
```

---

## Step 2: Install Dependencies

Cyrus is a pnpm monorepo. Install all dependencies from the root:

```bash
pnpm install
```

This will install dependencies for:
- All packages in `packages/`
- All apps in `apps/`

---

## Step 3: Build All Packages

Before you can run the CLI, you need to build all packages:

```bash
pnpm build
```

This builds the entire monorepo in the correct dependency order:
1. Core packages (`@cyrus/core`, `@cyrus/claude-parser`, etc.)
2. Application packages (`@cyrus/cli`)

**Tip:** If you make changes to any package, you'll need to rebuild it. You can build a specific package:
```bash
# Build only the core package
cd packages/core
pnpm build

# Or from root
pnpm --filter @cyrus/core build
```

---

## Step 4: Link the CLI Globally

Now link the CLI so you can run `cyrus` from anywhere:

```bash
cd apps/cli
pnpm install -g .
```

This creates a global symlink to your local development version. Any changes you make and rebuild will be immediately available.

**Alternative: Use pnpm link**
```bash
cd apps/cli
pnpm link --global
```

**Verify the installation:**
```bash
which cyrus
# Should show path to your local build

cyrus --version
# Should show the current version
```

---

## Step 5: Configure Environment

Follow the same configuration steps as the self-hosting guide:

1. Create your environment file at `~/.cyrus/.env`
2. Add your Linear OAuth credentials
3. Add your Claude Code authentication

See **[Self-Hosting Guide](./SELF_HOSTING.md)** for detailed environment setup.

---

## Step 6: Run Cyrus

Now you can run your locally built version:

```bash
cyrus
```

All the same commands work:
```bash
cyrus self-auth
cyrus self-add-repo https://github.com/yourorg/yourrepo.git
cyrus check-tokens
```

---

## Development Workflow

### Making Changes

When developing Cyrus, you'll typically work in watch mode:

**Option A: Watch Mode (Recommended)**

Open two terminals:

**Terminal 1 - Build watcher:**
```bash
cd /path/to/cyrus
pnpm dev
```

This runs TypeScript in watch mode for all packages. Changes are compiled automatically.

**Terminal 2 - Run Cyrus:**
```bash
cyrus
```

When you make changes:
1. The watch mode automatically rebuilds
2. Restart the `cyrus` command to pick up changes

**Option B: Manual Rebuild**

```bash
# Make changes to code
# Then rebuild
pnpm build

# Run cyrus
cyrus
```

### Running Tests

Before committing changes, run tests:

```bash
# Run all tests
pnpm test

# Run tests for packages only (faster)
pnpm test:packages:run

# Run tests in watch mode
pnpm test:packages

# Run TypeScript type checking
pnpm typecheck

# Run linting
pnpm lint
```

### Testing Specific Packages

```bash
# Test only edge-worker package
cd packages/edge-worker
pnpm test:run

# Test only CLI app
cd apps/cli
pnpm test:run
```

---

## Switching Between Source and Published Version

### Use Source Version

```bash
# If you have the published version installed, remove it first
npm uninstall -g cyrus-ai

# Link your local version
cd /path/to/cyrus/apps/cli
pnpm install -g .
```

### Use Published Version

```bash
# Remove local version
cd /path/to/cyrus/apps/cli
npm uninstall -g .

# Install published version
npm install -g cyrus-ai
```

---

## Troubleshooting

### "cyrus: command not found"

The global link may not have been created. Try:

```bash
cd apps/cli
npm uninstall -g .
pnpm install -g .

# Verify
which cyrus
```

### Changes Not Taking Effect

Make sure you've rebuilt:

```bash
cd /path/to/cyrus
pnpm build
```

Then restart the `cyrus` command.

### Build Errors

Clean and reinstall:

```bash
# Clean all build artifacts
pnpm clean  # If available

# Or manually
rm -rf node_modules
rm -rf apps/*/node_modules
rm -rf packages/*/node_modules
rm -rf apps/*/dist
rm -rf packages/*/dist

# Reinstall
pnpm install
pnpm build
```

### TypeScript Errors

Check your Node.js version:

```bash
node --version  # Should be v18+
```

Run type checking to see all errors:

```bash
pnpm typecheck
```

### Tests Failing

Make sure all packages are built:

```bash
pnpm build
pnpm test:packages:run
```

---

## Package Structure

Understanding the monorepo structure helps when developing:

```
cyrus/
├── apps/
│   ├── cli/              # Main CLI application (what you run)
│   ├── electron/         # GUI app (in development)
│   └── proxy/            # OAuth/webhook proxy server
└── packages/
    ├── core/             # Shared types, session management
    ├── claude-parser/    # Parses Claude stdout with jq
    ├── claude-runner/    # Executes Claude Code CLI
    ├── edge-worker/      # Core agent logic
    ├── gemini-runner/    # Gemini integration
    └── ndjson-client/    # NDJSON streaming client
```

When you change code:
- **Packages**: Changes require rebuild (`pnpm build`)
- **CLI**: Changes require rebuild and restart
- Dependencies flow: packages → apps

---

## Contributing

When contributing changes:

1. Make your changes
2. Run tests: `pnpm test:packages:run`
3. Run type checking: `pnpm typecheck`
4. Run linting: `pnpm lint`
5. Update `CHANGELOG.md` under `## [Unreleased]`
6. Commit and create a PR

See **[CLAUDE.md](../CLAUDE.md)** for detailed development guidelines.

---

## Additional Resources

- **[Self-Hosting Guide](./SELF_HOSTING.md)** - Complete self-hosting setup
- **[Git & GitHub Setup](./GIT_GITHUB.md)** - Configure Git and GitHub CLI
- **[Configuration Reference](./CONFIG_FILE.md)** - Detailed config options
- **[CLAUDE.md](../CLAUDE.md)** - Full development guidelines
