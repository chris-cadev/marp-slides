#!/usr/bin/env bun

import { run as runImage, parseArgs as parseImageArgs, printHelp as printImageHelp } from "./commands/image.ts";
import { run as runVideo, parseArgs as parseVideoArgs, printHelp as printVideoHelp } from "./commands/video.ts";

const VERSION = "0.2.3";

function printMainHelp() {
  console.log(`marp-slides v${VERSION}`);
  console.log("");
  console.log("Usage: marp-slides <command> [options]");
  console.log("");
  console.log("Commands:");
  console.log("  image                   Export slides as PNG images");
  console.log("  video                   Export slides as MP4 video with animations");
  console.log("");
  console.log("Options:");
  console.log("  --help, -h              Show this help");
  console.log("  --version, -v           Show version");
  console.log("");
  console.log("Examples:");
  console.log("  marp-slides image presentation.md");
  console.log("  marp-slides image \"*.md\" 2k");
  console.log("  marp-slides video presentation.md --slide 1 --duration 5");
  console.log("");
  console.log("Run 'marp-slides <command> --help' for more options on a specific command.");
}

async function main() {
  const args = Bun.argv.slice(2);

  if (args.length === 0) {
    printMainHelp();
    process.exit(0);
  }

  const command = args[0];

  if (command === "--help" || command === "-h") {
    printMainHelp();
    process.exit(0);
  }

  if (command === "--version" || command === "-v") {
    console.log(`marp-slides v${VERSION}`);
    process.exit(0);
  }

  if (command === "image") {
    await runImage(args.slice(1));
  } else if (command === "video") {
    await runVideo(args.slice(1));
  } else if (command === "help") {
    const subCommand = args[1];
    if (subCommand === "image" || !subCommand) {
      printImageHelp();
    } else if (subCommand === "video") {
      printVideoHelp();
    } else {
      console.error(`Unknown command: ${subCommand}`);
      console.error("Available commands: image, video");
      process.exit(1);
    }
  } else {
    console.error(`Unknown command: ${command}`);
    console.error("Run 'marp-slides --help' for usage.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
