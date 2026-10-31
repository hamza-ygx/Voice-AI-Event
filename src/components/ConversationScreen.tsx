"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Conversation, type VoiceConversation } from "@elevenlabs/react";
import Orb, { type OrbAudio, type OrbPhase } from "./Orb";
import Subtitles, { type RevealMode } from "./Subtitles";
import { cueListenStart, cueListenStop } from "@/lib/sounds";
import { getMicId, getVolume } from "@/lib/settings";
import { isCharacterId, type Character, type CharacterId } from "@/lib/characters";

const IDLE_LIMIT_MS = 60_000;
const SPEECH_VAD = 0.5;
const STILL_TALKING_VAD = 0.25;
const MIC_OPEN_DELAY_MS = 180;
const AUTO_RETRIES = 1;
const END_SILENCE_MS = 2000;
const NO_SPEECH_MS = 8000;
const MAX_LISTEN_MS = 20_000;
const MAX_THINK_MS = 10_000;
const DANGLING_SILENCE_MS = 3000;
const DANGLING_MIN_OPEN_MS = 1500;
const DANGLING =
  /(?:^|[\s,])(och|och så|men|eller|att|eftersom|fast|som|när|typ|alltså|liksom|asså|ehm|eh|öh|öhm|hmm|en|ett|and|but|or|because|um|uh|the)[\s,.…-]*$|(\.\.\.|…|-)\s*$/i;

const spoken = (text: string) =>
  text
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\[[^\]]*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

type ErrorKind = "mic" | "offline" | "session" | "dropped" | "auth";

const ERRORS: Record<ErrorKind, { title: string; body: string }> = {
  mic: {
    title: "Mikrofonen är blockerad",
    body: "Klicka på ikonen till vänster om adressfältet, tillåt mikrofonen och försök igen. Kontrollera också att den externa mikrofonen är inkopplad.",
  },
  offline: {
    title: "Ingen internetanslutning",
    body: "Kontrollera wifi eller anslut till mobilens hotspot och försök sedan igen.",
  },
  session: {
    title: "Samtalet kunde inte starta",
    body: "Något gick fel hos röstjänsten. Vänta några sekunder och försök igen.",
  },
  dropped: {
    title: "Samtalet bröts",
    body: "Anslutningen försvann mitt i samtalet. Kontrollera internet och försök igen.",
  },
  auth: {
    title: "Inloggningen har gått ut",
    body: "Ladda om sidan och ange PIN-koden igen.",
  },
};

const HINTS: Record<OrbPhase, string> = {
  connecting: "Ansluter…",
  idle: "Klicka för att prata",
  listening: "Jag lyssnar…",
  thinking: "Funderar…",
  speaking: "Klicka för att avbryta",
};

export type Handoff = { from: string; greeting: string; topic: string; language: string };

const HANDOFF_LANGUAGES = ["sv", "en", "de", "da", "no", "fi", "pl", "ar", "es", "fr"];
const SWITCH_FALLBACK_MS = 8000;

type Props = {
  character: Character;
  onExit: () => void;
  handoff?: Handoff | null;
  onSwitch?: (to: CharacterId, handoff: Handoff) => void;
};

export default function ConversationScreen({ character, onExit, handoff, onSwitch }: Props) {
  const [phase, setPhaseState] = useState<OrbPhase>("connecting");
  const [subtitle, setSubtitle] = useState("");
  const [userSaid, setUserSaid] = useState("");
  const [error, setError] = useState<ErrorKind | null>(null);
  const [attempt, setAttempt] = useState(0);

  const conv = useRef<VoiceConversation | null>(null);
  const phaseRef = useRef<OrbPhase>("connecting");
  const micOpen = useRef(false);
  const heardSpeech = useRef(false);
  const interrupting = useRef(false);
  const ignoreParts = useRef(false);
  const lastActivity = useRef(Date.now());
  const ending = useRef(false);
  const audio = useRef<OrbAudio | null>(null);
  const retries = useRef(0);
  const micTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseSince = useRef(Date.now());
  const lastSpeech = useRef(0);
  const holdUntil = useRef(0);
  const pendingSwitch = useRef<{ to: CharacterId; handoff: Handoff } | null>(null);
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoListen = useRef(false);
  const handoffRef = useRef(handoff);
  const onSwitchRef = useRef(onSwitch);
  onSwitchRef.current = onSwitch;
  const heldText = useRef("");

  const setPhase = useCallback((p: OrbPhase) => {
    if (phaseRef.current !== p) phaseSince.current = Date.now();
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const touch = () => {
    lastActivity.current = Date.now();
  };

  const closeSession = useCallback(() => {
    ending.current = true;
    const c = conv.current;
    conv.current = null;
    audio.current = null;
    c?.endSession().catch(() => {});
  }, []);

  const fail = useCallback(
    (kind: ErrorKind) => {
      closeSession();
      if ((kind === "session" || kind === "dropped") && retries.current < AUTO_RETRIES) {
        retries.current += 1;
        setTimeout(() => setAttempt((n) => n + 1), 800);
        return;
      }
      setError(kind);
    },
    [closeSession],
  );

  const runSwitch = useCallback(() => {
    const next = pendingSwitch.current;
    if (!next) return;
    pendingSwitch.current = null;
    if (switchTimer.current) clearTimeout(switchTimer.current);
    closeSession();
    onSwitchRef.current?.(next.to, next.handoff);
  }, [closeSession]);

  const setMic = (open: boolean) => {
    if (micTimer.current) clearTimeout(micTimer.current);
    micOpen.current = open;
    if (!open) {
      conv.current?.setMicMuted(true);
      return;
    }
    micTimer.current = setTimeout(() => {
      if (micOpen.current) conv.current?.setMicMuted(false);
    }, MIC_OPEN_DELAY_MS);
  };

  useEffect(() => {
    let cancelled = false;
    ending.current = false;
    micOpen.current = false;
    heardSpeech.current = false;
    interrupting.current = false;
    ignoreParts.current = false;
    pendingSwitch.current = null;
    autoListen.current = Boolean(handoffRef.current);
    setError(null);
    setSubtitle("");
    setUserSaid("");
    setPhase("connecting");
    touch();

    (async () => {
      if (!navigator.onLine) return fail("offline");

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        return fail("mic");
      }

      let token: string;
      try {
        const res = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ character: character.id }),
        });
        if (res.status === 401) return fail("auth");
        if (!res.ok) return fail("session");
        token = (await res.json()).token;
      } catch {
        return fail(navigator.onLine ? "session" : "offline");
      }
      if (cancelled) return;

      try {
        const c = await Conversation.startSession({
          conversationToken: token,
          connectionType: "webrtc",
          textOnly: false,
          useWakeLock: true,
          inputDeviceId: getMicId(),
          overrides: handoffRef.current
            ? { agent: { firstMessage: handoffRef.current.greeting, language: handoffRef.current.language as never } }
            : undefined,
          clientTools: {
            switch_character: (p: { character?: unknown; greeting?: unknown; topic?: unknown; language?: unknown }) => {
              const to = p?.character;
              if (!isCharacterId(to) || to === character.id || !onSwitchRef.current) return "unavailable";
              const language = typeof p.language === "string" && HANDOFF_LANGUAGES.includes(p.language) ? p.language : "sv";
              const greeting =
                typeof p.greeting === "string" && p.greeting.trim()
                  ? p.greeting.trim().slice(0, 200)
                  : `${character.name} sa att du behövde mig, vad kan jag hjälpa dig med?`;
              const topic = typeof p.topic === "string" ? p.topic.trim().slice(0, 300) : "";
              pendingSwitch.current = { to, handoff: { from: character.name, greeting, topic, language } };
              setMic(false);
              if (phaseRef.current === "speaking") {
                switchTimer.current = setTimeout(runSwitch, SWITCH_FALLBACK_MS);
              } else {
                switchTimer.current = setTimeout(runSwitch, 600);
              }
              return "ok";
            },
          },
          onConnect: () => touch(),
          onDisconnect: (details) => {
            if (ending.current || cancelled) return;
            conv.current = null;
            if (details.reason === "error") fail(navigator.onLine ? "dropped" : "offline");
            else onExit();
          },
          onError: () => {},
          onModeChange: ({ mode }) => {
            if (mode === "speaking") {
              holdUntil.current = 0;
              heldText.current = "";
              setMic(false);
              touch();
              if (!interrupting.current) setPhase("speaking");
            } else {
              if (interrupting.current) {
                interrupting.current = false;
                conv.current?.setVolume({ volume: getVolume() });
              }
              if (pendingSwitch.current) {
                if (switchTimer.current) clearTimeout(switchTimer.current);
                switchTimer.current = setTimeout(runSwitch, 300);
                return;
              }
              if (autoListen.current && conv.current) {
                autoListen.current = false;
                heardSpeech.current = false;
                cueListenStart();
                setMic(true);
                setPhase("listening");
                return;
              }
              setPhase(micOpen.current ? "listening" : "idle");
            }
          },
          onVadScore: ({ vadScore }) => {
            if (!micOpen.current) return;
            if (vadScore > SPEECH_VAD) {
              heardSpeech.current = true;
              lastSpeech.current = Date.now();
              touch();
            } else if (heardSpeech.current && vadScore > STILL_TALKING_VAD) {
              lastSpeech.current = Date.now();
            }
          },
          onMessage: ({ source, message }) => {
            touch();
            if (source === "user") {
              ignoreParts.current = false;
              const said = [heldText.current, message.trim()].filter(Boolean).join(" ");
              holdUntil.current = 0;
              heldText.current = "";
              setUserSaid(said);
              if (phaseRef.current !== "speaking" && !interrupting.current && DANGLING.test(said)) {
                const c = conv.current;
                if (c) {
                  heldText.current = said;
                  holdUntil.current = Math.max(Date.now() + DANGLING_MIN_OPEN_MS, (lastSpeech.current || Date.now()) + DANGLING_SILENCE_MS);
                  heardSpeech.current = false;
                  c.sendUserActivity();
                  setMic(true);
                  setPhase("listening");
                  return;
                }
              }
              if (interrupting.current) {
                interrupting.current = false;
                conv.current?.setVolume({ volume: getVolume() });
              }
              if (phaseRef.current === "listening") cueListenStop();
              if (phaseRef.current !== "speaking") setPhase("thinking");
            } else if (!ignoreParts.current) {
              setSubtitle(message);
            }
          },
          onAgentChatResponsePart: ({ type, text }) => {
            if (ignoreParts.current) return;
            touch();
            if (type === "start") setSubtitle("");
            else if (type === "delta") setSubtitle((s) => s + text);
          },
          onAgentResponseCorrection: (e) => {
            if (!ignoreParts.current) setSubtitle(e.corrected_agent_response);
          },
        });

        if (cancelled) {
          c.endSession().catch(() => {});
          return;
        }
        const voice = c as VoiceConversation;
        conv.current = voice;
        voice.setMicMuted(true);
        voice.setVolume({ volume: getVolume() });
        retries.current = 0;
        const h = handoffRef.current;
        if (h?.topic) voice.sendContextualUpdate(`The visitor was just sent to you by ${h.from}. What they want help with: ${h.topic}`);
        audio.current = {
          input: () => voice.getInputVolume(),
          output: () => voice.getOutputVolume(),
          outputBins: () => voice.getOutputByteFrequencyData(),
        };
        setPhase("idle");
        touch();
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string })?.name;
        fail(name === "NotAllowedError" ? "mic" : navigator.onLine ? "session" : "offline");
      }
    })();

    return () => {
      cancelled = true;
      if (micTimer.current) clearTimeout(micTimer.current);
      if (switchTimer.current) clearTimeout(switchTimer.current);
      closeSession();
    };
  }, [character.id, character.name, attempt, closeSession, fail, onExit, setPhase, runSwitch]);

  useEffect(() => {
    const id = setInterval(() => {
      if (error || ending.current) return;
      if (phaseRef.current === "speaking") touch();
      if (Date.now() - lastActivity.current > IDLE_LIMIT_MS) {
        closeSession();
        onExit();
      }
    }, 1000);
    const offline = () => {
      if (conv.current) fail("offline");
    };
    window.addEventListener("offline", offline);
    return () => {
      clearInterval(id);
      window.removeEventListener("offline", offline);
    };
  }, [error, closeSession, fail, onExit]);

  useEffect(() => {
    const id = setInterval(() => {
      const p = phaseRef.current;
      const now = Date.now();
      const elapsed = now - phaseSince.current;
      if (p === "listening" && micOpen.current && holdUntil.current) {
        if (heardSpeech.current) {
          holdUntil.current = 0;
        } else if (now >= holdUntil.current) {
          holdUntil.current = 0;
          heldText.current = "";
          setMic(false);
          setPhase("thinking");
        } else if (now + 2000 <= holdUntil.current + 200) {
          conv.current?.sendUserActivity();
        }
      } else if (p === "listening" && micOpen.current) {
        const done = heardSpeech.current
          ? now - lastSpeech.current > END_SILENCE_MS || elapsed > MAX_LISTEN_MS
          : elapsed > NO_SPEECH_MS;
        if (done) {
          setMic(false);
          cueListenStop();
          setPhase(heardSpeech.current ? "thinking" : "idle");
        }
      } else if (p === "thinking" && elapsed > MAX_THINK_MS) {
        setPhase("idle");
      }
    }, 150);
    return () => clearInterval(id);
  }, [setPhase]);

  const onOrbClick = () => {
    const c = conv.current;
    if (!c) return;
    touch();
    const p = phaseRef.current;
    holdUntil.current = 0;
    heldText.current = "";
    if (p === "idle") {
      heardSpeech.current = false;
      cueListenStart();
      setMic(true);
      setPhase("listening");
    } else if (p === "listening") {
      setMic(false);
      cueListenStop();
      setPhase(heardSpeech.current ? "thinking" : "idle");
    } else if (p === "speaking" || p === "thinking") {
      interrupting.current = true;
      ignoreParts.current = true;
      c.setVolume({ volume: 0 });
      setSubtitle("");
      setUserSaid("");
      heardSpeech.current = false;
      cueListenStart();
      setMic(true);
      setPhase("listening");
    }
  };

  const answer = spoken(subtitle);
  const reveal: RevealMode = phase === "speaking" ? "pace" : phase === "thinking" || phase === "connecting" ? "hold" : "all";

  const leave = () => {
    closeSession();
    onExit();
  };

  return (
    <main className="screen conversation" style={{ "--c": character.color, "--g": character.glow } as React.CSSProperties}>
      <div className="topbar">
        <button className="chip" onClick={leave}>
          ← Byt person
        </button>
        <div className="who">{character.name}</div>
        <button className="chip" onClick={leave}>
          Börja om
        </button>
      </div>

      {error ? (
        <div className="error-card" role="alert">
          <h2>{ERRORS[error].title}</h2>
          <p>{ERRORS[error].body}</p>
          <div className="error-actions">
            {error === "auth" ? (
              <button className="chip primary" onClick={() => window.location.reload()}>
                Ladda om
              </button>
            ) : (
              <button
                className="chip primary"
                onClick={() => {
                  retries.current = 0;
                  setAttempt((n) => n + 1);
                }}
              >
                Försök igen
              </button>
            )}
            <button className="chip" onClick={leave}>
              Tillbaka
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="stage">
            <Orb color={character.color} phase={phase} audio={audio} onClick={onOrbClick} label={HINTS[phase]} />
            <div className={`hint hint-${phase}`}>{HINTS[phase]}</div>
          </div>
          <Subtitles
            text={answer}
            userSaid={userSaid}
            mode={reveal}
            rate={character.speechRate}
            takeHome={phase === "idle" && answer ? `${character.name}s tips:\n${answer}` : null}
          />
        </>
      )}
    </main>
  );
}
