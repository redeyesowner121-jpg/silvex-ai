import { dbGet, notifyGroup, money } from "@/lib/telegram.server";
import { cfg } from "@/lib/bot/core";
await cfg();
const orders = (await dbGet<Record<string, any>>("orders")) || {};
const list = Object.values(orders).sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
console.log("orders:", list.length);
let sent = 0;
for (let i = 0; i < list.length; i += 10) {
  const chunk = list.slice(i, i + 10);
  const text = chunk
    .map((o: any) =>
      `🧾 <b>${o.orderId}</b>\n👤 ${o.email || o.telegramChatId || "-"}\n📦 ${(o.items || []).map((it: any) => `${it.title} x${it.qty || 1}`).join(", ")}\n💵 ${money(Number(o.total || 0))} • ${o.status}\n🕒 ${String(o.date || "").slice(0, 19).replace("T", " ")}`,
    )
    .join("\n\n");
  await notifyGroup(`📜 <b>Past logs ${i + 1}-${i + chunk.length} of ${list.length}</b>\n\n${text}`);
  sent += chunk.length;
  await new Promise((r) => setTimeout(r, 1200));
}
console.log("sent", sent);
