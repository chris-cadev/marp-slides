# Continuous Deployment Scripts

Manual submission scripts for publishing `marp-slides` to various registries.

## Prerequisites

1. **GitHub CLI** (`gh`) installed and authenticated:
   ```bash
   gh auth login
   ```

2. **Bun** installed:
   ```bash
   # https://bun.sh
   ```

3. **GH_TOKEN** environment variable set (for creating PRs):
   ```bash
   export GH_TOKEN=$(gh auth token)
   ```

## Scripts

### Homebrew

Submit a new version to Homebrew/homebrew-core.

```bash
# From the project root
bun run cd/homebrew.ts v0.1.0

# Or let it auto-detect version from package.json
bun run cd/homebrew.ts
```

This will:
1. Download the release asset from GitHub Releases
2. Calculate SHA256
3. Fork homebrew-core (if not already forked)
4. Create the formula file
5. Create a PR to Homebrew/homebrew-core

**Notes:**
- You need write access to `Homebrew/homebrew-core` or must fork it first
- PRs are subject to review by Homebrew maintainers
- Formula naming follows Homebrew conventions

### winget

Submit a new version to Microsoft/winget-pkgs.

```bash
# From the project root
bun run cd/winget.ts v0.1.0

# Or let it auto-detect version from package.json
bun run cd/winget.ts
```

This will:
1. Download the release asset from GitHub Releases
2. Calculate SHA256
3. Create the winget manifest
4. Fork winget-pkgs (if not already forked)
5. Create a PR to microsoft/winget-pkgs

**Notes:**
- You need write access to `microsoft/winget-pkgs` or must fork it first
- winget has automated validation checks
- Manifest must follow strict schema requirements

## Workflow

### 1. Create a New Release

```bash
# Update version in package.json, jsr.json, and marp-slides.ts
# Then create a git tag and push
git tag v0.1.0
git push origin v0.1.0
```

### 2. Wait for GitHub Actions

The `Publish` workflow will:
- Publish to npm
- Publish to JSR
- Create GitHub Release with asset

### 3. Submit to Homebrew/winget

```bash
bun run cd/homebrew.ts v0.1.0
bun run cd/winget.ts v0.1.0
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GH_TOKEN` | Yes | GitHub token for creating PRs. Get with `gh auth token` |

## Troubleshooting

### "Failed to fork repository"
- Make sure you have permissions to fork
- Check `gh auth status`

### "Failed to push branch"
- Ensure `GH_TOKEN` is set
- Verify you can push to your fork

### "Failed to create pull request"
- Check that the target repository accepts PRs
- Verify your fork is up to date

## Notes

- These scripts are **manual** - they don't run automatically in CI
- Homebrew/winget maintainers will review and may request changes
- npm and JSR are fully automated via GitHub Actions OIDC
