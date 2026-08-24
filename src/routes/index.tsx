import { createFileRoute } from "@tanstack/react-router";
import { RoadkillGame } from "@/components/RoadkillGame";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <RoadkillGame />;
}
