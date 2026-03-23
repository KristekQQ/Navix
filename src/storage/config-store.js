"use strict";

const fs = require("fs");
const path = require("path");
const { createEmptyConfig, validateConfigShape } = require("./config-schema");
const { AppError } = require("../errors/app-error");

function createConfigStore(baseDir = process.cwd()) {
  const legacyConfigDir = path.join(baseDir, ".navix");
  const preferredConfigPath = path.join(legacyConfigDir, "projects.json");

  function resolveConfigPath() {
    if (fs.existsSync(preferredConfigPath)) {
      return preferredConfigPath;
    }

    return preferredConfigPath;
  }

  function loadConfig() {
    const configPath = resolveConfigPath();
    if (!fs.existsSync(configPath)) {
      return createEmptyConfig();
    }

    try {
      const raw = fs.readFileSync(configPath, "utf8");
      const config = JSON.parse(raw);
      validateConfigShape(config, configPath);
      return config;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(`Failed to read config at ${configPath}: ${error.message}`);
    }
  }

  function saveConfig(config) {
    const configPath = preferredConfigPath;
    const configDir = path.dirname(configPath);
    validateConfigShape(config, configPath);
    fs.mkdirSync(configDir, { recursive: true });

    const tempPath = `${configPath}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, configPath);
  }

  return {
    getBaseDir: () => baseDir,
    getConfigPath: () => resolveConfigPath(),
    getPreferredConfigPath: () => preferredConfigPath,
    loadConfig,
    saveConfig,
  };
}

module.exports = {
  createConfigStore,
};
