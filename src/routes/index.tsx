import { createFileRoute, Link } from "@tanstack/react-router";
import { NavBar } from "@/components/nav-bar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Brain, Layers, Sparkles, Zap, Target, BookOpen } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Mindspark — Turn notes into mastery with AI" },
      {
        name: "description",
        content:
          "Upload notes or paste a chapter. Mindspark generates summaries, flashcards, and adaptive quizzes — and tracks your mastery with spaced repetition.",
      },
    ],
  }),
});

function Landing() {
  return (
    <div className="min-h-screen bg-gradient-mesh">
      <NavBar />
      <main className="mx-auto max-w-6xl px-6">
        {/* Hero */}
        <section className="py-20 sm:py-28 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground shadow-soft">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Powered by Lovable AI
          </div>
          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            Study smarter,
            <br />
            <span className="text-gradient">not longer.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Paste a chapter or your lecture notes. Mindspark instantly creates a clear summary,
            active-recall flashcards, and adaptive quizzes — then tracks what you actually remember.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/login">
              <Button size="lg" className="shadow-elegant">
                Start studying free
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline">
                See how it works
              </Button>
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="grid gap-6 pb-16 sm:grid-cols-3">
          {[
            { icon: Brain, title: "AI summaries", body: "Distill any text into structured, faithful notes you can actually re-read." },
            { icon: Layers, title: "Active-recall flashcards", body: "Auto-generated Q&A cards that target the highest-yield concepts." },
            { icon: Target, title: "Adaptive quizzes", body: "Multiple-choice quizzes with explanations to close gaps fast." },
            { icon: Zap, title: "Spaced repetition", body: "SM-2 inspired scheduling so you review exactly when you're about to forget." },
            { icon: BookOpen, title: "Your library", body: "All your materials in one place — organized, searchable, private." },
            { icon: Sparkles, title: "Secure by default", body: "Email + Google sign-in. Row-level security keeps your notes yours." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border bg-gradient-card p-6 shadow-soft">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>

        {/* How it works */}
        <section className="rounded-2xl border bg-card p-8 shadow-soft sm:p-12">
          <h2 className="font-display text-3xl font-bold">From notes to mastery in 3 steps</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              ["Paste your notes", "Drop a chapter, lecture transcript, or paper excerpt."],
              ["AI builds your kit", "Summary, key concepts, flashcards, and a quiz — in seconds."],
              ["Practice & track", "Review cards on the right day. Watch your mastery climb."],
            ].map(([title, body], i) => (
              <li key={title} className="rounded-lg border bg-background p-5">
                <div className="text-sm font-mono text-primary">0{i + 1}</div>
                <div className="mt-1 font-semibold">{title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <Footer />
    </div>
  );
}
