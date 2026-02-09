const DEFAULT_GROUP_COLOR = "#6b7280";

export function groupColor(color: string | null | undefined): string {
  return color || DEFAULT_GROUP_COLOR;
}
