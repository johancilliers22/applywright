/**
 * Model client factory. Three routes, in order of preference:
 *   1. Anthropic Messages API via the org key (`ANTHROPIC_ORG_API_KEY`) — the
 *      estate's sanctioned use for those credits: direct API, never Claude Code.
 *   2. Any OpenAI-compatible endpoint (DeepSeek by default, or OpenAI, Azure,
 *      vLLM, Ollama) via MODEL_API_KEY.
 *   3. No model at all, in which case tailoring stays on its deterministic
 *      rule-based path and the product still works.
 */

import { createAnthropicModelClient } from "./provider/anthropic.js";

export function createModelClient(config, options = {}) {
  const provider = String(config.model?.provider ?? "").toLowerCase();
  const anthropicKey = String(config.anthropic?.apiKey ?? "").trim();

  if (anthropicKey && (provider === "anthropic" || provider === "" || provider === "auto")) {
    const client = createAnthropicModelClient(config, options);
    if (client) return client;
  }

  const { apiKey, baseUrl, name, timeoutMs, maxTokens } = config.model;
  if (!apiKey) return null;

  return {
    kind: "openai-compatible",
    name,

    /**
     * One JSON-mode completion. Throws on transport or parse failure so the
     * caller can fall back to rules rather than shipping half a rewrite.
     */
    async complete({ system, prompt, schema }) {
      const body = {
        model: name,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      };

      let response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new Error(`model request failed: ${error.message}`);
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`model returned ${response.status}: ${detail.slice(0, 200)}`);
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) throw new Error("model returned no content");

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error("model returned content that is not JSON");
      }
      if (schema && typeof schema === "function" && !schema(parsed)) {
        throw new Error("model returned JSON that does not match the expected shape");
      }
      return parsed;
    },
  };
}
