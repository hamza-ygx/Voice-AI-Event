import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8").trim();

const useLibraryVoices = !process.argv.includes("--placeholder-voices");
const customSecretArg = process.argv.indexOf("--custom-llm-secret");
const customSecretId = customSecretArg > -1 ? process.argv[customSecretArg + 1] : null;

const CHARACTERS = {
  kocken: { name: "Orben – Kocken", voice_id: "IKne3meq5aSn9XLyUdCD", library_voice_id: "ISDDl0xPNLMD73L5PQj4", stability: 0.4, speed: 1.05, keywords: ["entrecôte", "kyckling", "vin"] },
  psykologen: { name: "Orben – Psykologen", voice_id: "EXAVITQu4vr4xnSDxMaL", library_voice_id: "kPdGSxhZAqy4bmPAf9iJ", stability: 0.6, speed: 0.92, keywords: ["chef", "somna", "stress"] },
  tradgardaren: { name: "Orben – Trädgårdaren", voice_id: "JBFqnCBsd6RMkjVDRZzb", library_voice_id: "oJEeOXECH9V31Oci9WHK", stability: 0.55, speed: 0.97, keywords: ["äppelträd", "beskära", "tomater"] },
  huset: { name: "Orben – Huset", voice_id: "XrExE9yKIg1WjnnlVkGX", library_voice_id: "4Ct5uMEndw4cJ7q0Jx0l", stability: 0.55, speed: 1.03, keywords: ["packning", "avlopp", "kran"] },
};

const OTHER_LANGUAGES = ["en", "de", "da", "no", "fi", "pl", "ar", "es", "fr"];

const llm = customSecretId
  ? {
      llm: "custom-llm",
      custom_llm: {
        url: "https://api.anthropic.com/v1",
        model_id: "claude-haiku-5-5",
        api_key: { secret_id: customSecretId },
        api_type: "chat_completions",
      },
    }
  : { llm: "gemini-2.5-flash" };

const shared = read("prompts/_shared.md");

for (const [id, c] of Object.entries(CHARACTERS)) {
  const config = {
    name: c.name,
    tags: ["orben"],
    conversation_config: {
      agent: {
        first_message: "",
        language: "sv",
        disable_first_message_interruptions: false,
        prompt: {
          prompt: `${read(`prompts/${id}.md`)}\n\n${shared}`,
          ...llm,
          temperature: customSecretId ? null : 0.4,
          max_tokens: 300,
          thinking_budget: 0,
          timezone: "Europe/Stockholm",
          ignore_default_personality: true,
          backup_llm_config: customSecretId
            ? { preference: "disabled" }
            : { preference: "override", order: ["gemini-2.5-flash-lite"] },
          built_in_tools: {
            language_detection: { type: "system", name: "language_detection", pre_tool_speech: "off", params: { system_tool_type: "language_detection" } },
          },
        },
      },
      tts: {
        model_id: "eleven_v4_turbo",
        voice_id: useLibraryVoices ? c.library_voice_id : c.voice_id,
        stability: c.stability,
        speed: c.speed,
        similarity_boost: 0.8,
      },
      turn: {
        mode: "turn",
        turn_model: "turn_v3",
        turn_eagerness: "patient",
        speculative_turn: true,
        turn_timeout: -1,
        silence_end_call_timeout: 60,
        soft_timeout_config: { timeout_seconds: -1 },
      },
      asr: { keywords: ["Kocken", "Psykologen", "Trädgårdaren", "Huset", ...c.keywords] },
      conversation: {
        max_duration_seconds: 600,
        client_events: [
          "conversation_initiation_metadata",
          "audio",
          "interruption",
          "user_transcript",
          "agent_response",
          "agent_response_correction",
          "agent_chat_response_part",
          "vad_score",
          "ping",
        ],
      },
      language_presets: Object.fromEntries(OTHER_LANGUAGES.map((l) => [l, { overrides: {} }])),
    },
    platform_settings: {
      auth: { enable_auth: true },
      privacy: {
        record_voice: false,
        retention_days: -1,
        zero_retention_mode: true,
      },
      call_limits: { agent_concurrency_limit: 3, daily_limit: 500, bursting_enabled: false },
      overrides: { custom_llm_extra_body: Boolean(customSecretId) },
      trust_context: "low",
    },
  };
  writeFileSync(join(root, "agent_configs", `${id}.json`), JSON.stringify(config, null, 2) + "\n");
}

console.log(`Wrote ${Object.keys(CHARACTERS).length} agent configs (${customSecretId ? "Claude via custom LLM" : "temporary Gemini"}, ${useLibraryVoices ? "library" : "placeholder"} voices).`);
