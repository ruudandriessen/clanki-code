import { describe, test, expect } from "bun:test";
import path from "path";
import { extractFileGraph } from "../src/extract.ts";
import type { FileEdge } from "../src/types.ts";

const fixturesDir = path.resolve(import.meta.dir, "fixtures");
const tsconfigPath = path.join(fixturesDir, "tsconfig.json");

function findEdge(edges: FileEdge[], fromFile: string, toFile: string): FileEdge | undefined {
  const fromPath = path.join(fixturesDir, fromFile);
  const toPath = path.join(fixturesDir, toFile);
  return edges.find((e) => e.from === fromPath && e.to === toPath);
}

describe("extractFileGraph", () => {
  const edges = extractFileGraph(tsconfigPath);

  test("extracts named imports", () => {
    const edge = findEdge(edges, "service.ts", "models.ts");
    expect(edge).toBeDefined();
    expect(edge!.symbols).toContain("User");
    expect(edge!.symbols).toContain("Order");
  });

  test("extracts aliased imports using original name", () => {
    const edge = findEdge(edges, "service.ts", "utils.ts");
    // Should use the original exported name "formatName", not the alias "fmt"
    expect(edge).toBeDefined();
    const utilsEdges = edges.filter(
      (e) =>
        e.from === path.join(fixturesDir, "service.ts") &&
        e.to === path.join(fixturesDir, "utils.ts"),
    );
    const allSymbols = utilsEdges.flatMap((e) => e.symbols);
    expect(allSymbols).toContain("formatName");
  });

  test("extracts namespace imports", () => {
    const utilsEdges = edges.filter(
      (e) =>
        e.from === path.join(fixturesDir, "service.ts") &&
        e.to === path.join(fixturesDir, "utils.ts"),
    );
    const allSymbols = utilsEdges.flatMap((e) => e.symbols);
    expect(allSymbols).toContain("* as Utils");
  });

  test("extracts side-effect imports with empty symbols", () => {
    const edge = findEdge(edges, "service.ts", "side-effect.ts");
    expect(edge).toBeDefined();
    expect(edge!.symbols).toEqual([]);
  });

  test("extracts barrel re-exports (export * from)", () => {
    const edge = findEdge(edges, "barrel.ts", "models.ts");
    expect(edge).toBeDefined();
    expect(edge!.symbols).toContain("*");
  });

  test("extracts named re-exports (export { x } from)", () => {
    const edge = findEdge(edges, "barrel.ts", "utils.ts");
    expect(edge).toBeDefined();
    expect(edge!.symbols).toContain("formatName");
  });

  test("extracts dynamic import() calls", () => {
    const edge = findEdge(edges, "lazy.ts", "service.ts");
    expect(edge).toBeDefined();
    expect(edge!.symbols).toContain("<dynamic>");
  });

  test("does not include edges to node_modules", () => {
    const externalEdges = edges.filter((e) => e.to.includes("node_modules"));
    expect(externalEdges).toHaveLength(0);
  });

  test("uses absolute paths", () => {
    for (const edge of edges) {
      expect(path.isAbsolute(edge.from)).toBe(true);
      expect(path.isAbsolute(edge.to)).toBe(true);
    }
  });
});
