#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const MAX_FILE_LINES = 500;
const CHECKED_EXTENSIONS = new Set([".py", ".ts", ".tsx"]);
const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  ".ruff_cache",
  ".turbo",
  ".venv",
  "build",
  "dist",
  "node_modules",
]);

const LEGACY_OVERSIZED_FILES = new Set([
  "apps/customer-android-api/tests/test_session_api.py",
  "apps/customer-android/App.tsx",
  "apps/worker/tests/test_task_api.py",
]);

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const oversizedFiles = [];
const staleLegacyFiles = [];

for (const filePath of walkFiles(repoRoot)) {
  if (!CHECKED_EXTENSIONS.has(path.extname(filePath))) {
    continue;
  }

  const relativePath = toRelativePath(filePath);
  const lineCount = countLines(filePath);

  if (lineCount > MAX_FILE_LINES) {
    if (!LEGACY_OVERSIZED_FILES.has(relativePath)) {
      oversizedFiles.push({ lineCount, path: relativePath });
    }
    continue;
  }

  if (LEGACY_OVERSIZED_FILES.has(relativePath)) {
    staleLegacyFiles.push({ lineCount, path: relativePath });
  }
}

for (const relativePath of LEGACY_OVERSIZED_FILES) {
  if (!fs.existsSync(path.join(repoRoot, relativePath))) {
    staleLegacyFiles.push({ lineCount: 0, path: relativePath });
  }
}

if (oversizedFiles.length > 0 || staleLegacyFiles.length > 0) {
  reportFailures();
  process.exitCode = 1;
}

function* walkFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORY_NAMES.has(entry.name)) {
        yield* walkFiles(path.join(directory, entry.name));
      }
      continue;
    }

    if (entry.isFile()) {
      yield path.join(directory, entry.name);
    }
  }
}

function countLines(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  if (content.length === 0) {
    return 0;
  }

  return content.endsWith("\n")
    ? content.split("\n").length - 1
    : content.split("\n").length;
}

function toRelativePath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function reportFailures() {
  console.error(
    `File line limit failed. Maximum allowed: ${MAX_FILE_LINES} lines for .ts, .tsx, and .py files.`
  );

  if (oversizedFiles.length > 0) {
    console.error("\nOversized files:");
    for (const file of oversizedFiles.sort(compareByPath)) {
      console.error(`- ${file.path}: ${file.lineCount} lines`);
    }
  }

  if (staleLegacyFiles.length > 0) {
    console.error("\nStale legacy oversized allowlist entries:");
    for (const file of staleLegacyFiles.sort(compareByPath)) {
      const suffix =
        file.lineCount === 0 ? "missing" : `${file.lineCount} lines`;
      console.error(`- ${file.path}: ${suffix}`);
    }
  }
}

function compareByPath(left, right) {
  return left.path.localeCompare(right.path);
}
