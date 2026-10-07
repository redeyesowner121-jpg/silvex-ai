type DeliveredItem = { title: string; content: string };

/** Download one order's delivered items as a .txt file. */
export function downloadDeliveryTxt(
  order: { orderId: string; delivered?: DeliveredItem[]; deliveryNote?: string },
) {
  const items = order.delivered || [];
  if (!items.length) return;
  const lines: string[] = [`Order ${order.orderId}`, ""];
  items.forEach((item, index) => {
    lines.push(`--- ${item.title} (${index + 1}/${items.length}) ---`);
    lines.push(item.content);
    lines.push("");
  });
  if (order.deliveryNote) {
    lines.push("Note:", order.deliveryNote);
  }
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `delivery-${order.orderId.slice(-6)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
