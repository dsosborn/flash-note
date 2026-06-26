export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export type NoteName = (typeof NOTE_NAMES)[number];

export interface NoteInfo {
  midi: number;
  name: NoteName;
  octave: number;
  /** e.g. "C4", "G5" */
  label: string;
  /** VexFlow key string, e.g. "c/4", "g#/5" */
  vexKey: string;
  clef: "treble" | "bass";
}

// A4 = 440 Hz = MIDI 69
export function frequencyToMidi(hz: number): number {
  return Math.round(12 * Math.log2(hz / 440) + 69);
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiToNoteName(midi: number): NoteName {
  return NOTE_NAMES[((midi % 12) + 12) % 12];
}

export function midiToOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

export function midiToLabel(midi: number): string {
  return midiToNoteName(midi) + midiToOctave(midi);
}

/** Convert a note label like "C#4" to a VexFlow key like "c#/4" */
export function labelToVexKey(label: string): string {
  const match = label.match(/^([A-G]#?)(\d)$/);
  if (!match) return label.toLowerCase();
  return match[1].toLowerCase() + "/" + match[2];
}

function buildNote(midi: number, clef: "treble" | "bass"): NoteInfo {
  const name = midiToNoteName(midi);
  const octave = midiToOctave(midi);
  const label = name + octave;
  return {
    midi,
    name,
    octave,
    label,
    vexKey: labelToVexKey(label),
    clef,
  };
}

/**
 * Treble clef: lines E4,G4,B4,D5,F5 — we cover C4 through A5 (MIDI 60-81)
 * We skip sharps/flats in the beginner pool to keep it simple.
 */
const TREBLE_MIDI_POOL = [
  60, // C4
  62, // D4
  64, // E4
  65, // F4
  67, // G4
  69, // A4
  71, // B4
  72, // C5
  74, // D5
  76, // E5
  77, // F5
  79, // G5
  81, // A5
];

/**
 * Bass clef: lines G2,B2,D3,F3,A3 — we cover G2 through C4 (MIDI 43-60)
 * Natural notes only for beginners.
 */
const BASS_MIDI_POOL = [
  43, // G2
  45, // A2
  47, // B2
  48, // C3
  50, // D3
  52, // E3
  53, // F3
  55, // G3
  57, // A3
  59, // B3
  60, // C4 (middle C — shared, shown on ledger line in bass)
];

export const TREBLE_NOTES: NoteInfo[] = TREBLE_MIDI_POOL.map((m) => buildNote(m, "treble"));
export const BASS_NOTES: NoteInfo[] = BASS_MIDI_POOL.map((m) => buildNote(m, "bass"));
export const ALL_NOTES: NoteInfo[] = [...TREBLE_NOTES, ...BASS_NOTES];

export function randomNote(clef?: "treble" | "bass"): NoteInfo {
  const pool =
    clef === "treble" ? TREBLE_NOTES : clef === "bass" ? BASS_NOTES : ALL_NOTES;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Check if two MIDI note numbers represent the same pitch class (ignore octave errors). */
export function sameNoteIgnoreOctave(a: number, b: number): boolean {
  return ((a % 12) + 12) % 12 === ((b % 12) + 12) % 12;
}

/** Exact MIDI match (same note AND octave). */
export function exactMatch(a: number, b: number): boolean {
  return a === b;
}
