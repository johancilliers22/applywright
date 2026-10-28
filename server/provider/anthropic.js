/**
 * Anthropic Messages API client for the tailoring model.
 *
 * Why this exists: Applywright's default model adapter speaks the OpenAI
 * `/chat/completions` dialect. Anthropic speaks `/v1/messages` with an `x-api-key`
 * header, so a key cannot simply be dropped into MODEL_API_KEY.
 *
 * Estate canon (brain/estate-providers-and-harness-register.md): the org API key
 * is `ANTHROPIC_ORG_API_KEY`, $200/month credits, **direct API only** — the
 * credits exclude Claude Code, and the key must never be set as
 * `ANTHROPIC_API_KEY` because that flips Claude Code onto API billing. This
 * module therefore reads ANTHROPIC_ORG_API_KEY only, and only in this process.
 */

const DEFAULT_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

const JSON_INSTRUCTION =
  "Reply with a single JSON object and nothing else — no prose, no code fences.";

/**
 * Pull a JSON object out of a Messages response. Claude usually obeys the
 * instruction, but a stray fence or a leading sentence must not crash a turn.
 */
export function extractJson(text) {
  if (typeof text !== "string") throw new Error("model returned no text");
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      /* try the next shape */
    }
  }
  throw new Error("model did not return a JSON object");
}

export function createAnthropicModelClient(config, { fetchImpl = fetch } = {}) {
  const settings = config.anthropic ?? {};
  const apiKey = String(settings.apiKey ?? "").trim();
  if (!apiKey) return null;

  const baseUrl = String(settings.baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
  const model = settings.model || "claude-sonnet-4-5";
  const timeoutMs = settings.timeoutMs ?? 60_000;
  const maxTokens = settings.maxTokens ?? 2_000;

  return {
    kind: "anthropic",
    name: model,

    async complete({ system, prompt, schema }) {
      const body = {
        model,
        max_tokens: maxTokens,
        temperature: 0.2,
        system: `${system}\n\n${JSON_INSTRUCTION}`,
        messages: [{ role: "user", content: prompt }],
      };

      let response;
      try {
        response = await fetchImpl(`${baseUrl}/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new Error(`anthropic request failed: ${error.message}`);
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        // Never echo the key; the upstream body never contains it.
        throw new Error(`anthropic returned ${response.status}: ${detail.slice(0, 200)}`);
      }

      const payload = await response.json();
      const text = (payload?.content ?? [])
        .filter((block) => block?.type === "text")
        .map((block) => block.text)
        .join("\n");

      const parsed = extractJson(text);
      if (schema && typeof schema === "function" && !schema(parsed)) {
        throw new Error("model returned JSON that does not match the expected shape");
      }
      return parsed;
    },
  };
}
