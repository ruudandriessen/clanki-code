import ts from "typescript";
import path from "path";
import type { FileEdge } from "./types.ts";

/**
 * Extract the file-level import graph from a TypeScript project.
 *
 * Walks every source file in the program, extracts static and dynamic imports,
 * resolves specifiers to absolute file paths, and captures imported symbol names.
 */
export function extractFileGraph(tsconfigPath: string): FileEdge[] {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    const msg = ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n");
    throw new Error(`Failed to read tsconfig: ${msg}`);
  }

  const basePath = path.dirname(path.resolve(tsconfigPath));
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, basePath);
  if (parsed.errors.length > 0) {
    const msg = parsed.errors
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
      .join("\n");
    throw new Error(`Failed to parse tsconfig: ${msg}`);
  }

  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();
  const edges: FileEdge[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    // Skip declaration files and files outside the project (node_modules, etc.)
    if (sourceFile.isDeclarationFile) continue;
    if (sourceFile.fileName.includes("node_modules")) continue;

    const fromPath = path.resolve(sourceFile.fileName);
    collectImports(sourceFile, fromPath, program, checker, edges);
  }

  return edges;
}

/**
 * Collect all imports from a single source file by walking its AST.
 */
function collectImports(
  sourceFile: ts.SourceFile,
  fromPath: string,
  program: ts.Program,
  checker: ts.TypeChecker,
  edges: FileEdge[],
): void {
  ts.forEachChild(sourceFile, function visit(node) {
    // Static import declarations: import { foo } from "./bar"
    if (ts.isImportDeclaration(node)) {
      handleImportDeclaration(node, fromPath, program, edges);
    }
    // Static export declarations: export { foo } from "./bar"
    else if (ts.isExportDeclaration(node)) {
      handleExportDeclaration(node, fromPath, program, edges);
    }
    // Dynamic import(): const m = import("./bar")
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      handleDynamicImport(node, fromPath, sourceFile, program, edges);
    }

    ts.forEachChild(node, visit);
  });
}

/**
 * Handle a static import declaration.
 *
 * Covers:
 *  - import { a, b } from "./mod"
 *  - import { a as x } from "./mod"
 *  - import defaultExport from "./mod"
 *  - import * as ns from "./mod"
 *  - import "./mod" (side-effect)
 */
function handleImportDeclaration(
  node: ts.ImportDeclaration,
  fromPath: string,
  program: ts.Program,
  edges: FileEdge[],
): void {
  if (!ts.isStringLiteral(node.moduleSpecifier)) return;

  const specifier = node.moduleSpecifier.text;
  const resolved = resolveModuleSpecifier(specifier, fromPath, program.getCompilerOptions());
  if (!resolved) return;

  const symbols: string[] = [];
  const importClause = node.importClause;

  if (importClause) {
    // Default import: import Foo from "./bar"
    if (importClause.name) {
      symbols.push(importClause.name.text);
    }

    const bindings = importClause.namedBindings;
    if (bindings) {
      if (ts.isNamedImports(bindings)) {
        // Named imports: import { a, b as c } from "./bar"
        for (const el of bindings.elements) {
          // Use the original exported name, not the local alias
          symbols.push((el.propertyName ?? el.name).text);
        }
      } else if (ts.isNamespaceImport(bindings)) {
        // Namespace import: import * as ns from "./bar"
        symbols.push(`* as ${bindings.name.text}`);
      }
    }
  }
  // If no importClause, it's a side-effect import: import "./bar"
  // We still record the edge with an empty symbols array.

  edges.push({ from: fromPath, to: resolved, symbols });
}

/**
 * Handle a re-export declaration.
 *
 * Covers:
 *  - export { a, b } from "./mod"
 *  - export * from "./mod"
 *  - export * as ns from "./mod"
 */
function handleExportDeclaration(
  node: ts.ExportDeclaration,
  fromPath: string,
  program: ts.Program,
  edges: FileEdge[],
): void {
  if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) return;

  const specifier = node.moduleSpecifier.text;
  const resolved = resolveModuleSpecifier(specifier, fromPath, program.getCompilerOptions());
  if (!resolved) return;

  const symbols: string[] = [];
  const exportClause = node.exportClause;

  if (exportClause) {
    if (ts.isNamedExports(exportClause)) {
      for (const el of exportClause.elements) {
        symbols.push((el.propertyName ?? el.name).text);
      }
    } else if (ts.isNamespaceExport(exportClause)) {
      symbols.push(`* as ${exportClause.name.text}`);
    }
  } else {
    // export * from "./mod" — barrel re-export
    symbols.push("*");
  }

  edges.push({ from: fromPath, to: resolved, symbols });
}

/**
 * Handle a dynamic import() call.
 *
 * Extracts the module specifier if it's a string literal.
 * Dynamic imports with non-literal specifiers are skipped.
 */
function handleDynamicImport(
  node: ts.CallExpression,
  fromPath: string,
  sourceFile: ts.SourceFile,
  program: ts.Program,
  edges: FileEdge[],
): void {
  const arg = node.arguments[0];
  if (!arg || !ts.isStringLiteral(arg)) return;

  const specifier = arg.text;
  const resolved = resolveModuleSpecifier(specifier, fromPath, program.getCompilerOptions());
  if (!resolved) return;

  // Dynamic imports don't have a static symbol list at the import site.
  // The symbols are accessed at runtime via the returned module object.
  edges.push({ from: fromPath, to: resolved, symbols: ["<dynamic>"] });
}

/**
 * Resolve an import specifier to an absolute file path using the TypeScript
 * module resolution algorithm. Respects tsconfig paths, baseUrl, etc.
 *
 * Returns null for unresolvable specifiers (e.g. bare node_modules packages
 * that don't resolve to project source files).
 */
function resolveModuleSpecifier(
  specifier: string,
  containingFile: string,
  options: ts.CompilerOptions,
): string | null {
  const result = ts.resolveModuleName(specifier, containingFile, options, ts.sys);

  const resolved = result.resolvedModule;
  if (!resolved) return null;

  // Skip external node_modules — we only care about project source files
  if (resolved.isExternalLibraryImport) return null;

  return path.resolve(resolved.resolvedFileName);
}
