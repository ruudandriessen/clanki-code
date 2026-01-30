/**
 * Represents a single import relationship between two source files.
 */
export interface FileEdge {
  /** Absolute path of the importing file. */
  from: string;
  /** Absolute path of the imported file. */
  to: string;
  /** Named imports crossing this edge (e.g. ["createUser", "UserSchema"]). */
  symbols: string[];
}
