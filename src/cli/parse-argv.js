"use strict";

const { AppError } = require("../errors/app-error");

function parseArgv(argv) {
  if (argv.length === 0 || isHelp(argv[0])) {
    return { command: "help" };
  }

  const [command, ...rest] = argv;

  switch (command) {
    case "add":
      return parseAdd(rest);
    case "add-web":
      return parseAddWeb(rest);
    case "list":
      return parseList(rest);
    case "route":
      return parseRoute(rest);
    case "run":
      return parseRun(rest);
    case "serve":
      return parseServe(rest);
    default:
      throw new AppError(`Unknown command '${command}'. Use 'help' to see available commands.`);
  }
}

function parseAdd(args) {
  if (args.length < 2) {
    throw new AppError("Usage: navix add <alias> <path>");
  }

  const [alias, projectPath] = args;
  return {
    command: "add",
    alias,
    projectPath,
  };
}

function parseAddWeb(args) {
  if (args.length < 3 || args.length > 4) {
    throw new AppError("Usage: navix add-web <alias> <webPath> <targetUrl> [path]");
  }

  const [alias, webPath, targetUrl, projectPath] = args;
  return {
    command: "add-web",
    alias,
    webPath,
    targetUrl,
    projectPath: projectPath || null,
  };
}

function parseList(args) {
  if (args.length !== 0) {
    throw new AppError("Usage: navix list");
  }

  return { command: "list" };
}

function parseRun(args) {
  if (args.length < 3) {
    throw new AppError("Usage: navix run <alias> -- <command> [args...]");
  }

  const separatorIndex = args.indexOf("--");
  if (separatorIndex === -1) {
    throw new AppError("Usage: navix run <alias> -- <command> [args...]");
  }

  const alias = args[0];
  const commandArgs = args.slice(separatorIndex + 1);
  if (separatorIndex !== 1 || commandArgs.length === 0) {
    throw new AppError("Usage: navix run <alias> -- <command> [args...]");
  }

  const [executable, ...rest] = commandArgs;
  return {
    command: "run",
    alias,
    executable,
    args: rest,
  };
}

function parseRoute(args) {
  if (args.length !== 3) {
    throw new AppError("Usage: navix route <alias> <webPath> <targetUrl>");
  }

  const [alias, webPath, targetUrl] = args;
  return {
    command: "route",
    alias,
    webPath,
    targetUrl,
  };
}

function parseServe(args) {
  if (args.length > 1) {
    throw new AppError("Usage: navix serve [port]");
  }

  const [port] = args;
  const normalizedPort = port ? Number(port) : 8080;
  if (!Number.isInteger(normalizedPort) || normalizedPort < 1 || normalizedPort > 65535) {
    throw new AppError(`Invalid port '${port}'.`);
  }

  return {
    command: "serve",
    port: normalizedPort,
  };
}

function isHelp(value) {
  return value === "help" || value === "--help" || value === "-h";
}

function formatHelp() {
  return [
    "Navix",
    "",
    "Usage:",
    "  navix add <alias> <path>",
    "  navix add-web <alias> <webPath> <targetUrl> [path]",
    "  navix list",
    "  navix route <alias> <webPath> <targetUrl>",
    "  navix run <alias> -- <command> [args...]",
    "  navix serve [port]",
    "",
    "Config:",
    "  Editable config file: ./.navix/projects.json",
    "  Example config file: ./.navix/projects.example.json",
    "",
    "Examples:",
    "  navix add sfxHotswap ../sfx-hotswap",
    "  navix add-web admin admin http://127.0.0.1:5173 ../admin-ui",
    "  navix add-web docs docs http://127.0.0.1:3000",
    "  navix route sfxHotswap sfx http://127.0.0.1:4173",
    "  navix list",
    "  navix run sfxHotswap -- git status",
    "  navix serve 8080",
  ].join("\n");
}

module.exports = {
  parseArgv,
  formatHelp,
};
