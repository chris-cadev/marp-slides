import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { RESOLUTIONS, RESOLUTION_KEYS } from "../shared/resolutions.ts";

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

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    input: "",
    slide: null,
    duration: null,
    resolution: "2k",
    output: null,
    fps: DEFAULT_FPS,
    quiet: false,
  };

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
      if (RESOLUTION_KEYS.includes(res)) result.resolution = res;
    } else if (arg === "--output" && i + 1 < args.length) {
      result.output = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      result.input = arg;
    }
  }

  return result;
}

export function printHelp() {
  console.log("Usage: marp-slides video <input.md> [options]");
  console.log("");
  console.log("Arguments:");
  console.log("  <input.md>                 Marp markdown file");
  console.log("");
  console.log("Options:");
  console.log("  --slide <n>               Slide number to record (default: interactive)");
  console.log("  --duration <sec>           Recording duration in seconds (required)");
  console.log("  --resolution <res>         Recording resolution: hd, fhd, 2k, 4k, 5k (default: 2k)");
  console.log("  --fps <n>                 Frames per second (default: 30)");
  console.log("  --output <path>           Output video path (default: auto-generated)");
  console.log("  --quiet                   Suppress progress output");
  console.log("  --help, -h                Show this help");
  console.log("");
  console.log("Example:");
  console.log("  marp-slides video presentation.md --slide 2 --duration 5");
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
  const mdDir = path.dirname(mdPath);

  const marpArgs = [
    "npx", "--yes", "@marp-team/marp-cli@latest",
    mdPath,
    "--bespoke.transition",
    "--allow-local-files",
    "-o", htmlPath,
  ];

  const marpProcess = Bun.spawn(marpArgs, {
    cwd: mdDir,
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

  // Copy attachments folder to temp directory (for relative image paths)
  const attachmentsSrc = path.join(mdDir, "attachments");
  const attachmentsDest = path.join(tempDir, "attachments");
  if (fs.existsSync(attachmentsSrc)) {
    copyDir(attachmentsSrc, attachmentsDest);
  }

  // Modify HTML to inject a script that finds and exposes the deck
  let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  
  // Inject a script after </body> or at the end that finds the deck
  const injectScript = `
<script>
(function() {
  // Wait for bespoke to initialize
  function findAndExposeDeck() {
    // Try to find deck on the parent element
    const parent = document.querySelector('.bespoke-marp-parent');
    if (!parent) return false;
    
    // The deck is stored as a non-enumerable property or in a closure
    // Try to find it by checking the element's properties
    const descriptors = Object.getOwnPropertyDescriptors(parent);
    for (const [key, desc] of Object.entries(descriptors)) {
      if (desc.value && typeof desc.value === 'object' && typeof desc.value.slide === 'function') {
        window.__marpDeck = desc.value;
        return true;
      }
    }
    
    // Try looking at __proto__ chain
    let proto = Object.getPrototypeOf(parent);
    while (proto && proto !== HTMLElement.prototype && proto !== Element.prototype) {
      const descriptors = Object.getOwnPropertyDescriptors(proto);
      for (const [key, desc] of Object.entries(descriptors)) {
        if (desc.value && typeof desc.value === 'object' && typeof desc.value.slide === 'function') {
          window.__marpDeck = desc.value;
          return true;
        }
      }
      proto = Object.getPrototypeOf(proto);
    }
    
    return false;
  }
  
  // Try immediately and then poll
  if (!findAndExposeDeck()) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (findAndExposeDeck() || attempts > 20) {
        clearInterval(interval);
      }
    }, 100);
  }
})();
</script>
`;
  
  // Insert the script before </body>
  if (htmlContent.includes('</body>')) {
    htmlContent = htmlContent.replace('</body>', injectScript + '</body>');
  } else {
    htmlContent += injectScript;
  }
  
  fs.writeFileSync(htmlPath, htmlContent, 'utf-8');

  return htmlPath;
}

async function recordSlide(
  htmlPath: string,
  slideNumber: number,
  duration: number,
  width: number,
  height: number,
  fps: number,
  framesDir: string,
  quiet: boolean
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
  
  // Wait a bit for our injected script to run
  await new Promise(r => setTimeout(r, 500));
  
  // Try to use the exposed deck
  const navigationResult = await page.evaluate((targetSlide) => {
    const result: any = { method: 'unknown' };
    
    // Method 1: Try the exposed __marpDeck
    if (typeof (window as any).__marpDeck !== 'undefined') {
      const deck = (window as any).__marpDeck;
      result.method = 'exposed-deck';
      result.hasSlide = typeof deck.slide === 'function';
      if (typeof deck.slide === 'function') {
        deck.slide(targetSlide - 1);
        result.newSlide = deck.slide();
      }
      return result;
    }
    
    // Method 2: Try window.location.hash for hash-based navigation
    if (window.location.hash) {
      result.method = 'hash-found';
      result.hash = window.location.hash;
    }
    
    // Method 3: Check if there's a bespoke-marp element with deck info
    const parent = document.querySelector('.bespoke-marp-parent');
    if (parent) {
      result.hasParent = true;
      // Try keyboard navigation simulation
      result.method = 'fallback-keyboard';
    }
    
    return result;
  }, slideNumber);
  
  log(`Navigation result: ${JSON.stringify(navigationResult)}`, quiet);
  
  // Fallback: Use keyboard navigation if deck wasn't found
  if (navigationResult.method === 'fallback-keyboard' || navigationResult.method === 'unknown') {
    log('Using keyboard navigation fallback...', quiet);
    
    // Navigate to target slide using keyboard
    for (let i = 1; i < slideNumber; i++) {
      await page.keyboard.press('ArrowRight');
      await new Promise(r => setTimeout(r, 100));
    }
    await new Promise(r => setTimeout(r, 300));
  }

  const totalFrames = Math.ceil(duration * fps);
  const frameDelay = 1000 / fps;

  log(`Recording ${totalFrames} frames at ${fps} fps...`, quiet);

  for (let i = 0; i < totalFrames; i++) {
    const framePath = path.join(framesDir, `frame_${String(i).padStart(6, "0")}.png`);
    await page.screenshot({ path: framePath, type: "png" });

    if (!quiet && i % fps === 0) {
      process.stdout.write(`\rProgress: ${Math.floor((i / totalFrames) * 100)}%`);
    }

    await new Promise((r) => setTimeout(r, frameDelay));
  }

  if (!quiet) console.log("\rProgress: 100%");
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

export async function run(args: string[]) {
  const parsedArgs = parseArgs(args);

  if (!parsedArgs.input) {
    printHelp();
    process.exit(1);
  }

  if (!parsedArgs.duration) {
    logError("Error: --duration is required");
    process.exit(1);
  }

  if (!fs.existsSync(parsedArgs.input)) {
    logError(`Error: File not found: ${parsedArgs.input}`);
    process.exit(1);
  }

  log("=== Marp Slides (Video) ===");
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

  let slideNumber = parsedArgs.slide;
  if (!slideNumber) {
    log("Counting slides...");
    const slideCount = await getSlideCount(parsedArgs.input);
    log(`Found ${slideCount} slides`);
    slideNumber = await selectSlide(slideCount);
  }

  log(`Selected slide: ${slideNumber}`);
  log(`Duration: ${parsedArgs.duration}s`);
  log(`Resolution: ${parsedArgs.resolution.toUpperCase()} (${RESOLUTIONS[parsedArgs.resolution].width}x${RESOLUTIONS[parsedArgs.resolution].height})`);
  log(`FPS: ${parsedArgs.fps}`);
  log("");

  const res = RESOLUTIONS[parsedArgs.resolution];
  const mdBasename = path.basename(parsedArgs.input, ".md");

  const outputPath = parsedArgs.output || path.join(
    path.dirname(parsedArgs.input),
    `${mdBasename}_slide${slideNumber}.mp4`
  );

  log(`Output: ${outputPath}`);
  log("");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "marp-video-"));
  const framesDir = path.join(tempDir, "frames");
  fs.mkdirSync(framesDir, { recursive: true });

  try {
    log("Step 1/3: Exporting HTML with transitions...", parsedArgs.quiet);
    const htmlPath = await exportHtml(parsedArgs.input, tempDir);
    log("  Done", parsedArgs.quiet);

    log("Step 2/3: Recording frames in browser...", parsedArgs.quiet);
    await recordSlide(
      htmlPath,
      slideNumber,
      parsedArgs.duration,
      res.width,
      res.height,
      parsedArgs.fps,
      framesDir,
      parsedArgs.quiet
    );
    log("  Done", parsedArgs.quiet);

    log("Step 3/3: Encoding video...", parsedArgs.quiet);
    await createVideo(framesDir, outputPath, parsedArgs.fps);
    log("  Done", parsedArgs.quiet);

    log("");
    log(`Video created: ${outputPath}`);

  } catch (error) {
    logError(`Error: ${error}`);
    process.exit(1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
