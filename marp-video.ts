#!/usr/bin/env bun

import * as path from "path";
import * as fs from "fs";
import * as os from "os";

const VERSION = "0.1.0";

const RESOLUTIONS: Record<string, { width: number; height: number }> = {
  hd: { width: 1280, height: 720 },
  fhd: { width: 1920, height: 1080 },
  "2k": { width: 2560, height: 1440 },
  "4k": { width: 3840, height: 2160 },
  "5k": { width: 5120, height: 2880 },
};

const DEFAULT_RESOLUTION = "2k";
const DEFAULT_FPS = 30;

interface CliArgs {
  input: string;
  slide: number | null;
  duration: number | null;
  resolution: string;
  output: string | null;
  fps: number;
  quiet: boolean;
}

function log(message: string, quiet = false) {
  if (!quiet) console.log(message);
}

function logError(message: string) {
  console.error(message);
}

function parseArgs(): CliArgs {
  const args = Bun.argv.slice(2);
  const result: CliArgs = {
    input: "",
    slide: null,
    duration: null,
    resolution: DEFAULT_RESOLUTION,
    output: null,
    fps: DEFAULT_FPS,
    quiet: false,
  };

  const resolutionKeys = Object.keys(RESOLUTIONS);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--quiet") {
      result.quiet = true;
    } else if (arg === "--fps" && i + 1 < args.length) {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val) && val > 0) result.fps = val;
    } else if (arg === "--slide" && i + 1 < args.length) {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val) && val > 0) result.slide = val;
    } else if (arg === "--duration" && i + 1 < args.length) {
      const val = parseFloat(args[++i]);
      if (!isNaN(val) && val > 0) result.duration = val;
    } else if (arg === "--resolution" && i + 1 < args.length) {
      const res = args[++i].toLowerCase();
      if (resolutionKeys.includes(res)) result.resolution = res;
    } else if (arg === "--output" && i + 1 < args.length) {
      result.output = args[++i];
    } else if (!arg.startsWith("-")) {
      result.input = arg;
    }
  }

  return result;
}

async function checkFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = Bun.spawn(["ffmpeg", "-version"], { stdout: "pipe", stderr: "pipe" });
    proc.exited.then((code) => resolve(code === 0));
  });
}

async function checkPuppeteer(): Promise<boolean> {
  try {
    await import("puppeteer");
    return true;
  } catch {
    return false;
  }
}

async function getSlideCount(mdPath: string): Promise<number> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "marp-video-"));
  const tempBase = path.join(tempDir, "__temp_slides");

  const marpArgs = [
    "npx", "--yes", "@marp-team/marp-cli@latest",
    mdPath,
    "--allow-local-files",
    "--image-scale", "1",
    "-o", tempBase,
  ];

  const marpProcess = Bun.spawn(marpArgs, {
    cwd: path.dirname(mdPath),
    stdout: "pipe",
    stderr: "pipe",
  });

  await marpProcess.exited;

  const tempFiles = fs.readdirSync(tempDir)
    .filter((f) => f.startsWith("__temp_slides.") && /^\d+$/.test(f.split(".").pop() || ""))
    .sort((a, b) => {
      const numA = parseInt(a.split(".").pop() || "0", 10);
      const numB = parseInt(b.split(".").pop() || "0", 10);
      return numA - numB;
    });

  const count = tempFiles.length;

  fs.rmSync(tempDir, { recursive: true, force: true });

  return count;
}

async function selectSlide(slideCount: number): Promise<number> {
  const { select } = await import("@clack/prompts");

  const options = Array.from({ length: slideCount }, (_, i) => ({
    value: String(i + 1),
    label: `Slide ${i + 1}`,
  }));

  const selected = await select({
    message: "Select a slide to record:",
    options,
    initialValue: "1",
  });

  return parseInt(selected as string, 10);
}

async function exportHtml(mdPath: string, tempDir: string): Promise<string> {
  const htmlPath = path.join(tempDir, "presentation.html");

  const marpArgs = [
    "npx", "--yes", "@marp-team/marp-cli@latest",
    mdPath,
    "--bespoke.transition",
    "--allow-local-files",
    "-o", htmlPath,
  ];

  const marpProcess = Bun.spawn(marpArgs, {
    cwd: path.dirname(mdPath),
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(marpProcess.stdout).text(),
    new Response(marpProcess.stderr).text(),
    marpProcess.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`Marp CLI failed:\n${stdout}\n${stderr}`);
  }

  return htmlPath;
}

async function recordSlide(
  htmlPath: string,
  slideNumber: number,
  duration: number,
  width: number,
  height: number,
  fps: number,
  framesDir: string
): Promise<void> {
  const { default: puppeteer } = await import("puppeteer");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });

  const fileUrl = `file://${path.resolve(htmlPath)}`;
  await page.goto(fileUrl, { waitUntil: "networkidle0" });

  await page.evaluate((slide) => {
    if (typeof Reveal !== "undefined") {
      Reveal.initialize({ embedded: true }).then(() => {
        Reveal.slide(slide - 1);
      });
    }
  }, slideNumber);

  await new Promise(r => setTimeout(r, 1000));

  const totalFrames = Math.ceil(duration * fps);
  const frameDelay = 1000 / fps;

  log(`Recording ${totalFrames} frames at ${fps} fps...`);

  for (let i = 0; i < totalFrames; i++) {
    const framePath = path.join(framesDir, `frame_${String(i).padStart(6, "0")}.png`);
    await page.screenshot({ path: framePath, type: "png" });

    if (i < totalFrames - 1) {
      const currentSlide = await page.evaluate(() => {
        if (typeof Reveal !== "undefined") {
          const indices = Reveal.getIndices();
          return { h: indices.h, v: indices.v };
        }
        return { h: 0, v: 0 };
      });

      const targetSlideIndex = slideNumber - 1;
      if (currentSlide.h < targetSlideIndex) {
        await page.evaluate(() => {
          if (typeof Reveal !== "undefined") Reveal.next();
        });
      }
    }

    if (i % fps === 0) {
      process.stdout.write(`\rProgress: ${Math.floor((i / totalFrames) * 100)}%`);
    }

    await new Promise((r) => setTimeout(r, frameDelay));
  }

  console.log("\rProgress: 100%");
  await browser.close();
}

async function createVideo(framesDir: string, outputPath: string, fps: number): Promise<void> {
  const ffmpegArgs = [
    "ffmpeg",
    "-y",
    "-framerate", fps.toString(),
    "-i", path.join(framesDir, "frame_%06d.png"),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "ultrafast",
    outputPath,
  ];

  log("Encoding video...");

  const ffmpegProcess = Bun.spawn(ffmpegArgs, {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(ffmpegProcess.stdout).text(),
    new Response(ffmpegProcess.stderr).text(),
    ffmpegProcess.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`ffmpeg failed:\n${stdout}\n${stderr}`);
  }
}

async function main() {
  const args = parseArgs();

  if (Bun.argv.includes("--version") || Bun.argv.includes("-v")) {
    console.log(`marp-video v${VERSION}`);
    return;
  }

  if (!args.input) {
    console.error("Usage: marp-video <input.md> [options]");
    console.error("");
    console.error("Arguments:");
    console.error("  <input.md>                 Marp markdown file");
    console.error("");
    console.error("Options:");
    console.error("  --slide <n>               Slide number to record (default: interactive)");
    console.error("  --duration <sec>           Recording duration in seconds (required)");
    console.error("  --resolution <res>         Recording resolution: hd, fhd, 2k, 4k, 5k (default: 2k)");
    console.error("  --fps <n>                 Frames per second (default: 30)");
    console.error("  --output <path>           Output video path (default: auto-generated)");
    console.error("  --quiet                   Suppress progress output");
    console.error("  --version, -v             Show version");
    console.error("");
    console.error("Example:");
    console.error("  marp-video presentation.md --slide 2 --duration 5");
    process.exit(1);
  }

  if (!args.duration) {
    logError("Error: --duration is required");
    process.exit(1);
  }

  if (!fs.existsSync(args.input)) {
    logError(`Error: File not found: ${args.input}`);
    process.exit(1);
  }

  log("=== Marp Video ===");
  log(`Version: ${VERSION}`);
  log("");

  const hasFfmpeg = await checkFfmpeg();
  if (!hasFfmpeg) {
    logError("Error: ffmpeg is required but not found.");
    logError("Install it: https://ffmpeg.org/download.html");
    process.exit(1);
  }
  log("ffmpeg: OK");

  const hasPuppeteer = await checkPuppeteer();
  if (!hasPuppeteer) {
    logError("Error: puppeteer is required but not found.");
    logError("Run: bun add puppeteer");
    process.exit(1);
  }
  log("puppeteer: OK");
  log("");

  let slideNumber = args.slide;
  if (!slideNumber) {
    log("Counting slides...");
    const slideCount = await getSlideCount(args.input);
    log(`Found ${slideCount} slides`);
    slideNumber = await selectSlide(slideCount);
  }

  log(`Selected slide: ${slideNumber}`);
  log(`Duration: ${args.duration}s`);
  log(`Resolution: ${args.resolution.toUpperCase()} (${RESOLUTIONS[args.resolution].width}x${RESOLUTIONS[args.resolution].height})`);
  log(`FPS: ${args.fps}`);
  log("");

  const res = RESOLUTIONS[args.resolution];
  const mdBasename = path.basename(args.input, ".md");

  const outputPath = args.output || path.join(
    path.dirname(args.input),
    `${mdBasename}_slide${slideNumber}.mp4`
  );

  log(`Output: ${outputPath}`);
  log("");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "marp-video-"));
  const framesDir = path.join(tempDir, "frames");
  fs.mkdirSync(framesDir, { recursive: true });

  try {
    log("Step 1/3: Exporting HTML with transitions...");
    const htmlPath = await exportHtml(args.input, tempDir);
    log("  Done");

    log("Step 2/3: Recording frames in browser...");
    await recordSlide(
      htmlPath,
      slideNumber,
      args.duration,
      res.width,
      res.height,
      args.fps,
      framesDir
    );
    log("  Done");

    log("Step 3/3: Encoding video...");
    await createVideo(framesDir, outputPath, args.fps);
    log("  Done");

    log("");
    log(`Video created: ${outputPath}`);

  } catch (error) {
    logError(`Error: ${error}`);
    process.exit(1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

export { main, parseArgs };
