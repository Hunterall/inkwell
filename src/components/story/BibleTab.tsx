import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Trash2,
  Sparkles,
  Plus,
  Users,
  MapPin,
  BookOpen,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/integrations/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { streamWrite } from "@/lib/ai/stream-client";
import { parseBibleJson } from "@/lib/ai/prompts";
import { useBible, useChapters, fullText, type BibleEntry } from "./data";
import { useDebouncedSave } from "./useDebouncedSave";
import type { Story } from "@/routes/_authenticated/stories_.$id";

const KINDS = [
  { k: "character", label: "Characters", icon: Users },
  { k: "place", label: "Places", icon: MapPin },
  { k: "lore", label: "World & lore", icon: BookOpen },
];

type ExtractedItem = {
  id: string;
  name: string;
  description: string;
  cast?: string;
  selected: boolean;
};

export function BibleTab({ story, update }: { story: Story; update: (p: Partial<Story>) => void }) {
  const qc = useQueryClient();
  const { data: entries = [] } = useBible(story.id);
  const { data: chapters = [] } = useChapters(story.id);

  const [analyzing, setAnalyzing] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [savingExtracted, setSavingExtracted] = useState(false);

  // Extracted elements for review & edit
  const [detectedGenre, setDetectedGenre] = useState("");
  const [detectedLogline, setDetectedLogline] = useState("");
  const [detectedSynopsis, setDetectedSynopsis] = useState("");
  const [applyOverview, setApplyOverview] = useState(true);

  const [extractedCharacters, setExtractedCharacters] = useState<ExtractedItem[]>([]);
  const [extractedPlaces, setExtractedPlaces] = useState<ExtractedItem[]>([]);
  const [extractedLore, setExtractedLore] = useState<ExtractedItem[]>([]);

  const save = useDebouncedSave(async (p: Partial<BibleEntry>) => {
    const { id, ...rest } = p;
    if (id) await updateDoc(doc(db, "bible_entries", id), rest);
  });

  const patch = (id: string, p: Partial<BibleEntry>) => {
    qc.setQueryData<BibleEntry[]>(["bible", story.id], (o) =>
      (o ?? []).map((e) => (e.id === id ? { ...e, ...p } : e)),
    );
    save({ id, ...p });
  };

  const add = async (kind: string) => {
    const uid = auth.currentUser?.uid ?? "";
    await addDoc(collection(db, "bible_entries"), {
      userId: uid,
      storyId: story.id,
      kind,
      name: "",
      description: "",
      createdAt: serverTimestamp(),
    });
    qc.invalidateQueries({ queryKey: ["bible", story.id] });
  };

  const remove = async (id: string) => {
    await deleteDoc(doc(db, "bible_entries", id));
    qc.invalidateQueries({ queryKey: ["bible", story.id] });
  };

  // Run AI analysis on imported or typed script/chapters
  async function runAiAnalysis() {
    const text = (story.script.trim() || fullText(chapters)).trim();
    if (!text) {
      toast.error("Write or import some chapters or a script first to analyze.");
      return;
    }

    setAnalyzing(true);
    const toastId = toast.loading("Analyzing script to extract characters, places & world lore…");

    try {
      const fullResponse = await streamWrite(
        {
          mode: "bible",
          text,
          title: story.title,
        },
        () => {},
      );

      const parsed = parseBibleJson(fullResponse);

      setDetectedGenre(parsed.genre || story.genre || "");
      setDetectedLogline(parsed.logline || story.logline || "");
      setDetectedSynopsis(parsed.synopsis || story.synopsis || "");
      setApplyOverview(true);

      setExtractedCharacters(
        parsed.characters.map((c, i) => ({
          id: `char-${i}-${Date.now()}`,
          name: c.name,
          description: c.description,
          selected: true,
        })),
      );

      setExtractedPlaces(
        parsed.places.map((p, i) => ({
          id: `place-${i}-${Date.now()}`,
          name: p.name,
          description: p.description,
          selected: true,
        })),
      );

      setExtractedLore(
        parsed.lore.map((l, i) => ({
          id: `lore-${i}-${Date.now()}`,
          name: l.name,
          description: l.description,
          selected: true,
        })),
      );

      const totalFound =
        parsed.characters.length + parsed.places.length + parsed.lore.length;

      toast.success(
        `Discovered ${totalFound} story elements (${parsed.characters.length} characters, ${parsed.places.length} places, ${parsed.lore.length} lore)! Review and edit them below.`,
        { id: toastId },
      );

      setReviewOpen(true);
    } catch (e) {
      toast.error((e as Error).message || "Analysis failed. Please check your AI API key in Settings.", {
        id: toastId,
      });
    } finally {
      setAnalyzing(false);
    }
  }

  // Save selected elements from the review dialog into Firestore
  async function saveExtractedToBible() {
    setSavingExtracted(true);
    const uid = auth.currentUser?.uid ?? "";

    try {
      // 1. Update story overview if selected
      if (applyOverview) {
        update({
          genre: detectedGenre.trim() || story.genre,
          logline: detectedLogline.trim() || story.logline,
          synopsis: detectedSynopsis.trim() || story.synopsis,
        });
      }

      // 2. Add selected characters
      const selectedChars = extractedCharacters.filter((c) => c.selected && c.name.trim());
      for (const c of selectedChars) {
        await addDoc(collection(db, "bible_entries"), {
          userId: uid,
          storyId: story.id,
          kind: "character",
          name: c.name.trim(),
          description: c.description.trim(),
          cast: c.cast?.trim() || "",
          createdAt: serverTimestamp(),
        });
      }

      // 3. Add selected places
      const selectedPlaces = extractedPlaces.filter((p) => p.selected && p.name.trim());
      for (const p of selectedPlaces) {
        await addDoc(collection(db, "bible_entries"), {
          userId: uid,
          storyId: story.id,
          kind: "place",
          name: p.name.trim(),
          description: p.description.trim(),
          createdAt: serverTimestamp(),
        });
      }

      // 4. Add selected lore
      const selectedLore = extractedLore.filter((l) => l.selected && l.name.trim());
      for (const l of selectedLore) {
        await addDoc(collection(db, "bible_entries"), {
          userId: uid,
          storyId: story.id,
          kind: "lore",
          name: l.name.trim(),
          description: l.description.trim(),
          createdAt: serverTimestamp(),
        });
      }

      const totalAdded = selectedChars.length + selectedPlaces.length + selectedLore.length;
      await qc.invalidateQueries({ queryKey: ["bible", story.id] });
      setReviewOpen(false);
      toast.success(
        `Added ${totalAdded} elements to your Story Bible! You can continue editing them anytime.`,
      );
    } catch (e) {
      toast.error((e as Error).message || "Failed to save elements to bible.");
    } finally {
      setSavingExtracted(false);
    }
  }

  const selectedCount =
    extractedCharacters.filter((c) => c.selected).length +
    extractedPlaces.filter((p) => p.selected).length +
    extractedLore.filter((l) => l.selected).length;

  return (
    <div className="space-y-10">
      {/* Top Banner / Analysis Action */}
      <div className="page flex flex-wrap items-center justify-between gap-4 rounded-md p-6 border-sepia/20">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-sepia" />
            Story Bible & World Building
          </h2>
          <p className="mt-1 font-serif text-sm text-muted-foreground">
            Let the AI analyze your imported script or typed chapters to extract all characters,
            notable places, and world lore with full editing capabilities.
          </p>
        </div>
        <Button
          onClick={runAiAnalysis}
          disabled={analyzing}
          className="shadow-sm"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          {analyzing ? "Analyzing story & script…" : "AI Story Analysis"}
        </Button>
      </div>

      {/* Story Overview Card */}
      <div className="page grid gap-4 rounded-md p-6 md:grid-cols-2">
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-widest text-sepia">Genre</p>
          <Input
            value={story.genre}
            onChange={(e) => update({ genre: e.target.value })}
            placeholder="e.g. Political satire, Sci-fi thriller"
          />
          <p className="pt-2 font-mono text-xs uppercase tracking-widest text-sepia">Logline</p>
          <Textarea
            value={story.logline}
            onChange={(e) => update({ logline: e.target.value })}
            placeholder="One sentence that captures the essence and stakes."
          />
        </div>
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-widest text-sepia">Synopsis</p>
          <Textarea
            className="min-h-36"
            value={story.synopsis}
            onChange={(e) => update({ synopsis: e.target.value })}
            placeholder="The overarching narrative arc and key turning points…"
          />
        </div>
      </div>

      {/* Story Bible Sections: Characters, Places, Lore */}
      {KINDS.map(({ k, label, icon: Icon }) => (
        <section key={k}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-2xl flex items-center gap-2">
              <Icon className="h-5 w-5 text-sepia" />
              {label}
            </h2>
            <Button size="sm" variant="outline" onClick={() => add(k)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add {k}
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {entries
              .filter((e) => e.kind === k)
              .map((e) => (
                <div key={e.id} className="page relative rounded-md p-4 transition-all hover:border-sepia/40">
                  <button
                    aria-label="Delete"
                    onClick={() => remove(e.id)}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <Input
                    value={e.name}
                    placeholder="Name"
                    onChange={(ev) => patch(e.id, { name: ev.target.value })}
                    className="mb-2 font-display text-lg"
                  />
                  {k === "character" && (
                    <div className="mb-2 space-y-1">
                      <label className="text-[11px] font-mono uppercase tracking-wider text-sepia flex items-center gap-1">
                        <Users className="h-3 w-3" /> Cast / Actor Name
                      </label>
                      <Input
                        value={e.cast || ""}
                        placeholder="e.g. Cillian Murphy, Florence Pugh"
                        onChange={(ev) => patch(e.id, { cast: ev.target.value })}
                        className="h-8 text-xs font-sans bg-background/60"
                      />
                    </div>
                  )}
                  <Textarea
                    value={e.description}
                    placeholder="Description, traits, role, history…"
                    onChange={(ev) => patch(e.id, { description: ev.target.value })}
                    className="min-h-24 font-serif text-sm"
                  />
                </div>
              ))}
            {entries.filter((e) => e.kind === k).length === 0 && (
              <div className="col-span-full border border-dashed rounded-md p-6 text-center text-sm text-muted-foreground">
                No {label.toLowerCase()} yet. Click &quot;Add {k}&quot; or run &quot;AI Story Analysis&quot; above to auto-extract them from your script.
              </div>
            )}
          </div>
        </section>
      ))}

      {/* Review & Edit Extracted Elements Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-sepia" />
              AI Extracted Story Bible Elements
            </DialogTitle>
            <DialogDescription>
              Review, edit names &amp; descriptions, or toggle items before adding them to your Story Bible.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="characters" className="flex-1 flex flex-col min-h-0 mt-3">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="characters" className="text-xs sm:text-sm">
                Characters ({extractedCharacters.filter((c) => c.selected).length})
              </TabsTrigger>
              <TabsTrigger value="places" className="text-xs sm:text-sm">
                Places ({extractedPlaces.filter((p) => p.selected).length})
              </TabsTrigger>
              <TabsTrigger value="lore" className="text-xs sm:text-sm">
                World &amp; Lore ({extractedLore.filter((l) => l.selected).length})
              </TabsTrigger>
              <TabsTrigger value="overview" className="text-xs sm:text-sm">
                Overview
              </TabsTrigger>
            </TabsList>

            {/* Characters Tab */}
            <TabsContent value="characters" className="flex-1 overflow-y-auto space-y-3 pr-1 pt-3">
              {extractedCharacters.map((c, idx) => (
                <div
                  key={c.id}
                  className={`p-3 rounded-md border transition-all ${
                    c.selected ? "border-sepia/30 bg-card" : "border-border/50 opacity-60 bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={(e) => {
                          const updated = [...extractedCharacters];
                          updated[idx]!.selected = e.target.checked;
                          setExtractedCharacters(updated);
                        }}
                        className="rounded"
                      />
                      <Input
                        value={c.name}
                        onChange={(e) => {
                          const updated = [...extractedCharacters];
                          updated[idx]!.name = e.target.value;
                          setExtractedCharacters(updated);
                        }}
                        placeholder="Character name"
                        className="font-bold text-sm h-8"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setExtractedCharacters(extractedCharacters.filter((_, i) => i !== idx))
                      }
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mb-2">
                    <Input
                      value={c.cast || ""}
                      onChange={(e) => {
                        const updated = [...extractedCharacters];
                        updated[idx]!.cast = e.target.value;
                        setExtractedCharacters(updated);
                      }}
                      placeholder="Cast / Actor name (e.g. Timothée Chalamet)"
                      className="text-xs h-7 bg-background/60"
                    />
                  </div>
                  <Textarea
                    value={c.description}
                    onChange={(e) => {
                      const updated = [...extractedCharacters];
                      updated[idx]!.description = e.target.value;
                      setExtractedCharacters(updated);
                    }}
                    placeholder="Personality, traits, role, relationships…"
                    className="text-xs min-h-16 font-serif"
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setExtractedCharacters([
                    ...extractedCharacters,
                    {
                      id: `char-${Date.now()}`,
                      name: "New Character",
                      description: "",
                      selected: true,
                    },
                  ])
                }
                className="w-full text-xs"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add custom character
              </Button>
            </TabsContent>

            {/* Places Tab */}
            <TabsContent value="places" className="flex-1 overflow-y-auto space-y-3 pr-1 pt-3">
              {extractedPlaces.map((p, idx) => (
                <div
                  key={p.id}
                  className={`p-3 rounded-md border transition-all ${
                    p.selected ? "border-sepia/30 bg-card" : "border-border/50 opacity-60 bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="checkbox"
                        checked={p.selected}
                        onChange={(e) => {
                          const updated = [...extractedPlaces];
                          updated[idx]!.selected = e.target.checked;
                          setExtractedPlaces(updated);
                        }}
                        className="rounded"
                      />
                      <Input
                        value={p.name}
                        onChange={(e) => {
                          const updated = [...extractedPlaces];
                          updated[idx]!.name = e.target.value;
                          setExtractedPlaces(updated);
                        }}
                        placeholder="Location / place name"
                        className="font-bold text-sm h-8"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setExtractedPlaces(extractedPlaces.filter((_, i) => i !== idx))
                      }
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <Textarea
                    value={p.description}
                    onChange={(e) => {
                      const updated = [...extractedPlaces];
                      updated[idx]!.description = e.target.value;
                      setExtractedPlaces(updated);
                    }}
                    placeholder="Atmosphere, narrative significance, sensory details…"
                    className="text-xs min-h-16 font-serif"
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setExtractedPlaces([
                    ...extractedPlaces,
                    {
                      id: `place-${Date.now()}`,
                      name: "New Place",
                      description: "",
                      selected: true,
                    },
                  ])
                }
                className="w-full text-xs"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add custom place
              </Button>
            </TabsContent>

            {/* Lore Tab */}
            <TabsContent value="lore" className="flex-1 overflow-y-auto space-y-3 pr-1 pt-3">
              {extractedLore.map((l, idx) => (
                <div
                  key={l.id}
                  className={`p-3 rounded-md border transition-all ${
                    l.selected ? "border-sepia/30 bg-card" : "border-border/50 opacity-60 bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="checkbox"
                        checked={l.selected}
                        onChange={(e) => {
                          const updated = [...extractedLore];
                          updated[idx]!.selected = e.target.checked;
                          setExtractedLore(updated);
                        }}
                        className="rounded"
                      />
                      <Input
                        value={l.name}
                        onChange={(e) => {
                          const updated = [...extractedLore];
                          updated[idx]!.name = e.target.value;
                          setExtractedLore(updated);
                        }}
                        placeholder="Rule, concept, faction, or artifact"
                        className="font-bold text-sm h-8"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setExtractedLore(extractedLore.filter((_, i) => i !== idx))
                      }
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <Textarea
                    value={l.description}
                    onChange={(e) => {
                      const updated = [...extractedLore];
                      updated[idx]!.description = e.target.value;
                      setExtractedLore(updated);
                    }}
                    placeholder="World rules, backstory, magic or technology systems, history…"
                    className="text-xs min-h-16 font-serif"
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setExtractedLore([
                    ...extractedLore,
                    {
                      id: `lore-${Date.now()}`,
                      name: "New Lore Concept",
                      description: "",
                      selected: true,
                    },
                  ])
                }
                className="w-full text-xs"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add custom lore item
              </Button>
            </TabsContent>

            {/* Overview Tab */}
            <TabsContent value="overview" className="flex-1 overflow-y-auto space-y-4 pr-1 pt-3">
              <div className="flex items-center gap-2 pb-2 border-b">
                <input
                  type="checkbox"
                  id="applyOverviewToggle"
                  checked={applyOverview}
                  onChange={(e) => setApplyOverview(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="applyOverviewToggle" className="text-sm font-semibold cursor-pointer">
                  Update Story Genre, Logline &amp; Synopsis
                </label>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-sepia">Genre</label>
                  <Input
                    value={detectedGenre}
                    onChange={(e) => setDetectedGenre(e.target.value)}
                    placeholder="Genre"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-sepia">Logline</label>
                  <Textarea
                    value={detectedLogline}
                    onChange={(e) => setDetectedLogline(e.target.value)}
                    placeholder="Logline"
                    className="mt-1 min-h-16"
                  />
                </div>
                <div>
                  <label className="text-xs font-mono uppercase tracking-wider text-sepia">Synopsis</label>
                  <Textarea
                    value={detectedSynopsis}
                    onChange={(e) => setDetectedSynopsis(e.target.value)}
                    placeholder="Synopsis"
                    className="mt-1 min-h-28"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4 pt-3 border-t flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {selectedCount} item{selectedCount === 1 ? "" : "s"} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReviewOpen(false)}
                disabled={savingExtracted}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={saveExtractedToBible}
                disabled={savingExtracted || selectedCount === 0}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {savingExtracted ? "Adding to Bible…" : `Add to Story Bible (${selectedCount})`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
