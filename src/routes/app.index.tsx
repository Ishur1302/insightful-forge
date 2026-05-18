import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { processMaterial } from "@/lib/study.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Loader2, BookOpen, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Material = Database["public"]["Tables"]["materials"]["Row"];

export const Route = createFileRoute("/app/")({
  component: Dashboard,
});

function Dashboard() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const router = useRouter();
  const processFn = useServerFn(processMaterial);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("materials")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setMaterials(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (title.trim().length < 2) return toast.error("Add a title");
    if (content.trim().length < 100) return toast.error("Paste at least 100 characters of notes");
    setCreating(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("materials")
        .insert({
          user_id: u.user.id,
          title: title.trim().slice(0, 200),
          source_content: content.trim().slice(0, 50000),
          status: "processing",
        })
        .select()
        .single();
      if (error) throw error;
      setOpen(false);
      setTitle("");
      setContent("");
      toast.success("Generating your study kit…");
      router.navigate({ to: "/app/$materialId", params: { materialId: data.id } });
      // Fire and forget AI processing
      processFn({ data: { materialId: data.id } }).catch((e) => {
        toast.error(e instanceof Error ? e.message : "AI generation failed");
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("materials").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setMaterials((m) => m.filter((x) => x.id !== id));
    toast.success("Deleted");
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Your library</h1>
          <p className="text-muted-foreground mt-1">All your study materials in one place.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-elegant"><Plus className="h-4 w-4 mr-1" />New material</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add study material</DialogTitle>
              <DialogDescription>Paste a chapter, lecture transcript, or notes. AI will summarize and build flashcards and a quiz.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="t">Title</Label>
                <Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Photosynthesis — Chapter 4" maxLength={200} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="c">Notes ({content.length.toLocaleString()} chars)</Label>
                <Textarea id="c" rows={12} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Paste your notes here…" maxLength={50000} />
              </div>
              <Button onClick={create} disabled={creating} className="w-full">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create & generate"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-8">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : materials.length === 0 ? (
          <Card className="bg-gradient-card border-dashed">
            <CardContent className="py-16 text-center">
              <BookOpen className="h-10 w-10 mx-auto text-muted-foreground" />
              <h3 className="mt-4 font-semibold text-lg">No materials yet</h3>
              <p className="text-muted-foreground text-sm mt-1">Add your first chapter to see AI in action.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {materials.map((m) => (
              <Card key={m.id} className="bg-gradient-card hover:shadow-elegant transition-shadow group">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base line-clamp-2">{m.title}</CardTitle>
                    <StatusBadge status={m.status} />
                  </div>
                  <CardDescription className="line-clamp-2">
                    {m.summary ?? m.source_content.slice(0, 120) + "…"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</span>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => remove(m.id)} aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Link to="/app/$materialId" params={{ materialId: m.id }}>
                      <Button size="sm" variant="secondary">
                        Open <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ready") return <Badge variant="secondary" className="bg-success/15 text-success border-success/20">Ready</Badge>;
  if (status === "error") return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Processing</Badge>;
}
