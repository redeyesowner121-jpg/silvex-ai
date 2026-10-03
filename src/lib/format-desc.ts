/**
 * Supplier descriptions often pack every point into a single line, separated
 * only by checkmarks / bullets ("✔ A ✔ B ✔ C"). This turns each marker into
 * its own line so the description reads line by line in the bot and website.
 */
export function formatDescription(raw: string): string {
  const text = String(raw || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/\\n/g, "\n")
    .replace(/\r\n?/g, "\n");
  return text
    .split("\n")
    .flatMap((line) => {
      if (!line.trim()) return [""];
      return line.split(/\s*(?=[✔✔️✅☑✓•●▪◆★])/).map((part) => part.trim());
    })
    .join("\n");
}
