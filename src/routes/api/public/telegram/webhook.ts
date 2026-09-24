import { createFileRoute } from "@tanstack/react-router";
import { loadBotRuntime, rememberUsername, telegramWebhookOk, tg } from "@/lib/telegram.server";
import { editTarget, loadBotPresentation, rememberName } from "@/lib/bot/core";
import { handleCallback } from "@/lib/bot/route-callback";
import { handleText } from "@/lib/bot/route-text";

const chatQueues = new Map<string, Promise<void>>();

async function processUpdate(update: any) {
  await loadBotPresentation().catch(() => undefined);
  if (update?.business_connection) {
    const { handleBusinessConnection } = await import("@/lib/bot/business");
    await handleBusinessConnection(update.business_connection);
  } else if (update?.business_message || update?.edited_business_message) {
    const { handleBusinessMessage } = await import("@/lib/bot/business");
    await handleBusinessMessage(update.business_message ?? update.edited_business_message);
  } else if (update?.callback_query) {
    const cq = update.callback_query;
    void tg("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => undefined);
    const chatId = cq.message?.chat?.id;
    const messageId = cq.message?.message_id;
    if (chatId) {
      rememberName(Number(chatId), cq.from?.first_name || cq.from?.username);
      rememberUsername(Number(chatId), cq.from?.username);
      if (messageId) editTarget.set(Number(chatId), Number(messageId));
      try {
        await handleCallback(Number(chatId), String(cq.data || ""));
      } finally {
        editTarget.delete(Number(chatId));
      }
    }
  } else {
    const msg = update?.message ?? update?.edited_message;
    const chatId = msg?.chat?.id;
    if (chatId) {
      rememberName(Number(chatId), msg?.from?.first_name || msg?.from?.username);
      rememberUsername(Number(chatId), msg?.from?.username);
      await handleText(
        Number(chatId),
        String(msg.text ?? msg.caption ?? ""),
        msg.entities ?? msg.caption_entities,
        msg.sticker,
        msg.reply_to_message?.message_id,
        msg.from,
      );
    }
  }
  void import("@/lib/providers-import.server")
    .then(({ syncAllProviders }) => syncAllProviders(false))
    .catch(() => undefined);
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      // Health view for the store owner: says whether this server can talk to
      // Telegram at all. It never shows any key, only yes/no.
      GET: async () =>
        Response.json({
          ok: true,
          hasBotToken: Boolean(process.env["TELEGRAM_BOT_TOKEN"]),
          hasConnectionKey: Boolean(
            process.env["TELEGRAM_API_KEY_1"] || process.env["TELEGRAM_API_KEY"],
          ),
          hasLovableKey: Boolean(process.env["LOVABLE_API_KEY"]),
        }),
      POST: async ({ request }) => {
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        const [update] = await Promise.all([
          request.json().catch(() => null),
          loadBotRuntime().catch(() => undefined),
        ]);
        if (!telegramWebhookOk(actual)) return new Response("Unauthorized", { status: 401 });

        // Answer Telegram immediately so it sends the next update without waiting.
        // Work continues in the background, queued per chat to keep order.
        const key = String(
          update?.callback_query?.message?.chat?.id ??
            update?.message?.chat?.id ??
            update?.edited_message?.chat?.id ??
            "misc",
        );
        const prev = chatQueues.get(key) ?? Promise.resolve();
        const next = prev.then(() => processUpdate(update)).catch((err) => {
          console.error("telegram webhook error", err);
        });
        chatQueues.set(key, next);
        void next.finally(() => {
          if (chatQueues.get(key) === next) chatQueues.delete(key);
        });
        return Response.json({ ok: true });
      },
    },
  },
});
