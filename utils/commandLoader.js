const fs = require('fs');
const path = require('path');
const logger = require('./logger');

function loadCommands(commandsPath) {
  const commands = new Map();
  const registrations = new Map();

  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith('.js'))
    .sort();

  function register(key, cmd, file, type) {
    const normalizedKey = key.trim().toLowerCase();
    const existing = registrations.get(normalizedKey);

    if (existing) {
      logger.error(
        `[commandLoader] Collision for "${normalizedKey}": ${type} from "${file}" (${cmd.name}) ` +
        `conflicts with ${existing.type} from "${existing.file}" (${existing.command.name}); skipping.`,
      );
      return false;
    }

    commands.set(normalizedKey, cmd);
    registrations.set(normalizedKey, { command: cmd, file, type });
    return true;
  }

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);

    try {
      const command = require(filePath);

      const commandList = Array.isArray(command) ? command : [command];

      for (const cmd of commandList) {
        if (!cmd || typeof cmd.name !== 'string' || !cmd.name.trim() || typeof cmd.execute !== 'function') {
          logger.warn(`[commandLoader] Skipping entry in "${file}" — must have { name, execute }.`);
          continue;
        }
        if (register(cmd.name, cmd, file, 'primary command')) {
          logger.info(`[commandLoader] Loaded command: ${cmd.name}`);
        }

        if (Array.isArray(cmd.aliases)) {
          for (const alias of cmd.aliases) {
            if (typeof alias !== 'string' || !alias.trim()) continue;
            if (register(alias, cmd, file, 'alias')) {
              logger.info(`[commandLoader] Registered alias: ${alias} -> ${cmd.name}`);
            }
          }
        }
      }
    } catch (error) {
      logger.error(`[commandLoader] Failed to load "${file}": ${error.message}`);
    }
  }

  return commands;
}

module.exports = { loadCommands };
