#!/usr/bin/env bun

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getCurrentVersion, formatVersion, incrementVersion, updateVersion } from "./version.ts";

interface ReleaseArgs {
  type: "major" | "minor" | "patch";
  prerelease: string | null;
  dryRun: boolean;
  customVersion: string | null;
}

function parseArgs(): ReleaseArgs {
  const args = Bun.argv.slice(2);
  const result: ReleaseArgs = {
    type: "patch",
    prerelease: null,
    dryRun: false,
    customVersion: null,
  };

  for (const arg of args) {
    if (arg === "--dry-run" || arg === "-n") {
      result.dryRun = true;
    } else if (arg === "major") {
      result.type = "major";
    } else if (arg === "minor") {
      result.type = "minor";
    } else if (arg === "patch") {
      result.type = "patch";
    } else if (arg === "--pre" && args[args.indexOf(arg) + 1]) {
      result.prerelease = args[args.indexOf(arg) + 1];
    } else if (arg.startsWith("--set=")) {
      result.customVersion = arg.replace("--set=", "");
    } else if (arg.match(/^\d+\.\d+\.\d+/)) {
      result.customVersion = arg;
    }
  }

  return result;
}

async function runCommand(cmd: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: cwd || process.cwd(),
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code || 0 });
    });
  });
}

async function gitAdd(files: string[]): Promise<void> {
  await runCommand("git", ["add", ...files]);
}

async function gitCommit(message: string): Promise<void> {
  await runCommand("git", ["commit", "-m", message]);
}

async function gitTag(tag: string): Promise<void> {
  await runCommand("git", ["tag", tag]);
}

function log(message: string, color = "reset") {
  const colors: Record<string, string> = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
  };
  console.log(`${colors[color] || colors.reset}${message}${colors.reset}`);
}

function logError(message: string) {
  console.error(`\x1b[31mError: ${message}\x1b[0m`);
}

async function main() {
  const args = parseArgs();
  const currentVersion = getCurrentVersion();

  log("\n=== Release Script ===\n", "cyan");
  log(`Current version: ${currentVersion}`);

  let newVersion: string;

  if (args.customVersion) {
    newVersion = args.customVersion;
  } else {
    const newVer = incrementVersion(currentVersion, args.type, args.prerelease || undefined);
    newVersion = formatVersion(newVer);
  }

  log(`New version: ${newVersion}`, "green");

  if (args.dryRun) {
    log("\n[DRY RUN] No changes made.", "yellow");
    log("To release, run without --dry-run", "yellow");
    process.exit(0);
  }

  log("\nUpdating version in all files...", "blue");

  try {
    updateVersion(newVersion);
    log("Version updated successfully!", "green");
  } catch (error) {
    logError(`Failed to update version: ${error}`);
    process.exit(1);
  }

  const files = ["package.json", "jsr.json", "marp-slides.ts", "README.md"];
  log("\nStaging files...", "blue");
  await gitAdd(files);

  const tag = `v${newVersion}`;
  const commitMessage = `release: ${tag}`;

  log("\nCreating commit...", "blue");
  await gitCommit(commitMessage);
  log(`Commit created: ${commitMessage}`, "green");

  log("\nCreating tag...", "blue");
  await gitTag(tag);
  log(`Tag created: ${tag}`, "green");

  log("\n=== Release Summary ===\n", "cyan");
  log(`Version: ${currentVersion} → ${newVersion}`, "green");
  log(`Tag: ${tag}`, "green");
  log("", "reset");
  log("Next steps:", "yellow");
  log("  1. Review the changes: git log --oneline -3", "reset");
  log("  2. Push changes and tags:", "reset");
  log("     git push && git push --tags", "reset");
  log("  3. GitHub Actions will publish to:", "reset");
  log("     - npm (latest tag)", "reset");
  log("     - JSR", "reset");
  log("     - GitHub Releases", "reset");
  log("", "reset");
}

main().catch((err) => {
  logError(`Fatal error: ${err}`);
  process.exit(1);
});
