#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_FILESETS = {
  codex: ["AGENTS.md", "references", "templates", "examples"],
  claude: ["SKILL.md", "AGENTS.md", "references", "templates", "examples"],
  cursor: [".cursor", "AGENTS.md", "references", "templates", "examples"],
  windsurf: [".windsurfrules", "AGENTS.md", "references", "templates", "examples"],
  all: [
    "SKILL.md",
    "AGENTS.md",
    ".cursor",
    ".windsurfrules",
    "references",
    "templates",
    "examples"
  ]
};

function usage() {
  console.log(`zama-fhevm-skill installer

Usage:
  npx zama-fhevm-skill@latest --tool <tool> [--target <path>] [--force] [--dry-run]

Options:
  --tool       One of: codex, claude, cursor, windsurf, all
  --target     Target directory (default: current working directory)
  --force      Overwrite existing files/directories
  --dry-run    Print actions without writing files
  --help       Show this help message

Examples:
  npx zama-fhevm-skill@latest --tool codex
  npx zama-fhevm-skill@latest --tool cursor --target ./my-project
  npx zama-fhevm-skill@latest --tool all --force
`);
}

function parseArgs(argv) {
  const out = {
    tool: null,
    target: process.cwd(),
    force: false,
    dryRun: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--force") {
      out.force = true;
      continue;
    }
    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (arg === "--tool") {
      out.tool = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--target") {
      const next = argv[i + 1] ?? null;
      if (next) {
        out.target = path.resolve(next);
      }
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function ensureDir(dir, dryRun) {
  if (dryRun) return;
  fs.mkdirSync(dir, { recursive: true });
}

function copyEntry(srcRoot, targetRoot, relPath, options) {
  const src = path.join(srcRoot, relPath);
  const dest = path.join(targetRoot, relPath);

  if (!fs.existsSync(src)) {
    throw new Error(`Missing source path in package: ${relPath}`);
  }

  const exists = fs.existsSync(dest);
  if (exists && !options.force) {
    throw new Error(`Refusing to overwrite existing path: ${dest} (use --force)`);
  }

  console.log(`${options.dryRun ? "[dry-run] " : ""}copy ${relPath} -> ${dest}`);
  if (options.dryRun) return;

  ensureDir(path.dirname(dest), false);
  fs.cpSync(src, dest, {
    recursive: true,
    force: options.force,
    errorOnExist: !options.force
  });
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    usage();
    process.exit(1);
  }

  if (opts.help) {
    usage();
    return;
  }

  if (!opts.tool || !TOOL_FILESETS[opts.tool]) {
    console.error("Error: --tool is required and must be one of codex, claude, cursor, windsurf, all.");
    usage();
    process.exit(1);
  }

  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const targetRoot = path.resolve(opts.target);

  ensureDir(targetRoot, opts.dryRun);
  console.log(`Installing zama-fhevm-skill for tool="${opts.tool}" into ${targetRoot}`);

  const entries = TOOL_FILESETS[opts.tool];
  for (const relPath of entries) {
    copyEntry(packageRoot, targetRoot, relPath, opts);
  }

  console.log("Install complete.");
}

main();
