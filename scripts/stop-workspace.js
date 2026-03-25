"use strict";

const fs = require("fs");
const path = require("path");

const RUNTIME_DIR = path.resolve(__dirname, "..", ".navix", "runtime");

main();

function main() {
  if (!fs.existsSync(RUNTIME_DIR)) {
    console.log(`No runtime directory: ${RUNTIME_DIR}`);
    return;
  }

  const pidFiles = fs
    .readdirSync(RUNTIME_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".pid.json"));

  if (pidFiles.length === 0) {
    console.log("No managed workspace processes found.");
    return;
  }

  for (const entry of pidFiles) {
    const pidPath = path.join(RUNTIME_DIR, entry.name);
    const record = JSON.parse(fs.readFileSync(pidPath, "utf8"));
    const name = record.name || entry.name;
    const pid = Number(record.pid);

    if (Number.isInteger(pid)) {
      try {
        process.kill(pid, "SIGTERM");
        console.log(`Stopped ${name} (pid ${pid})`);
      } catch (error) {
        if (error.code === "ESRCH") {
          console.log(`Process already exited: ${name} (pid ${pid})`);
        } else {
          throw error;
        }
      }
    }

    fs.rmSync(pidPath, { force: true });
  }
}
