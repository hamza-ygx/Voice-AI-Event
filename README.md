# Orben

Voice booth app for the RKJH client event (15 November 2026, 15:00–23:00). A visitor picks one of five characters, clicks the orb, talks, and gets a short spoken answer with live subtitles.

| Character | Orb | Field |
|---|---|---|
| Kocken | yellow | food, cooking, drinks |
| Psykologen | pink | everyday life, relationships, stress |
| Trädgårdaren | green | garden and plants, Halland climate |
| Conciergen | turquoise | travel, restaurants and things to do around the world |
| Kompisen | purple | everything else: names and meanings, history, science, tech, trivia (answers every topic, web search) |

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
| `TAVILY_API_KEY` | Web search for Conciergen (`/api/search`). Queries are short and contain no visitor details |
| `ORBEN_SEARCH_TOKEN` | Random, ≥ 32 chars. Same value as the ElevenLabs workspace secret `orben_search_token`; the `web_search` webhook tool sends it in the `Authorization` header |

Changing the PIN does not log out the booth. Rotate `SESSION_SECRET` to force everyone to re-enter it. Every env change needs a redeploy.

## Agents as code

`agents/` follows the ElevenLabs CLI layout:

- `agents/prompts/<id>.md`: character prompt; `_shared.md`: rules shared by all four.
- `agents/build.mjs`: generates `agents/agent_configs/<id>.json` from prompts + settings.
- `agents/agents.json`: agent name → agent ID. `/api/session` reads IDs from here.
- `agents/pronunciation/orben.pls`: pronunciation dictionary (emergency numbers digit by digit, VVS, AI, French food and wine words). Uploaded once in the ElevenLabs dashboard, attached to all four agents.
- `agents/tests.json`: the ElevenLabs LLM tests and which run per character. Re-run them after every prompt change.

```bash
node agents/build.mjs                                   # current: Gemini + Swedish voices (Filip, Evelina, Peter, Andreas, Jörgen)
node agents/build.mjs --placeholder-voices              # English premade voices (fallback)
node agents/build.mjs --custom-llm-secret <secret_id>   # Claude Haiku 5.5 via your Anthropic key
```

Pushing: the configs are applied through the ElevenLabs MCP connector (the CLI host is blocked from the dev container). With network access the CLI equivalent is `npx @elevenlabs/cli agents push` from `agents/`. The repo is the source of truth; don't edit agents in the dashboard.

### Current agent settings

| Setting | Value | Why |
|---|---|---|
| LLM | `gemini-3.1-flash-lite`, max 240 tokens (Psykologen and Kompisen 320 for the crisis line), backup `gemini-2.5-flash` | Fastest and cheapest model that passed every safety test (see below). Billed through ElevenLabs credits, no separate key |
| TTS | `eleven_v4_turbo` | Multilingual, low latency |
| Turn detection | `turn_v3`, eagerness `normal`, `speculative_turn: true` | `patient` kept listening too long in noise. The app also ends the turn itself after 2 s of silence (see below) |
| `turn_timeout` | `-1` | Never "are you still there?" while the mic is muted between clicks |
| `silence_end_call_timeout` | `60` s | Server-side backstop for the 60 s idle reset |
| `max_duration_seconds` | `600` | Cost cap |
| First message | empty | Waits for the visitor |
| Language | Swedish + auto-detect (en, de, da, no, fi, pl, ar, es, fr) | |
| Privacy | `zero_retention_mode: true`, `record_voice: false`, `retention_days: -1` (required by ZRM) | No audio, transcripts or PII stored by ElevenLabs |
| Limits | concurrency 3, 500 conversations/day, bursting off | Cost safety |

Measured in ElevenLabs tests: LLM first sentence ≈ 1.0 s after the user turn ends.

### Model choice

Benchmarked 30 Oct 2026 on copies of Kocken (4 tests × 5) and Psykologen (3 tests × 3):

| | 2.5 Flash | **3.1 Flash-Lite** | 3.5 Flash-Lite | 3.8 Flash |
|---|---|---|---|---|
| Whole answer, median / worst | 1.00 / 1.30 s | **0.85 / 1.07 s** | 0.88 / 1.26 s | 3.54 / 11.5 s |
| Safety tests (112, crisis) | all passed | **all passed** | wrong hotline digit, unsafe gas advice | 2 of 5 emergency answers broken |
| $/min (ElevenLabs estimate) | 0.0068 | **0.0060** | 0.0075 | 0.0179 |

After switching, the full suite (all 4 characters, every test × 3) passed 69/69, median 0.80 s. Thinking cannot be turned off on the 3.x models; 3.1 Flash-Lite does not think by default, 3.8 Flash does and is too slow.

Hotline numbers (112, 1177, 90101) are kept as digits in the prompt and spoken via the pronunciation dictionary; spelling them out made one model say the wrong number.

### Why not Claude

Measured 30 Oct 2026, same 4 Kocken tests × 5 runs each:

| Seconds (median / p90 / worst) | Gemini 2.5 Flash | Claude Haiku 5.5 via own Anthropic key |
|---|---|---|
| First sentence from the LLM | 0.50 / 0.75 / 0.81 | 1.10 / 2.76 / 7.42 |
| Whole answer, from end of user turn | 1.00 / 1.15 / 1.30 | 1.95 / 3.00 / 8.44 |
| Tests passed | 20/20 | 18/20 (2 answers cut off mid-sentence) |

- A custom LLM (own Anthropic key) is not allowed with `zero_retention_mode`, so it would also mean storing transcripts.
- ElevenLabs' built-in Claude errors in this workspace and silently falls back to the backup model.
- `build.mjs --custom-llm-secret <id>` is kept in case this changes.

## How the conversation works

- Picking a character asks for the mic once and opens a session. The mic starts muted.
- Click the orb → mic opens ("Jag lyssnar…"). Turn detection decides when the visitor is done.
- Agent answers → mic mutes, subtitles stream the answer.
- Click while the agent talks → its audio is muted instantly and the mic opens. The server stops generating when the visitor starts speaking (ElevenLabs has no client-side "stop generation" call; if the visitor stays silent, the rest of the answer is generated but not heard).
- "Byt person", "Börja om", 60 s without speech from either side, or the 10 min cap → session ends, everything is cleared, back to the picker.
- The app ends the visitor's turn itself after 2 s without speech (normal pauses mid-sentence are fine), after 20 s of listening at most. If the transcript ends on an unfinished word ("och", "men", "att", "and", "…"), the mic reopens and the agent is held (`sendUserActivity`) until 3 s of silence; anything said in that window is read together with the first part, and goes back to idle if nobody speaks within 8 s. If no answer arrives within 10 s it returns to idle.
- Short rising/falling tones mark mic open/closed. The mic opens 180 ms after the tone so the tone isn't transcribed.
- Subtitles reveal at the character's speaking pace, show "Du sa: …" (what speech recognition heard), and after the answer a QR code opens `/tips#<tip>` on the visitor's phone, with buttons to save it to Notes (share sheet), copy it or download it as a .txt. The tip lives only in the URL fragment, which browsers never send to the server, so nothing is stored or logged.
- No hand-offs: every character answers every question itself in its own voice (speciality = flavour, not a limit). All five have web search and the crisis and emergency rules. The `switch_character` client code is kept but no agent has the tool any more.
- Voices differ in loudness. Default `gain` in `src/lib/characters.ts` is 1.0 for Conciergen (Andreas, a quiet voice) and 0.5 for the others; the staff panel has a balance slider per character (saved in the browser) to even them out by ear at the sound check.
- A dropped or failed connection retries once automatically before showing the error screen.
- The picker rotates a highlighted character and an example question every 4.5 s to draw people in.

## Staff panel

On the picker, press and hold the heading "Vem vill du prata med?" (or the small RKJH text bottom right) for 1.5 s, or press Ctrl+Shift+P. It has:
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
7. Keep an eye on ElevenLabs credits during the evening.

## After the event

1. ElevenLabs: archive or delete the four `Orben – …` agents.
2. ElevenLabs: delete the restricted API key used by Vercel.
3. Vercel: pause or delete the `voice_orb_agent` project.
