#!/usr/bin/env bun

import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";

const REPO_OWNER = "chris-cadev";
const REPO_NAME = "marp-slides";
const WINGET_PKGS = "microsoft/winget-pkgs";

interface CliArgs {
  version: string | null;
  force: boolean;
}

function log(message: string) {
  console.log(message);
}

function logError(message: string) {
  console.error(`\x1b[31mError: ${message}\x1b[0m`);
}

function logSuccess(message: string) {
  console.log(`\x1b[32m${message}\x1b[0m`);
}

function logInfo(message: string) {
  console.log(`\x1b[36m${message}\x1b[0m`);
}

function parseArgs(): CliArgs {
  const args = Bun.argv.slice(2);
  const result: CliArgs = {
    version: null,
    force: false,
  };

  for (const arg of args) {
    if (arg === "--force" || arg === "-f") {
      result.force = true;
    } else if (arg.startsWith("v")) {
      result.version = arg.replace(/^v/, "");
    } else if (!result.version) {
      result.version = arg;
    }
  }

  return result;
}

function getScriptPath(): string {
  return path.resolve(Bun.argv[1] || import.meta.filename);
}

async function getLocalVersion(): Promise<string> {
  const packageJson = path.join(path.dirname(getScriptPath()), "..", "package.json");
  const content = await Bun.file(packageJson).text();
  const data = JSON.parse(content);
  return data.version || "";
}

async function calculateSha256(filePath: string): Promise<string> {
  const content = await Bun.file(filePath).arrayBuffer();
  const hash = crypto.createHash("sha256").update(new Uint8Array(content)).digest("hex");
  return hash.toUpperCase();
}

function createWingetManifest(version: string, sha256: string, url: string): string {
  return `PackageIdentifier: MarpSlides
PackageVersion: "${version}"
Publisher: ${REPO_OWNER}
PackageName: ${REPO_NAME}
PackageDescription: Export Marp presentations to PNG images with batch support
License: MIT
LicenseUrl: https://github.com/${REPO_OWNER}/${REPO_NAME}/blob/main/LICENSE
ProjectUrl: https://github.com/${REPO_OWNER}/${REPO_NAME}
Agreement: 
  LicenseUrl: https://github.com/${REPO_OWNER}/${REPO_NAME}/blob/main/LICENSE
  AgreementLabel: MIT License
ShortDescription: Export Marp presentations to PNG images
Homepage: https://github.com/${REPO_OWNER}/${REPO_NAME}
Tags:
  - marp
  - presentation
  - slides
  - png
  - export
Installers:
  - Architecture: x64
    InstallerType: portable
    InstallerUrl: ${url}
    InstallerSha256: ${sha256}
    Commands:
      - ${REPO_NAME}
ManifestType: singleton
ManifestVersion: 1.9.0
`;
}

async function createPullRequest(
  branchName: string,
  version: string,
  sha256: string,
  url: string
): Promise<string> {
  logInfo(`Creating pull request to ${WINGET_PKGS}...`);

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "winget-"));
  const manifestDir = path.join(tempDir, "manifests", "m", "MarpSlides");
  const manifestPath = path.join(manifestDir, `${version}.yaml`);

  await fs.promises.mkdir(manifestDir, { recursive: true });

  const manifest = createWingetManifest(version, sha256, url);
  await fs.promises.writeFile(manifestPath, manifest);

  const localPath = path.join(tempDir, "winget-pkgs");
  await fs.promises.mkdir(localPath, { recursive: true });

  logInfo("Cloning forked repository...");
  const cloneResult = await Bun.spawn({
    cmd: ["git", "clone", `--depth=1`, `https://github.com/${REPO_OWNER}/winget-pkgs.git`, localPath],
    cwd: tempDir,
  });
  await cloneResult.exited;

  const destManifestDir = path.join(localPath, "manifests", "m", "MarpSlides");
  await fs.promises.mkdir(destManifestDir, { recursive: true });
  await fs.promises.cp(manifestPath, path.join(destManifestDir, `${version}.yaml`));

  const addResult = await Bun.spawn({
    cmd: ["git", "add", "manifests"],
    cwd: localPath,
  });
  await addResult.exited;

  const commitResult = await Bun.spawn({
    cmd: ["git", "commit", "-m", `Add ${REPO_NAME} ${version}`],
    cwd: localPath,
    env: { GIT_AUTHOR_NAME: "github-actions[bot]", GIT_AUTHOR_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com", GIT_COMMITTER_NAME: "github-actions[bot]", GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com" },
  });
  await commitResult.exited;

  logInfo("Pushing branch to fork...");
  const pushResult = await Bun.spawn({
    cmd: ["git", "push", "-u", "origin", branchName],
    cwd: localPath,
    env: { GH_TOKEN: process.env.GH_TOKEN || "" },
  });
  await pushResult.exited;

  if (pushResult.exitCode !== 0) {
    logError("Failed to push branch");
    process.exit(1);
  }

  logInfo("Creating pull request...");

  const prResult = await Bun.spawn({
    cmd: [
      "gh", "pr", "create",
      "--repo", WINGET_PKGS,
      "--base", "main",
      "--head", `${REPO_OWNER}:${branchName}`,
      "--title", `${REPO_NAME} ${version}`,
      "--body", `Created by \`cd/winget.ts\`

## Version: ${version}
SHA256: ${sha256}

Download from: https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/v${version}`,
    ],
  });

  await prResult.exited;

  if (prResult.exitCode !== 0) {
    logError("Failed to create pull request");
    process.exit(1);
  }

  await fs.promises.rm(tempDir, { recursive: true });

  return `https://github.com/${WINGET_PKGS}/pull/new/${branchName}`;
}

async function main() {
  const args = parseArgs();

  log("\n=== winget Submission Script ===\n");

  const version = args.version || await getLocalVersion();

  if (!version) {
    logError("Could not determine version. Please provide it as an argument:");
    logError("  bun run cd/winget.ts <version>");
    logError("  bun run cd/winget.ts 0.1.0");
    process.exit(1);
  }

  log(`Version: ${version}`);

  const releaseAssetUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/v${version}/${REPO_NAME}`;
  log(`Release URL: ${releaseAssetUrl}`);

  const downloadPath = path.join(os.tmpdir(), `marp-slides-${version}`);
  const scriptPath = path.join(downloadPath, REPO_NAME);

  if (fs.existsSync(downloadPath)) {
    logInfo(`Using cached download: ${downloadPath}`);
  } else {
    logInfo("Downloading release asset...");

    await fs.promises.mkdir(downloadPath, { recursive: true });

    const response = await fetch(releaseAssetUrl);
    if (!response.ok) {
      logError(`Failed to download: ${response.status} ${response.statusText}`);
      logError(`Make sure the release v${version} exists at:`);
      logError(`  https://github.com/${REPO_OWNER}/${REPO_NAME}/releases`);
      process.exit(1);
    }

    const arrayBuffer = await response.arrayBuffer();
    await Bun.write(scriptPath, arrayBuffer);
    await fs.promises.chmod(scriptPath, 0o755);

    logSuccess("Download complete!");
  }

  logInfo("Calculating SHA256...");
  const sha256 = await calculateSha256(scriptPath);
  log(`SHA256: ${sha256}`);

  const branchName = `${REPO_NAME.toLowerCase()}-${version}`;

  logInfo(`\nSubmitting to ${WINGET_PKGS}...`);
  logInfo(`Manifest: manifests/m/MarpSlides/${version}.yaml`);
  logInfo(`Branch: ${branchName}\n`);

  const prUrl = await createPullRequest(branchName, version, sha256, releaseAssetUrl);

  logSuccess("\n=== Success! ===");
  log(`Pull Request created: ${prUrl}`);
  log("\nNote: winget maintainers will verify and merge your PR.");
  log("This may take some time as automated checks need to pass.\n");

  await fs.promises.rm(downloadPath, { recursive: true });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
