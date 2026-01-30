import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import { classifyFiles } from "../src/classify.ts";
import { tagsForFile, tagsForGroup, bestGroup } from "../src/heuristics.ts";
import type { GroupConfig, GroupDefinition } from "../src/types.ts";

// ---------------------------------------------------------------------------
// Standard group config used across tests
// ---------------------------------------------------------------------------

const GROUPS: GroupDefinition[] = [
  { name: "UI Components", description: "React components that render UI" },
  { name: "API Routes", description: "HTTP endpoint handlers" },
  { name: "Data Models", description: "Database schemas and types" },
  { name: "Business Logic", description: "Core domain services and utilities" },
];

const CONFIG: GroupConfig = { groups: GROUPS };

// ---------------------------------------------------------------------------
// Heuristic tag tests
// ---------------------------------------------------------------------------

describe("tagsForFile", () => {
  test("tags component directory files", () => {
    const tags = tagsForFile("/project/src/components/Button.tsx");
    expect(tags.has("ui")).toBe(true);
    expect(tags.has("component")).toBe(true);
  });

  test("tags route directory files", () => {
    const tags = tagsForFile("/project/src/routes/users.ts");
    expect(tags.has("api")).toBe(true);
    expect(tags.has("route")).toBe(true);
  });

  test("tags model directory files", () => {
    const tags = tagsForFile("/project/src/models/User.ts");
    expect(tags.has("data")).toBe(true);
    expect(tags.has("model")).toBe(true);
  });

  test("tags service directory files", () => {
    const tags = tagsForFile("/project/src/services/auth.ts");
    expect(tags.has("logic")).toBe(true);
    expect(tags.has("service")).toBe(true);
  });

  test("tags lib directory files", () => {
    const tags = tagsForFile("/project/src/lib/crypto.ts");
    expect(tags.has("logic")).toBe(true);
    expect(tags.has("lib")).toBe(true);
  });

  test("tags utils directory files", () => {
    const tags = tagsForFile("/project/src/utils/format.ts");
    expect(tags.has("logic")).toBe(true);
    expect(tags.has("util")).toBe(true);
  });

  test("tags .tsx files as UI", () => {
    const tags = tagsForFile("/project/src/App.tsx");
    expect(tags.has("ui")).toBe(true);
  });

  test("tags file-suffix conventions", () => {
    expect(tagsForFile("/project/user.model.ts").has("data")).toBe(true);
    expect(tagsForFile("/project/user.service.ts").has("logic")).toBe(true);
    expect(tagsForFile("/project/user.controller.ts").has("api")).toBe(true);
    expect(tagsForFile("/project/user.schema.ts").has("data")).toBe(true);
  });

  test("returns empty set for unrecognised paths", () => {
    const tags = tagsForFile("/project/README.md");
    expect(tags.size).toBe(0);
  });

  test("handles Windows-style backslash paths", () => {
    const tags = tagsForFile("C:\\project\\src\\components\\Button.tsx");
    expect(tags.has("ui")).toBe(true);
    expect(tags.has("component")).toBe(true);
  });
});

describe("tagsForGroup", () => {
  test("extracts tags from UI Components group", () => {
    const tags = tagsForGroup(GROUPS[0]); // "UI Components" / "React components that render UI"
    expect(tags.has("ui")).toBe(true);
    expect(tags.has("component")).toBe(true);
  });

  test("extracts tags from API Routes group", () => {
    const tags = tagsForGroup(GROUPS[1]); // "API Routes" / "HTTP endpoint handlers"
    expect(tags.has("api")).toBe(true);
    expect(tags.has("route")).toBe(true);
  });

  test("extracts tags from Data Models group", () => {
    const tags = tagsForGroup(GROUPS[2]); // "Data Models" / "Database schemas and types"
    expect(tags.has("data")).toBe(true);
    expect(tags.has("model")).toBe(true);
  });

  test("extracts tags from Business Logic group", () => {
    const tags = tagsForGroup(GROUPS[3]); // "Business Logic" / "Core domain services and utilities"
    expect(tags.has("logic")).toBe(true);
    expect(tags.has("service")).toBe(true);
  });
});

describe("bestGroup", () => {
  test("classifies component file to UI Components", () => {
    const result = bestGroup("/src/components/Button.tsx", GROUPS);
    expect(result).not.toBeNull();
    expect(result!.group).toBe("UI Components");
  });

  test("classifies route file to API Routes", () => {
    const result = bestGroup("/src/routes/users.ts", GROUPS);
    expect(result).not.toBeNull();
    expect(result!.group).toBe("API Routes");
  });

  test("classifies model file to Data Models", () => {
    const result = bestGroup("/src/models/User.ts", GROUPS);
    expect(result).not.toBeNull();
    expect(result!.group).toBe("Data Models");
  });

  test("classifies service file to Business Logic", () => {
    const result = bestGroup("/src/services/auth.ts", GROUPS);
    expect(result).not.toBeNull();
    expect(result!.group).toBe("Business Logic");
  });

  test("classifies utils file to Business Logic", () => {
    const result = bestGroup("/src/utils/format.ts", GROUPS);
    expect(result).not.toBeNull();
    expect(result!.group).toBe("Business Logic");
  });

  test("returns null for unrecognised files", () => {
    const result = bestGroup("/project/README.md", GROUPS);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifyFiles integration tests
// ---------------------------------------------------------------------------

describe("classifyFiles", () => {
  let tmpDir: string;

  beforeAll(() => {
    // Create a temporary project structure
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "classify-test-"));

    const dirs = [
      "src/components",
      "src/routes",
      "src/models",
      "src/services",
      "src/lib",
      "src/utils",
      "src/config",
    ];
    for (const d of dirs) {
      fs.mkdirSync(path.join(tmpDir, d), { recursive: true });
    }

    const files: Record<string, string> = {
      "src/components/Button.tsx": "export function Button() { return <button />; }",
      "src/components/Header.tsx": "export function Header() { return <header />; }",
      "src/routes/users.ts": "export function getUsers() {}",
      "src/routes/health.ts": "export function healthCheck() {}",
      "src/models/User.ts": "export interface User { id: string; }",
      "src/models/Order.ts": "export interface Order { id: string; }",
      "src/services/auth.ts": "export function login() {}",
      "src/lib/crypto.ts": "export function hash() {}",
      "src/utils/format.ts": "export function formatDate() {}",
      "src/config/env.ts": "export const PORT = 3000;",
      "README.md": "# Project",
    };

    for (const [filePath, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(tmpDir, filePath), content);
    }
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function filePaths(...relative: string[]): string[] {
    return relative.map((r) => path.join(tmpDir, r));
  }

  test("classifies files using heuristics", () => {
    const files = filePaths(
      "src/components/Button.tsx",
      "src/routes/users.ts",
      "src/models/User.ts",
      "src/services/auth.ts",
    );

    const result = classifyFiles(files, CONFIG, { projectRoot: tmpDir });

    expect(result.classifications).toHaveLength(4);
    expect(result.unclassified).toHaveLength(0);

    const byFile = new Map(
      result.classifications.map((c) => [path.relative(tmpDir, c.file), c]),
    );

    expect(byFile.get("src/components/Button.tsx")!.group).toBe("UI Components");
    expect(byFile.get("src/routes/users.ts")!.group).toBe("API Routes");
    expect(byFile.get("src/models/User.ts")!.group).toBe("Data Models");
    expect(byFile.get("src/services/auth.ts")!.group).toBe("Business Logic");

    // All should be heuristic-based
    for (const c of result.classifications) {
      expect(c.strategy).toBe("heuristic");
    }
  });

  test("unrecognised files are unclassified", () => {
    const files = filePaths("README.md");
    const result = classifyFiles(files, CONFIG, { projectRoot: tmpDir });

    expect(result.classifications).toHaveLength(0);
    expect(result.unclassified).toHaveLength(1);
    expect(result.unclassified[0]).toBe(path.join(tmpDir, "README.md"));
  });

  test("overrides take priority over heuristics", () => {
    const configWithOverride: GroupConfig = {
      ...CONFIG,
      overrides: [
        { pattern: "src/components/**", group: "Business Logic" },
      ],
    };

    const files = filePaths("src/components/Button.tsx");
    const result = classifyFiles(files, configWithOverride, {
      projectRoot: tmpDir,
    });

    expect(result.classifications).toHaveLength(1);
    expect(result.classifications[0].group).toBe("Business Logic");
    expect(result.classifications[0].strategy).toBe("override");
  });

  test("caching persists and reuses classifications", () => {
    const cacheDir = path.join(tmpDir, ".cache");
    const files = filePaths("src/components/Button.tsx");

    // First run — should classify via heuristic
    const result1 = classifyFiles(files, CONFIG, {
      projectRoot: tmpDir,
      cacheDir,
    });
    expect(result1.classifications[0].strategy).toBe("heuristic");

    // Second run — should hit cache
    const result2 = classifyFiles(files, CONFIG, {
      projectRoot: tmpDir,
      cacheDir,
    });
    expect(result2.classifications[0].group).toBe("UI Components");
    // Cache returns the stored strategy
    expect(result2.classifications[0].strategy).toBe("heuristic");
  });

  test("cache invalidates on file content change", () => {
    const cacheDir = path.join(tmpDir, ".cache-invalidation");
    const btnPath = path.join(tmpDir, "src/components/Button.tsx");
    const files = [btnPath];

    // First run
    classifyFiles(files, CONFIG, { projectRoot: tmpDir, cacheDir });

    // Modify the file
    fs.writeFileSync(btnPath, "export function Button() { return <div />; }");

    // Second run — cache should miss because content changed
    const result = classifyFiles(files, CONFIG, {
      projectRoot: tmpDir,
      cacheDir,
    });
    expect(result.classifications[0].group).toBe("UI Components");
    expect(result.classifications[0].strategy).toBe("heuristic");

    // Restore original content
    fs.writeFileSync(
      btnPath,
      "export function Button() { return <button />; }",
    );
  });

  test("each file is assigned to exactly one group", () => {
    const files = filePaths(
      "src/components/Button.tsx",
      "src/components/Header.tsx",
      "src/routes/users.ts",
      "src/routes/health.ts",
      "src/models/User.ts",
      "src/models/Order.ts",
      "src/services/auth.ts",
      "src/lib/crypto.ts",
      "src/utils/format.ts",
    );

    const result = classifyFiles(files, CONFIG, { projectRoot: tmpDir });

    // Every classified file appears exactly once
    const classified = result.classifications.map((c) => c.file);
    const unique = new Set(classified);
    expect(unique.size).toBe(classified.length);

    // No file is both classified and unclassified
    const unclassSet = new Set(result.unclassified);
    for (const c of result.classifications) {
      expect(unclassSet.has(c.file)).toBe(false);
    }
  });
});
