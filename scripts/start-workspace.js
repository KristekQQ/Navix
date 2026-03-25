"use strict";

const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const SCRIPT_DIR = __dirname;
const NAVIX_DIR = path.resolve(SCRIPT_DIR, "..");
const WORKSPACE_DIR = path.resolve(NAVIX_DIR, "..");
const CONFIG_PATH = path.join(NAVIX_DIR, ".navix", "projects.json");
const RUNTIME_DIR = path.join(NAVIX_DIR, ".navix", "runtime");

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const skipInstall = args.has("--no-install");

const PROJECTS = [
  {
    key: "webp-animator",
    alias: "WebP-Animator",
    dirName: "WebP-Animator",
    preferredPort: 5173,
    start(env) {
      return createCommand("node", ["./node_modules/vite/bin/vite.js", "--host", "--port", String(env.PORT)]);
    },
  },
  {
    key: "panorama",
    alias: "panorama",
    dirName: "panorama",
    preferredPort: 3000,
    start(env) {
      return createCommand("node", ["server.js"], env);
    },
  },
  {
    key: "sfx-hotswap",
    alias: "SFX-HotSwap",
    dirName: "SFX-HotSwap",
    preferredPort: 4173,
    start(env) {
      return createCommand("node", ["server.js"], env);
    },
  },
];

main().catch((error) => {
  console.error(error.message || String(error));
  process.exitCode = 1;
});

async function main() {
  ensureRuntimeDir();
  if (!isDryRun) {
    stopManagedProcesses();
  }
  const config = loadConfig();
  const assignedPorts = new Map();

  for (const project of PROJECTS) {
    const port = await findAvailablePort(project.preferredPort, assignedPorts);
    assignedPorts.set(project.key, port);
    updateProjectTarget(config, project.key, port);
  }

  const proxyPort = await findAvailablePort(80, assignedPorts);

  if (isDryRun) {
    printPlan(proxyPort, assignedPorts);
    return;
  }

  saveConfig(config);

  for (const project of PROJECTS) {
    const projectDir = path.join(WORKSPACE_DIR, project.dirName);
    ensureProjectDirectory(projectDir);
    maybeInstallDependencies(projectDir);
    await launchManagedProcess({
      name: project.key,
      cwd: projectDir,
      ...project.start({ PORT: String(assignedPorts.get(project.key)) }),
      readyPort: assignedPorts.get(project.key),
    });
  }

  await launchManagedProcess({
    name: "navix-proxy",
    cwd: NAVIX_DIR,
    ...createCommand("node", ["index.js", "serve", String(proxyPort)]),
    readyPort: proxyPort,
  });

  console.log("");
  console.log(`Navix proxy: http://127.0.0.1:${proxyPort}`);
  for (const project of PROJECTS) {
    console.log(`  /${config.projects[project.key].webPath}/ -> ${config.projects[project.key].webTarget}`);
  }
  console.log(`Logs: ${RUNTIME_DIR}`);
}

function createCommand(command, argsList, extraEnv) {
  return {
    command: process.platform === "win32" && command === "npm" ? "npm.cmd" : command,
    args: argsList,
    env: extraEnv || {},
  };
}

function ensureRuntimeDir() {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Missing Navix config: ${CONFIG_PATH}`);
  }

  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function updateProjectTarget(config, key, port) {
  const project = config.projects && config.projects[key];
  if (!project) {
    throw new Error(`Project '${key}' is missing in ${CONFIG_PATH}`);
  }

  project.webTarget = `http://127.0.0.1:${port}`;
}

async function findAvailablePort(preferredPort, reserved) {
  let port = preferredPort;
  while (reservedHasPort(reserved, port) || !(await isPortFree(port))) {
    port += 1;
  }

  return port;
}

function reservedHasPort(reserved, port) {
  return Array.from(reserved.values()).includes(port);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

function ensureProjectDirectory(projectDir) {
  if (!fs.existsSync(projectDir)) {
    throw new Error(`Missing project directory: ${projectDir}`);
  }
}

function maybeInstallDependencies(projectDir) {
  if (skipInstall) {
    return;
  }

  const nodeModulesDir = path.join(projectDir, "node_modules");
  const installMarkerPath = path.join(nodeModulesDir, ".navix-platform.json");
  const expectedMarker = {
    platform: process.platform,
    arch: process.arch,
  };

  if (fs.existsSync(nodeModulesDir)) {
    const marker = readInstallMarker(installMarkerPath);
    if (marker && marker.platform === expectedMarker.platform && marker.arch === expectedMarker.arch) {
      return;
    }

    console.log(`Reinstalling dependencies for ${projectDir} because platform marker is missing or changed.`);
    fs.rmSync(nodeModulesDir, { recursive: true, force: true });
  }

  console.log(`Installing dependencies in ${projectDir}`);
  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/c", "npm", "install"], {
          cwd: projectDir,
          stdio: "pipe",
          env: process.env,
          encoding: "utf8",
        })
      : spawnSync("npm", ["install"], {
          cwd: projectDir,
          stdio: "pipe",
          env: process.env,
          encoding: "utf8",
        });

  if (result.status !== 0) {
    const details = [result.stdout || "", result.stderr || "", result.error ? String(result.error) : ""]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(`npm install failed in ${projectDir}${details ? `\n${details}` : ""}`);
  }

  fs.mkdirSync(nodeModulesDir, { recursive: true });
  fs.writeFileSync(installMarkerPath, `${JSON.stringify(expectedMarker, null, 2)}\n`, "utf8");
}

function readInstallMarker(installMarkerPath) {
  if (!fs.existsSync(installMarkerPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(installMarkerPath, "utf8"));
  } catch {
    return null;
  }
}

function stopManagedProcesses() {
  const pidFiles = fs
    .readdirSync(RUNTIME_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".pid.json"));

  for (const entry of pidFiles) {
    const pidPath = path.join(RUNTIME_DIR, entry.name);
    try {
      const record = JSON.parse(fs.readFileSync(pidPath, "utf8"));
      if (record && Number.isInteger(record.pid)) {
        try {
          process.kill(record.pid, "SIGTERM");
        } catch (error) {
          if (error.code !== "ESRCH") {
            throw error;
          }
        }
      }
    } finally {
      fs.rmSync(pidPath, { force: true });
    }
  }
}

async function launchManagedProcess(options) {
  const outputPath = path.join(RUNTIME_DIR, `${options.name}.log`);
  const outFd = fs.openSync(outputPath, "a");
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    detached: true,
    stdio: ["ignore", outFd, outFd],
    windowsHide: true,
  });

  child.unref();
  fs.closeSync(outFd);
  writePidFile(options.name, child.pid, options.readyPort, outputPath);
  await waitForPort(options.readyPort, 20000, options.name, outputPath);
}

function writePidFile(name, pid, port, logPath) {
  const pidPath = path.join(RUNTIME_DIR, `${name}.pid.json`);
  fs.writeFileSync(
    pidPath,
    `${JSON.stringify({ name, pid, port, logPath, startedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
}

function waitForPort(port, timeoutMs, name, logPath) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const socket = net.createConnection({ host: "127.0.0.1", port });

      socket.on("connect", () => {
        clearInterval(timer);
        socket.destroy();
        resolve();
      });

      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - startedAt < timeoutMs) {
          return;
        }

        clearInterval(timer);
        reject(new Error(`${name} did not start on port ${port}.\n${readLogTail(logPath)}`));
      });
    }, 500);
  });
}

function readLogTail(logPath) {
  if (!fs.existsSync(logPath)) {
    return `No log output yet: ${logPath}`;
  }

  const lines = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/);
  const tail = lines.slice(-20).join("\n");
  return `Last log lines from ${logPath}:\n${tail}`;
}

function printPlan(proxyPort, assignedPorts) {
  console.log("Dry run only. Planned ports:");
  console.log(`  Navix proxy -> http://127.0.0.1:${proxyPort}`);
  for (const project of PROJECTS) {
    console.log(`  ${project.alias} -> http://127.0.0.1:${assignedPorts.get(project.key)}`);
  }
  console.log(`Config path: ${CONFIG_PATH}`);
}
