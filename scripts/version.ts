#!/usr/bin/env bun

import * as fs from "fs";
import * as path from "path";

export interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
  prereleaseNum: number | null;
}

export function parseVersion(version: string): Version {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.?(\d+))?$/);
  if (!match) {
    throw new Error(`Invalid version format: ${version}`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
    prereleaseNum: match[5] ? parseInt(match[5], 10) : null,
  };
}

export function formatVersion(version: Version): string {
  let result = `${version.major}.${version.minor}.${version.patch}`;
  if (version.prerelease && version.prereleaseNum !== null) {
    result += `-${version.prerelease}.${version.prereleaseNum}`;
  } else if (version.prerelease) {
    result += `-${version.prerelease}`;
  }
  return result;
}

export function incrementVersion(version: string, type: "major" | "minor" | "patch", prerelease?: string): Version {
  const v = parseVersion(version);

  if (prerelease) {
    if (v.prerelease === prerelease && v.prereleaseNum !== null) {
      v.prereleaseNum++;
    } else {
      v.prerelease = prerelease;
      v.prereleaseNum = 1;
    }
  } else {
    v.prerelease = null;
    v.prereleaseNum = null;
    switch (type) {
      case "major":
        v.major++;
        v.minor = 0;
        v.patch = 0;
        break;
      case "minor":
        v.minor++;
        v.patch = 0;
        break;
      case "patch":
        v.patch++;
        break;
    }
  }

  return v;
}

export function getCurrentVersion(): string {
  const packageJson = path.join(process.cwd(), "package.json");
  const content = fs.readFileSync(packageJson, "utf-8");
  const data = JSON.parse(content);
  return data.version;
}

export function updateVersion(newVersion: string): void {
  const rootDir = process.cwd();

  const packageJsonPath = path.join(rootDir, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");

  const jsrJsonPath = path.join(rootDir, "jsr.json");
  const jsrJson = JSON.parse(fs.readFileSync(jsrJsonPath, "utf-8"));
  jsrJson.version = newVersion;
  fs.writeFileSync(jsrJsonPath, JSON.stringify(jsrJson, null, 2) + "\n");

  const cliPath = path.join(rootDir, "cli.ts");
  if (fs.existsSync(cliPath)) {
    let cliContent = fs.readFileSync(cliPath, "utf-8");
    cliContent = cliContent.replace(
      /const VERSION = "[^"]+";/,
      `const VERSION = "${newVersion}";`
    );
    fs.writeFileSync(cliPath, cliContent);
  }

  const readmePath = path.join(rootDir, "README.md");
  if (fs.existsSync(readmePath)) {
    let readmeContent = fs.readFileSync(readmePath, "utf-8");
    readmeContent = readmeContent.replace(
      /(\/img\.shields\.io\/npm\/v\/marp-slides)\.svg/,
      `$1@${newVersion}.svg`
    );
    readmeContent = readmeContent.replace(
      /(jsr\.io\/badges\/v\/@davinci\/marp-slides)\.svg/,
      `$1@${newVersion}.svg`
    );
    fs.writeFileSync(readmePath, readmeContent);
  }
}
