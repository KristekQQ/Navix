"use strict";

const { spawn } = require("child_process");
const { AppError } = require("../errors/app-error");

function runProjectCommand(project, executable, args) {
  if (!executable) {
    throw new AppError("Command is required.");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: project.path,
      stdio: "inherit",
      shell: false,
    });

    child.on("error", (error) => {
      reject(new AppError(`Failed to start '${executable}' in ${project.path}: ${error.message}`));
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new AppError(`Command '${executable}' terminated by signal ${signal}.`));
        return;
      }

      resolve(code === null ? 1 : code);
    });
  });
}

module.exports = {
  runProjectCommand,
};
