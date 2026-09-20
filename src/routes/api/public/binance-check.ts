import { createFileRoute } from "@tanstack/react-router";

/**
 * Small health check: tells us whether Binance accepts the saved API key
 * from the live server's IP. Returns no secrets, only Binance's answer.
 */
export const Route = createFileRoute("/api/public/binance-check")({
  server: {
    handlers: {
      GET: async () => {
        const { binanceConfig } = await import("@/lib/binance.server");
        const conf = await binanceConfig();
        const out: Record<string, unknown> = {
          keySaved: Boolean(conf.apiKey),
          secretSaved: Boolean(conf.apiSecret),
          address: conf.address || "",
          payId: conf.payId || "",
        };
        if (conf.apiKey && conf.apiSecret) {
          const crypto = await import("node:crypto");
          const q = new URLSearchParams({
            timestamp: String(Date.now()),
            recvWindow: "60000",
          }).toString();
          const sig = crypto
            .createHmac("sha256", conf.apiSecret)
            .update(q)
            .digest("hex");
          try {
            const r = await fetch(
              `https://api.binance.com/sapi/v1/account/status?${q}&signature=${sig}`,
              { headers: { "X-MBX-APIKEY": conf.apiKey } },
            );
            out["status"] = r.status;
            out["binance"] = (await r.text()).slice(0, 300);
          } catch (e) {
            out["error"] = String(e).slice(0, 200);
          }
        }
        return new Response(JSON.stringify(out, null, 2), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
