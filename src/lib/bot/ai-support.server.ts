/** Server-only AI helper: runs the support agent on the Lovable AI Gateway. */

const ENDPOINT = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

export type AgentTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export function hasAiKey(): boolean {
  return Boolean(process.env["LOVABLE_API_KEY"]);
}

/** One streamed call; we only need the final completed response. */
async function call(body: Record<string, unknown>, key: string): Promise<any> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`AI request failed [${res.status}]: ${detail}`);
  }
  const raw = await res.text();
  let completed: any = null;
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const json = JSON.parse(payload);
      if (json?.type === "response.completed") completed = json.response;
    } catch {
      /* partial or non-JSON event */
    }
  }
  if (!completed) throw new Error("AI returned no answer.");
  return completed;
}

function textOf(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }
  const parts: string[] = [];
  for (const item of response?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const c of item.content ?? []) if (typeof c?.text === "string") parts.push(c.text);
  }
  return parts.join("").trim();
}

/**
 * Runs the agent until it stops asking for tools, then returns its reply text.
 */
export async function runSupportAgent(opts: {
  instructions: string;
  input: any[];
  tools: AgentTool[];
  exec: (name: string, args: any) => Promise<string>;
  maxSteps?: number;
}): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const tools = opts.tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    strict: true,
  }));

  let items: any[] = [...opts.input];
  const steps = opts.maxSteps ?? 5;

  for (let i = 0; i < steps; i++) {
    const response = await call(
      {
        model: MODEL,
        instructions: opts.instructions,
        input: items,
        tools,
        store: false,
        reasoning: { effort: "low", summary: "auto" },
        include: ["reasoning.encrypted_content"],
      },
      key,
    );

    const output: any[] = response?.output ?? [];
    items = [...items, ...output];
    const calls = output.filter((o) => o?.type === "function_call");
    if (!calls.length) return textOf(response);

    for (const c of calls) {
      let result = "";
      try {
        result = await opts.exec(String(c.name), JSON.parse(c.arguments || "{}"));
      } catch (err) {
        result = `Error: ${(err as Error)?.message || err}`;
      }
      items.push({ type: "function_call_output", call_id: c.call_id, output: result || "done" });
    }
  }
  return "";
}
