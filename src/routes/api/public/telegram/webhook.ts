import { createFileRoute } from "@tanstack/react-router";
import { loadBotRuntime, rememberUsername, telegramWebhookOk, tg } from "@/lib/telegram.server";
import { editTarget, loadBotPresentation, rememberName } from "@/lib/bot/core";
import { handleCallback } from "@/lib/bot/route-callback";
import { handleText } from "@/lib/bot/route-text";

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

        // Settings, styling and the update body load together instead of one by one.
        const [, , update] = await Promise.all([
          loadBotRuntime().catch(() => undefined),
          loadBotPresentation().catch(() => undefined),
          request.json().catch(() => null),
        ]);
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!telegramWebhookOk(actual)) return new Response("Unauthorized", { status: 401 });

        try {
          if (update?.business_connection) {
            const { handleBusinessConnection } = await import("@/lib/bot/business");
            await handleBusinessConnection(update.business_connection);
          } else if (update?.business_message || update?.edited_business_message) {
            const { handleBusinessMessage } = await import("@/lib/bot/business");
            await handleBusinessMessage(update.business_message ?? update.edited_business_message);
          } else if (update?.callback_query) {
            const cq = update.callback_query;
            // Stop the button spinner right away; don't wait for Telegram.
            void tg("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => undefined);
            const chatId = cq.message?.chat?.id;
            const messageId = cq.message?.message_id;
            if (chatId) rememberName(Number(chatId), cq.from?.first_name || cq.from?.username);
            if (chatId) rememberUsername(Number(chatId), cq.from?.username);
            if (chatId && messageId) editTarget.set(Number(chatId), Number(messageId));
            if (chatId) {
              try {
                await handleCallback(Number(chatId), String(cq.data || ""));
              } finally {
                editTarget.delete(Number(chatId));
              }
            }
          } else {
            const msg = update?.message ?? update?.edited_message;
            const chatId = msg?.chat?.id;
            if (chatId) rememberName(Number(chatId), msg?.from?.first_name || msg?.from?.username);
            if (chatId) rememberUsername(Number(chatId), msg?.from?.username);
            if (chatId)
              await handleText(
                Number(chatId),
                String(msg.text ?? msg.caption ?? ""),
                msg.entities ?? msg.caption_entities,
                msg.sticker,
                msg.reply_to_message?.message_id,
                msg.from,
              );
          }
        } catch (err) {
          console.error("telegram webhook error", err);
        }
        // Keep supplier prices and stock fresh for bot shoppers too
        // (runs at most once a minute, and never blocks for long).
        try {
          const { syncAllProviders } = await import("@/lib/providers-import.server");
          await Promise.race([
            syncAllProviders(false),
            new Promise((r) => setTimeout(r, 6000)),
          ]);
        } catch {
          /* ignore */
        }
        return Response.json({ ok: true });
      },
    },
  },
});
