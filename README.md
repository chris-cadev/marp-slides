# marp-slides

> Export Marp presentations to PNG images with batch processing and parallel execution.

[![npm](https://img.shields.io/npm/v/marp-slides@0.1.0.svg)](https://www.npmjs.com/package/marp-slides)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Quick Start

```bash
# Try now (no install required)
npx marp-slides presentation.md

# Install globally
npm install -g marp-slides
```

## marp-slides - Image Export

Export slides as PNG images with batch processing and parallel execution.

```bash
# Single file
marp-slides presentation.md

# Multiple files with glob pattern
marp-slides "*.md"

# With resolution (hd, fhd, 2k, 4k, 5k)
marp-slides presentation.md 4k
```

## marp-video - Video Export

Create videos from slides with full animation support (fragments, transitions).

```bash
# Record slide 2 for 5 seconds
npx marp-video presentation.md --slide 2 --duration 5

# Custom resolution
marp-video presentation.md --slide 2 --duration 10 --resolution fhd
```

## Installation

See [docs/installation.md](docs/installation.md) for detailed setup instructions.

**Quick setup with Mise:**

```bash
mise use -g bun ffmpeg
```

**Manual:**

1. Install [Bun](https://bun.sh/)
2. For `marp-video`: Install [ffmpeg](https://ffmpeg.org/)

## Options

### marp-slides

| Option                | Description                                      | Default                |
| --------------------- | ------------------------------------------------ | ---------------------- |
| `resolution`          | Output resolution: `hd`, `fhd`, `2k`, `4k`, `5k` | `2k` or interactive    |
| `--override`          | Overwrite existing output folders                | `false`                |
| `--output-dir <path>` | Custom output directory                          | Same as `.md` location |
| `--format <fmt>`      | Image format: `png`, `webp`, `jpg`               | `png`                  |
| `--quiet`             | Suppress progress output                         | `false`                |
| `--dry-run`           | Preview without creating files                   | `false`                |

### marp-video

| Option               | Description                                     | Default        |
| -------------------- | ----------------------------------------------- | -------------- |
| `--slide <n>`        | Slide number to record                          | Interactive    |
| `--duration <sec>`   | Recording duration                              | Required       |
| `--resolution <res>` | Video resolution: `hd`, `fhd`, `2k`, `4k`, `5k` | `2k`           |
| `--fps <n>`          | Frames per second                               | `30`           |
| `--output <path>`    | Output video path                               | Auto-generated |

## Examples

```bash
# Export all slides at 2K resolution
marp-slides "presentations/*.md" 2k

# Preview what would be created
marp-slides "*.md" --dry-run

# Create video from slide 3
marp-video presentation.md --slide 3 --duration 5

# Video with custom output path
marp-video presentation.md --slide 2 --duration 10 --output intro.mp4
```

## How It Works

```
presentation.md
    │
    ▼
Marp CLI renders
    │
    ├──> PNG images (marp-slides)
    │
    └──> HTML + Browser (marp-video)
              │
              ▼
         Frames → MP4
```

## Documentation

- [Installation Guide](docs/installation.md) - Detailed setup for all dependencies

## License

MIT © chris-cadev
