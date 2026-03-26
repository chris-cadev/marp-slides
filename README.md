# marp-slides

> Export Marp presentations to PNG images with batch processing, parallel execution, and interactive prompts.

[![npm](https://img.shields.io/npm/v/marp-slides.svg)](https://www.npmjs.com/package/marp-slides)
[![JSR](https://jsr.io/badges/v/@davinci/marp-slides.svg)](https://jsr.io/@davinci/marp-slides)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

```bash
# Try now (no install required)
npx marp-slides presentation.md

# Install globally
npm install -g marp-slides

# Done! Use anywhere
marp-slides "*.md" 2k
```

## Installation

### npm (Recommended)

```bash
npm install -g marp-slides
```

### Deno

```bash
deno run jsr:@davinci/marp-slides presentation.md
```

### Bun

```bash
bunx marp-slides presentation.md
```

### Direct Download

```bash
curl -fsSL https://github.com/chris-cadev/marp-slides/releases/latest/download/marp-slides -o marp-slides
chmod +x marp-slides
./marp-slides presentation.md
```

## Usage

```bash
# Single file
marp-slides presentation.md

# Multiple files with glob pattern
marp-slides "*.md"

# With resolution (hd, fhd, 2k, 4k, 5k)
marp-slides presentation.md 4k

# Override existing output folders
marp-slides "*.md" --override

# Quiet mode (less output)
marp-slides "*.md" --quiet

# Preview what would be created
marp-slides "*.md" --dry-run

# JSON output for scripting
marp-slides "*.md" --json

# Update to latest version
marp-slides update
```

## Features

- **Batch Processing** - Process multiple files with glob patterns (`*.md`, `**/*.md`)
- **Resolution Options** - HD (1280x720), Full HD (1920x1080), 2K, 4K, 5K
- **Interactive Mode** - If no resolution is specified, shows a nice selector
- **Parallel Processing** - Automatically uses your CPU cores efficiently
- **Smart Output** - Creates folders alongside your `.md` files
- **Custom Patterns** - Flexible filename patterns (`{Name}_{n3}.png`)
- **Multiple Formats** - Export as PNG, WebP, or JPG
- **Dry Run** - Preview what will be created without making changes
- **JSON Output** - Machine-readable results for automation
- **Auto-Update** - Built-in update command

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `resolution` | Output resolution: `hd`, `fhd`, `2k`, `4k`, `5k` | `2k` or interactive |
| `--override` | Overwrite existing output folders | `false` |
| `--output-dir <path>` | Custom output directory | Same as `.md` location |
| `--format <fmt>` | Image format: `png`, `webp`, `jpg` | `png` |
| `--quality <n>` | Image quality 0-100 (for webp/jpg) | `90` |
| `--pattern <pat>` | Filename pattern | `{Name}.{n3}` |
| `--parallel <n>` | Number of parallel workers | Auto-detect |
| `--quiet` | Suppress progress output | `false` |
| `--json` | Output machine-readable JSON | `false` |
| `--dry-run` | Preview without creating files | `false` |
| `--version`, `-v` | Show version info | - |
| `update` | Check and install latest version | - |

### Filename Pattern Variables

| Variable | Example | Description |
|----------|---------|-------------|
| `{Name}` | `Presentation` | Markdown filename (without ext) |
| `{n}` | `1` | Slide number (1-based) |
| `{n2}` | `01` | Slide number (2-digit) |
| `{n3}` | `001` | Slide number (3-digit) |
| `{n4}` | `0001` | Slide number (4-digit) |

## Examples

### Basic Usage

```bash
# Export a single presentation
marp-slides slides.md

# Export with 4K resolution
marp-slides slides.md 4k
```

### Batch Processing

```bash
# All markdown files in current directory
marp-slides "*.md"

# All markdown files in subdirectories
marp-slides "./presentations/**/*.md"

# Specific files
marp-slides intro.md chapter1.md chapter2.md
```

### Custom Output

```bash
# Custom output directory
marp-slides slides.md --output-dir ./exports

# Custom filename pattern
marp-slides slides.md --pattern "{Name}_slide_{n3}"

# Output: slides_slide_001.png, slides_slide_002.png, ...
```

### Image Formats

```bash
# PNG (default, lossless)
marp-slides slides.md

# WebP with quality
marp-slides slides.md --format webp --quality 85

# JPG (smaller file size)
marp-slides slides.md --format jpg --quality 80
```

### Automation

```bash
# Dry run to preview
marp-slides "*.md" --dry-run

# JSON output for scripts
marp-slides "*.md" --json > results.json

# Quiet mode (less noise)
marp-slides "*.md" --quiet
```

## How It Works

1. **Input** - Takes Marp markdown files (`.md`)
2. **Export** - Uses `@marp-team/marp-cli` to render slides
3. **Output** - Creates PNG images in a folder named after the markdown file

```
presentation.md
└─> presentation/
     ├── presentation.001.png
     ├── presentation.002.png
     └── presentation.003.png
```

## Updating

```bash
# Check for updates
marp-slides update

# Force update
marp-slides update --force
```

## Requirements

- [Bun](https://bun.sh) (recommended) or Node.js/npm
- [@marp-team/marp-cli](https://github.com/marp-team/marp-cli) (auto-installed)

## License

MIT © chris-cadev
