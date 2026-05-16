export type TocItem = {
  id: string;
  text: string;
  level: number;
};

export function slugifyHeading(text: string, seen: Map<string, number>) {
  const base = text
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-") || "section";

  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);

  return count === 0 ? base : `${base}-${count}`;
}
