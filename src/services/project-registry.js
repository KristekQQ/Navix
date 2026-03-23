"use strict";

const { createConfigStore } = require("../storage/config-store");
const {
  canonicalizeAlias,
  ensureValidAlias,
  ensureValidWebPath,
  resolveProjectPath,
  toStoredProjectPath,
  ensureDirectoryPath,
  isGitProjectDirectory,
  pathExists,
  ensureValidTargetUrl,
} = require("./path-utils");
const { AppError } = require("../errors/app-error");

function createProjectRegistry() {
  const store = createConfigStore();

  function toRuntimeProject(project) {
    const resolvedPath = project.path ? resolveProjectPath(project.path, store.getBaseDir()) : null;

    return {
      alias: project.alias,
      path: resolvedPath,
      configPath: project.path || null,
      isGitRepo: resolvedPath ? isGitProjectDirectory(resolvedPath) : false,
      webPath: project.webPath || null,
      webTarget: project.webTarget || null,
    };
  }

  function addProject(alias, inputPath) {
    ensureValidAlias(alias);

    const config = store.loadConfig();
    const key = canonicalizeAlias(alias);
    if (config.projects[key]) {
      throw new AppError(`Alias '${alias}' already exists.`);
    }

    const resolvedPath = resolveProjectPath(inputPath, store.getBaseDir());
    ensureDirectoryPath(resolvedPath);

    const project = {
      alias: alias.trim(),
      path: toStoredProjectPath(inputPath, resolvedPath, store.getBaseDir()),
    };

    config.projects[key] = project;
    store.saveConfig(config);

    return toRuntimeProject(project);
  }

  function addWebProject(alias, webPath, targetUrl, inputPath) {
    ensureValidAlias(alias);
    ensureValidWebPath(webPath);
    const normalizedTargetUrl = ensureValidTargetUrl(targetUrl);

    const config = store.loadConfig();
    const key = canonicalizeAlias(alias);
    if (config.projects[key]) {
      throw new AppError(`Alias '${alias}' already exists.`);
    }

    const project = {
      alias: alias.trim(),
      webPath: webPath.trim().toLowerCase(),
      webTarget: normalizedTargetUrl,
    };

    if (inputPath) {
      const resolvedPath = resolveProjectPath(inputPath, store.getBaseDir());
      ensureDirectoryPath(resolvedPath);
      project.path = toStoredProjectPath(inputPath, resolvedPath, store.getBaseDir());
    }

    ensureWebPathAvailable(config, project.webPath);
    config.projects[key] = project;
    store.saveConfig(config);

    return toRuntimeProject(project);
  }

  function listProjects() {
    const config = store.loadConfig();
    return Object.values(config.projects)
      .map((project) => {
        try {
          const runtimeProject = toRuntimeProject(project);
          return {
            ...runtimeProject,
            status: runtimeProject.path ? "ok" : "web-only",
          };
        } catch {
          return {
            alias: project.alias,
            path: project.path || null,
            configPath: project.path || null,
            isGitRepo: false,
            webPath: project.webPath || null,
            webTarget: project.webTarget || null,
            status: project.path ? "missing" : "web-only",
          };
        }
      })
      .sort((left, right) => left.alias.localeCompare(right.alias));
  }

  function getProject(alias) {
    ensureValidAlias(alias);

    const config = store.loadConfig();
    const project = config.projects[canonicalizeAlias(alias)];
    if (!project) {
      throw new AppError(`Project '${alias}' was not found.`);
    }

    const runtimeProject = toRuntimeProject(project);
    if (!runtimeProject.path) {
      throw new AppError(`Project '${project.alias}' has no local path configured.`);
    }

    if (!pathExists(runtimeProject.path)) {
      throw new AppError(`Project '${project.alias}' points to a missing path: ${runtimeProject.path}`);
    }

    return runtimeProject;
  }

  function setWebRoute(alias, webPath, targetUrl) {
    ensureValidAlias(alias);
    ensureValidWebPath(webPath);
    const normalizedTargetUrl = ensureValidTargetUrl(targetUrl);

    const config = store.loadConfig();
    const key = canonicalizeAlias(alias);
    const project = config.projects[key];
    if (!project) {
      throw new AppError(`Project '${alias}' was not found.`);
    }

    ensureWebPathAvailable(config, webPath, project.alias);

    project.webPath = webPath.trim().toLowerCase();
    project.webTarget = normalizedTargetUrl;
    store.saveConfig(config);
    return toRuntimeProject(project);
  }

  function listWebProjects() {
    return listProjects().filter((project) => project.webPath && project.webTarget);
  }

  return {
    addProject,
    addWebProject,
    listProjects,
    getProject,
    getConfigPath: () => store.getPreferredConfigPath(),
    setWebRoute,
    listWebProjects,
  };
}

function ensureWebPathAvailable(config, webPath, currentAlias) {
  const webPathKey = canonicalizeAlias(webPath);

  for (const entry of Object.values(config.projects)) {
    if (!entry.webPath) {
      continue;
    }

    const isCurrentEntry = currentAlias && canonicalizeAlias(entry.alias) === canonicalizeAlias(currentAlias);
    if (!isCurrentEntry && canonicalizeAlias(entry.webPath) === webPathKey) {
      throw new AppError(`Web path '${webPath}' is already used by project '${entry.alias}'.`);
    }
  }
}

module.exports = {
  createProjectRegistry,
};
