import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import type { GroupConfig, GroupDefinition, GroupOverride } from "./types.ts";

/**
 * Load and validate a group configuration from a YAML file.
 *
 * Expected format:
 * ```yaml
 * groups:
 *   - name: "UI Components"
 *     description: "React components that render UI"
 *   - name: "API Routes"
 *     description: "HTTP endpoint handlers"
 * overrides:           # optional
 *   - pattern: "src/config/**"
 *     group: "Business Logic"
 * ```
 */
export function loadGroupConfig(configPath: string): GroupConfig {
  const resolved = path.resolve(configPath);
  const raw = fs.readFileSync(resolved, "utf-8");
  return parseGroupConfig(raw);
}

/**
 * Parse and validate a group configuration from a YAML string.
 */
export function parseGroupConfig(yaml: string): GroupConfig {
  const doc = parseYaml(yaml);

  if (!doc || typeof doc !== "object") {
    throw new Error("Group config must be a YAML object");
  }

  const { groups, overrides } = doc as Record<string, unknown>;

  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error("Group config must define at least one group");
  }

  const parsed: GroupConfig = {
    groups: groups.map(validateGroupDefinition),
  };

  // Validate uniqueness of group names
  const names = new Set<string>();
  for (const g of parsed.groups) {
    if (names.has(g.name)) {
      throw new Error(`Duplicate group name: "${g.name}"`);
    }
    names.add(g.name);
  }

  // Parse overrides if present
  if (overrides !== undefined) {
    if (!Array.isArray(overrides)) {
      throw new Error('"overrides" must be an array');
    }
    parsed.overrides = overrides.map((o, i) => validateGroupOverride(o, i, names));
  }

  return parsed;
}

function validateGroupDefinition(raw: unknown, index: number): GroupDefinition {
  if (!raw || typeof raw !== "object") {
    throw new Error(`groups[${index}] must be an object`);
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.name !== "string" || obj.name.trim() === "") {
    throw new Error(`groups[${index}].name must be a non-empty string`);
  }
  if (typeof obj.description !== "string" || obj.description.trim() === "") {
    throw new Error(`groups[${index}].description must be a non-empty string`);
  }

  return { name: obj.name.trim(), description: obj.description.trim() };
}

function validateGroupOverride(
  raw: unknown,
  index: number,
  validGroups: Set<string>,
): GroupOverride {
  if (!raw || typeof raw !== "object") {
    throw new Error(`overrides[${index}] must be an object`);
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.pattern !== "string" || obj.pattern.trim() === "") {
    throw new Error(`overrides[${index}].pattern must be a non-empty string`);
  }
  if (typeof obj.group !== "string" || obj.group.trim() === "") {
    throw new Error(`overrides[${index}].group must be a non-empty string`);
  }

  const group = obj.group.trim();
  if (!validGroups.has(group)) {
    throw new Error(`overrides[${index}].group "${group}" does not match any defined group`);
  }

  return { pattern: obj.pattern.trim(), group };
}
