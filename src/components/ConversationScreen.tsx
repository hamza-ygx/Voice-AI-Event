"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Conversation, type VoiceConversation } from "@elevenlabs/react";
import Orb, { type OrbAudio, type OrbPhase } from "./Orb";
import type { Character } from "@/lib/characters";

const IDLE_LIMIT_MS = 60_000;
const SPEECH_VAD = 0.5;

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

type Props = {
  character: Character;
  onExit: () => void;
};

export default function ConversationScreen({ character, onExit }: Props) {
  const [phase, setPhaseState] = useState<OrbPhase>("connecting");
  const [subtitle, setSubtitle] = useState("");
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

  const setPhase = useCallback((p: OrbPhase) => {
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
      setError(kind);
    },
    [closeSession],
  );

  const setMic = (open: boolean) => {
    micOpen.current = open;
    conv.current?.setMicMuted(!open);
  };

  useEffect(() => {
    let cancelled = false;
    ending.current = false;
    micOpen.current = false;
    heardSpeech.current = false;
    interrupting.current = false;
    ignoreParts.current = false;
    setError(null);
    setSubtitle("");
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
              setMic(false);
              touch();
              if (!interrupting.current) setPhase("speaking");
            } else {
              if (interrupting.current) {
                interrupting.current = false;
                conv.current?.setVolume({ volume: 1 });
              }
              setPhase(micOpen.current ? "listening" : "idle");
            }
          },
          onVadScore: ({ vadScore }) => {
            if (micOpen.current && vadScore > SPEECH_VAD) {
              heardSpeech.current = true;
              touch();
            }
          },
          onMessage: ({ source, message }) => {
            touch();
            if (source === "user") {
              ignoreParts.current = false;
              if (interrupting.current) {
                interrupting.current = false;
                conv.current?.setVolume({ volume: 1 });
              }
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
      closeSession();
    };
  }, [character.id, attempt, closeSession, fail, onExit, setPhase]);

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

  const onOrbClick = () => {
    const c = conv.current;
    if (!c) return;
    touch();
    const p = phaseRef.current;
    if (p === "idle") {
      heardSpeech.current = false;
      setMic(true);
      setPhase("listening");
    } else if (p === "listening") {
      setMic(false);
      setPhase(heardSpeech.current ? "thinking" : "idle");
    } else if (p === "speaking" || p === "thinking") {
      interrupting.current = true;
      ignoreParts.current = true;
      c.setVolume({ volume: 0 });
      setSubtitle("");
      heardSpeech.current = false;
      setMic(true);
      setPhase("listening");
    }
  };

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
              <button className="chip primary" onClick={() => setAttempt((n) => n + 1)}>
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
          <div className="subtitles" aria-live="polite">
            {subtitle && <p>{subtitle}</p>}
          </div>
        </>
      )}
    </main>
  );
}
