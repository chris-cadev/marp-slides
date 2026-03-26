# Installation Guide

This guide covers installing all dependencies for `marp-slides` and `marp-video`.

## Contents

- [Bun](#bun) - JavaScript runtime
- [ffmpeg](#ffmpeg) - Video encoding (marp-video only)
- [Mise](#mise) - Optional unified tool manager

---

## Bun

Bun is a fast JavaScript runtime that runs these scripts. [Official site](https://bun.sh/)

### Quick Install

```bash
curl -fsSL https://bun.sh/install | bash
```

### Other Methods

```bash
# npm
npm install -g bun

# Homebrew (macOS)
brew install bun

# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"
```

### Verify

```bash
bun --version
```

---

## ffmpeg

ffmpeg encodes videos for `marp-video`. [Official site](https://ffmpeg.org/)

### macOS

```bash
# Homebrew
brew install ffmpeg
```

### Linux (Ubuntu/Debian)

```bash
sudo apt update && sudo apt install ffmpeg
```

### Linux (Fedora/RHEL)

```bash
sudo dnf install ffmpeg
```

### Linux (Arch)

```bash
sudo pacman -S ffmpeg
```

### Windows

```bash
# winget
winget install ffmpeg

# Chocolatey
choco install ffmpeg
```

### Binary Downloads

Pre-built binaries from [ffmpeg.org](https://ffmpeg.org/download.html):

- [Windows builds](https://www.gyan.dev/ffmpeg/builds/)
- [macOS builds](https://evermeet.cx/ffmpeg/getdesc/zip)
- [Linux builds](https://johnvansickle.com/ffmpeg/)

### Verify

```bash
ffmpeg -version
```

---

## Mise (Optional)

[Mise](https://mise.jdx.dev/) is a unified runtime version manager that can install and manage Bun, ffmpeg, and other tools.

### Install Mise

```bash
curl https://mise.run | sh
```

### Install Tools with Mise

```bash
# Install both Bun and ffmpeg
mise use -g bun ffmpeg

# Install specific versions
mise use -g bun@latest ffmpeg@latest
```

### Verify

```bash
mise versions
```

---

## Quick Setup (All Dependencies)

### With Mise (Recommended)

```bash
# Install mise first
curl https://mise.run | sh

# Install all tools
mise use -g bun ffmpeg
```

### Manual Installation

1. Install Bun: [bun.sh](https://bun.sh/)
2. Install ffmpeg: [ffmpeg.org](https://ffmpeg.org/download.html)

---

## Troubleshooting

### ffmpeg not found

Make sure ffmpeg is in your PATH. Restart your terminal after installation.

```bash
# Check if installed
which ffmpeg
```

### Puppeteer issues

Puppeteer downloads its own Chromium. If you have issues:

```bash
# Update puppeteer
bun add puppeteer@latest
```

### Permission denied

On Unix systems, you may need to make scripts executable:

```bash
chmod +x marp-slides.ts marp-video.ts
```
