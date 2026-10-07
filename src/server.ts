import "./lib/error-capture";

// Locked Firebase rules block anonymous reads/writes. Every server-side call to
// the Realtime Database gets the database secret attached, so the bot, deposits
// and webhooks keep full access while browsers stay restricted.
{
  const g = globalThis as { __rtdbAuthFetch?: boolean };
  if (!g.__rtdbAuthFetch) {
    g.__rtdbAuthFetch = true;
    const orig = globalThis.fetch.bind(globalThis);
    globalThis.fetch = ((input: any, init?: any) => {
      const secret = process.env["FIREBASE_DATABASE_SECRET"];
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : null;
      if (secret && raw && /firebaseio\.com|firebasedatabase\.app/.test(raw)) {
        const u = new URL(raw);
        if (!u.searchParams.has("auth")) u.searchParams.set("auth", secret);
        return orig(u.toString(), init);
      }
      return orig(input, init);
    }) as typeof fetch;
  }
}

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      return normalized;
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
