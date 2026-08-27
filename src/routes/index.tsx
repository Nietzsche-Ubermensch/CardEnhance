import { createFileRoute } from "@tanstack/react-router";
import { StudioApp } from "@/components/studio/studio-app";
import { PageShell } from "@/components/studio/app-nav";

export const Route = createFileRoute("/")({ component: IndexPage });

function IndexPage() {
  return (
    <PageShell current="/">
      <StudioApp />
    </PageShell>
  );
}
