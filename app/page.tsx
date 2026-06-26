import GameLoader from "@/components/GameLoader";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-gradient-to-b from-indigo-100 via-purple-50 to-pink-100">
      <GameLoader />
    </main>
  );
}
