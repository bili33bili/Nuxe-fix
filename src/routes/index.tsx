import { createFileRoute } from "@tanstack/react-router";
import { ForgeApp } from "@/components/forge/ForgeApp";
import { ForgeErrorBoundary } from "@/components/forge/ErrorBoundary";
import { AuthGate } from "@/components/auth/AuthGate";

const TITLE = "Nuxe — Workspace Pengembangan";
const DESC =
  "Workspace pengembangan proyek untuk mengelola file, mengedit kode, menjalankan preview, dan mengekspor proyek.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  console.info("[Nuxe-fix] route / rendered");

  return (
    <AuthGate>
      <ForgeErrorBoundary>
        <ForgeApp />
      </ForgeErrorBoundary>
    </AuthGate>
  );
}
