"use strict";

const { AppError } = require("../errors/app-error");
const { canonicalizeAlias, ensureValidAlias, ensureValidTargetUrl, ensureValidWebPath } = require("../services/path-utils");

function createEmptyConfig() {
  return {
    version: 1,
    projects: {},
  };
}

function validateConfigShape(config, configPath) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new AppError(`Config at ${configPath} must be a JSON object.`);
  }

  if (config.version !== 1) {
    throw new AppError(`Unsupported config version in ${configPath}.`);
  }

  if (!config.projects || typeof config.projects !== "object" || Array.isArray(config.projects)) {
    throw new AppError(`Config at ${configPath} must contain an object 'projects'.`);
  }

  for (const [key, project] of Object.entries(config.projects)) {
    validateProjectShape(key, project, configPath);
  }
}

function validateProjectShape(key, project, configPath) {
  if (!project || typeof project !== "object" || Array.isArray(project)) {
    throw new AppError(`Project '${key}' in ${configPath} must be an object.`);
  }

  ensureValidAlias(project.alias);
  if (canonicalizeAlias(project.alias) !== key) {
    throw new AppError(`Project key '${key}' must match canonical alias '${canonicalizeAlias(project.alias)}'.`);
  }

  const hasPath = project.path !== undefined && project.path !== null && String(project.path).trim() !== "";
  const hasWebPath = project.webPath !== undefined && project.webPath !== null && String(project.webPath).trim() !== "";
  const hasWebTarget =
    project.webTarget !== undefined && project.webTarget !== null && String(project.webTarget).trim() !== "";

  if (!hasPath && !hasWebPath && !hasWebTarget) {
    throw new AppError(`Project '${project.alias}' in ${configPath} must define 'path' or a 'webPath' + 'webTarget' pair.`);
  }

  if (hasPath && (typeof project.path !== "string" || !project.path.trim())) {
    throw new AppError(`Project '${project.alias}' in ${configPath} must contain a non-empty string 'path'.`);
  }

  if (hasWebPath !== hasWebTarget) {
    throw new AppError(`Project '${project.alias}' in ${configPath} must define both 'webPath' and 'webTarget'.`);
  }

  if (hasWebPath) {
    ensureValidWebPath(project.webPath);
    ensureValidTargetUrl(project.webTarget);
  }
}

module.exports = {
  createEmptyConfig,
  validateConfigShape,
};
