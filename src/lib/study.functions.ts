import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateObject } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway";

const ProcessInput = z.object({
  materialId: z.string().uuid(),
});

const StudyPlanSchema = z.object({
  summary: z
    .string()
    .describe("A clear, structured 4-8 paragraph summary of the source material in plain English."),
  key_concepts: z
    .array(
      z.object({
        term: z.string(),
        definition: z.string(),
      }),
    )
    .min(3)
    .max(12),
  flashcards: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string(),
      }),
    )
    .min(5)
    .max(15),
  quiz: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).length(4),
        correct_index: z.number().min(0).max(3),
        explanation: z.string(),
      }),
    )
    .min(4)
    .max(8),
});

export const processMaterial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProcessInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { data: material, error } = await supabase
      .from("materials")
      .select("id, source_content, title")
      .eq("id", data.materialId)
      .eq("user_id", userId)
      .single();
    if (error || !material) throw new Error("Material not found");

    await supabase.from("materials").update({ status: "processing", error_message: null }).eq("id", data.materialId);

    try {
      const gateway = createLovableAiGatewayProvider(key);
      const model = gateway("google/gemini-3-flash-preview");

      const truncated = material.source_content.slice(0, 18000);
      const { object } = await generateObject({
        model,
        schema: StudyPlanSchema,
        prompt: `You are an expert tutor. From the following study material titled "${material.title}", produce:
1) A faithful, well-structured summary.
2) Key concepts with concise definitions.
3) Active-recall flashcards (Q/A) that test the most important ideas.
4) A multiple-choice quiz with 4 options each, exactly one correct, and a short explanation.

Material:
"""
${truncated}
"""

Only use information present or directly implied by the material. Do not invent facts.`,
      });

      // Save summary + concepts
      await supabase
        .from("materials")
        .update({
          summary: object.summary,
          key_concepts: object.key_concepts,
          status: "ready",
        })
        .eq("id", data.materialId);

      // Replace flashcards
      await supabase.from("flashcards").delete().eq("material_id", data.materialId);
      const fcRows = object.flashcards.map((f) => ({
        material_id: data.materialId,
        user_id: userId,
        question: f.question,
        answer: f.answer,
      }));
      await supabase.from("flashcards").insert(fcRows);

      return { ok: true, quiz: object.quiz };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("materials")
        .update({ status: "error", error_message: msg.slice(0, 500) })
        .eq("id", data.materialId);
      throw new Error(msg);
    }
  });

const GenerateQuizInput = z.object({ materialId: z.string().uuid() });

export const generateQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => GenerateQuizInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { data: material } = await supabase
      .from("materials")
      .select("source_content, title")
      .eq("id", data.materialId)
      .eq("user_id", userId)
      .single();
    if (!material) throw new Error("Material not found");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const QuizSchema = z.object({
      quiz: z
        .array(
          z.object({
            question: z.string(),
            options: z.array(z.string()).length(4),
            correct_index: z.number().min(0).max(3),
            explanation: z.string(),
          }),
        )
        .length(5),
    });

    const { object } = await generateObject({
      model,
      schema: QuizSchema,
      prompt: `Create a fresh 5-question multiple-choice quiz on "${material.title}" using only this material:
"""
${material.source_content.slice(0, 16000)}
"""
Each question has 4 options, exactly one correct answer, and a short explanation. Avoid repeating earlier wording verbatim.`,
    });

    return object.quiz;
  });

const ReviewInput = z.object({
  flashcardId: z.string().uuid(),
  quality: z.number().min(0).max(5),
});

// SM-2 inspired spaced repetition update
export const reviewFlashcard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ReviewInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: card } = await supabase
      .from("flashcards")
      .select("ease, interval_days, review_count")
      .eq("id", data.flashcardId)
      .eq("user_id", userId)
      .single();
    if (!card) throw new Error("Card not found");

    let ease = card.ease + (0.1 - (5 - data.quality) * (0.08 + (5 - data.quality) * 0.02));
    if (ease < 1.3) ease = 1.3;
    let interval: number;
    if (data.quality < 3) interval = 1;
    else if (card.review_count === 0) interval = 1;
    else if (card.review_count === 1) interval = 3;
    else interval = Math.round(card.interval_days * ease);

    const due = new Date(Date.now() + interval * 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("flashcards")
      .update({
        ease,
        interval_days: interval,
        review_count: card.review_count + 1,
        due_at: due,
      })
      .eq("id", data.flashcardId);

    return { ok: true, due, interval };
  });

const SaveAttemptInput = z.object({
  materialId: z.string().uuid(),
  questions: z.array(z.unknown()),
  score: z.number().int().min(0),
  total: z.number().int().min(1),
});

export const saveQuizAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SaveAttemptInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("quiz_attempts").insert({
      material_id: data.materialId,
      user_id: userId,
      questions: data.questions as never,
      score: data.score,
      total: data.total,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
