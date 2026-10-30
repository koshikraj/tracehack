import Anthropic from "@anthropic-ai/sdk";
import { loadSnapshot } from "@/lib/snapshot-server";
import { TOOLS, TOOL_LABEL, SYSTEM_PROMPT, VIEW_TOOLS, runTool } from "@/lib/agent";

type Msg = Anthropic.Beta.Messages.BetaMessageParam;

const MODEL = process.env.CHAT_MODEL || "claude-opus-5-5";
const MAX_TURNS = 12;          // user messages per conversation
const MAX_TOOL_ROUNDS = 8;     // model ↔ tool iterations per question

// Basic per-IP limiter (in-memory, per server instance).
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), win = 10 * 60_000, max = 20;
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < win);
  arr.push(now); hits.set(ip, arr);
  return arr.length > max;
}

interface Body { messages: { role: "user" | "assistant"; content: string }[]; view?: string }

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return Response.json({ error: "missing_key", message: "Chat is not configured: set ANTHROPIC_API_KEY in web/.env.local and restart the dev server." }, { status: 503 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (limited(ip)) return Response.json({ error: "rate_limited", message: "Too many questions in a short time. Try again in a few minutes." }, { status: 429 });

  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ error: "bad_request" }, { status: 400 }); }
  const history = (body.messages ?? []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim());
  if (!history.length || history.at(-1)!.role !== "user") return Response.json({ error: "bad_request" }, { status: 400 });
  if (history.filter((m) => m.role === "user").length > MAX_TURNS) {
    return Response.json({ error: "too_long", message: "This conversation is at its limit. Start a new chat to keep going." }, { status: 400 });
  }

  const snap = await loadSnapshot();
  const client = new Anthropic();

  // Plain-text history; the volatile view note rides on the last user turn (after the cached prefix).
  const messages: Msg[] = history.map((m, i) => ({
    role: m.role,
    content: i === history.length - 1 && body.view ? `${m.content.slice(0, 2000)}\n\n<current_view>\n${body.view.slice(0, 1500)}\n</current_view>` : m.content.slice(0, 4000),
  }));

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const s = client.beta.messages.stream({
            model: MODEL,
            max_tokens: 16000,
            system: [{ type: "text", text: SYSTEM_PROMPT }],
            tools: TOOLS,
            messages,
            thinking: { type: "adaptive" },
            output_config: { effort: "medium" },
            cache_control: { type: "ephemeral" },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          });
          s.on("text", (delta) => send({ type: "text", delta }));
          const msg = await s.finalMessage();

          if (msg.stop_reason === "refusal") { send({ type: "text", delta: "\n\nI can't help with that one. Try asking about the fund flows or balances." }); break; }
          if (msg.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: msg.content }); continue; }
          const uses = msg.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
          if (msg.stop_reason !== "tool_use" || uses.length === 0) break;

          messages.push({ role: "assistant", content: msg.content });
          const results = await Promise.all(uses.map(async (u) => {
            send({ type: "tool", name: u.name, label: TOOL_LABEL[u.name] ?? u.name });
            const r = await runTool(snap, u.name, u.input);
            if (r.action && VIEW_TOOLS.has(u.name)) send({ type: "action", action: r.action });
            return { type: "tool_result" as const, tool_use_id: u.id, content: r.content, is_error: r.isError || undefined };
          }));
          messages.push({ role: "user", content: results });
          send({ type: "text", delta: "" }); // keep-alive between rounds
        }
        send({ type: "done" });
      } catch (e) {
        const msg = e instanceof Anthropic.RateLimitError ? "The assistant is busy right now. Try again shortly."
          : e instanceof Anthropic.AuthenticationError ? "The API key was rejected. Check ANTHROPIC_API_KEY."
            : e instanceof Anthropic.APIError ? `The assistant hit an API error (${e.status}).` : "The assistant hit an error.";
        console.error("[chat]", e);
        send({ type: "error", message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
