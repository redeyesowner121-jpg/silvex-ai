/** Registers the bot's slash-command menu and the blue "Menu" button. */
import { tg } from "@/lib/telegram.server";

export const USER_COMMANDS = [
  { command: "start", description: "Open the store menu" },
  { command: "products", description: "Browse all products" },
  { command: "wallet", description: "Wallet balance & top up" },
  { command: "deposit", description: "Add funds with crypto" },
  { command: "orders", description: "Your orders" },
  { command: "profile", description: "Your profile" },
  { command: "refer", description: "Invite friends & earn" },
  { command: "reviews", description: "Read or write a review" },
  { command: "apikey", description: "Your reseller API key" },
  { command: "support", description: "Contact support" },
  { command: "help", description: "List of all commands" },
];

export const ADMIN_COMMANDS = [
  ...USER_COMMANDS,
  { command: "admin", description: "Admin panel" },
  { command: "setemoji", description: "Change bot & website emojis" },
];

let done = false;

/** Pushes the command list to Telegram (once per server start, or forced). */
export async function registerBotCommands(force = false) {
  if (done && !force) return;
  done = true;
  await Promise.all([
    tg("setMyCommands", { commands: USER_COMMANDS }).catch(() => undefined),
    tg("setChatMenuButton", { menu_button: { type: "commands" } }).catch(() => undefined),
  ]);
}

/** Gives an admin chat the extra admin commands in its own menu. */
export async function registerAdminCommands(chatId: number) {
  await tg("setMyCommands", {
    commands: ADMIN_COMMANDS,
    scope: { type: "chat", chat_id: chatId },
  }).catch(() => undefined);
}

/** Persistent quick-reply keyboard shown under the message box. */
export const QUICK_MENU = {
  keyboard: [
    [{ text: "🛍 Products" }, { text: "💬 Support" }],
    [{ text: "👛 Wallet" }, { text: "🔗 API" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Choose a quick menu below",
};

/** Attaches the quick menu to a chat (uses a tiny message as the carrier). */
export async function showQuickMenu(chatId: number) {
  await tg("sendMessage", {
    chat_id: chatId,
    text: "⌨️ Quick menu is ready below.",
    reply_markup: QUICK_MENU,
  }).catch(() => undefined);
}
