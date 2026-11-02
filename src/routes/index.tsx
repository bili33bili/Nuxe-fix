import { createFileRoute } from "@tanstack/react-router";
import { ForgeApp } from "@/components/forge/ForgeApp";
import { ForgeErrorBoundary } from "@/components/forge/ErrorBoundary";

const TITLE = "PROJECT FORGE — Pembangun Struktur Proyek & Ekspor ZIP";
const DESC =
  "Bangun struktur proyek, edit file, dan ekspor ZIP langsung di browser. Tanpa login, bisa offline. Proyek Anda. Struktur Anda. Aturan Anda.";

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
  return (
    <ForgeErrorBoundary>
      <ForgeApp />
    </ForgeErrorBoundary>
  );
}
