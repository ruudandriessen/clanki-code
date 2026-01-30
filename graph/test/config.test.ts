import { describe, test, expect } from "bun:test";
import { parseGroupConfig } from "../src/config.ts";

describe("parseGroupConfig", () => {
  test("parses a minimal valid config", () => {
    const config = parseGroupConfig(`
groups:
  - name: "UI Components"
    description: "React components that render UI"
`);
    expect(config.groups).toHaveLength(1);
    expect(config.groups[0].name).toBe("UI Components");
    expect(config.groups[0].description).toBe(
      "React components that render UI",
    );
    expect(config.overrides).toBeUndefined();
  });

  test("parses multiple groups", () => {
    const config = parseGroupConfig(`
groups:
  - name: "UI Components"
    description: "React components"
  - name: "API Routes"
    description: "HTTP endpoint handlers"
  - name: "Data Models"
    description: "Database schemas and types"
  - name: "Business Logic"
    description: "Core domain services"
`);
    expect(config.groups).toHaveLength(4);
    expect(config.groups.map((g) => g.name)).toEqual([
      "UI Components",
      "API Routes",
      "Data Models",
      "Business Logic",
    ]);
  });

  test("parses overrides", () => {
    const config = parseGroupConfig(`
groups:
  - name: "UI Components"
    description: "React components"
  - name: "Business Logic"
    description: "Core domain services"
overrides:
  - pattern: "src/config/**"
    group: "Business Logic"
  - pattern: "src/components/legacy/**"
    group: "UI Components"
`);
    expect(config.overrides).toHaveLength(2);
    expect(config.overrides![0]).toEqual({
      pattern: "src/config/**",
      group: "Business Logic",
    });
    expect(config.overrides![1]).toEqual({
      pattern: "src/components/legacy/**",
      group: "UI Components",
    });
  });

  test("trims whitespace from names and descriptions", () => {
    const config = parseGroupConfig(`
groups:
  - name: "  UI Components  "
    description: "  React components  "
`);
    expect(config.groups[0].name).toBe("UI Components");
    expect(config.groups[0].description).toBe("React components");
  });

  test("rejects empty input", () => {
    expect(() => parseGroupConfig("")).toThrow("YAML object");
  });

  test("rejects config without groups", () => {
    expect(() => parseGroupConfig("overrides: []")).toThrow(
      "at least one group",
    );
  });

  test("rejects empty groups array", () => {
    expect(() => parseGroupConfig("groups: []")).toThrow("at least one group");
  });

  test("rejects group without name", () => {
    expect(() =>
      parseGroupConfig(`
groups:
  - description: "Some group"
`),
    ).toThrow("groups[0].name");
  });

  test("rejects group without description", () => {
    expect(() =>
      parseGroupConfig(`
groups:
  - name: "Foo"
`),
    ).toThrow("groups[0].description");
  });

  test("rejects duplicate group names", () => {
    expect(() =>
      parseGroupConfig(`
groups:
  - name: "Foo"
    description: "First"
  - name: "Foo"
    description: "Second"
`),
    ).toThrow('Duplicate group name: "Foo"');
  });

  test("rejects override referencing non-existent group", () => {
    expect(() =>
      parseGroupConfig(`
groups:
  - name: "UI"
    description: "UI stuff"
overrides:
  - pattern: "**/*.ts"
    group: "NonExistent"
`),
    ).toThrow('"NonExistent" does not match any defined group');
  });

  test("rejects override without pattern", () => {
    expect(() =>
      parseGroupConfig(`
groups:
  - name: "UI"
    description: "UI stuff"
overrides:
  - group: "UI"
`),
    ).toThrow("overrides[0].pattern");
  });

  test("rejects override without group", () => {
    expect(() =>
      parseGroupConfig(`
groups:
  - name: "UI"
    description: "UI stuff"
overrides:
  - pattern: "**/*.ts"
`),
    ).toThrow("overrides[0].group");
  });
});
