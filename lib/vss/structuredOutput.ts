import type { IncidentDraft } from './types';

/**
 * Turns a model's answer into { summary, events } — shared by both real
 * paths that can produce structured output (client.ts's native VSS `schema`
 * field, and nvidiaHosted.ts's prompted JSON block), so there is one place
 * that decides what "detected an event" means, not three.
 *
 * Never throws. A response that cannot be parsed is treated as "the model
 * reported no structured events", the same honest-empty behavior the app
 * already uses elsewhere — it does not invent detections that were not
 * reported. See ARCHITECTURE.md's known-gaps table, which this closes.
 */

/**
 * Appended to the user prompt in nvidia-hosted mode, which is a raw chat
 * completion with no native structured-output field — the model has to be
 * told, in the prompt, to end its answer with a JSON block. Real VSS does
 * not need this; it gets a `schema` field instead (see buildJsonSchema).
 */
export function buildPromptInstruction(knownCodes: string[]): string {
  const codeList = knownCodes.length
    ? `one of: ${knownCodes.join(', ')}, or "other" if none fit`
    : `a short snake_case label describing what happened`;

  return `

First, answer normally in plain English.

Then, on a new line, add a fenced code block labeled json with this exact
structure, using only what is visible in the frames:

\`\`\`json
{"events": [{"event_type": "<${codeList}>", "offset_seconds": <your best estimate as a number>, "description": "<one short sentence>", "objects": ["<objects involved>"]}]}
\`\`\`

If nothing relevant happened, use "events": [].`;
}

/**
 * A JSON Schema string for real VSS's `schema` field (SummarizationQuery —
 * see services/video-summarization/api_spec/openapi.json). UNVERIFIED
 * against a live deployment — built from the documented field shape, not
 * confirmed against a running LVS. If a real deployment ignores it or
 * formats differently, extractStructured()'s fallback to prose-only still
 * keeps the app working; only the timeline stays empty, same as today.
 */
export function buildJsonSchema(knownCodes: string[]): string {
  return JSON.stringify({
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'A short plain-English summary of the video.' },
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            event_type: knownCodes.length ? { type: 'string', enum: [...knownCodes, 'other'] } : { type: 'string' },
            offset_seconds: { type: 'number' },
            description: { type: 'string' },
            objects: { type: 'array', items: { type: 'string' } },
          },
          required: ['event_type', 'description'],
        },
      },
    },
    required: ['summary', 'events'],
  });
}

export interface StructuredExtraction {
  summary: string;
  events: IncidentDraft[];
}

/**
 * Accepts any of: a pure JSON string matching the schema above (real VSS
 * structured mode), prose followed by a ```json fenced block (nvidia-hosted,
 * prompted for it), or plain prose with no structure at all (older
 * behavior, or the model ignored the instruction). `knownCodes` is optional
 * — when supplied, an event_type outside that list is relabelled "other"
 * rather than trusted verbatim; when omitted (real VSS, where the allowed
 * values were already constrained via the schema's enum at generation
 * time), whatever the model wrote is passed through as-is.
 */
export function extractStructured(raw: string, knownCodes?: string[]): StructuredExtraction {
  const fenceMatch = raw.match(/```json\s*([\s\S]*?)```/i);
  const candidate = (fenceMatch ? fenceMatch[1] : raw).trim();
  const proseBefore = fenceMatch ? raw.slice(0, fenceMatch.index).trim() : '';

  let parsed: any;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    // Nothing in the response was valid JSON — treat the whole thing as
    // prose and report no structured events, rather than failing the run.
    return { summary: raw.trim(), events: [] };
  }

  const summary = typeof parsed.summary === 'string' && parsed.summary.trim()
    ? parsed.summary.trim()
    : proseBefore || raw.trim();

  const rawEvents = Array.isArray(parsed.events) ? parsed.events : [];
  const events: IncidentDraft[] = rawEvents
    .filter((e: any) => e && typeof e === 'object')
    .map((e: any) => {
      const code = typeof e.event_type === 'string' ? e.event_type : 'other';
      return {
        eventCode: knownCodes && !knownCodes.includes(code) ? 'other' : code,
        offsetMs: Number.isFinite(e.offset_seconds) ? Math.max(0, Math.round(e.offset_seconds * 1000)) : 0,
        description: typeof e.description === 'string' && e.description.trim() ? e.description.trim() : 'Detected event',
        objectIds: Array.isArray(e.objects) ? e.objects.filter((o: unknown) => typeof o === 'string') : [],
      };
    });

  return { summary, events };
}
