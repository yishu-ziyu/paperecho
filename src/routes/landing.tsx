import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing/LandingPage";

export const Route = createFileRoute("/landing")({
  component: LandingRoute,
});

function LandingRoute() {
  return <LandingPage />;
}
