"use strict";

function printProjects(projects) {
  if (projects.length === 0) {
    console.log("No projects registered yet.");
    return;
  }

  for (const project of projects) {
    const webInfo = project.webPath && project.webTarget ? ` | web: /${project.webPath}/ -> ${project.webTarget}` : "";
    const pathInfo = project.path ? ` -> ${project.path}` : "";
    console.log(`${project.alias} [${project.status}]${pathInfo}${webInfo}`);
  }
}

function printMessage(message) {
  console.log(message);
}

function printError(message) {
  console.error(message);
}

module.exports = {
  printProjects,
  printMessage,
  printError,
};
