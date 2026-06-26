"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PitchDetector } from "pitchy";
import { frequencyToMidi, midiToLabel } from "@/lib/notes";

export type MicStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "error"
  | "unsupported";

export interface PitchState {
  /** Detected MIDI note number, or null if no confident pitch. */
  detectedMidi: number | null;
  /** Human-readable label like "C4", or null. */
  detectedNote: string | null;
  /** Raw frequency in Hz, or null. */
  frequency: number | null;
  /** pitchy clarity value 0–1 (higher = more confident). */
  clarity: number;
  status: MicStatus;
}

const CLARITY_THRESHOLD = 0.85;
/** Number of consecutive frames that must agree before emitting a note. */
const STABILITY_FRAMES = 4;
/** Minimum frequency to consider (below this is noise / not a musical note). */
const MIN_FREQ = 60;  // ~B1
const MAX_FREQ = 1200; // ~D6

export function usePitchDetection() {
  const [state, setState] = useState<PitchState>({
    detectedMidi: null,
    detectedNote: null,
    frequency: null,
    clarity: 0,
    status: "idle",
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<PitchDetector<Float32Array<ArrayBuffer>> | null>(null);
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const stabilityQueueRef = useRef<number[]>([]);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    detectorRef.current = null;
    bufferRef.current = null;
    stabilityQueueRef.current = [];
    setState((s) => ({ ...s, status: "idle", detectedMidi: null, detectedNote: null, frequency: null, clarity: 0 }));
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState((s) => ({ ...s, status: "unsupported" }));
      return;
    }

    setState((s) => ({ ...s, status: "requesting" }));

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      setState((s) => ({ ...s, status: "denied" }));
      return;
    }

    streamRef.current = stream;

    // AudioContext must be created/resumed after a user gesture — iOS requirement.
    let ctx = audioCtxRef.current;
    if (!ctx || ctx.state === "closed") {
      ctx = new AudioContext();
      audioCtxRef.current = ctx;
    }
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyserRef.current = analyser;

    const bufferSize = analyser.fftSize;
    const detector = PitchDetector.forFloat32Array(bufferSize) as PitchDetector<Float32Array<ArrayBuffer>>;
    detectorRef.current = detector;
    bufferRef.current = new Float32Array(bufferSize) as Float32Array<ArrayBuffer>;

    setState((s) => ({ ...s, status: "active" }));

    const loop = () => {
      if (!analyserRef.current || !detectorRef.current || !bufferRef.current) return;

      analyserRef.current.getFloatTimeDomainData(bufferRef.current);
      const [frequency, clarity] = detectorRef.current.findPitch(
        bufferRef.current,
        ctx!.sampleRate
      );

      if (clarity >= CLARITY_THRESHOLD && frequency >= MIN_FREQ && frequency <= MAX_FREQ) {
        const midi = frequencyToMidi(frequency);
        const queue = stabilityQueueRef.current;
        queue.push(midi);
        if (queue.length > STABILITY_FRAMES) queue.shift();

        // All frames in the queue agree on the same MIDI note.
        const stable = queue.length === STABILITY_FRAMES && queue.every((m) => m === midi);
        if (stable) {
          setState((s) => ({
            ...s,
            detectedMidi: midi,
            detectedNote: midiToLabel(midi),
            frequency,
            clarity,
          }));
        }
      } else {
        // Low confidence — reset stability queue and clear display after short gap.
        stabilityQueueRef.current = [];
        setState((s) => ({
          ...s,
          detectedMidi: null,
          detectedNote: null,
          frequency: null,
          clarity,
        }));
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();
    };
  }, []);

  return { ...state, start, stop };
}
