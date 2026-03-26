#!/usr/bin/env bun

import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";

const REPO_OWNER = "chris-cadev";
const REPO_NAME = "marp-slides";
const HOMEBREW_CORE = "Homebrew/homebrew-core";

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
  return hash;
}

async function createHomebrewFormula(version: string, sha256: string): Promise<string> {
  return `class MarpSlides < Formula
  desc "Export Marp presentations to PNG images"
  homepage "https://github.com/${REPO_OWNER}/${REPO_NAME}"
  url "https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/v${version}/${REPO_NAME}"
  sha256 "${sha256}"
  license "MIT"
  version "${version}"

  depends_on "bun" => :recommended

  def install
    bin.install "${REPO_NAME}" => "${REPO_NAME}"
  end

  test do
    system "#{bin}/${REPO_NAME}", "--version"
  end
end
`;
}

async function checkExistingBranch(branchName: string): Promise<boolean> {
  const result = await Bun.spawn({
    cmd: ["gh", "api", `repos/${HOMEBREW_CORE}/branches/${branchName}`],
    method: "GET",
  });
  return result.status === 200;
}

async function forkRepository(): Promise<string> {
  logInfo("Forking Homebrew/homebrew-core...");

  const result = await Bun.spawn({
    cmd: ["gh", "repo", "fork", HOMEBREW_CORE, "--clone=false"],
    stdout: "inherit",
    stderr: "inherit",
  });

  await result.exited;

  if (result.exitCode !== 0) {
    logError("Failed to fork repository");
    process.exit(1);
  }

  logSuccess("Repository forked successfully!");
  return `${REPO_OWNER}/homebrew-core`;
}

async function createPullRequest(
  forkOwner: string,
  branchName: string,
  version: string,
  sha256: string
): Promise<string> {
  logInfo(`Creating pull request to ${HOMEBREW_CORE}...`);

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "homebrew-"));
  const formulaPath = path.join(tempDir, `${REPO_NAME}.rb`);

  const formula = await createHomebrewFormula(version, sha256);
  await fs.promises.writeFile(formulaPath, formula);

  const localPath = path.join(tempDir, "homebrew-core");
  await fs.promises.mkdir(localPath, { recursive: true });

  logInfo("Cloning forked repository...");
  const cloneResult = await Bun.spawn({
    cmd: ["git", "clone", `--depth=1`, `https://github.com/${forkOwner}/homebrew-core.git`, localPath],
    cwd: tempDir,
  });
  await cloneResult.exited;

  await fs.promises.cp(formulaPath, path.join(localPath, "Formula", `${REPO_NAME}.rb`));

  const addResult = await Bun.spawn({
    cmd: ["git", "add", "Formula"],
    cwd: localPath,
  });
  await addResult.exited;

  const commitResult = await Bun.spawn({
    cmd: ["git", "commit", "-m", `Create ${REPO_NAME} ${version}`],
    cwd: localPath,
    env: { GIT_AUTHOR_NAME: "github-actions[bot]", GIT_AUTHOR_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com", GIT_COMMITTER_NAME: "github-actions[bot]", GIT_COMMITTER_EMAIL: "41898282+github-actions[bot]@users.noreply.github.com" },
  });
  await commitResult.exited;

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
      "--repo", HOMEBREW_CORE,
      "--base", "master",
      "--head", `${forkOwner}:${branchName}`,
      "--title", `${REPO_NAME} ${version}`,
      "--body", `Created by \`cd/homebrew.ts\`

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

  return `https://github.com/${HOMEBREW_CORE}/pull/new/${branchName}`;
}

async function main() {
  const args = parseArgs();

  log("\n=== Homebrew Submission Script ===\n");

  const version = args.version || await getLocalVersion();

  if (!version) {
    logError("Could not determine version. Please provide it as an argument:");
    logError("  bun run cd/homebrew.ts <version>");
    logError("  bun run cd/homebrewbrew.ts v0.1.0");
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

  const branchName = `${REPO_NAME}-${version}`;

  logInfo(`\nSubmitting to Homebrew/homebrew-core...`);
  logInfo(`Formula: Formula/${REPO_NAME}.rb`);
  logInfo(`Branch: ${branchName}\n`);

  const forkOwner = REPO_OWNER;
  const prUrl = await createPullRequest(forkOwner, branchName, version, sha256);

  logSuccess("\n=== Success! ===");
  log(`Pull Request created: ${prUrl}`);
  log("\nNote: Homebrew maintainers will review and merge your PR.");
  log("This may take some time as they need to verify the formula.\n");

  await fs.promises.rm(downloadPath, { recursive: true });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
