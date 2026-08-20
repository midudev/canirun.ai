export const TEXT_USES = ["chat", "code", "reasoning"] as const

export const USE_CATEGORIES = [
  { key: "text", label: "Text & Coding" },
  { key: "image", label: "Image" },
  { key: "video", label: "Video" },
  { key: "small", label: "Lightweight" },
] as const

export type UseCategoryKey = (typeof USE_CATEGORIES)[number]["key"]

const USE_FILTER_ALIASES: Record<string, UseCategoryKey> = {
  chat: "text",
  code: "text",
  reasoning: "text",
  edge: "small",
}

export function normalizeUseFilter(value: string | null | undefined): string {
  if (!value || value === "all") return "all"
  return USE_FILTER_ALIASES[value] ?? value
}

export function matchesUseCategory(
  uses: readonly string[],
  params: number,
  key: string,
): boolean {
  if (key === "small") return params <= 4
  if (key === "text") return uses.some((u) => (TEXT_USES as readonly string[]).includes(u))
  // image/video categories are generation-only — vision is input understanding
  if (key === "image") return uses.includes("image")
  if (key === "video") return uses.includes("video")
  return uses.includes(key)
}

export function getModelUseCategories(
  uses: readonly string[],
  params: number,
): { key: UseCategoryKey; label: string }[] {
  return USE_CATEGORIES.filter((cat) => matchesUseCategory(uses, params, cat.key))
}
