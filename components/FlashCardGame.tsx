"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Staff from "@/components/Staff";
import { usePitchDetection } from "@/hooks/usePitchDetection";
import { ALL_NOTES, sameNoteIgnoreOctave, midiToLabel, labelToVexKey } from "@/lib/notes";
import type { NoteInfo } from "@/lib/notes";
import type { WrongNoteDisplay } from "@/components/Staff";

type Screen = "landing" | "playing" | "results";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// How long the correct note must be held before it's accepted.
const CORRECT_HOLD_MS = 400;
// How long the green flash shows before advancing to the next card.
const ADVANCE_DELAY_MS = 700;
// How long the red flash shows on a wrong note.
const WRONG_DISPLAY_MS = 900;
// Same wrong note won't be counted again within this window.
const WRONG_DEBOUNCE_MS = 1500;

export default function FlashCardGame() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [queue, setQueue] = useState<NoteInfo[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [justCorrect, setJustCorrect] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [flashWrong, setFlashWrong] = useState(false);
  const [wrongNoteLabel, setWrongNoteLabel] = useState<string | null>(null);
  const [wrongNoteDisplay, setWrongNoteDisplay] = useState<WrongNoteDisplay | null>(null);

  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const correctHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrongFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrongDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the midi that's currently being debounced for wrong detection.
  const lastWrongMidiRef = useRef<number | null>(null);
  // Always reflects the latest detectedMidi so timeouts can check the live value.
  const detectedMidiRef = useRef<number | null>(null);
  // Index ref so the advance timeout can read the latest value.
  const indexRef = useRef(0);
  const totalRef = useRef(0);

  const { detectedMidi, detectedNote, status, start, stop } = usePitchDetection();

  // Keep refs in sync.
  useEffect(() => { detectedMidiRef.current = detectedMidi; }, [detectedMidi]);
  useEffect(() => { indexRef.current = index; }, [index]);

  const currentNote: NoteInfo | undefined = queue[index];
  const total = queue.length;

  // Tick the elapsed timer while playing.
  useEffect(() => {
    if (screen !== "playing") return;
    startTimeRef.current = Date.now() - elapsed * 1000;
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // Advance to the next card or finish the test.
  const advanceToNext = useCallback((currentIndex: number) => {
    if (currentIndex + 1 >= totalRef.current) {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      stop();
      setScreen("results");
    } else {
      setIndex(currentIndex + 1);
    }
  }, [stop]);

  // Core pitch-matching logic.
  useEffect(() => {
    if (screen !== "playing" || isAdvancing || !currentNote) return;

    // Whenever detectedMidi changes, cancel any pending correct-hold timer.
    if (correctHoldTimerRef.current) {
      clearTimeout(correctHoldTimerRef.current);
      correctHoldTimerRef.current = null;
    }

    if (detectedMidi === null) return;

    const targetMidi = currentNote.midi;

    if (sameNoteIgnoreOctave(detectedMidi, targetMidi)) {
      // Start the hold timer. Only accept if the note is still held when it fires.
      correctHoldTimerRef.current = setTimeout(() => {
        if (
          detectedMidiRef.current !== null &&
          sameNoteIgnoreOctave(detectedMidiRef.current, targetMidi)
        ) {
          // Debounce the just-played midi so it can't immediately trigger a wrong
          // on the next card if the player is slow to release.
          lastWrongMidiRef.current = detectedMidiRef.current;
          if (wrongDebounceTimerRef.current) clearTimeout(wrongDebounceTimerRef.current);
          wrongDebounceTimerRef.current = setTimeout(() => {
            lastWrongMidiRef.current = null;
          }, WRONG_DEBOUNCE_MS);

          setJustCorrect(true);
          setIsAdvancing(true);
          setScore((s) => s + 1);

          advanceTimerRef.current = setTimeout(() => {
            const capturedIndex = indexRef.current;
            setJustCorrect(false);
            setIsAdvancing(false);
            advanceToNext(capturedIndex);
          }, ADVANCE_DELAY_MS);
        }
      }, CORRECT_HOLD_MS);
    } else {
      // Wrong note — register if not currently debounced.
      if (detectedMidi !== lastWrongMidiRef.current) {
        lastWrongMidiRef.current = detectedMidi;
        setWrongCount((c) => c + 1);
        setFlashWrong(true);
        setWrongNoteLabel(detectedNote);
        // Compute which clef and VexFlow key to draw the wrong note on.
        const wLabel = midiToLabel(detectedMidi);
        setWrongNoteDisplay({
          vexKey: labelToVexKey(wLabel),
          clef: detectedMidi < 60 ? "bass" : "treble",
        });

        if (wrongFlashTimerRef.current) clearTimeout(wrongFlashTimerRef.current);
        wrongFlashTimerRef.current = setTimeout(() => {
          setFlashWrong(false);
          setWrongNoteLabel(null);
          setWrongNoteDisplay(null);
        }, WRONG_DISPLAY_MS);

        if (wrongDebounceTimerRef.current) clearTimeout(wrongDebounceTimerRef.current);
        wrongDebounceTimerRef.current = setTimeout(() => {
          lastWrongMidiRef.current = null;
        }, WRONG_DEBOUNCE_MS);
      }
    }
  }, [detectedMidi, detectedNote, currentNote, screen, isAdvancing, advanceToNext]);

  const handleStart = useCallback(async () => {
    const shuffled = shuffle(ALL_NOTES);
    totalRef.current = shuffled.length;
    setQueue(shuffled);
    setIndex(0);
    setScore(0);
    setWrongCount(0);
    setElapsed(0);
    setJustCorrect(false);
    setIsAdvancing(false);
    setFlashWrong(false);
    setWrongNoteLabel(null);
    setWrongNoteDisplay(null);
    lastWrongMidiRef.current = null;
    await start();
    setScreen("playing");
  }, [start]);

  const handleSkip = useCallback(() => {
    if (isAdvancing) return;
    if (correctHoldTimerRef.current) clearTimeout(correctHoldTimerRef.current);
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    setIsAdvancing(false);
    setJustCorrect(false);
    setFlashWrong(false);
    setWrongNoteLabel(null);
    setWrongNoteDisplay(null);
    setWrongCount((c) => c + 1);
    lastWrongMidiRef.current = null;
    advanceToNext(indexRef.current);
  }, [isAdvancing, advanceToNext]);

  const handleRestart = useCallback(() => {
    stop();
    setScreen("landing");
    setQueue([]);
    setIndex(0);
    setScore(0);
    setWrongCount(0);
    setElapsed(0);
  }, [stop]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (correctHoldTimerRef.current) clearTimeout(correctHoldTimerRef.current);
      if (wrongFlashTimerRef.current) clearTimeout(wrongFlashTimerRef.current);
      if (wrongDebounceTimerRef.current) clearTimeout(wrongDebounceTimerRef.current);
    };
  }, []);

  // Target note stays blue always; only the wrong note itself renders red.
  const noteColor = justCorrect ? "#16a34a" : "#1e3a8a";

  // ── Landing ──────────────────────────────────────────────────────────────
  if (screen === "landing") {
    return (
      <div className="flex flex-col items-center gap-8 w-full max-w-md mx-auto text-center">
        <div>
          <h1 className="text-5xl font-extrabold text-indigo-700 tracking-tight drop-shadow mb-2">
            🎵 FlashNote
          </h1>
          <p className="text-indigo-400 font-medium text-lg">Learn to read sheet music</p>
        </div>

        <div className="bg-white/80 backdrop-blur rounded-2xl shadow px-7 py-5 text-left space-y-2 text-gray-600 text-sm w-full">
          <p className="font-bold text-gray-700 text-base mb-3">How it works</p>
          <p>🎼 Every note in the treble and bass clef appears once, in random order.</p>
          <p>🎤 Play the note shown on your keyboard — the mic listens automatically.</p>
          <p>⏱ Your time and score are tracked. Try to beat your record!</p>
          <p>⏭ Tap skip if you get stuck — it won&apos;t count toward your score.</p>
        </div>

        {status === "denied" && (
          <p className="text-red-500 text-sm">
            Microphone access was denied. Please allow it in your browser settings and reload.
          </p>
        )}
        {status === "unsupported" && (
          <p className="text-red-500 text-sm">
            Your browser doesn&apos;t support microphone access. Try Chrome, Safari, or Edge.
          </p>
        )}

        <button
          onClick={handleStart}
          className="w-full bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white font-extrabold py-5 rounded-2xl shadow-lg text-2xl transition-colors"
        >
          Start
        </button>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────
  if (screen === "results") {
    const attempted = score + wrongCount;
    const pct = attempted > 0 ? Math.round((score / (score + wrongCount)) * 100) : 100;
    return (
      <div className="flex flex-col items-center gap-7 w-full max-w-md mx-auto text-center">
        <div>
          <p className="text-5xl mb-2">{pct === 100 ? "🏆" : pct >= 70 ? "🌟" : "🎵"}</p>
          <h2 className="text-3xl font-extrabold text-indigo-700">
            {pct === 100 ? "Perfect!" : "Nice work!"}
          </h2>
        </div>

        <div className="bg-white rounded-2xl shadow-xl px-10 py-6 w-full space-y-4">
          <div className="flex justify-around">
            <div>
              <p className="text-4xl font-extrabold text-green-500">
                {score}
                <span className="text-xl text-gray-400">/{total}</span>
              </p>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">Correct</p>
            </div>
            <div>
              <p className="text-4xl font-extrabold text-red-400">{wrongCount}</p>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">Wrong</p>
            </div>
            <div>
              <p className="text-4xl font-extrabold text-purple-500">{formatTime(elapsed)}</p>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">Time</p>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div
              className="bg-indigo-400 h-3 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-gray-500 text-sm">{pct}% accuracy</p>
        </div>

        <button
          onClick={handleRestart}
          className="w-full bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white font-extrabold py-5 rounded-2xl shadow-lg text-xl transition-colors"
        >
          Play Again
        </button>
      </div>
    );
  }

  // ── Playing ───────────────────────────────────────────────────────────────
  // Determine what to show in the "You're playing" readout.
  const displayNote = flashWrong ? wrongNoteLabel : (justCorrect ? currentNote?.label : detectedNote);
  const displayColor = flashWrong
    ? "text-red-500"
    : justCorrect
    ? "text-green-500"
    : detectedNote
    ? "text-indigo-600"
    : "text-gray-200";

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-lg mx-auto">

      {/* Progress + timer row */}
      <div className="flex items-center justify-between w-full px-1">
        <span className="text-2xl font-extrabold text-purple-500 tabular-nums">
          {formatTime(elapsed)}
        </span>
        <span className="text-sm font-bold text-gray-400">
          {index + 1} <span className="text-gray-300">/</span> {total}
        </span>
        <div className="text-right">
          <span className="text-xl font-extrabold text-green-500">{score}</span>
          <span className="text-gray-300 mx-1">·</span>
          <span className="text-xl font-extrabold text-red-400">{wrongCount}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-white/60 rounded-full h-2.5 shadow-inner">
        <div
          className="bg-indigo-400 h-2.5 rounded-full transition-all duration-300"
          style={{ width: `${(index / total) * 100}%` }}
        />
      </div>

      {/* Flash card */}
      <div
        className={`
          bg-white rounded-3xl shadow-xl px-4 pt-4 pb-3 w-full flex flex-col items-center transition-all duration-200
          ${justCorrect ? "ring-4 ring-green-400 bg-green-50" : ""}
          ${flashWrong ? "ring-4 ring-red-300 bg-red-50" : ""}
        `}
      >
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">
          Play this note
        </p>
        {currentNote && (
          <Staff
            note={currentNote}
            color={noteColor}
            wrongNote={flashWrong ? wrongNoteDisplay : null}
          />
        )}
        {justCorrect && (
          <p className="text-green-600 font-bold text-base mt-1 animate-bounce">
            ✓ {currentNote?.label}
          </p>
        )}
        {flashWrong && (
          <p className="text-red-500 font-bold text-base mt-1">
            ✗ {wrongNoteLabel} — keep trying!
          </p>
        )}
      </div>

      {/* Live tuner */}
      <div className="bg-white rounded-2xl shadow w-full px-6 py-4 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          You&apos;re playing
        </span>
        <span className={`text-3xl font-extrabold tabular-nums transition-colors duration-150 ${displayColor}`}>
          {displayNote ?? "–"}
        </span>
      </div>

      {/* Skip */}
      <button
        onClick={handleSkip}
        disabled={isAdvancing}
        className="text-sm text-gray-400 hover:text-gray-600 font-semibold py-2 px-4 rounded-xl transition-colors disabled:opacity-30"
      >
        ⏭ Skip this note
      </button>
    </div>
  );
}
