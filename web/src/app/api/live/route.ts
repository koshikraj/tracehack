import { loadSnapshot } from "@/lib/snapshot-server";
import { readLive } from "@/lib/live";

export async function GET(request: Request) {
  void request.headers; // request-time route: never prerendered
  const snap = await loadSnapshot();
  const result = await readLive(snap);
  return Response.json(result, { headers: { "cache-control": "public, max-age=30, s-maxage=60" } });
}
