"use strict";

const fs = require("fs");
const path = require("path");
const { AppError } = require("../errors/app-error");

const ALIAS_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const WEB_PATH_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const RESERVED_ALIASES = new Set(["add", "add-web", "help", "list", "route", "run", "serve"]);

function ensureValidAlias(alias) {
  const normalized = String(alias || "").trim();
  if (!ALIAS_PATTERN.test(normalized)) {
    throw new AppError("Alias must match [A-Za-z0-9_-] and be 1 to 64 characters long.");
  }

  if (RESERVED_ALIASES.has(normalized.toLowerCase())) {
    throw new AppError(`Alias '${normalized}' is reserved.`);
  }
}

function canonicalizeAlias(alias) {
  return String(alias).trim().toLowerCase();
}

function ensureValidWebPath(webPath) {
  const normalized = String(webPath || "").trim().toLowerCase();
  if (!WEB_PATH_PATTERN.test(normalized)) {
    throw new AppError("Web path must match [A-Za-z0-9_-] and be 1 to 64 characters long.");
  }
}

function ensureValidTargetUrl(targetUrl) {
  let parsed;
  try {
    parsed = new URL(String(targetUrl || "").trim());
  } catch {
    throw new AppError("Target URL must be a valid absolute URL, for example http://127.0.0.1:4173");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new AppError("Target URL must use http or https.");
  }

  return parsed.toString().replace(/\/$/, "");
}

function resolveProjectPath(inputPath, baseDir = process.cwd()) {
  const normalized = String(inputPath || "").trim();
  if (!normalized) {
    throw new AppError("Project path is required.");
  }

  return fs.realpathSync.native(path.resolve(baseDir, normalized));
}

function toStoredProjectPath(inputPath, resolvedPath, baseDir = process.cwd()) {
  const normalized = String(inputPath || "").trim();
  if (path.isAbsolute(normalized)) {
    return resolvedPath;
  }

  const relativePath = path.relative(baseDir, resolvedPath) || ".";
  if (relativePath === ".") {
    return ".";
  }

  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function ensureDirectoryPath(projectPath) {
  if (!pathExists(projectPath)) {
    throw new AppError(`Path does not exist: ${projectPath}`);
  }

  const stat = fs.statSync(projectPath);
  if (!stat.isDirectory()) {
    throw new AppError(`Path is not a directory: ${projectPath}`);
  }
}

function isGitProjectDirectory(projectPath) {
  return pathExists(path.join(projectPath, ".git"));
}

function pathExists(targetPath) {
  return fs.existsSync(targetPath);
}

module.exports = {
  canonicalizeAlias,
  ensureValidAlias,
  ensureValidWebPath,
  ensureValidTargetUrl,
  resolveProjectPath,
  toStoredProjectPath,
  ensureDirectoryPath,
  isGitProjectDirectory,
  pathExists,
};
