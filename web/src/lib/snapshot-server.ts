// Server-only snapshot loader for API routes.
import fs from "node:fs/promises";
import path from "node:path";
import type { Snapshot } from "./types";

let snap: Snapshot | null = null;

export async function loadSnapshot(): Promise<Snapshot> {
  if (!snap) snap = JSON.parse(await fs.readFile(path.join(process.cwd(), "public", "snapshot.json"), "utf8")) as Snapshot;
  return snap;
}
