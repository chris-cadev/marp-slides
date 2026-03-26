#!/usr/bin/env bun

import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as https from "https";

const VERSION = "0.1.0-beta.7";
const REPO_OWNER = "chris-cadev";
const REPO_NAME = "marp-slides";
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const DOWNLOAD_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/marp-slides`;

const RESOLUTIONS: Record<string, { scale: number; width: number; height: number }> = {
  hd: { scale: 1, width: 1280, height: 720 },
  fhd: { scale: 2, width: 1920, height: 1080 },
  "2k": { scale: 3, width: 2560, height: 1440 },
  "4k": { scale: 4, width: 3840, height: 2160 },
  "5k": { scale: 5, width: 5120, height: 2880 },
};

const DEFAULT_RESOLUTION = "2k";
const DEFAULT_FORMAT = "png";
const DEFAULT_QUALITY = 90;
const DEFAULT_PATTERN = "{name}.{n3}";
const DEFAULT_PARALLELISM_RATIO = 0.5;

interface CliArgs {
  inputs: string[];
  resolution: string | null;
  override: boolean;
  outputDir: string | null;
  format: string;
  quality: number;
  pattern: string;
  quiet: boolean;
  json: boolean;
  dryRun: boolean;
  parallel: number | null;
  showVersion: boolean;
  update: boolean;
  forceUpdate: boolean;
}

interface FileResult {
  input: string;
  outputDir: string;
  slides: number;
  images: string[];
  status: "success" | "skipped" | "failed" | "dry-run";
  error?: string;
}

interface JsonOutput {
  success: boolean;
  total: number;
  processed: number;
  skipped: number;
  failed: number;
  slides: number;
  outputs: FileResult[];
  errors: string[];
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  body?: string;
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
    inputs: [],
    resolution: null,
    override: false,
    outputDir: null,
    format: DEFAULT_FORMAT,
    quality: DEFAULT_QUALITY,
    pattern: DEFAULT_PATTERN,
    quiet: false,
    json: false,
    dryRun: false,
    parallel: null,
    showVersion: false,
    update: false,
    forceUpdate: false,
  };

  const resolutionKeys = Object.keys(RESOLUTIONS);
  const formatOptions = ["png", "webp", "jpg"];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--override") {
      result.override = true;
    } else if (arg === "--quiet") {
      result.quiet = true;
    } else if (arg === "--json") {
      result.json = true;
    } else if (arg === "--dry-run") {
      result.dryRun = true;
    } else if (arg === "--version" || arg === "-v") {
      result.showVersion = true;
    } else if (arg === "update") {
      result.update = true;
    } else if (arg === "--force" || arg === "-f") {
      result.forceUpdate = true;
    } else if (arg === "--parallel" && i + 1 < args.length) {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val) && val > 0) result.parallel = val;
    } else if (arg === "--output-dir" && i + 1 < args.length) {
      result.outputDir = args[++i];
    } else if (arg === "--format" && i + 1 < args.length) {
      const fmt = args[++i].toLowerCase();
      if (formatOptions.includes(fmt)) result.format = fmt;
    } else if (arg === "--quality" && i + 1 < args.length) {
      const q = parseInt(args[++i], 10);
      if (!isNaN(q) && q >= 0 && q <= 100) result.quality = q;
    } else if (arg === "--pattern" && i + 1 < args.length) {
      result.pattern = args[++i];
    } else if (arg.startsWith("-")) {
      // Unknown flag, ignore
    } else if (resolutionKeys.includes(arg.toLowerCase())) {
      result.resolution = arg.toLowerCase();
    } else {
      result.inputs.push(arg);
    }
  }

  return result;
}

async function expandGlob(pattern: string): Promise<string[]> {
  const { globSync } = await import("tinyglobby");
  const matches = globSync(pattern, { absolute: false });
  return matches.filter((f: string) => f.endsWith(".md"));
}

function getOutputDir(mdPath: string, outputDir: string | null): string {
  const mdDir = path.dirname(path.resolve(mdPath));
  const mdBasename = path.basename(mdPath, ".md");
  return outputDir ? path.join(outputDir, mdBasename) : path.join(mdDir, mdBasename);
}

function applyPattern(pattern: string, name: string, n: number): string {
  return pattern
    .replace(/{name}/g, name)
    .replace(/{n}/g, n.toString())
    .replace(/{n2}/g, n.toString().padStart(2, "0"))
    .replace(/{n3}/g, n.toString().padStart(3, "0"))
    .replace(/{n4}/g, n.toString().padStart(4, "0"));
}

async function selectResolution(): Promise<string> {
  const { select } = await import("@clack/prompts");

  const options = Object.entries(RESOLUTIONS).map(([key, res]) => ({
    value: key,
    label: `${key.toUpperCase()} (${res.width}x${res.height})`,
  }));

  const selected = await select({
    message: "Select resolution:",
    options,
    initialValue: DEFAULT_RESOLUTION,
  });

  return selected as string;
}

async function selectFilesToOverride(files: string[]): Promise<Set<string>> {
  const { multiselect } = await import("@clack/prompts");

  const options = files.map((file) => ({
    value: file,
    label: file,
    hint: "Override",
  }));

  const selected = await multiselect({
    message: "Select files to override:",
    options,
    required: false,
  });

  return new Set((selected as string[]) || []);
}

async function fetchLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const url = new URL(GITHUB_API_URL);
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: "GET",
        headers: {
          "User-Agent": "marp-slides",
          "Accept": "application/vnd.github.v3+json",
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const release: GitHubRelease = JSON.parse(data);
            resolve(release.tag_name.replace(/^v/, ""));
          } catch {
            resolve(null);
          }
        });
      });

      req.on("error", () => resolve(null));
      req.end();
    } catch {
      resolve(null);
    }
  });
}

async function downloadFile(url: string, destPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const file = fs.createWriteStream(destPath);
      https.get(url, { headers: { "User-Agent": "marp-slides" } }, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            downloadFile(redirectUrl, destPath).then(resolve);
            return;
          }
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve(true);
        });
      }).on("error", () => {
        fs.unlinkSync(destPath);
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

async function performUpdate(force: boolean): Promise<void> {
  console.log("Checking for updates...");

  const latestVersion = await fetchLatestVersion();
  if (!latestVersion) {
    logError("Could not fetch latest version. Are you connected to the internet?");
    process.exit(1);
  }

  const currentClean = VERSION.replace(/-.*$/, "");
  const latestClean = latestVersion.replace(/-.*$/, "");

  if (!force && latestClean === currentClean) {
    console.log(`You're already on the latest version: v${VERSION}`);
    return;
  }

  console.log(`Updating from v${VERSION} to v${latestVersion}...`);

  const tempPath = path.join(os.tmpdir(), `marp-slides-${Date.now()}`);
  const success = await downloadFile(DOWNLOAD_URL, tempPath);

  if (!success) {
    logError("Download failed. Please try again later.");
    fs.unlinkSync(tempPath);
    process.exit(1);
  }

  fs.chmodSync(tempPath, 0o755);

  const currentScriptPath = Bun.argv[1] || import.meta.filename;
  if (currentScriptPath && fs.existsSync(currentScriptPath)) {
    fs.copyFileSync(tempPath, currentScriptPath);
    fs.unlinkSync(tempPath);
    console.log(`Updated successfully! New version: v${latestVersion}`);
  } else {
    logError("Could not determine script location for update.");
    fs.unlinkSync(tempPath);
    process.exit(1);
  }
}

async function processFile(
  mdPath: string,
  args: CliArgs,
  resolution: string,
  quiet: boolean
): Promise<FileResult> {
  const mdBasename = path.basename(mdPath, ".md");
  const outputDir = getOutputDir(mdPath, args.outputDir);

  if (args.dryRun) {
    log(`  [DRY-RUN] Would create: ${outputDir}/`);
    return {
      input: mdPath,
      outputDir,
      slides: 0,
      images: [],
      status: "dry-run",
    };
  }

  const tempBase = `__temp_slides_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const mdDir = path.dirname(mdPath);

  const scale = RESOLUTIONS[resolution].scale;
  const formatArgs: string[] = [];

  if (args.format !== "png") {
    formatArgs.push("--image-format", args.format);
  }

  if ((args.format === "webp" || args.format === "jpg") && args.quality !== 90) {
    formatArgs.push("--image-quality", args.quality.toString());
  }

  const marpArgs = [
    "npx", "--yes", "@marp-team/marp-cli@latest",
    mdPath,
    "--images", "png",
    "--allow-local-files",
    "--image-scale", scale.toString(),
    ...formatArgs,
    "-o", tempBase,
  ];

  const marpProcess = Bun.spawn(marpArgs, {
    cwd: mdDir,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [marpOutput, marpError, exitCode] = await Promise.all([
    new Response(marpProcess.stdout).text(),
    new Response(marpProcess.stderr).text(),
    marpProcess.exited,
  ]);

  if (exitCode !== 0) {
    logError(`Error rendering ${mdPath}`);
    logError(`Exit code: ${exitCode}`);
    logError(marpOutput);
    logError(marpError);
    const cleanupFiles = fs.readdirSync(mdDir)
      .filter((f) => f.startsWith(tempBase + ".") && /^\d+$/.test(f.split(".").pop() || ""));
    for (const file of cleanupFiles) {
      fs.unlinkSync(path.join(mdDir, file));
    }
    return {
      input: mdPath,
      outputDir,
      slides: 0,
      images: [],
      status: "failed",
      error: "Marp CLI failed",
    };
  }

  const tempFiles = fs.readdirSync(mdDir)
    .filter((f) => f.startsWith(tempBase + ".") && /^\d+$/.test(f.split(".").pop() || ""))
    .sort((a, b) => {
      const numA = parseInt(a.split(".").pop() || "0", 10);
      const numB = parseInt(b.split(".").pop() || "0", 10);
      return numA - numB;
    });

  fs.mkdirSync(outputDir, { recursive: true });

  const images: string[] = [];
  let n = 1;
  for (const file of tempFiles) {
    const newName = applyPattern(args.pattern, mdBasename, n) + ".png";
    const srcPath = path.join(mdDir, file);
    const destPath = path.join(outputDir, newName);
    fs.renameSync(srcPath, destPath);
    images.push(newName);
    n++;
  }

  fs.rmSync(path.join(mdDir, tempBase), { recursive: true, force: true });

  log(`  Created ${images.length} slides in: ${outputDir}`, quiet);

  return {
    input: mdPath,
    outputDir,
    slides: images.length,
    images,
    status: "success",
  };
}

async function main() {
  const args = parseArgs();

  if (args.showVersion) {
    console.log(`marp-slides v${VERSION}`);
    return;
  }

  if (args.update) {
    await performUpdate(args.forceUpdate);
    return;
  }

  if (args.inputs.length === 0) {
    console.error("Usage: marp-slides <input...> [resolution] [options]");
    console.error("       marp-slides update [--force]");
    console.error("");
    console.error("Commands:");
    console.error("  update [--force]     Check for updates and install latest version");
    console.error("");
    console.error("Arguments:");
    console.error("  <input...>              .md files or glob patterns (e.g., *.md, ./slides/**/*.md)");
    console.error("  [resolution]            hd, fhd, 2k, 4k, 5k (default: 2k or interactive)");
    console.error("");
    console.error("Options:");
    console.error("  --override              Skip confirmation and override existing folders");
    console.error("  --output-dir <path>     Custom output base directory");
    console.error("  --format <fmt>          png, webp, jpg (default: png)");
    console.error("  --quality <n>          Image quality 0-100 for webp/jpg (default: 90)");
    console.error("  --pattern <pattern>    Filename pattern (default: {name}.{n3})");
    console.error("  --parallel <n>         Number of parallel workers (default: auto)");
    console.error("  --quiet                 Suppress progress output");
    console.error("  --json                 Output machine-readable JSON");
    console.error("  --dry-run              Preview without rendering");
    console.error("  --version, -v          Show version information");
    console.error("");
    console.error("Pattern variables: {name}, {n}, {n2}, {n3}, {n4}");
    process.exit(1);
  }

  const allFiles: string[] = [];
  for (const input of args.inputs) {
    const files = await expandGlob(input);
    for (const file of files) {
      if (!allFiles.includes(file)) allFiles.push(file);
    }
  }

  if (allFiles.length === 0) {
    logError("Error: No .md files found");
    process.exit(1);
  }

  const validFiles: string[] = [];
  const missingFiles: string[] = [];
  for (const file of allFiles) {
    if (fs.existsSync(file)) {
      validFiles.push(file);
    } else {
      missingFiles.push(file);
    }
  }

  if (validFiles.length === 0) {
    logError("Error: No valid .md files found");
    process.exit(1);
  }

  if (missingFiles.length > 0 && !args.quiet) {
    log(`Warning: ${missingFiles.length} file(s) not found, skipping`);
  }

  const existingFolders = validFiles.filter((f) => {
    const outputDir = getOutputDir(f, args.outputDir);
    return fs.existsSync(outputDir);
  });

  const filesToProcess = validFiles.filter((f) => !existingFolders.includes(f));

  if (existingFolders.length > 0 && !args.override && !args.dryRun) {
    if (existingFolders.length === validFiles.length) {
      logError("Error: All output folders exist. Use --override to overwrite.");
      process.exit(1);
    }

    const toOverride = await selectFilesToOverride(existingFolders);
    for (const f of existingFolders) {
      if (toOverride.has(f)) {
        filesToProcess.push(f);
      }
    }
  } else if (args.override) {
    filesToProcess.push(...existingFolders);
  }

  if (filesToProcess.length === 0) {
    log("Nothing to process (all files skipped).");
    process.exit(0);
  }

  let resolution = args.resolution;
  if (!resolution) {
    resolution = await selectResolution();
  }

  if (!RESOLUTIONS[resolution]) {
    logError(`Invalid resolution: ${resolution}`);
    process.exit(1);
  }

  const resInfo = RESOLUTIONS[resolution];

  if (!args.json) {
    log("\n=== Marp Slides ===");
    log(`Version: ${VERSION}`);
    log(`Files: ${filesToProcess.length}`);
    log(`Resolution: ${resolution.toUpperCase()} (${resInfo.width}x${resInfo.height})`);
    log(`Format: ${args.format}${args.format !== "png" ? ` @ ${args.quality}%` : ""}`);
    log(`Pattern: ${args.pattern}`);
    log("");
  }

  const cpuCount = os.cpus().length;
  const defaultParallelism = Math.max(1, Math.floor(cpuCount * DEFAULT_PARALLELISM_RATIO));
  const maxParallel = args.parallel ?? defaultParallelism;
  const parallelism = Math.min(maxParallel, filesToProcess.length);

  if (!args.json) {
    log(`Parallelism: ${parallelism}/${cpuCount} cores`);
    log("");
  }

  const results: FileResult[] = [];
  let totalSlides = 0;

  if (args.dryRun) {
    log("Files to process:");
    for (const file of filesToProcess) {
      const mdBasename = path.basename(file, ".md");
      const outputDir = getOutputDir(file, args.outputDir);
      const patternExample = applyPattern(args.pattern, mdBasename, 1) + ".png";
      log(`  ${file}`);
      log(`    → ${outputDir}/${patternExample}`);
    }
  } else {
    for (let i = 0; i < filesToProcess.length; i += parallelism) {
      const batch = filesToProcess.slice(i, i + parallelism);
      const batchResults = await Promise.all(
        batch.map((file) => processFile(file, args, resolution!, args.quiet))
      );
      for (const result of batchResults) {
        results.push(result);
        if (result.status === "success") totalSlides += result.slides;
      }
    }
  }

  const successCount = results.filter((r) => r.status === "success").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;
  const failedCount = results.filter((r) => r.status === "failed").length;

  if (args.json) {
    const jsonOutput: JsonOutput = {
      success: failedCount === 0 && skippedCount === 0,
      total: validFiles.length,
      processed: successCount,
      skipped: skippedCount,
      failed: failedCount,
      slides: totalSlides,
      outputs: results,
      errors: results.filter((r) => r.error).map((r) => `${r.input}: ${r.error}`),
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
  } else {
    log("\n=== Summary ===");
    log(`Processed: ${successCount}`);
    log(`Skipped: ${skippedCount}`);
    log(`Failed: ${failedCount}`);
    log(`Total slides: ${totalSlides}`);
  }

  if (args.dryRun) process.exit(2);
  if (failedCount > 0) process.exit(3);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
