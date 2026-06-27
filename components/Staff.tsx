"use client";

import { useEffect, useRef } from "react";
import type { NoteInfo } from "@/lib/notes";

export interface WrongNoteDisplay {
  vexKey: string;
  clef: "treble" | "bass";
}

interface StaffProps {
  note: NoteInfo;
  /** Colour for the target note head. */
  color?: string;
  /** When set, renders this note in red on its appropriate clef. */
  wrongNote?: WrongNoteDisplay | null;
}

export default function Staff({ note, color = "#1a1a2e", wrongNote }: StaffProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    let rafId: number;

    const render = async () => {
      if (cancelled || !containerRef.current) return;

      // Load VexFlow first (cached after first call, but async on initial load).
      const VF = await import("vexflow");
      if (cancelled || !containerRef.current) return;

      // Measure width HERE — after the async gap — so we always get the
      // post-layout value. On first load the import takes real time and the
      // page may still be laying out beforehand.
      const containerWidth = containerRef.current.offsetWidth;
      if (containerWidth === 0) {
        // Layout not ready yet — retry next frame.
        rafId = requestAnimationFrame(render);
        return;
      }

      containerRef.current.innerHTML = "";

      const {
        Renderer,
        Stave,
        StaveNote,
        StaveConnector,
        GhostNote,
        Voice,
        Formatter,
      } = VF;

      const BASE_WIDTH = 300;
      const BASE_HEIGHT = 220;
      const SCALE = containerWidth / BASE_WIDTH;
      const WIDTH = containerWidth;
      const HEIGHT = Math.round(BASE_HEIGHT * SCALE);
      const TREBLE_Y = 20;
      const BASS_Y = 105;
      const STAVE_WIDTH = BASE_WIDTH - 30;
      const RED = "#dc2626";

      const renderer = new Renderer(containerRef.current, Renderer.Backends.SVG);
      renderer.resize(WIDTH, HEIGHT);
      const context = renderer.getContext();
      context.scale(SCALE, SCALE);
      context.setFont("Arial", 12);

      const trebleStave = new Stave(15, TREBLE_Y, STAVE_WIDTH);
      trebleStave.addClef("treble");
      trebleStave.setContext(context).draw();

      const bassStave = new Stave(15, BASS_Y, STAVE_WIDTH);
      bassStave.addClef("bass");
      bassStave.setContext(context).draw();

      new StaveConnector(trebleStave, bassStave)
        .setType(StaveConnector.type.BRACE)
        .setContext(context)
        .draw();

      new StaveConnector(trebleStave, bassStave)
        .setType(StaveConnector.type.SINGLE_LEFT)
        .setContext(context)
        .draw();

      const makeVoice = (tickable: InstanceType<typeof StaveNote | typeof GhostNote>) => {
        const v = new Voice({ numBeats: 4, beatValue: 4 }).setStrict(false);
        v.addTickable(tickable as Parameters<typeof v.addTickable>[0]);
        return v;
      };

      // Build voices for each clef.
      // A clef may have up to two voices: the target note and (optionally) the wrong note.
      const buildClefVoices = (
        clef: "treble" | "bass",
        stave: InstanceType<typeof Stave>
      ) => {
        const isTarget = note.clef === clef;
        const isWrong = wrongNote?.clef === clef;

        // Primary voice — target note or ghost.
        let primary: InstanceType<typeof StaveNote> | InstanceType<typeof GhostNote>;
        if (isTarget) {
          primary = new StaveNote({ keys: [note.vexKey], duration: "q", clef }) as InstanceType<typeof StaveNote>;
          (primary as InstanceType<typeof StaveNote>).setStyle({ fillStyle: color, strokeStyle: color });
        } else {
          primary = new GhostNote({ duration: "q" }) as InstanceType<typeof GhostNote>;
        }

        const voices: ReturnType<typeof makeVoice>[] = [makeVoice(primary)];

        // Secondary voice — wrong note (red, stem down) if it belongs to this clef.
        if (isWrong && wrongNote) {
          const wrongStaveNote = new StaveNote({
            keys: [wrongNote.vexKey],
            duration: "q",
            clef,
            stemDirection: -1,
          });
          wrongStaveNote.setStyle({ fillStyle: RED, strokeStyle: RED });
          voices.push(makeVoice(wrongStaveNote));
        }

        return { voices, stave };
      };

      const treble = buildClefVoices("treble", trebleStave);
      const bass = buildClefVoices("bass", bassStave);

      const allVoices = [...treble.voices, ...bass.voices];

      const fmt = new Formatter();
      // joinVoices groups voices that share the same stave so they align.
      if (treble.voices.length > 1) fmt.joinVoices(treble.voices);
      if (bass.voices.length > 1) fmt.joinVoices(bass.voices);
      fmt.format(allVoices, STAVE_WIDTH - 80);

      treble.voices.forEach((v) => v.draw(context, treble.stave));
      bass.voices.forEach((v) => v.draw(context, bass.stave));
    };

    rafId = requestAnimationFrame(render);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [note, color, wrongNote]);

  return (
    <div
      ref={containerRef}
      className="staff-container w-full"
      aria-label={`Grand staff showing note ${note.label} on ${note.clef} clef`}
    />
  );
}
