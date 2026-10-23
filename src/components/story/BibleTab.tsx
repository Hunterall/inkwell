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
  Compass,
  Check,
  Film,
  Lightbulb,
  RotateCw,
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
import {
  parseBibleJson,
  parseSuggestedLocations,
  type SuggestedLocation,
  parseLoglineResult,
  type LoglineOption,
} from "@/lib/ai/prompts";
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

  // Suggested Locations state
  const [suggestingLocations, setSuggestingLocations] = useState(false);
  const [locationsDialogOpen, setLocationsDialogOpen] = useState(false);
  const [savingLocations, setSavingLocations] = useState(false);
  const [suggestedGenre, setSuggestedGenre] = useState("");
  const [suggestedLocations, setSuggestedLocations] = useState<SuggestedLocation[]>([]);

  // Refresh Logline state
  const [refreshingLogline, setRefreshingLogline] = useState(false);
  const [loglineOptions, setLoglineOptions] = useState<LoglineOption[]>([]);
  const [dialogLoglineOptions, setDialogLoglineOptions] = useState<LoglineOption[]>([]);

  // Function to refresh logline with fresh AI-crafted options
  async function runRefreshLogline(target: "main" | "dialog" = "main") {
    const text = (story.script.trim() || fullText(chapters)).trim();
    if (!text) {
      toast.error("Write or import some chapters or a script first to refresh the logline.");
      return;
    }

    const currentLogline = target === "dialog" ? detectedLogline : story.logline;
    setRefreshingLogline(true);
    const toastId = toast.loading("Crafting fresh, high-concept logline options…");

    try {
      const fullResponse = await streamWrite(
        {
          mode: "logline",
          text,
          title: story.title,
          style: story.genre || story.style,
          instruction: currentLogline?.trim()
            ? `The existing logline is not nice or needs improvement: "${currentLogline.trim()}". Craft 4 fresh, significantly more captivating, punchy, and original alternatives.`
            : undefined,
        },
        () => {},
      );

      const result = parseLoglineResult(fullResponse);
      if (!result.recommended && !result.options.length) {
        throw new Error("Could not craft loglines. Please try again.");
      }

      if (target === "dialog") {
        setDetectedLogline(result.recommended);
        setDialogLoglineOptions(result.options);
      } else {
        update({ logline: result.recommended });
        setLoglineOptions(result.options);
      }

      toast.success("Refreshed with fresh logline options!", { id: toastId });
    } catch (e) {
      toast.error((e as Error).message || "Failed to refresh logline.", { id: toastId });
    } finally {
      setRefreshingLogline(false);
    }
  }

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

  // Run AI location scout suggestions based on script & genre
  async function runSuggestLocations() {
    const text = (story.script.trim() || fullText(chapters)).trim();
    if (!text) {
      toast.error("Write or import some chapters or a script first to suggest locations.");
      return;
    }

    setSuggestingLocations(true);
    const toastId = toast.loading(
      "Analyzing scenes & scouting real-world filming destinations (e.g. Goa, Gokarna, Udupi)…",
    );

    try {
      const fullResponse = await streamWrite(
        {
          mode: "locations",
          text,
          title: story.title,
          style: story.genre || story.style,
        },
        () => {},
      );

      const parsed = parseSuggestedLocations(fullResponse);
      if (!parsed.locations.length) {
        throw new Error("No locations suggested. Please try again.");
      }

      setSuggestedGenre(parsed.genre || story.genre || "");
      setSuggestedLocations(
        parsed.locations.map((loc, i) => ({
          ...loc,
          id: `suggested-loc-${i}-${Date.now()}`,
          selected: true,
        })),
      );

      toast.success(
        `Scouted real-world filming places for ${parsed.locations.length} scene${parsed.locations.length === 1 ? "" : "s"}!`,
        { id: toastId },
      );
      setLocationsDialogOpen(true);
    } catch (e) {
      toast.error((e as Error).message || "Location scouting failed. Check AI API key in Settings.", {
        id: toastId,
      });
    } finally {
      setSuggestingLocations(false);
    }
  }

  // Save chosen suggested locations to Story Bible places
  async function saveSuggestedLocationsToBible() {
    setSavingLocations(true);
    const uid = auth.currentUser?.uid ?? "";

    try {
      const selected = suggestedLocations.filter((l) => l.selected && (l.name.trim() || l.selectedPlace?.trim()));
      for (const loc of selected) {
        const placeName = (loc.name.trim() || loc.selectedPlace?.trim() || "Location").trim();
        const fullDesc = [
          loc.description.trim(),
          "",
          loc.scene ? `Scene: ${loc.scene}${loc.sceneType ? ` (${loc.sceneType})` : ""}` : "",
          loc.suggestedPlaces && loc.suggestedPlaces.length > 0
            ? `Scouted Filming Places: ${loc.suggestedPlaces.join(" • ")}`
            : "",
          loc.productionNotes ? `Filming Notes: ${loc.productionNotes}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        await addDoc(collection(db, "bible_entries"), {
          userId: uid,
          storyId: story.id,
          kind: "place",
          name: placeName,
          description: fullDesc.trim(),
          createdAt: serverTimestamp(),
        });
      }

      await qc.invalidateQueries({ queryKey: ["bible", story.id] });
      setLocationsDialogOpen(false);
      toast.success(
        `Added ${selected.length} real-world location${selected.length === 1 ? "" : "s"} to your Story Bible Places!`,
      );
    } catch (e) {
      toast.error((e as Error).message || "Failed to save locations.");
    } finally {
      setSavingLocations(false);
    }
  }

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
          <div className="flex items-center justify-between pt-2">
            <span className="font-mono text-xs uppercase tracking-widest text-sepia flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-sepia" /> Logline
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => runRefreshLogline("main")}
              disabled={refreshingLogline}
              className="h-6 px-2 text-xs text-sepia hover:text-foreground hover:bg-sepia/10 font-sans"
              title="Generate fresh, captivating logline options using AI"
            >
              <RotateCw className={`mr-1.5 h-3 w-3 ${refreshingLogline ? "animate-spin" : ""}`} />
              {refreshingLogline ? "Refreshing…" : "Refresh Logline"}
            </Button>
          </div>
          <Textarea
            value={story.logline}
            onChange={(e) => update({ logline: e.target.value })}
            placeholder="One sentence that captures the essence and stakes."
            className="min-h-16 font-serif text-sm leading-relaxed"
          />

          {loglineOptions.length > 0 && (
            <div className="rounded-md border border-sepia/20 bg-sepia/5 p-2.5 space-y-1.5 mt-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono text-sepia uppercase tracking-wider font-semibold flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Fresh Angles (Click to apply):
                </span>
                <button
                  type="button"
                  onClick={() => runRefreshLogline("main")}
                  disabled={refreshingLogline}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline flex items-center gap-1"
                >
                  <RotateCw className="h-2.5 w-2.5" /> Reroll
                </button>
              </div>
              <div className="space-y-1.5">
                {loglineOptions.map((opt, i) => {
                  const isSelected = story.logline.trim() === opt.text.trim();
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => update({ logline: opt.text })}
                      className={`w-full text-left p-2 rounded text-xs transition-all border ${
                        isSelected
                          ? "bg-sepia text-white border-sepia font-medium shadow-sm"
                          : "bg-background/80 hover:bg-sepia/10 border-border text-foreground hover:border-sepia/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span
                          className={`text-[10px] font-mono font-semibold uppercase tracking-wider ${
                            isSelected ? "text-white/90" : "text-sepia"
                          }`}
                        >
                          {opt.angle}
                        </span>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <p className="leading-snug line-clamp-2">{opt.text}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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
            <div className="flex items-center gap-2">
              {k === "place" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runSuggestLocations}
                  disabled={suggestingLocations}
                  className="border-sepia/40 bg-sepia/5 hover:bg-sepia/15 text-foreground"
                >
                  <Compass className="mr-1.5 h-3.5 w-3.5 text-sepia" />
                  {suggestingLocations ? "Scouting Places…" : "Suggest Places for Scenes"}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => add(k)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add {k}
              </Button>
            </div>
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
              <div className="col-span-full border border-dashed rounded-md p-6 text-center text-sm text-muted-foreground space-y-3">
                <p>
                  No {label.toLowerCase()} yet.
                  {k === "place"
                    ? " Click 'Suggest Places for Scenes' to let AI analyze each scene and scout real-world filming destinations (e.g. Goa, Gokarna, Udupi for beach scenes; Manali/Munnar for mountains), or add one manually."
                    : " Click \"Add " + k + "\" or run \"AI Story Analysis\" above to auto-extract them from your script."}
                </p>
                {k === "place" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={runSuggestLocations}
                    disabled={suggestingLocations}
                  >
                    <Compass className="mr-1.5 h-3.5 w-3.5 text-sepia" />
                    {suggestingLocations ? "Scouting Places…" : "AI Scout Real Places for Scenes"}
                  </Button>
                )}
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
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-mono uppercase tracking-wider text-sepia flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-sepia" /> Logline
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => runRefreshLogline("dialog")}
                      disabled={refreshingLogline}
                      className="h-6 px-2 text-xs text-sepia hover:text-foreground hover:bg-sepia/10 font-sans"
                      title="Generate fresh, captivating logline options using AI"
                    >
                      <RotateCw className={`mr-1.5 h-3 w-3 ${refreshingLogline ? "animate-spin" : ""}`} />
                      {refreshingLogline ? "Refreshing…" : "Refresh Logline"}
                    </Button>
                  </div>
                  <Textarea
                    value={detectedLogline}
                    onChange={(e) => setDetectedLogline(e.target.value)}
                    placeholder="Logline"
                    className="mt-1 min-h-16 font-serif text-sm leading-relaxed"
                  />

                  {dialogLoglineOptions.length > 0 && (
                    <div className="mt-2 rounded-md border border-sepia/20 bg-sepia/5 p-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono text-sepia uppercase tracking-wider font-semibold flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> Fresh Angles (Click to apply):
                        </span>
                        <button
                          type="button"
                          onClick={() => runRefreshLogline("dialog")}
                          disabled={refreshingLogline}
                          className="text-[10px] text-muted-foreground hover:text-foreground underline flex items-center gap-1"
                        >
                          <RotateCw className="h-2.5 w-2.5" /> Reroll
                        </button>
                      </div>
                      <div className="space-y-1">
                        {dialogLoglineOptions.map((opt, i) => {
                          const isSelected = detectedLogline.trim() === opt.text.trim();
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setDetectedLogline(opt.text)}
                              className={`w-full text-left p-1.5 rounded text-xs transition-all border ${
                                isSelected
                                  ? "bg-sepia text-white border-sepia font-medium shadow-sm"
                                  : "bg-background/80 hover:bg-sepia/10 border-border text-foreground hover:border-sepia/40"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-0.5">
                                <span
                                  className={`text-[10px] font-mono font-semibold uppercase tracking-wider ${
                                    isSelected ? "text-white/90" : "text-sepia"
                                  }`}
                                >
                                  {opt.angle}
                                </span>
                                {isSelected && <Check className="h-3 w-3 text-white" />}
                              </div>
                              <p className="leading-snug line-clamp-2">{opt.text}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
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

      {/* Review & Add Suggested Locations Dialog */}
      <Dialog open={locationsDialogOpen} onOpenChange={setLocationsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display flex items-center gap-2">
              <Compass className="h-5 w-5 text-sepia" />
              Scene-by-Scene Real-World Location Scout
            </DialogTitle>
            <DialogDescription>
              Scouted authentic real-world filming destinations for each scene in your script ({suggestedGenre || story.genre || "Drama"}). For example, beach scenes offer coastal places like Goa, Gokarna, and Udupi. Click any place chip to pick it, refine details, and add them to your Story Bible Places.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1 pt-3 min-h-0">
            {suggestedLocations.map((loc, idx) => (
              <div
                key={loc.id || idx}
                className={`p-4 rounded-lg border transition-all ${
                  loc.selected ? "border-sepia/40 bg-card shadow-sm" : "border-border/50 opacity-60 bg-muted/20"
                }`}
              >
                {/* Scene Header & Setting Badge */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={loc.selected ?? true}
                      onChange={(e) => {
                        const updated = [...suggestedLocations];
                        updated[idx] = { ...updated[idx]!, selected: e.target.checked };
                        setSuggestedLocations(updated);
                      }}
                      className="rounded h-4 w-4 accent-primary shrink-0"
                    />
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-sepia/10 text-sepia border border-sepia/20 flex items-center gap-1 shrink-0">
                        <Film className="h-3 w-3" />
                        {loc.scene || "Major Scene"}
                      </span>
                      {loc.sceneType && (
                        <span className="text-[11px] font-sans px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
                          {loc.sceneType}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSuggestedLocations(suggestedLocations.filter((_, i) => i !== idx))
                    }
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0 p-1"
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Real-World Place Suggestion Chips */}
                {loc.suggestedPlaces && loc.suggestedPlaces.length > 0 && (
                  <div className="mb-3 rounded-md bg-muted/30 p-2.5 border border-border/60">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-sepia mb-1.5 flex items-center gap-1.5 font-medium">
                      <MapPin className="h-3 w-3" />
                      Suggested Real-World Filming Places (click to select):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {loc.suggestedPlaces.map((place) => {
                        const isChosen = loc.name === place || loc.selectedPlace === place;
                        return (
                          <button
                            key={place}
                            type="button"
                            onClick={() => {
                              const updated = [...suggestedLocations];
                              updated[idx] = {
                                ...updated[idx]!,
                                selectedPlace: place,
                                name: place,
                              };
                              setSuggestedLocations(updated);
                            }}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 border ${
                              isChosen
                                ? "bg-sepia text-white border-sepia shadow-sm ring-1 ring-sepia"
                                : "bg-background hover:bg-sepia/10 border-border text-foreground hover:border-sepia/40"
                            }`}
                          >
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span>{place}</span>
                            {isChosen && <Check className="h-3 w-3 ml-0.5 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Place Name Input */}
                <div className="mb-3 space-y-1">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Location Name for Story Bible
                  </label>
                  <Input
                    value={loc.name}
                    onChange={(e) => {
                      const updated = [...suggestedLocations];
                      updated[idx] = { ...updated[idx]!, name: e.target.value };
                      setSuggestedLocations(updated);
                    }}
                    placeholder="e.g. Goa (Palolem Beach), Gokarna (Om Beach), Udupi"
                    className="font-bold text-sm h-8 bg-background"
                  />
                </div>

                {/* Cinematic Atmosphere & Scene Fit */}
                <div className="mb-2.5 space-y-1">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Cinematic Atmosphere & Scene Fit
                  </label>
                  <Textarea
                    value={loc.description}
                    onChange={(e) => {
                      const updated = [...suggestedLocations];
                      updated[idx] = { ...updated[idx]!, description: e.target.value };
                      setSuggestedLocations(updated);
                    }}
                    placeholder="Visual landscape, sensory details (surf, golden hour, cliffs), mood…"
                    className="text-xs min-h-20 font-serif leading-relaxed"
                  />
                </div>

                {/* Production Notes */}
                {loc.productionNotes && (
                  <div className="rounded border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-muted-foreground flex items-start gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-foreground">Production & Shooting Notes:</strong>{" "}
                      {loc.productionNotes}
                    </span>
                  </div>
                )}
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setSuggestedLocations([
                  ...suggestedLocations,
                  {
                    id: `suggested-loc-${Date.now()}`,
                    name: "Goa (Palolem Beach)",
                    scene: "Major Scene",
                    sceneType: "Beach / Coastal",
                    suggestedPlaces: [
                      "Goa (Palolem Beach & Vagator Cliffs)",
                      "Gokarna (Om Beach & Kudle Beach)",
                      "Udupi (Kapu Beach Lighthouse & Malpe Beach)",
                    ],
                    recommendedPlace: "Goa (Palolem Beach)",
                    selectedPlace: "Goa (Palolem Beach)",
                    description: "Scenic shoreline suited for dramatic sunset and emotional dialogue.",
                    productionNotes: "Golden hour window 5:15 - 6:30 PM. Permits required for commercial filming.",
                    selected: true,
                  },
                ])
              }
              className="w-full text-xs"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add another scene location
            </Button>
          </div>

          <DialogFooter className="mt-4 pt-3 border-t flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {suggestedLocations.filter((l) => l.selected).length} of {suggestedLocations.length} location{suggestedLocations.length === 1 ? "" : "s"} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocationsDialogOpen(false)}
                disabled={savingLocations}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={saveSuggestedLocationsToBible}
                disabled={savingLocations || suggestedLocations.filter((l) => l.selected).length === 0}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {savingLocations
                  ? "Adding Places…"
                  : `Add to Story Bible Places (${suggestedLocations.filter((l) => l.selected).length})`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
