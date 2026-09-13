import { providerProducts } from "../src/lib/providers.server";
import { dbGet, dbPatch } from "../src/lib/telegram.server";
const products = (await dbGet<Record<string, any>>("products")) || {};
const linked = Object.entries(products).filter(([, p]: any) => p?.delivery === "supplier" && String(p.supplierId ?? "") !== "");
const provs = [...new Set(linked.map(([, p]: any) => String(p.provider || "custom")))];
const cats = new Map<string, Map<string, any>>();
for (const pid of provs) {
  try { const items = await providerProducts(pid); cats.set(pid, new Map(items.map(i => [String(i.id), i]))); console.log(pid, items.length); }
  catch (e:any) { console.log("FAIL", pid, e.message); }
}
let n = 0;
for (const [id, p] of linked as any) {
  const sp = cats.get(String(p.provider || "custom"))?.get(String(p.supplierId));
  const d = String(sp?.description || "").trim();
  if (!d || d === String(p.desc || "").trim()) continue;
  await dbPatch(`products/${id}`, { desc: d });
  console.log("✔", p.title, "->", d.slice(0, 60).replace(/\n/g, " "));
  n++;
}
console.log("updated", n, "of", linked.length);
