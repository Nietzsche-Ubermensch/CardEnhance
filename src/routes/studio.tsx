import { createFileRoute } from "@tanstack/react-router";
import { StudioApp } from "@/components/studio/studio-app";
import { PageShell } from "@/components/studio/app-nav";

export const Route = createFileRoute("/studio")({ component: StudioPage });

function StudioPage() {
  return (
    <PageShell current="/studio">
      <StudioApp />
    </PageShell>
  );
}
