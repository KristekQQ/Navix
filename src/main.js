"use strict";

const { parseArgv, formatHelp } = require("./cli/parse-argv");
const { printProjects, printMessage, printError } = require("./cli/output");
const { createProjectRegistry } = require("./services/project-registry");
const { runProjectCommand } = require("./services/command-runner");
const { startProxyServer } = require("./services/web-proxy");
const { AppError } = require("./errors/app-error");

async function runCli(argv) {
  try {
    const parsed = parseArgv(argv);
    const registry = createProjectRegistry();

    switch (parsed.command) {
      case "help":
        printMessage(formatHelp());
        return;
      case "add": {
        const project = registry.addProject(parsed.alias, parsed.projectPath);
        printMessage(
          `Project '${project.alias}' added at ${project.path}${project.isGitRepo ? "" : " (warning: no .git detected)"}\nConfig: ${registry.getConfigPath()}`
        );
        return;
      }
      case "add-web": {
        const project = registry.addWebProject(parsed.alias, parsed.webPath, parsed.targetUrl, parsed.projectPath);
        const pathInfo = project.path ? ` with path ${project.path}` : " without a local path";
        printMessage(
          `Web route '/${project.webPath}/' -> ${project.webTarget} added for '${project.alias}'${pathInfo}.\nConfig: ${registry.getConfigPath()}`
        );
        return;
      }
      case "list": {
        const projects = registry.listProjects();
        printProjects(projects);
        return;
      }
      case "route": {
        const project = registry.setWebRoute(parsed.alias, parsed.webPath, parsed.targetUrl);
        printMessage(
          `Route '/${project.webPath}/' -> ${project.webTarget} saved for '${project.alias}'.\nConfig: ${registry.getConfigPath()}`
        );
        return;
      }
      case "run": {
        const project = registry.getProject(parsed.alias);
        const exitCode = await runProjectCommand(project, parsed.executable, parsed.args);
        process.exitCode = exitCode;
        return;
      }
      case "serve": {
        startProxyServer(registry, parsed.port);
        return;
      }
      default:
        throw new AppError(`Unsupported command '${parsed.command}'.`);
    }
  } catch (error) {
    const appError = normalizeError(error);
    printError(appError.message);
    process.exitCode = appError.exitCode;
  }
}

function normalizeError(error) {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError(error && error.message ? error.message : "Unexpected error.");
}

module.exports = {
  runCli,
};
