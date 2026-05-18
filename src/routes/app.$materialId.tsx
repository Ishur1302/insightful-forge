import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { generateQuiz, processMaterial, reviewFlashcard, saveQuizAttempt } from "@/lib/study.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, RotateCcw, ArrowLeft, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Material = Database["public"]["Tables"]["materials"]["Row"];
type Flashcard = Database["public"]["Tables"]["flashcards"]["Row"];
type KeyConcept = { term: string; definition: string };
type QuizQ = { question: string; options: string[]; correct_index: number; explanation: string };

export const Route = createFileRoute("/app/$materialId")({
  component: MaterialPage,
});

function MaterialPage() {
  const { materialId } = Route.useParams();
  const [material, setMaterial] = useState<Material | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const reprocessFn = useServerFn(processMaterial);

  const load = useCallback(async () => {
    const [{ data: m }, { data: fc }] = await Promise.all([
      supabase.from("materials").select("*").eq("id", materialId).maybeSingle(),
      supabase.from("flashcards").select("*").eq("material_id", materialId).order("created_at"),
    ]);
    setMaterial(m);
    setCards(fc ?? []);
    setLoading(false);
  }, [materialId]);

  useEffect(() => { load(); }, [load]);

  // Poll while processing
  useEffect(() => {
    if (material?.status === "processing" || material?.status === "pending") {
      const t = setInterval(load, 2500);
      return () => clearInterval(t);
    }
  }, [material?.status, load]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!material) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <h2 className="text-xl font-semibold">Material not found</h2>
        <Link to="/app"><Button className="mt-4" variant="outline">Back to library</Button></Link>
      </div>
    );
  }

  const concepts = (material.key_concepts as unknown as KeyConcept[]) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link to="/app" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Library
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{material.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">Added {new Date(material.created_at).toLocaleString()}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            toast.info("Regenerating with AI…");
            try {
              await reprocessFn({ data: { materialId } });
              await load();
              toast.success("Regenerated");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            }
          }}
        >
          <RotateCcw className="h-4 w-4 mr-1" /> Regenerate
        </Button>
      </div>

      {material.status === "processing" || material.status === "pending" ? (
        <Card className="mt-8 bg-gradient-card">
          <CardContent className="py-16 text-center">
            <Sparkles className="h-10 w-10 mx-auto text-primary animate-pulse" />
            <h3 className="mt-4 font-semibold text-lg">AI is building your study kit</h3>
            <p className="text-muted-foreground text-sm mt-1">This usually takes 5-15 seconds.</p>
          </CardContent>
        </Card>
      ) : material.status === "error" ? (
        <Card className="mt-8 border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Generation failed</CardTitle>
            <CardDescription>{material.error_message ?? "Unknown error"}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Tabs defaultValue="summary" className="mt-8">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="flashcards">Flashcards ({cards.length})</TabsTrigger>
            <TabsTrigger value="quiz">Quiz</TabsTrigger>
          </TabsList>
          <TabsContent value="summary" className="mt-4">
            <Card>
              <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
              <CardContent className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-foreground/90 leading-relaxed">
                {material.summary}
              </CardContent>
            </Card>
            {concepts.length > 0 && (
              <Card className="mt-4">
                <CardHeader><CardTitle>Key concepts</CardTitle></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {concepts.map((c, i) => (
                    <div key={i} className="rounded-lg border bg-background p-4">
                      <div className="font-semibold">{c.term}</div>
                      <div className="text-sm text-muted-foreground mt-1">{c.definition}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
          <TabsContent value="flashcards" className="mt-4">
            <FlashcardReview cards={cards} onUpdated={load} />
          </TabsContent>
          <TabsContent value="quiz" className="mt-4">
            <QuizPanel materialId={materialId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function FlashcardReview({ cards, onUpdated }: { cards: Flashcard[]; onUpdated: () => void }) {
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const reviewFn = useServerFn(reviewFlashcard);

  if (cards.length === 0) {
    return <p className="text-muted-foreground">No flashcards yet.</p>;
  }
  const card = cards[idx % cards.length];

  const grade = async (quality: number) => {
    try {
      await reviewFn({ data: { flashcardId: card.id, quality } });
      setRevealed(false);
      setIdx((i) => i + 1);
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex justify-between text-sm text-muted-foreground mb-2">
        <span>Card {(idx % cards.length) + 1} of {cards.length}</span>
        <Badge variant="outline">Reviews: {card.review_count}</Badge>
      </div>
      <Card className="min-h-[260px] bg-gradient-card shadow-elegant">
        <CardContent className="p-8">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Question</div>
          <p className="mt-2 text-lg font-medium">{card.question}</p>
          {revealed && (
            <>
              <div className="mt-6 text-xs uppercase tracking-wider text-muted-foreground">Answer</div>
              <p className="mt-2 text-foreground/90">{card.answer}</p>
            </>
          )}
        </CardContent>
      </Card>
      <div className="mt-4 flex justify-center gap-2">
        {!revealed ? (
          <Button onClick={() => setRevealed(true)} size="lg">Reveal answer</Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => grade(1)}>Again</Button>
            <Button variant="outline" onClick={() => grade(3)}>Hard</Button>
            <Button onClick={() => grade(4)}>Good</Button>
            <Button variant="secondary" onClick={() => grade(5)}>Easy</Button>
          </>
        )}
      </div>
    </div>
  );
}

function QuizPanel({ materialId }: { materialId: string }) {
  const [quiz, setQuiz] = useState<QuizQ[] | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const genFn = useServerFn(generateQuiz);
  const saveFn = useServerFn(saveQuizAttempt);

  const start = async () => {
    setLoading(true);
    setSubmitted(false);
    try {
      const q = await genFn({ data: { materialId } });
      setQuiz(q as QuizQ[]);
      setAnswers(new Array(q.length).fill(-1));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!quiz) return;
    if (answers.some((a) => a < 0)) return toast.error("Answer all questions");
    const score = quiz.reduce((s, q, i) => s + (q.correct_index === answers[i] ? 1 : 0), 0);
    setSubmitted(true);
    try {
      await saveFn({
        data: {
          materialId,
          questions: quiz.map((q, i) => ({ ...q, userAnswer: answers[i] })),
          score,
          total: quiz.length,
        },
      });
      toast.success(`You scored ${score} / ${quiz.length}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  if (!quiz) {
    return (
      <Card className="bg-gradient-card">
        <CardContent className="py-12 text-center">
          <Sparkles className="h-8 w-8 mx-auto text-primary" />
          <h3 className="mt-3 font-semibold">Generate a fresh quiz</h3>
          <p className="text-sm text-muted-foreground mt-1">5 multiple-choice questions based on this material.</p>
          <Button onClick={start} disabled={loading} className="mt-4">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate quiz"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const score = submitted ? quiz.reduce((s, q, i) => s + (q.correct_index === answers[i] ? 1 : 0), 0) : 0;

  return (
    <div className="space-y-4">
      {submitted && (
        <Card className="bg-gradient-card">
          <CardContent className="py-4 flex items-center justify-between">
            <div className="font-semibold text-lg">Score: {score} / {quiz.length}</div>
            <Button variant="outline" onClick={start}>New quiz</Button>
          </CardContent>
        </Card>
      )}
      {quiz.map((q, i) => (
        <Card key={i}>
          <CardHeader>
            <CardTitle className="text-base">{i + 1}. {q.question}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {q.options.map((opt, j) => {
              const chosen = answers[i] === j;
              const correct = q.correct_index === j;
              const showState = submitted && (chosen || correct);
              return (
                <button
                  key={j}
                  disabled={submitted}
                  onClick={() => setAnswers((a) => a.map((v, k) => (k === i ? j : v)))}
                  className={`w-full text-left rounded-md border px-3 py-2 text-sm transition-colors
                    ${chosen && !submitted ? "border-primary bg-primary/5" : "border-input hover:bg-accent"}
                    ${showState && correct ? "border-success bg-success/10" : ""}
                    ${showState && chosen && !correct ? "border-destructive bg-destructive/10" : ""}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span>{opt}</span>
                    {submitted && correct && <CheckCircle2 className="h-4 w-4 text-success" />}
                    {submitted && chosen && !correct && <XCircle className="h-4 w-4 text-destructive" />}
                  </div>
                </button>
              );
            })}
            {submitted && (
              <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">{q.explanation}</p>
            )}
          </CardContent>
        </Card>
      ))}
      {!submitted && (
        <Button onClick={submit} className="w-full" size="lg">Submit answers</Button>
      )}
    </div>
  );
}
