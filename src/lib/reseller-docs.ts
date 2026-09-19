export function resellerApiDocs(base: string, apiKey?: string): string {
  const key = apiKey || "YOUR_KEY";
  return `SILENT SELLER — Reseller API Documentation

Base URL
${base}

Authentication
Send your key with every request:
x-api-key: ${key}

All prices and wallet balances are in USD.

Endpoints
GET  ${base}/me
GET  ${base}/balance
GET  ${base}/products
GET  ${base}/orders
GET  ${base}/orders/ORDER_ID
POST ${base}/order

Create an order
POST ${base}/order
Content-Type: application/json
x-api-key: ${key}

Body:
{
  "productId": "ID",
  "qty": 1
}

Example
curl -X POST ${base}/order \\
  -H "x-api-key: ${key}" \\
  -H "content-type: application/json" \\
  -d '{"productId":"ID","qty":1}'

Successful response
{
  "ok": true,
  "orderId": "...",
  "status": "Completed",
  "total": 4.5,
  "balance": 20.5,
  "delivered": [{ "title": "...", "content": "..." }]
}

Delivery
Instant items are included in the order response. Manual items return as pending; check GET /orders/ORDER_ID or the Orders page for delivery.

Errors
401 — wrong or missing API key
404 — unknown product or order
400 — insufficient balance, unavailable stock, or invalid request

Security
Keep your API key private. Anyone holding it can spend your wallet balance.
`;
}

export function downloadTextFile(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}