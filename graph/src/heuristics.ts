import type { GroupDefinition } from "./types.ts";

// ---------------------------------------------------------------------------
// Semantic tag system
//
// Each heuristic rule tags a file with semantic labels. These tags are then
// matched against keywords extracted from each group's name and description.
// The group with the most matching tags wins.
// ---------------------------------------------------------------------------

/**
 * A built-in rule that assigns semantic tags to a file based on its path.
 */
interface HeuristicRule {
  /** Regex tested against the file path (forward-slash normalised). */
  test: RegExp;
  /** Semantic tags produced when the rule matches. */
  tags: string[];
}

/**
 * Built-in heuristic rules. Order does not matter — all matching rules
 * contribute tags, and the group with the highest aggregate score wins.
 */
const RULES: HeuristicRule[] = [
  // ---- Directory-based rules ----
  { test: /\/components?\//, tags: ["ui", "component"] },
  { test: /\/pages?\//, tags: ["ui", "page"] },
  { test: /\/views?\//, tags: ["ui", "view"] },
  { test: /\/layouts?\//, tags: ["ui", "layout"] },
  { test: /\/hooks?\//, tags: ["ui", "hook"] },
  { test: /\/widgets?\//, tags: ["ui", "widget"] },

  { test: /\/routes?\//, tags: ["api", "route"] },
  { test: /\/api\//, tags: ["api", "route"] },
  { test: /\/controllers?\//, tags: ["api", "controller"] },
  { test: /\/handlers?\//, tags: ["api", "handler"] },
  { test: /\/middleware\//, tags: ["api", "middleware"] },
  { test: /\/endpoints?\//, tags: ["api", "endpoint"] },

  { test: /\/models?\//, tags: ["data", "model"] },
  { test: /\/schemas?\//, tags: ["data", "schema"] },
  { test: /\/entities?\//, tags: ["data", "entity"] },
  { test: /\/migrations?\//, tags: ["data", "migration"] },
  { test: /\/types\//, tags: ["data", "type"] },

  { test: /\/services?\//, tags: ["logic", "service"] },
  { test: /\/lib\//, tags: ["logic", "lib"] },
  { test: /\/utils?\//, tags: ["logic", "util"] },
  { test: /\/helpers?\//, tags: ["logic", "helper"] },
  { test: /\/core\//, tags: ["logic", "core"] },
  { test: /\/domain\//, tags: ["logic", "domain"] },

  { test: /\/store\//, tags: ["state", "store"] },
  { test: /\/state\//, tags: ["state"] },
  { test: /\/context\//, tags: ["state", "context"] },

  { test: /\/styles?\//, tags: ["style"] },
  { test: /\/themes?\//, tags: ["style", "theme"] },
  { test: /\/config\//, tags: ["config"] },
  { test: /\/constants?\//, tags: ["config", "constant"] },

  // ---- File suffix-based rules ----
  { test: /\.component\.[tj]sx?$/, tags: ["ui", "component"] },
  { test: /\.page\.[tj]sx?$/, tags: ["ui", "page"] },
  { test: /\.route\.[tj]sx?$/, tags: ["api", "route"] },
  { test: /\.controller\.[tj]sx?$/, tags: ["api", "controller"] },
  { test: /\.handler\.[tj]sx?$/, tags: ["api", "handler"] },
  { test: /\.model\.[tj]sx?$/, tags: ["data", "model"] },
  { test: /\.schema\.[tj]sx?$/, tags: ["data", "schema"] },
  { test: /\.entity\.[tj]sx?$/, tags: ["data", "entity"] },
  { test: /\.service\.[tj]sx?$/, tags: ["logic", "service"] },
  { test: /\.util\.[tj]sx?$/, tags: ["logic", "util"] },
  { test: /\.helper\.[tj]sx?$/, tags: ["logic", "helper"] },
  { test: /\.hook\.[tj]sx?$/, tags: ["ui", "hook"] },

  // ---- Extension-based rules (lower signal, still useful) ----
  { test: /\.[tj]sx$/, tags: ["ui"] },
  { test: /\.css$/, tags: ["style"] },
  { test: /\.scss$/, tags: ["style"] },
];

/**
 * Maps keywords (from group name/description) to the semantic tags they
 * correspond to. This bridges the gap between arbitrary user-defined group
 * names and the fixed tag vocabulary used by heuristic rules.
 */
const KEYWORD_TAGS: Record<string, string[]> = {
  // UI
  ui: ["ui"],
  component: ["ui", "component"],
  components: ["ui", "component"],
  frontend: ["ui"],
  react: ["ui", "component"],
  view: ["ui", "view"],
  views: ["ui", "view"],
  page: ["ui", "page"],
  pages: ["ui", "page"],
  render: ["ui"],
  layout: ["ui", "layout"],
  widget: ["ui", "widget"],
  hook: ["ui", "hook"],

  // API
  api: ["api"],
  route: ["api", "route"],
  routes: ["api", "route"],
  endpoint: ["api", "endpoint"],
  endpoints: ["api", "endpoint"],
  http: ["api"],
  handler: ["api", "handler"],
  handlers: ["api", "handler"],
  controller: ["api", "controller"],
  controllers: ["api", "controller"],
  middleware: ["api", "middleware"],
  backend: ["api"],
  server: ["api"],

  // Data
  data: ["data"],
  model: ["data", "model"],
  models: ["data", "model"],
  database: ["data"],
  schema: ["data", "schema"],
  schemas: ["data", "schema"],
  entity: ["data", "entity"],
  entities: ["data", "entity"],
  migration: ["data", "migration"],
  type: ["data", "type"],
  types: ["data", "type"],

  // Logic
  business: ["logic"],
  logic: ["logic"],
  service: ["logic", "service"],
  services: ["logic", "service"],
  domain: ["logic", "domain"],
  core: ["logic", "core"],
  utility: ["logic", "util"],
  utilities: ["logic", "util"],
  util: ["logic", "util"],
  utils: ["logic", "util"],
  helper: ["logic", "helper"],
  helpers: ["logic", "helper"],
  lib: ["logic", "lib"],
  library: ["logic", "lib"],

  // State
  state: ["state"],
  store: ["state", "store"],
  context: ["state", "context"],
  redux: ["state", "store"],

  // Style
  style: ["style"],
  styles: ["style"],
  styling: ["style"],
  css: ["style"],
  theme: ["style", "theme"],

  // Config
  config: ["config"],
  configuration: ["config"],
  constant: ["config", "constant"],
  constants: ["config", "constant"],
  setting: ["config"],
  settings: ["config"],
};

/**
 * Extract semantic tags from a file path by running every built-in rule.
 */
export function tagsForFile(filePath: string): Set<string> {
  // Normalise to forward slashes for consistent matching
  const normalised = filePath.replace(/\\/g, "/");
  const tags = new Set<string>();

  for (const rule of RULES) {
    if (rule.test.test(normalised)) {
      for (const tag of rule.tags) {
        tags.add(tag);
      }
    }
  }

  return tags;
}

/**
 * Extract semantic tags from a group definition by tokenising its name and
 * description and looking up each token in the keyword → tag mapping.
 */
export function tagsForGroup(group: GroupDefinition): Set<string> {
  const text = `${group.name} ${group.description}`;
  const tokens = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const tags = new Set<string>();

  for (const token of tokens) {
    const mapped = KEYWORD_TAGS[token];
    if (mapped) {
      for (const tag of mapped) {
        tags.add(tag);
      }
    }
  }

  return tags;
}

/**
 * Score how well a file matches a group. Returns the number of overlapping
 * semantic tags between the file's tags and the group's tags.
 */
export function scoreMatch(fileTags: Set<string>, groupTags: Set<string>): number {
  let score = 0;
  for (const tag of fileTags) {
    if (groupTags.has(tag)) {
      score++;
    }
  }
  return score;
}

/**
 * Find the best matching group for a file. Returns the group name and its
 * score, or null if no group scored above zero.
 */
export function bestGroup(
  filePath: string,
  groups: GroupDefinition[],
): { group: string; score: number } | null {
  const fileTags = tagsForFile(filePath);
  if (fileTags.size === 0) return null;

  let best: { group: string; score: number } | null = null;

  for (const g of groups) {
    const groupTags = tagsForGroup(g);
    const score = scoreMatch(fileTags, groupTags);
    if (score > 0 && (best === null || score > best.score)) {
      best = { group: g.name, score };
    }
  }

  return best;
}
