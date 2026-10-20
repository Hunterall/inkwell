import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Inkwell — write the story, ship the script" },
      {
        name: "description",
        content:
          "Chapters, story bible and AI drafting, one-click screenplay conversion, storyboards and pitch decks.",
      },
      { property: "og:title", content: "Inkwell — write the story, ship the script" },
      {
        property: "og:description",
        content: "From prose to screenplay to pitch deck, in one writing desk.",
      },
    ],
  }),
  component: Index,
});

const steps = [
  {
    n: "I",
    t: "Write",
    d: "Chapters, a story bible for characters and world, and an AI that drafts, expands and rewrites in the voice you choose.",
  },
  {
    n: "II",
    t: "Adapt",
    d: "One click turns prose into properly formatted screenplay pages, with a scene-by-scene breakdown.",
  },
  {
    n: "III",
    t: "Pitch",
    d: "Illustrated storyboard frames and a PDF deck with synopsis, characters and moodboard.",
  },
];

function Index() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-2xl font-extrabold">Inkwell</span>
        <Button asChild variant="ghost">
          <Link to="/stories">Open your desk</Link>
        </Button>
      </header>
      <main className="mx-auto max-w-6xl px-6">
        <section className="border-b rule-ink py-20 md:py-28">
          <p className="font-mono text-sm uppercase tracking-[0.3em] text-primary">FADE IN:</p>
          <h1 className="mt-6 max-w-4xl text-5xl font-extrabold leading-[1.02] md:text-7xl">
            Write the story. <em className="font-normal text-primary">Ship the script.</em>
          </h1>
          <p className="mt-8 max-w-xl font-serif text-xl text-muted-foreground">
            One desk for the whole journey from first sentence to pitch meeting.
          </p>
          <div className="mt-10 flex gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Start writing</Link>
            </Button>
          </div>
        </section>
        <section className="grid gap-10 py-16 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n}>
              <div className="font-display text-5xl text-sepia">{s.n}</div>
              <h2 className="mt-3 text-2xl font-semibold">{s.t}</h2>
              <p className="mt-2 font-serif text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
