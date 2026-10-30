"use client";

import type { Snapshot } from "@/lib/types";
import { utc, short } from "@/lib/format";
import { ExtLink } from "./ui";
import { ChainIcon, SourceLogo, ICON_CREDITS } from "./icons";

const CAPTURE: Record<Snapshot["sources"][number]["capture"], { label: string; strong: boolean }> = {
  "full-text": { label: "Full article saved", strong: true },
  post: { label: "Post saved", strong: true },
  snippet: { label: "Search snippet only", strong: false },
  "not-captured": { label: "Not captured yet", strong: false },
};

function CaptureBadge({ c }: { c: Snapshot["sources"][number]["capture"] }) {
  const k = CAPTURE[c];
  return (
    <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${k.strong ? "bg-surface-2 text-ink-2" : "text-ink-2"}`}
      style={k.strong ? undefined : { outline: "1px dashed var(--line-2)", outlineOffset: -1 }}>{k.label}</span>
  );
}

export default function SourcesView({ snap }: { snap: Snapshot }) {
  return (
    <div className="scroll-thin h-full overflow-auto bg-bg px-5 py-7">
      <div className="mx-auto max-w-[760px] space-y-9 text-[14px] leading-relaxed text-ink-2">
        <section>
          <h2 className="display text-[22px] font-bold tracking-tight text-ink">How this is built</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li><b className="text-ink">Transfers.</b> We traced the stolen funds hop by hop on Ethereum, Tron and Bitcoin using public block explorers. Spam is removed first: fake tokens with look-alike names, zero-value transfers, look-alike addresses and tiny &ldquo;dust&rdquo; payments sent to pollute wallet histories. Transfers between the same two wallets in the same asset are drawn as one line. This tracing is a first pass, and we&apos;re still checking it.</li>
            <li><b className="text-ink">Totals.</b> &ldquo;Where it sits now&rdquo; adds up balances we read directly from the blockchains at attacker-linked wallets, between 06:11 and 06:29 UTC on 30 Oct. Figures that firms or news outlets reported are shown separately and never added in. When the live check sees a wallet&apos;s ETH, BTC, TRX, XRP or SOL balance change, that change is added to &ldquo;Held by attacker&rdquo;.</li>
            <li><b className="text-ink">Frozen.</b> Counted only when the token issuer&apos;s own freeze check returns &ldquo;frozen&rdquo; on-chain. RLUSD is the exception: Ripple said it froze it, but there&apos;s no public check we can run, so it&apos;s marked reported. Tether&apos;s check didn&apos;t work on Avalanche or Polygon, so those balances show as &ldquo;freeze status unknown&rdquo;.</li>
            <li><b className="text-ink">Lending.</b> The Aave position is counted as the USDT deposited minus the ETH borrowed against it. {snap.notes.lending.replace("Counts the Aave position only. ", "")}</li>
            <li><b className="text-ink">Not counted.</b> Money inside exchanges&apos; trading pools, routers and bridges (it was swapped or moved on, and isn&apos;t the attacker&apos;s wallet), and small hops we haven&apos;t reviewed yet. Some of those could belong to trading firms or exchange deposit accounts.</li>
            <li><b className="text-ink">Prices.</b> {snap.meta.priceNote} Tokens with no price available are left out of dollar totals.</li>
            <li><b className="text-ink">How sure we are.</b> &ldquo;Verified on-chain&rdquo; means we read it from the blockchain ourselves. &ldquo;Traced on-chain&rdquo; comes from block-explorer data. &ldquo;Reported&rdquo; means someone else said it and we haven&apos;t checked. On the map, dashed lines and outlines mark reported items.</li>
            <li><b className="text-ink">People.</b> Public figures and organisations are named, with their public profile picture, alongside their own public posts. Private accounts are left out. Claims about who did it appear only as &ldquo;attributed by&rdquo; the firm that made them.</li>
          </ul>
          {snap.notes.dataFixes.length > 0 && (
            <div className="mt-4 rounded-xl border border-line bg-raised p-3 text-[12.5px]">
              <b className="text-ink">Corrections to the traced data.</b>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">{snap.notes.dataFixes.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
          )}
        </section>

        <section>
          <h2 className="display text-[22px] font-bold tracking-tight text-ink">Chains</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-line text-left text-muted"><th className="py-1.5 pr-3">Chain</th><th className="pr-3">Transfers</th><th className="pr-3">Balances</th><th className="pr-3">First exploit tx</th><th className="pr-3">Balances read</th><th>Note</th></tr></thead>
              <tbody>
                {snap.chains.map((c) => (
                  <tr key={c.chain} className="border-b border-line align-top">
                    <td className="py-2 pr-3 font-medium text-ink"><span className="inline-flex items-center gap-2"><ChainIcon chain={c.chain} size={16} />{c.name}</span></td>
                    <td className="pr-3">{c.traced === "edges" ? `${c.edges} traced` : c.traced === "single-hop" ? "First hop traced" : "Reported"}</td>
                    <td className="pr-3">{c.balances === "on-chain" ? "Read on-chain" : "Reported"}</td>
                    <td className="mono pr-3">{c.firstExploitTx ? short(c.firstExploitTx, 8) : "—"}<div className="font-sans text-muted">{c.firstExploitVerification.startsWith("verified") ? "Verified on-chain" : c.firstExploitVerification.startsWith("REPORTED") ? "Reported" : "Not verified yet"}</div></td>
                    <td className="pr-3">{utc(c.lastUpdated)}</td>
                    <td className="text-muted">{c.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="display text-[22px] font-bold tracking-tight text-ink">Reported figures</h2>
          <ul className="mt-2 space-y-1">
            {[...snap.reported.stolenEstimates, ...snap.reported.frozenClaims, ...snap.reported.attribution].map((r, i) => (
              <li key={i} className="flex items-start gap-2.5"><SourceLogo source={r.url} name={r.by} size={18} /><span>{r.label}: <b className="text-ink">{r.value}</b>. {r.label === "Attribution" ? "Attributed by" : "Reported by"} <ExtLink href={r.url}>{r.by}</ExtLink>{r.time ? ` (${utc(r.time)})` : ""}</span></li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="display text-[22px] font-bold tracking-tight text-ink">Sources <span className="num font-normal text-muted">({snap.sources.length})</span></h2>
          <p className="mt-1 text-[13px] text-muted">Every source here is about this hack. The tag on each card says how much of it we saved: the full article, the X post itself, only a search snippet (the page blocked our capture), or nothing yet.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {snap.sources.map((s) => (
              <li key={s.url} className="rounded-2xl border border-line bg-raised p-3 shadow-card">
                <div className="flex items-center gap-2.5">
                  <SourceLogo source={s.url} name={s.author} size={26} />
                  <div className="min-w-0 leading-tight">
                    <ExtLink href={s.url} className="block truncate text-[13.5px] font-semibold text-ink">{s.author}</ExtLink>
                    <span className="text-[11.5px] text-muted">{s.type}, {s.date}</span>
                  </div>
                </div>
                <p className="mt-2 line-clamp-4 text-[12.5px] leading-snug text-ink-2">{s.summary}</p>
                <CaptureBadge c={s.capture} />
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="display text-[22px] font-bold tracking-tight text-ink">Left out</h2>
          <p className="mt-1 text-[13px] text-muted">Items in the research data that aren&apos;t about this hack, or carry no information, so they aren&apos;t shown or used anywhere on the site.</p>
          <h3 className="display mt-4 text-[15px] font-semibold text-ink">Sources ({snap.excluded.sources.length})</h3>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {snap.excluded.sources.map((s) => (
              <li key={s.url} className="flex gap-2.5"><SourceLogo source={s.url} name={s.author} size={16} /><span><ExtLink href={s.url} className="font-medium text-ink">{s.author}</ExtLink> <span className="text-ink-2">{s.reason}.</span></span></li>
            ))}
          </ul>
          <details className="mt-4 rounded-xl border border-line bg-raised p-3">
            <summary className="display cursor-pointer text-[15px] font-semibold text-ink">Posts on X ({snap.excluded.posts.length})</summary>
            <ul className="mt-2 space-y-1.5 text-[12.5px]">
              {snap.excluded.posts.map((p) => (
                <li key={p.id}><ExtLink href={p.url} className="font-medium text-ink">{p.name}</ExtLink> <span className="text-muted">&ldquo;{p.text.length > 70 ? p.text.slice(0, 69) + "…" : p.text}&rdquo;</span> <span className="text-ink-2">{p.reason}.</span></li>
              ))}
            </ul>
          </details>
        </section>

        <section className="rounded-lg border border-line p-4 text-xs">
          <b className="text-ink">Disclaimer.</b> {snap.meta.disclaimer} {ICON_CREDITS} Snapshot: {snap.meta.dataSnapshot}. For corrections, contact the site maintainers.
        </section>
      </div>
    </div>
  );
}
