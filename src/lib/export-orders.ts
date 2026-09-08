export type ExportRow = {
  orderId: string;
  date: string;
  buyer: string;
  product: string;
  delivery: string;
  amount: number;
  status: string;
};

const HEADERS = ["Order", "Date", "Buyer", "Product", "Delivery", "Amount ($)", "Status"];

function toCells(r: ExportRow) {
  return [
    r.orderId,
    r.date ? new Date(r.date).toLocaleString() : "",
    r.buyer,
    r.product,
    r.delivery,
    String(r.amount),
    r.status,
  ];
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportOrdersCsv(rows: ExportRow[], filename = "orders.csv") {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [HEADERS.map(esc).join(",")];
  rows.forEach((r) => lines.push(toCells(r).map(esc).join(",")));
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  lines.push(["", "", "", "", "TOTAL", String(total), ""].map(esc).join(","));
  download(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }), filename);
}

export async function exportOrdersPdf(
  rows: ExportRow[],
  title = "Orders report",
  filename = "orders.pdf",
) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape" });
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

  doc.setFontSize(14);
  doc.text(title, 14, 14);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleString()} · ${rows.length} orders · $${total}`, 14, 20);

  autoTable(doc, {
    head: [HEADERS],
    body: rows.map(toCells),
    foot: [["", "", "", "", "TOTAL", `$${total}`, ""]],
    startY: 25,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [79, 70, 229] },
    footStyles: { fillColor: [238, 238, 245], textColor: 20 },
  });

  doc.save(filename);
}
