export { extractFileGraph } from "./extract.ts";
export { loadGroupConfig, parseGroupConfig } from "./config.ts";
export { classifyFiles } from "./classify.ts";
export type { ClassifyOptions } from "./classify.ts";
export { tagsForFile, tagsForGroup, scoreMatch, bestGroup } from "./heuristics.ts";
export type {
  FileEdge,
  GroupDefinition,
  GroupOverride,
  GroupConfig,
  ClassificationStrategy,
  FileClassification,
  ClassificationResult,
} from "./types.ts";
