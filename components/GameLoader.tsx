"use client";

import dynamic from "next/dynamic";

const FlashCardGame = dynamic(() => import("@/components/FlashCardGame"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-40 text-indigo-400 text-lg animate-pulse">
      Loading…
    </div>
  ),
});

export default function GameLoader() {
  return <FlashCardGame />;
}
