import { createFileRoute } from "@tanstack/react-router";

/**
 * Serves a product photo that is stored as a base64 data URI inside the
 * product record. Public read-only endpoint: it returns only the image
 * bytes for one product id, never any other field. Responses carry a long
 * cache lifetime; a short server-side cache avoids a database hit per image.
 */

let cache: { at: number; products: Record<string, { logo?: string }> } | null = null;
const TTL = 60_000;

function dbUrl() {
  const projectId = process.env["FIREBASE_PROJECT_ID"] || "silvex-ai";
  return (
    process.env["FIREBASE_DATABASE_URL"] || `https://${projectId}-default-rtdb.firebaseio.com`
  ).replace(/\/+$/, "");
}

async function logoFor(id: string): Promise<string | null> {
  if (!cache || Date.now() - cache.at > TTL) {
    const res = await fetch(`${dbUrl()}/products.json`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const products = (await res.json()) as Record<string, { logo?: string }> | null;
    if (!products) return null;
    // Only keep the logo fields — the full records can be heavy.
    cache = {
      at: Date.now(),
      products: Object.fromEntries(
        Object.entries(products).map(([k, v]) => [k, { logo: v?.logo }]),
      ),
    };
  }
  return cache.products[id]?.logo || null;
}

export const Route = createFileRoute("/api/public/product-img/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = params.id;
        if (!id || !/^[\w-]+$/.test(id)) return new Response("Bad id", { status: 400 });
        try {
          const logo = await logoFor(id);
          if (!logo || !logo.startsWith("data:")) return new Response("Not found", { status: 404 });
          const comma = logo.indexOf(",");
          const meta = logo.slice(5, comma); // e.g. image/jpeg;base64
          const type = /^image\/(jpeg|png|gif|webp)/.test(meta)
            ? meta.split(";")[0]!
            : "image/jpeg";
          const bytes = Buffer.from(logo.slice(comma + 1), "base64");
          return new Response(new Uint8Array(bytes), {
            headers: {
              "Content-Type": type,
              "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
            },
          });
        } catch {
          return new Response("Unavailable", { status: 502 });
        }
      },
    },
  },
});
