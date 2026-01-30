#!/usr/bin/env bun
import path from "path";
import { extractFileGraph } from "./extract.ts";

const tsconfigArg = process.argv[2];

if (!tsconfigArg) {
  console.error("Usage: bun graph/src/cli.ts <path-to-tsconfig.json>");
  process.exit(1);
}

const tsconfigPath = path.resolve(tsconfigArg);
const edges = extractFileGraph(tsconfigPath);

console.log(JSON.stringify(edges, null, 2));
