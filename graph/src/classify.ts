import path from "path";
import fs from "fs";
import crypto from "crypto";
import type {
  GroupConfig,
  FileClassification,
  ClassificationResult,
} from "./types.ts";
import { bestGroup } from "./heuristics.ts";

/**
 * Options for {@link classifyFiles}.
 */
export interface ClassifyOptions {
  /** Absolute path to the project root. File paths in overrides are relative to this. */
  projectRoot: string;
  /** Directory to read/write the classification cache. Omit to disable caching. */
  cacheDir?: string;
}

// ---------------------------------------------------------------------------
// Cache format: JSON map of relative file path → cached entry.
// ---------------------------------------------------------------------------

interface CacheEntry {
  /** Hex SHA-256 of the file content at the time of classification. */
  contentHash: string;
  /** Assigned group name. */
  group: string;
  /** How the assignment was made. */
  strategy: FileClassification["strategy"];
}

type CacheMap = Record<string, CacheEntry>;

const CACHE_FILENAME = ".group-cache.json";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a set of source files into groups defined by `config`.
 *
 * Classification priority (highest → lowest):
 * 1. Manual overrides (glob patterns pinned to groups)
 * 2. Cached classification (content hash matches)
 * 3. Heuristic pre-pass (directory/filename pattern matching)
 * 4. Unclassified (for future LLM classification — Phase 4)
 */
export function classifyFiles(
  files: string[],
  config: GroupConfig,
  options: ClassifyOptions,
): ClassificationResult {
  const { projectRoot, cacheDir } = options;
  const cache = cacheDir ? loadCache(cacheDir) : {};
  const classifications: FileClassification[] = [];
  const unclassified: string[] = [];

  for (const file of files) {
    const abs = path.resolve(file);
    const rel = path.relative(projectRoot, abs);

    // 1. Manual override
    const overrideGroup = matchOverride(rel, config);
    if (overrideGroup) {
      classifications.push({
        file: abs,
        group: overrideGroup,
        strategy: "override",
      });
      updateCache(cache, rel, abs, overrideGroup, "override");
      continue;
    }

    // 2. Cache hit (content hash matches)
    const cached = lookupCache(cache, rel, abs);
    if (cached) {
      classifications.push({
        file: abs,
        group: cached.group,
        strategy: cached.strategy,
      });
      continue;
    }

    // 3. Heuristic classification
    const match = bestGroup(abs, config.groups);
    if (match) {
      classifications.push({
        file: abs,
        group: match.group,
        strategy: "heuristic",
      });
      updateCache(cache, rel, abs, match.group, "heuristic");
      continue;
    }

    // 4. Unclassified — awaiting Phase 4 LLM classification
    unclassified.push(abs);
  }

  if (cacheDir) {
    saveCache(cacheDir, cache);
  }

  return { classifications, unclassified };
}

// ---------------------------------------------------------------------------
// Override matching
// ---------------------------------------------------------------------------

/**
 * Check if a file's relative path matches any user-defined override pattern.
 * Returns the group name on match, or null.
 */
function matchOverride(relativePath: string, config: GroupConfig): string | null {
  if (!config.overrides || config.overrides.length === 0) return null;

  // Normalise to forward slashes for consistent glob matching
  const normalised = relativePath.replace(/\\/g, "/");

  for (const override of config.overrides) {
    const glob = new Bun.Glob(override.pattern);
    if (glob.match(normalised)) {
      return override.group;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Content hash caching
// ---------------------------------------------------------------------------

function hashFile(absPath: string): string | null {
  try {
    const content = fs.readFileSync(absPath);
    return crypto.createHash("sha256").update(content).digest("hex");
  } catch {
    return null;
  }
}

function loadCache(cacheDir: string): CacheMap {
  const cachePath = path.join(cacheDir, CACHE_FILENAME);
  try {
    const raw = fs.readFileSync(cachePath, "utf-8");
    return JSON.parse(raw) as CacheMap;
  } catch {
    return {};
  }
}

function saveCache(cacheDir: string, cache: CacheMap): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, CACHE_FILENAME);
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

function lookupCache(
  cache: CacheMap,
  relPath: string,
  absPath: string,
): CacheEntry | null {
  const entry = cache[relPath];
  if (!entry) return null;

  const currentHash = hashFile(absPath);
  if (!currentHash || currentHash !== entry.contentHash) return null;

  return entry;
}

function updateCache(
  cache: CacheMap,
  relPath: string,
  absPath: string,
  group: string,
  strategy: FileClassification["strategy"],
): void {
  const contentHash = hashFile(absPath);
  if (!contentHash) return;

  cache[relPath] = { contentHash, group, strategy };
}
