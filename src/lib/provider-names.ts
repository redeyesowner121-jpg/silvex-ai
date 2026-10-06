/** Client-safe display names for supplier/API shops. */
const NAMES: Record<string, string> = {
  qamify: "Qamify",
  mmostore: "MMO Store",
  safwantiger: "Safwan Tiger Shop",
  cupponhub: "CupponHub",
  safwan: "Safwan",
  pandora: "Pandora Digital",
  w2premium: "W2 Premium",
  elite: "Elite Digital",
  canboso: "Canboso",
  elklas: "Eklas",
  custom: "Custom supplier",
};

export function providerName(id?: string | null): string {
  if (!id) return "";
  return NAMES[id] || id;
}
