import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  FileDown,
  ImageIcon,
  Sparkles,
  Sun,
  Moon,
  Cloud,
  CloudRain,
  MapPin,
  Users,
  Package,
  Layers,
  Edit2,
  Check,
} from "lucide-react";
import { jsPDF } from "jspdf";
import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  addDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/integrations/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { streamWrite } from "@/lib/ai/stream-client";
import { parseScenes } from "@/lib/ai/prompts";
import { generateFrameImage } from "@/lib/frames.functions";
import {
  bibleToText,
  fullText,
  useBible,
  useChapters,
  useFrames,
  type Frame,
  type BibleEntry,
} from "./data";
import { getAiSettings } from "@/lib/settings";
import type { Story } from "@/routes/_authenticated/stories_.$id";

const LIGHTING_OPTIONS = [
  { value: "day", label: "Day", icon: Sun, color: "text-amber-500" },
  { value: "night", label: "Night", icon: Moon, color: "text-indigo-400" },
  { value: "cloudy", label: "Cloudy", icon: Cloud, color: "text-slate-400" },
  { value: "rainy", label: "Rainy", icon: CloudRain, color: "text-blue-400" },
  { value: "golden_hour", label: "Golden Hour", icon: Sun, color: "text-orange-400" },
  { value: "interior", label: "Interior", icon: Layers, color: "text-emerald-500" },
];

export function BoardTab({ story }: { story: Story }) {
  const qc = useQueryClient();
  const { data: chapters = [] } = useChapters(story.id);
  const { data: bible = [] } = useBible(story.id);
  const { data: frames = [] } = useFrames(story.id);
  const genImage = useServerFn(generateFrameImage);
  const [busy, setBusy] = useState(false);
  const [painting, setPainting] = useState<Record<string, boolean>>({});
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);

  // Compute breakdown stats
  const stats = {
    day: frames.filter((f) => (f.lighting || "").toLowerCase() === "day"),
    night: frames.filter((f) => (f.lighting || "").toLowerCase() === "night"),
    cloudy: frames.filter((f) => (f.lighting || "").toLowerCase() === "cloudy"),
    rainy: frames.filter((f) => (f.lighting || "").toLowerCase() === "rainy"),
    golden_hour: frames.filter((f) => (f.lighting || "").toLowerCase() === "golden_hour"),
    interior: frames.filter((f) => (f.lighting || "").toLowerCase() === "interior"),
  };

  async function breakdown() {
    const text = story.script.trim() || fullText(chapters);
    if (!text.trim()) {
      toast.error("Write your story or script first.");
      return;
    }
    setBusy(true);
    try {
      const out = await streamWrite({ mode: "scenes", text, bible: bibleToText(bible) }, () => {});
      const scenes = parseScenes(out);
      if (!scenes.length) throw new Error("Couldn't find scenes. Try again.");

      // Delete existing frames for this story
      const existingQuery = query(collection(db, "frames"), where("storyId", "==", story.id));
      const existingSnap = await getDocs(existingQuery);
      if (!existingSnap.empty) {
        const batch = writeBatch(db);
        existingSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      // Add new frames
      for (let i = 0; i < scenes.length; i++) {
        const s = scenes[i]!;
        await addDoc(collection(db, "frames"), {
          storyId: story.id,
          position: i,
          heading: s.heading,
          description: s.description,
          image_url: null,
          lighting: s.lighting || "day",
          location: s.location || "",
          props: s.props || "",
          cast: s.cast || "",
        });
      }

      qc.invalidateQueries({ queryKey: ["frames", story.id] });
      toast.success(`Generated ${scenes.length} storyboard frames with shot analysis!`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function updateFrameField(id: string, patch: Partial<Frame>) {
    try {
      await updateDoc(doc(db, "frames", id), patch);
      qc.invalidateQueries({ queryKey: ["frames", story.id] });
    } catch (e) {
      toast.error("Failed to update frame");
    }
  }

  async function paint(f: Frame) {
    setPainting((p) => ({ ...p, [f.id]: true }));
    try {
      const weatherModifier = f.lighting ? `${f.lighting} lighting` : "";
      const res = await genImage({
        data: {
          frameId: f.id,
          heading: f.heading,
          description: `${f.description}. ${weatherModifier}`.trim(),
          style: `${story.genre} ${story.style}`.trim(),
          provider: getAiSettings().imageProvider,
        },
      });
      if (res?.image_url) {
        await updateDoc(doc(db, "frames", f.id), { image_url: res.image_url });
        qc.invalidateQueries({ queryKey: ["frames", story.id] });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPainting((p) => ({ ...p, [f.id]: false }));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy} onClick={breakdown}>
            <Sparkles className="mr-2 h-4 w-4" />
            {busy ? "Analyzing & Breaking down…" : "Break into scenes"}
          </Button>
          <Button
            variant="secondary"
            disabled={!frames.length}
            onClick={() => frames.forEach((f) => !f.image_url && paint(f))}
          >
            <ImageIcon className="mr-2 h-4 w-4" />
            Illustrate all
          </Button>
          <Button variant="outline" onClick={() => exportDeck(story, bible, frames)}>
            <FileDown className="mr-2 h-4 w-4" />
            Export pitch deck (PDF)
          </Button>
        </div>
      </div>

      {/* Production Shot & Weather Breakdown Bar */}
      {frames.length > 0 && (
        <div className="page rounded-lg p-5 border shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-sepia" />
              <h3 className="font-semibold text-sm">Production Shot & Lighting Breakdown</h3>
            </div>
            <span className="text-xs text-muted-foreground">{frames.length} Total Shots</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-md border p-3 bg-background/50">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Sun className="h-4 w-4 text-amber-500" /> Day Shots
                </span>
                <span className="font-mono font-bold text-sm text-foreground">{stats.day.length}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                {stats.day.map((f, i) => `#${i + 1}`).join(", ") || "None"}
              </p>
            </div>

            <div className="rounded-md border p-3 bg-background/50">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Moon className="h-4 w-4 text-indigo-400" /> Night Shots
                </span>
                <span className="font-mono font-bold text-sm text-foreground">{stats.night.length}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                {stats.night.map((f, i) => `#${i + 1}`).join(", ") || "None"}
              </p>
            </div>

            <div className="rounded-md border p-3 bg-background/50">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Cloud className="h-4 w-4 text-slate-400" /> Cloudy Shots
                </span>
                <span className="font-mono font-bold text-sm text-foreground">{stats.cloudy.length}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                {stats.cloudy.map((f, i) => `#${i + 1}`).join(", ") || "None"}
              </p>
            </div>

            <div className="rounded-md border p-3 bg-background/50">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CloudRain className="h-4 w-4 text-blue-400" /> Rainy Shots
                </span>
                <span className="font-mono font-bold text-sm text-foreground">{stats.rainy.length}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                {stats.rainy.map((f, i) => `#${i + 1}`).join(", ") || "None"}
              </p>
            </div>
          </div>
        </div>
      )}

      {!frames.length && (
        <p className="font-serif text-muted-foreground">
          Break your story into scenes to build a storyboard and production breakdown.
        </p>
      )}

      {/* Frame cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {frames.map((f, i) => {
          const isEditing = editingFrameId === f.id;
          return (
            <div key={f.id} className="page overflow-hidden rounded-md border flex flex-col justify-between">
              <div>
                <div className="relative flex aspect-[3/2] items-center justify-center bg-muted">
                  {f.image_url ? (
                    <img
                      src={f.image_url}
                      alt={f.heading}
                      className={`h-full w-full object-cover ${painting[f.id] ? "blur-sm" : ""}`}
                    />
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={painting[f.id]}
                      onClick={() => paint(f)}
                    >
                      {painting[f.id] ? "Painting…" : "Illustrate"}
                    </Button>
                  )}

                  {/* Weather / Lighting badge */}
                  <div className="absolute top-2 right-2 bg-background/85 backdrop-blur px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 border">
                    {f.lighting === "night" && <Moon className="h-3 w-3 text-indigo-400" />}
                    {f.lighting === "rainy" && <CloudRain className="h-3 w-3 text-blue-400" />}
                    {f.lighting === "cloudy" && <Cloud className="h-3 w-3 text-slate-400" />}
                    {(f.lighting === "day" || !f.lighting) && <Sun className="h-3 w-3 text-amber-500" />}
                    {f.lighting === "golden_hour" && <Sun className="h-3 w-3 text-orange-400" />}
                    {f.lighting === "interior" && <Layers className="h-3 w-3 text-emerald-500" />}
                    <span className="capitalize">{f.lighting || "Day"}</span>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-xs font-semibold text-sepia">
                      Shot {i + 1}: {f.heading}
                    </p>
                    <button
                      type="button"
                      onClick={() => setEditingFrameId(isEditing ? null : f.id)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 shrink-0"
                    >
                      {isEditing ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Edit2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  <p className="font-serif text-sm text-foreground/90">{f.description}</p>

                  {/* Metadata fields display & inline editing */}
                  <div className="pt-2 border-t space-y-2 text-xs">
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label className="text-[11px] text-muted-foreground">Lighting & Weather</label>
                          <Select
                            value={f.lighting || "day"}
                            onValueChange={(val) => updateFrameField(f.id, { lighting: val })}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LIGHTING_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-muted-foreground">Location</label>
                          <Input
                            defaultValue={f.location || ""}
                            placeholder="e.g. Abandoned Warehouse, London Flat"
                            className="h-7 text-xs font-sans"
                            onBlur={(e) => updateFrameField(f.id, { location: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-muted-foreground">Cast / Actors</label>
                          <Input
                            defaultValue={f.cast || ""}
                            placeholder="e.g. Cillian Murphy, Florence Pugh"
                            className="h-7 text-xs font-sans"
                            onBlur={(e) => updateFrameField(f.id, { cast: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-muted-foreground">Props Needed</label>
                          <Input
                            defaultValue={f.props || ""}
                            placeholder="e.g. Antique revolver, Leather journal, Flashlight"
                            className="h-7 text-xs font-sans"
                            onBlur={(e) => updateFrameField(f.id, { props: e.target.value })}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1 text-muted-foreground">
                        {f.location && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 text-sepia shrink-0" />
                            <span className="font-medium text-foreground">{f.location}</span>
                          </div>
                        )}
                        {f.cast && (
                          <div className="flex items-center gap-1.5">
                            <Users className="h-3 w-3 text-sepia shrink-0" />
                            <span>Cast / Actor: <strong className="text-foreground">{f.cast}</strong></span>
                          </div>
                        )}
                        {f.props && (
                          <div className="flex items-center gap-1.5">
                            <Package className="h-3 w-3 text-sepia shrink-0" />
                            <span>Props: <strong className="text-foreground">{f.props}</strong></span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {f.image_url && (
                <div className="px-4 pb-3 pt-0">
                  <button
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                    disabled={painting[f.id]}
                    onClick={() => paint(f)}
                  >
                    Redraw illustration
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function exportDeck(story: Story, bible: BibleEntry[], frames: Frame[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;

  const bg = () => {
    doc.setFillColor(245, 239, 227);
    doc.rect(0, 0, W, H, "F");
    doc.setTextColor(31, 26, 20);
  };

  const title = (t: string) => {
    doc.setFont("times", "bold");
    doc.setFontSize(28);
    doc.text(t, M, M + 20);
    doc.setDrawColor(181, 69, 43);
    doc.line(M, M + 32, W - M, M + 32);
  };

  const body = (t: string, y: number, size = 13) => {
    doc.setFont("times", "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(t, W - M * 2);
    doc.text(lines, M, y);
    return y + lines.length * size * 1.3;
  };

  // 1. Cover Slide
  bg();
  doc.setFont("times", "bold");
  doc.setFontSize(48);
  doc.text(story.title || "Untitled", M, H / 2 - 20);
  doc.setFontSize(14);
  doc.setTextColor(181, 69, 43);
  doc.text((story.genre || "").toUpperCase(), M, H / 2 + 10);
  doc.setTextColor(31, 26, 20);
  body(story.logline, H / 2 + 40, 16);

  // 2. Synopsis Slide
  doc.addPage();
  bg();
  title("Synopsis");
  body(story.synopsis || "—", M + 70);

  // 3. Characters & World Slide
  const chars = bible.filter((b) => b.name.trim());
  if (chars.length) {
    doc.addPage();
    bg();
    title("Characters & World");
    let y = M + 70;
    for (const c of chars) {
      if (y > H - M - 40) {
        doc.addPage();
        bg();
        y = M + 40;
      }
      doc.setFont("times", "bold");
      doc.setFontSize(15);
      const castLabel = c.cast?.trim() ? `   [Cast / Actor: ${c.cast.trim()}]` : "";
      doc.text(`${c.name} (${c.kind})${castLabel}`, M, y);
      y = body(c.description, y + 18, 12) + 14;
    }
  }

  // 4. Production Breakdown Slide (Shots by Lighting, Weather, Locations, Props, Cast)
  if (frames.length) {
    doc.addPage();
    bg();
    title("Production & Shot Breakdown");

    const dayShots = frames.filter((f) => (f.lighting || "").toLowerCase() === "day");
    const nightShots = frames.filter((f) => (f.lighting || "").toLowerCase() === "night");
    const cloudyShots = frames.filter((f) => (f.lighting || "").toLowerCase() === "cloudy");
    const rainyShots = frames.filter((f) => (f.lighting || "").toLowerCase() === "rainy");

    let y = M + 65;

    // Summary Box
    doc.setFillColor(235, 227, 212);
    doc.roundedRect(M, y, W - M * 2, 45, 4, 4, "F");
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.setTextColor(181, 69, 43);
    doc.text("SHOT SCHEDULE & LIGHTING TOTALS:", M + 15, y + 26);
    doc.setTextColor(31, 26, 20);
    doc.setFont("times", "normal");
    doc.text(
      `Day: ${dayShots.length}  |  Night: ${nightShots.length}  |  Cloudy: ${cloudyShots.length}  |  Rainy: ${rainyShots.length}  |  Total Frames: ${frames.length}`,
      M + 260,
      y + 26,
    );

    y += 65;

    // Detailed Table Columns
    const colW = (W - M * 2) / 4;
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.text("DAY SHOTS", M, y);
    doc.text("NIGHT SHOTS", M + colW, y);
    doc.text("CLOUDY / OVERCAST", M + colW * 2, y);
    doc.text("RAINY SHOTS", M + colW * 3, y);

    doc.setDrawColor(181, 69, 43);
    doc.line(M, y + 4, W - M, y + 4);

    const renderShotList = (shots: Frame[], startX: number, startY: number) => {
      let curY = startY + 16;
      doc.setFont("times", "normal");
      doc.setFontSize(10);
      if (!shots.length) {
        doc.setTextColor(120, 110, 100);
        doc.text("None", startX, curY);
        doc.setTextColor(31, 26, 20);
        return;
      }
      shots.forEach((s) => {
        if (curY > H - M - 20) return;
        const sceneNum = frames.indexOf(s) + 1;
        doc.setFont("times", "bold");
        doc.text(`#${sceneNum}: ${s.location || s.heading.slice(0, 24)}`, startX, curY);
        curY += 12;
        doc.setFont("times", "normal");
        const desc = doc.splitTextToSize(s.description, colW - 15);
        doc.text(desc[0] || "", startX, curY);
        curY += 18;
      });
    };

    renderShotList(dayShots, M, y);
    renderShotList(nightShots, M + colW, y);
    renderShotList(cloudyShots, M + colW * 2, y);
    renderShotList(rainyShots, M + colW * 3, y);
  }

  // 5. Locations, Cast & Props Master Manifest Slide
  const allLocations = Array.from(new Set(frames.map((f) => f.location).filter(Boolean)));
  const allCast = Array.from(
    new Set(
      frames
        .map((f) => f.cast)
        .filter(Boolean)
        .flatMap((c) => c!.split(",").map((s) => s.trim())),
    ),
  );
  const allProps = Array.from(
    new Set(
      frames
        .map((f) => f.props)
        .filter(Boolean)
        .flatMap((p) => p!.split(",").map((s) => s.trim())),
    ),
  );

  if (allLocations.length || allCast.length || allProps.length) {
    doc.addPage();
    bg();
    title("Cast, Locations & Key Props Manifest");

    const thirdW = (W - M * 2) / 3;
    let y = M + 70;

    // Locations Column
    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.setTextColor(181, 69, 43);
    doc.text("LOCATIONS", M, y);
    doc.setDrawColor(181, 69, 43);
    doc.line(M, y + 4, M + thirdW - 20, y + 4);
    doc.setTextColor(31, 26, 20);
    doc.setFont("times", "normal");
    doc.setFontSize(11);
    let locY = y + 20;
    allLocations.forEach((loc) => {
      doc.text(`• ${loc}`, M, locY);
      locY += 16;
    });

    // Cast Column (Characters vs Cast Actors)
    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.setTextColor(181, 69, 43);
    doc.text("CAST & CHARACTERS", M + thirdW, y);
    doc.line(M + thirdW, y + 4, M + thirdW * 2 - 20, y + 4);
    doc.setTextColor(31, 26, 20);
    doc.setFont("times", "normal");
    doc.setFontSize(11);
    let castY = y + 20;

    // First list characters with their attached cast actors from Story Bible
    const charEntries = bible.filter((b) => b.kind === "character" && b.name.trim());
    if (charEntries.length) {
      charEntries.forEach((c) => {
        if (castY > H - M - 20) return;
        const lineText = c.cast?.trim() ? `• ${c.name} — played by ${c.cast.trim()}` : `• ${c.name} (TBD Cast)`;
        const lines = doc.splitTextToSize(lineText, thirdW - 25);
        lines.forEach((l: string) => {
          doc.text(l, M + thirdW, castY);
          castY += 14;
        });
        castY += 3;
      });
    }

    // Also include any storyboard-specific cast not already shown
    const knownNames = new Set(charEntries.flatMap((c) => [c.name.toLowerCase(), (c.cast || "").toLowerCase()]));
    const additionalCast = allCast.filter((act) => !knownNames.has(act.toLowerCase()));
    if (additionalCast.length) {
      additionalCast.forEach((actor) => {
        if (castY > H - M - 20) return;
        doc.text(`• ${actor} (Storyboard Cast)`, M + thirdW, castY);
        castY += 16;
      });
    }

    // Props Column
    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.setTextColor(181, 69, 43);
    doc.text("KEY PROPS", M + thirdW * 2, y);
    doc.line(M + thirdW * 2, y + 4, W - M, y + 4);
    doc.setTextColor(31, 26, 20);
    doc.setFont("times", "normal");
    doc.setFontSize(11);
    let propY = y + 20;
    allProps.forEach((prop) => {
      doc.text(`• ${prop}`, M + thirdW * 2, propY);
      propY += 16;
    });
  }

  // 6. Moodboard Slide
  const imgs = frames.filter((f) => f.image_url);
  if (imgs.length) {
    doc.addPage();
    bg();
    title("Visual Moodboard");
    const cw = (W - M * 2 - 24) / 3,
      ch = cw * (2 / 3);
    imgs
      .slice(0, 6)
      .forEach((f, i) =>
        doc.addImage(
          f.image_url!,
          "JPEG",
          M + (i % 3) * (cw + 12),
          M + 60 + Math.floor(i / 3) * (ch + 12),
          cw,
          ch,
        ),
      );
  }

  // 7. Individual Storyboard Scene Slides
  frames.forEach((f, i) => {
    doc.addPage();
    bg();
    title(`Scene ${i + 1}`);
    const y = M + 60;
    if (f.image_url) {
      const iw = W - M * 2 - 280,
        ih = iw * (2 / 3);
      doc.addImage(
        f.image_url,
        "JPEG",
        M,
        y,
        Math.min(iw, (H - y - M) * 1.5),
        Math.min(ih, H - y - M),
      );
    }

    const x = W - M - 260;
    doc.setFont("courier", "bold");
    doc.setFontSize(12);
    doc.text(doc.splitTextToSize(f.heading, 260), x, y + 10);

    // Weather / Lighting tag
    doc.setFont("times", "bold");
    doc.setFontSize(10);
    doc.setTextColor(181, 69, 43);
    doc.text(`LIGHTING: ${(f.lighting || "DAY").toUpperCase()}`, x, y + 36);
    doc.setTextColor(31, 26, 20);

    doc.setFont("times", "normal");
    doc.setFontSize(11);
    doc.text(doc.splitTextToSize(f.description, 260), x, y + 54);

    let metaY = y + 130;
    if (f.location) {
      doc.setFont("times", "bold");
      doc.text("Location: ", x, metaY);
      doc.setFont("times", "normal");
      doc.text(f.location, x + 50, metaY);
      metaY += 18;
    }
    if (f.cast) {
      doc.setFont("times", "bold");
      doc.text("Cast: ", x, metaY);
      doc.setFont("times", "normal");
      doc.text(f.cast, x + 30, metaY);
      metaY += 18;
    }
    if (f.props) {
      doc.setFont("times", "bold");
      doc.text("Props: ", x, metaY);
      doc.setFont("times", "normal");
      doc.text(doc.splitTextToSize(f.props, 220), x + 35, metaY);
    }
  });

  doc.save(`${story.title || "pitch"}-deck.pdf`);
}
