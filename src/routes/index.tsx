import { createFileRoute } from "@tanstack/react-router";
import { GameShell } from "@/game/GameShell";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <GameShell />;
}
