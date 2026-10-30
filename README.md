# Orben

Voice booth app for the RKJH client event (15 November 2026, 15:00–23:00). A visitor picks one of four characters, clicks the orb, talks, and gets a short spoken answer with live subtitles.

| Character | Orb | Field |
|---|---|---|
| Kocken | yellow | food, cooking, drinks |
| Psykologen | pink | everyday life, relationships, stress |
| Trädgårdaren | green | garden and plants, Halland climate |
| Huset | slate blue | home repairs and maintenance |

## Architecture

- **Next.js 16 (App Router), TypeScript**, hosted on Vercel (team RKJH, project `voice_orb_agent`).
- **ElevenLabs Agents** for speech-to-text, turn-taking and text-to-speech, over WebRTC via `@elevenlabs/react` (`Conversation` from `@elevenlabs/client`).
- **Agents are private** (`enable_auth: true`). The browser never sees the ElevenLabs key: `POST /api/session` checks the PIN cookie and mints a short-lived conversation token server-side.
- **PIN lock**: `POST /api/pin` compares against `APP_PIN` in constant time and sets an HMAC-signed, `httpOnly`, `Secure`, `SameSite=Strict` cookie valid for 3 days.
- **Rate limits** (per IP, per server instance): PIN 5 tries / 10 min, session 20 / min, health 10 / min.
- No analytics, no cookies besides the PIN cookie, no transcript or audio logging on Vercel.

```
src/app/api/pin        PIN check, sets cookie
src/app/api/session    cookie check, mints ElevenLabs conversation token
src/app/api/health     cookie check, test-mints a token (staff panel status)
src/components/Booth   character picker, attract mode, staff-panel long-press
src/components/ConversationScreen  session, click-to-talk, interrupt, cues, auto-retry, idle reset, errors
src/components/Subtitles  paced subtitles, "Du sa", QR take-home
src/components/StaffPanel mic picker + level meter, voice volume, connection check
src/components/Kiosk   hides cursor, blocks context menu/drag, fullscreen on first tap
src/components/Orb     canvas orb: idle / listening / thinking / speaking
agents/                agents as code (see below)
```

## Environment variables (Vercel → Settings → Environment Variables, Production + Preview, type Sensitive)

| Name | What |
|---|---|
| `APP_PIN` | Booth PIN, digits only, max 12 |
| `SESSION_SECRET` | Random, ≥ 32 chars. PowerShell: `$b=New-Object byte[] 32;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b);[Convert]::ToBase64String($b)\|Set-Clipboard` |
| `ELEVENLABS_API_KEY` | Restricted key, "ElevenLabs Agents" permission only, **from the same workspace as the agents** |

Changing the PIN does not log out the booth. Rotate `SESSION_SECRET` to force everyone to re-enter it. Every env change needs a redeploy.

## Agents as code

`agents/` follows the ElevenLabs CLI layout:

- `agents/prompts/<id>.md`: character prompt; `_shared.md`: rules shared by all four.
- `agents/build.mjs`: generates `agents/agent_configs/<id>.json` from prompts + settings.
- `agents/agents.json`: agent name → agent ID. `/api/session` reads IDs from here.
- `agents/tests.json`: the ElevenLabs LLM tests and which run per character. Re-run them after every prompt change.

```bash
node agents/build.mjs                                   # current: Gemini + Swedish voices (Filip, Evelina, Peter, Elin)
node agents/build.mjs --placeholder-voices              # English premade voices (fallback)
node agents/build.mjs --custom-llm-secret <secret_id>   # Claude Haiku 5.5 via your Anthropic key
```

Pushing: the configs are applied through the ElevenLabs MCP connector (the CLI host is blocked from the dev container). With network access the CLI equivalent is `npx @elevenlabs/cli agents push` from `agents/`. The repo is the source of truth; don't edit agents in the dashboard.

### Current agent settings

| Setting | Value | Why |
|---|---|---|
| LLM | `gemini-2.5-flash`, thinking off, max 300 tokens, backup `gemini-2.5-flash-lite` | **Temporary.** Built-in Claude is not available in this workspace; switch to custom-LLM Claude once the Anthropic key secret exists |
| TTS | `eleven_v4_turbo` | Multilingual, low latency |
| Turn detection | `turn_v3`, eagerness `patient`, `speculative_turn: true` | Waits through mid-sentence pauses; speculative turn starts the LLM during silence to keep first audio around 1–2 s |
| `turn_timeout` | `-1` | Never "are you still there?" while the mic is muted between clicks |
| `silence_end_call_timeout` | `60` s | Server-side backstop for the 60 s idle reset |
| `max_duration_seconds` | `600` | Cost cap |
| First message | empty | Waits for the visitor |
| Language | Swedish + auto-detect (en, de, da, no, fi, pl, ar, es, fr) | |
| Privacy | `zero_retention_mode: true`, `record_voice: false`, `retention_days: -1` (required by ZRM) | No audio, transcripts or PII stored by ElevenLabs |
| Limits | concurrency 3, 500 conversations/day, bursting off | Cost safety |

Measured in ElevenLabs tests: LLM first sentence ≈ 1.0 s after the user turn ends.

### Switching to Claude (your Anthropic key)

1. Anthropic Console: workspace `orben-booth`, monthly spend limit, API key in that workspace.
2. ElevenLabs (the workspace the agents live in) → Agents → Settings → Secrets → add the key, name `anthropic_api_key`.
3. Tell Claude Code the secret exists; it reads the `secret_id` and applies `--custom-llm-secret` to all four agents (custom LLM `https://api.anthropic.com/v1`, model `claude-haiku-5-5`, `temperature: null`).

## How the conversation works

- Picking a character asks for the mic once and opens a session. The mic starts muted.
- Click the orb → mic opens ("Jag lyssnar…"). Turn detection decides when the visitor is done.
- Agent answers → mic mutes, subtitles stream the answer.
- Click while the agent talks → its audio is muted instantly and the mic opens. The server stops generating when the visitor starts speaking (ElevenLabs has no client-side "stop generation" call; if the visitor stays silent, the rest of the answer is generated but not heard).
- "Byt person", "Börja om", 60 s without speech from either side, or the 10 min cap → session ends, everything is cleared, back to the picker.
- Short rising/falling tones mark mic open/closed. The mic opens 180 ms after the tone so the tone isn't transcribed.
- Subtitles reveal at the character's speaking pace, show "Du sa: …" (what speech recognition heard), and after the answer a QR code holds the tip as plain text (nothing leaves the device; the phone just reads the text).
- A dropped or failed connection retries once automatically before showing the error screen.
- The picker rotates a highlighted character and an example question every 4.5 s to draw people in.

## Staff panel

Press and hold the **RKJH** wordmark on the picker for 1.5 s. It has:
- microphone picker with a live level meter (saved in this browser),
- voice volume slider and a speaker test tone,
- internet and voice-service status (`/api/health` mints a test token and shows the round-trip time),
- reload button.

## Booth-day checklist (15 Nov)

1. Laptop on power, sleep and screen saver off, notifications off (Focus / Do Not Disturb).
2. Chrome, open the production URL, enter the PIN. The first tap goes fullscreen and the cursor hides after 3 s. For true kiosk mode start Chrome with `--kiosk <url>`.
3. External mic: a directional or headset mic beats the laptop mic in a noisy room. Plug in before opening Chrome, allow the mic, then pick it in the staff panel and check the meter.
4. Volume: computer volume ~70 %, fine-tune in the staff panel, test with each character. Stand 1–2 m away and check subtitles are readable.
5. Network: venue wifi, with a phone hotspot ready. If "Ingen internetanslutning" shows, switch to the hotspot and click "Försök igen".
6. Restart if anything is stuck: click "Börja om". Still stuck: reload the page (`Ctrl+R`). The PIN cookie survives reloads.
7. Keep an eye on ElevenLabs credits and the Anthropic spend during the evening.

## After the event

1. ElevenLabs: archive or delete the four `Orben – …` agents, and delete the `anthropic_api_key` secret.
2. ElevenLabs: delete the restricted API key used by Vercel.
3. Anthropic: disable or delete the `orben-booth` key.
4. Vercel: pause or delete the `voice_orb_agent` project.
