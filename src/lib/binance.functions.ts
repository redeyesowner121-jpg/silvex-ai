import { createServerFn } from "@tanstack/react-start";

/** Tells the website whether Binance deposits are on, and where to send them. */
export const binanceInfo = createServerFn({ method: "GET" }).handler(async () => {
  const { binanceConfig, binanceDepositAddress } = await import("./binance.server");
  const conf = await binanceConfig();
  const enabled = Boolean(conf.apiKey && conf.apiSecret);
  let address = conf.address;
  if (enabled && !address) {
    const live = await binanceDepositAddress(conf.coins[0] || "USDT", conf.network);
    address = live?.address || "";
  }
  return { enabled, address, network: conf.network, coins: conf.coins };
});

/**
 * Checks one Binance transfer and tops the balance up once.
 * Safe to call many times: the same transfer is only ever counted once.
 */
export const verifyBinanceDeposit = createServerFn({ method: "POST" })
  .inputValidator((input: { uid: string; txId: string }) => {
    const uid = String(input.uid || "").trim();
    const txId = String(input.txId || "").trim();
    if (!uid) throw new Error("Sign in first.");
    if (txId.replace(/^0x/i, "").length < 16) throw new Error("Paste the full transaction id.");
    return { uid, txId };
  })
  .handler(async ({ data }) => {
    const { settleBinanceDeposit } = await import("./binance.server");
    return settleBinanceDeposit(data.uid, data.txId);
  });
