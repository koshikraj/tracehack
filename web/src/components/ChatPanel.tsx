"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Coins, Flame, Map as MapIcon, Play, Radar, RotateCcw, Snowflake, Square, X } from "lucide-react";
import Hop, { type HopMood } from "./Hop";
import type { AgentAction } from "@/lib/view";

interface Turn { role: "user" | "assistant"; content: string; tools?: string[]; error?: string }

const SUGGESTIONS: { q: string; icon: typeof MapIcon; tone: string }[] = [
  { q: "Where are the stolen funds now?", icon: MapIcon, tone: "--st-held" },
  { q: "How much is frozen, and by whom?", icon: Snowflake, tone: "--st-frozen" },
  { q: "Show me the biggest ETH stash and how it got there", icon: Coins, tone: "--st-lending" },
  { q: "What happened on Tron?", icon: Flame, tone: "--st-commingled" },
  { q: "Take me to the first hour of the drain", icon: Play, tone: "--st-recovered" },
  { q: "Have any attacker wallets moved since the snapshot?", icon: Radar, tone: "--st-held" },
];

/** Hop's mood for an answer: tracing while it streams, "found it" when it moved the map. */
const MAP_LABELS = new Set(["Moving map", "Highlighting path", "Filtering map", "Scrubbing time", "Switching view"]);
function turnMood(t: { tools?: string[]; error?: string }, streaming: boolean): HopMood {
  if (streaming) return "thinking";
  if (t.error) return "sad";
  return (t.tools ?? []).some((x) => MAP_LABELS.has(x)) ? "found" : "happy";
}

/** Tiny, safe markdown: **bold**, `code`, [text](url), bullet lists, paragraphs. */
function Md({ text }: { text: string }) {
  const inline = (s: string, k: string): ReactNode[] => {
    const out: ReactNode[] = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
    let last = 0, m: RegExpExecArray | null, i = 0;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push(s.slice(last, m.index));
      const t = m[0];
      if (t.startsWith("**")) out.push(<b key={`${k}${i++}`} className="font-semibold text-ink">{t.slice(2, -2)}</b>);
      else if (t.startsWith("`")) out.push(<code key={`${k}${i++}`} className="mono rounded bg-surface-2 px-1 text-[12px]">{t.slice(1, -1)}</code>);
      else { const mm = t.match(/\[([^\]]+)\]\(([^)]+)\)/)!; out.push(<a key={`${k}${i++}`} href={mm[2]} target="_blank" rel="noopener noreferrer" className="underline decoration-line-2 underline-offset-2">{mm[1]}</a>); }
      last = m.index + t.length;
    }
    if (last < s.length) out.push(s.slice(last));
    return out;
  };
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((b, bi) => {
        const lines = b.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          return <ul key={bi} className="my-1.5 list-disc space-y-1 pl-4">{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""), `${bi}-${li}-`)}</li>)}</ul>;
        }
        return <p key={bi} className="my-1.5">{lines.map((l, li) => <span key={li}>{li > 0 && <br />}{inline(l.replace(/^#+\s*/, ""), `${bi}-${li}-`)}</span>)}</p>;
      })}
    </>
  );
}

export default function ChatPanel({ onAction, viewNote, onClose }: { onAction: (a: AgentAction) => void; viewNote: () => string; onClose: () => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [turns, status]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const history: Turn[] = [...turns.filter((t) => !t.error), { role: "user", content: question }];
    setTurns([...history, { role: "assistant", content: "", tools: [] }]);
    setInput(""); setBusy(true); setStatus("Thinking");
    const ctl = new AbortController(); abort.current = ctl;
    const patch = (fn: (t: Turn) => Turn) => setTurns((ts) => { const c = ts.slice(); c[c.length - 1] = fn(c[c.length - 1]); return c; });
    try {
      const res = await fetch("/api/chat", {
        method: "POST", signal: ctl.signal, headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })), view: viewNote() }),
      });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({}));
        patch((t) => ({ ...t, error: e.message ?? `Request failed (${res.status})` }));
        return;
      }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "text" && ev.delta) { setStatus(null); patch((t) => ({ ...t, content: t.content + ev.delta })); }
          else if (ev.type === "tool") { setStatus(ev.label); patch((t) => ({ ...t, tools: [...(t.tools ?? []), ev.label] })); }
          else if (ev.type === "action") onAction(ev.action as AgentAction);
          else if (ev.type === "error") patch((t) => ({ ...t, error: ev.message }));
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") patch((t) => ({ ...t, error: "Connection lost." }));
    } finally {
      setBusy(false); setStatus(null); abort.current = null;
    }
  }

  return (
    <aside className="flex h-full flex-col border-l border-line bg-surface" aria-label="Ask Hop about the funds">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Hop mood={busy ? "thinking" : turns.at(-1)?.error ? "sad" : "neutral"} size={40} decorative />
        <div className="min-w-0 flex-1">
          <h2 className="display text-[15px] font-semibold leading-tight text-ink">Ask Hop</h2>
          <p className="text-[11.5px] text-muted">{busy ? (status ?? "Working") + "…" : "Answers use this dataset and move the map"}</p>
        </div>
        {turns.length > 0 && <button onClick={() => { abort.current?.abort(); setTurns([]); }} title="Start a new chat" aria-label="Start a new chat" className="press rounded-lg p-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink"><RotateCcw size={15} /></button>}
        <button onClick={onClose} aria-label="Close assistant" className="press rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink"><X size={16} /></button>
      </div>

      <div ref={scroller} className="scroll-thin flex-1 space-y-5 overflow-y-auto px-4 py-4 text-[13.5px] leading-relaxed text-ink-2">
        {turns.length === 0 && (
          <div>
            <div className="pop-in mb-3 flex justify-center"><Hop mood="happy" size={132} /></div>
            <p className="display text-center text-[20px] font-semibold leading-snug text-ink">Hi, I&apos;m Hop. Ask me where the money went.</p>
            <p className="mt-1.5 text-center text-[12.5px] text-muted">Every figure comes with its source and how sure we are. Try one of these:</p>
            <div className="mt-4 grid gap-2">
              {SUGGESTIONS.map(({ q, icon: Icon, tone }, i) => (
                <button key={q} onClick={() => ask(q)} style={{ animationDelay: `${i * 45}ms` }}
                  className="pop-in press group flex items-center gap-3 rounded-xl border border-line bg-raised px-3 py-2.5 text-left text-[13px] font-medium text-ink shadow-card hover:border-line-2">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, var(${tone}) 14%, transparent)`, color: `var(${tone})` }}><Icon size={15} /></span>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => t.role === "user" ? (
          <div key={i} className="pop-in ml-10 w-fit max-w-[85%] justify-self-end rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[13.5px] text-surface" style={{ marginLeft: "auto" }}>{t.content}</div>
        ) : (
          <div key={i} className="pop-in flex gap-2.5">
            <span className="mt-0.5 shrink-0"><Hop mood={turnMood(t, i === turns.length - 1 && busy)} size={26} decorative /></span>
            <div className="min-w-0 flex-1">
              {!!t.tools?.length && (
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {[...new Set(t.tools)].map((x) => <span key={x} className="pop-in rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2 ring-1 ring-line">{x}</span>)}
                </div>
              )}
              {t.content && <Md text={t.content} />}
              {t.error && <p className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink">{t.error}</p>}
            </div>
          </div>
        ))}
        {status && <div className="flex items-center gap-2 pl-8 text-[12.5px]"><span className="shimmer font-medium">{status}</span></div>}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-line-2 bg-raised py-2 pl-3.5 pr-2 shadow-card transition-colors focus-within:border-ink-2">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={1} placeholder="Ask about a wallet, a chain or a moment"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
            className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent py-0.5 text-[13.5px] text-ink outline-none placeholder:text-muted" aria-label="Your question" />
          {busy ? <button type="button" onClick={() => abort.current?.abort()} aria-label="Stop" className="press grid h-8 w-8 place-items-center rounded-xl bg-surface-2 text-ink"><Square size={13} fill="currentColor" /></button>
            : <button type="submit" disabled={!input.trim()} aria-label="Ask" className="press grid h-8 w-8 place-items-center rounded-xl bg-ink text-surface disabled:opacity-25"><ArrowUp size={16} /></button>}
        </div>
        <p className="mt-1.5 px-1 text-[10.5px] leading-snug text-muted">AI answers can be wrong. Check figures against the linked sources.</p>
      </form>
    </aside>
  );
}
