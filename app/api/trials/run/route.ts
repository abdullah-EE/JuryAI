import { executeTrialStream } from "@/lib/trial-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let setup: unknown = {};
  try { setup = await request.json(); } catch { /* Defaults are safe. */ }
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void executeTrialStream(
        typeof setup === "object" && setup !== null ? setup : {},
        (event) => { if (!cancelled) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); },
      ).then(() => { if (!cancelled) controller.close(); }).catch(() => {
        if (cancelled) return;
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "trial_completed", sequence: 1, timestamp: new Date().toISOString(), status: "fallback_failed_safely", mode: "fallback" })}\n`));
        controller.close();
      });
    },
    cancel() { cancelled = true; },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Content-Type-Options": "nosniff" } });
}
