import { providerProducts } from "../src/lib/providers.server";
import { dbGet } from "../src/lib/telegram.server";
const products = (await dbGet<Record<string, any>>("products")) || {};
for (const pid of ["canboso","custom","mmostore","qamify","safwan"]) {
  const items = await providerProducts(pid).catch(()=>[]);
  const withDesc = items.filter(i=>String(i.description||"").trim());
  console.log(pid, items.length, "withDesc", withDesc.length, JSON.stringify(withDesc[0]?.description||"").slice(0,120));
}
for (const [id,p] of Object.entries(products) as any) if (p?.delivery==="supplier") console.log("-", p.provider, p.supplierId, "|", p.title, "| desc:", JSON.stringify(String(p.desc||"")).slice(0,80));
