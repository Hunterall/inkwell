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
  Compass,
  Film,
  Lightbulb,
  CheckCircle2,
  Trash2,
  Plus,
  Video,
  Camera,
  Maximize2,
  Focus,
  Copy,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { streamWrite } from "@/lib/ai/stream-client";
import {
  parseScenes,
  parseSuggestedLocations,
  parseCinematographyAnalysis,
  type SuggestedLocation,
  type CinematographyAnalysis,
  type CinematographyShot,
} from "@/lib/ai/prompts";
import { generateFrameImage } from "@/lib/frames.functions";
import {
  bibleToText,
  fullText,
  useBible,
  useChapters,
  useFrames,
  type Frame,
  type BibleEntry,
  FRAMING_OPTIONS,
  CAMERA_ANGLE_OPTIONS,
  CAMERA_MOVEMENT_OPTIONS,
} from "./data";
import { getAiSettings } from "@/lib/settings";
import type { Story } from "@/routes/_authenticated/stories_.$id";

const LIGHTING_OPTIONS = [
  { value: "day", label: "Day", icon: Sun, color: "text-amber-500" },
  { value: "night", label: "Night", icon: Moon, color: "text-indigo-400" },
  { value: "golden_hour", label: "Golden Hour", icon: Sun, color: "text-orange-400" },
  { value: "cloudy", label: "Cloudy", icon: Cloud, color: "text-slate-400" },
  { value: "rainy", label: "Rainy", icon: CloudRain, color: "text-blue-400" },
  { value: "interior", label: "Interior", icon: Layers, color: "text-emerald-500" },
];

export type LightingCategory = "day" | "night" | "golden_hour" | "cloudy" | "rainy" | "interior";

function getFrameLightingCategory(f: {
  lighting?: string | null;
  heading?: string | null;
  description?: string | null;
}): LightingCategory {
  const l = (f.lighting || "").toLowerCase().trim();
  const h = (f.heading || "").toLowerCase().trim();
  const d = (f.description || "").toLowerCase().trim();

  // 1. Rainy / Storm / Downpour
  if (
    l.includes("rain") ||
    l.includes("storm") ||
    h.includes("rain") ||
    d.includes("rain") ||
    d.includes("downpour")
  ) {
    return "rainy";
  }

  // 2. Cloudy / Overcast / Fog / Mist
  if (
    l.includes("cloud") ||
    l.includes("overcast") ||
    l.includes("fog") ||
    l.includes("mist") ||
    h.includes("cloud") ||
    h.includes("overcast") ||
    h.includes("fog")
  ) {
    return "cloudy";
  }

  // 3. Golden Hour / Sunset / Sunrise / Magic Hour / Dawn
  if (
    l.includes("golden") ||
    l.includes("sunset") ||
    l.includes("sunrise") ||
    l.includes("magic") ||
    l.includes("dawn") ||
    h.includes("sunset") ||
    h.includes("sunrise") ||
    h.includes("golden hour") ||
    h.includes("golden_hour") ||
    h.includes("dawn")
  ) {
    return "golden_hour";
  }

  // 4. Night / Evening / Dark / Moon / Midnight / Dusk
  if (
    l.includes("night") ||
    l.includes("evening") ||
    l.includes("dark") ||
    l.includes("moon") ||
    l.includes("midnight") ||
    h.includes("night") ||
    h.includes("evening") ||
    h.includes("midnight") ||
    h.includes("dusk")
  ) {
    return "night";
  }

  // 5. Day / Morning / Afternoon / Sun / Noon
  if (
    l.includes("day") ||
    l.includes("morning") ||
    l.includes("afternoon") ||
    l.includes("sun") ||
    h.includes("day") ||
    h.includes("morning") ||
    h.includes("afternoon")
  ) {
    return "day";
  }

  // 6. Interior
  if (l.includes("interior") || l.includes("indoor") || h.startsWith("int.")) {
    return "interior";
  }

  return "day";
}

function getQuickScenePlaces(heading: string, description: string): string[] {
  const text = `${heading} ${description}`.toLowerCase();
  if (
    text.includes("beach") ||
    text.includes("sea") ||
    text.includes("ocean") ||
    text.includes("coast") ||
    text.includes("shore") ||
    text.includes("surf")
  ) {
    return ["Goa (Palolem)", "Gokarna (Om Beach)", "Udupi (Kapu)", "Varkala"];
  }
  if (
    text.includes("mountain") ||
    text.includes("hill") ||
    text.includes("valley") ||
    text.includes("snow") ||
    text.includes("peak") ||
    text.includes("cliff")
  ) {
    return ["Manali (Solang)", "Munnar", "Ooty", "Leh-Ladakh"];
  }
  if (
    text.includes("palace") ||
    text.includes("fort") ||
    text.includes("royal") ||
    text.includes("castle") ||
    text.includes("haveli")
  ) {
    return ["Udaipur (City Palace)", "Jaipur (Amer Fort)", "Mysore Palace", "Chettinad"];
  }
  if (
    text.includes("forest") ||
    text.includes("jungle") ||
    text.includes("woods") ||
    text.includes("tree")
  ) {
    return ["Wayanad", "Coorg", "Dandeli", "Jim Corbett"];
  }
  if (
    text.includes("lake") ||
    text.includes("backwater") ||
    text.includes("river") ||
    text.includes("boat")
  ) {
    return ["Alappuzha (Alleppey)", "Kumarakom", "Dal Lake", "Rishikesh"];
  }
  if (
    text.includes("coffee") ||
    text.includes("tea") ||
    text.includes("plantation") ||
    text.includes("estate")
  ) {
    return ["Chikmagalur", "Coorg", "Munnar", "Valparai"];
  }
  if (
    text.includes("temple") ||
    text.includes("ghat") ||
    text.includes("shrine") ||
    text.includes("ashram")
  ) {
    return ["Varanasi Ghats", "Rishikesh", "Hampi", "Madurai"];
  }
  if (
    text.includes("city") ||
    text.includes("street") ||
    text.includes("alley") ||
    text.includes("urban") ||
    text.includes("club") ||
    text.includes("bar")
  ) {
    return ["Mumbai (Colaba)", "Old Delhi", "Bangalore (MG Rd)", "London (Soho)"];
  }
  return ["Goa (Palolem)", "Manali", "Udaipur", "Gokarna"];
}

export function BoardTab({ story }: { story: Story }) {
  const qc = useQueryClient();
  const { data: chapters = [] } = useChapters(story.id);
  const { data: bible = [] } = useBible(story.id);
  const { data: frames = [] } = useFrames(story.id);
  const genImage = useServerFn(generateFrameImage);
  const [busy, setBusy] = useState(false);
  const [painting, setPainting] = useState<Record<string, boolean>>({});
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);

  // Real-world location scouting state
  const [scoutingLocations, setScoutingLocations] = useState(false);
  const [scoutDialogOpen, setScoutDialogOpen] = useState(false);
  const [scoutedLocations, setScoutedLocations] = useState<SuggestedLocation[]>([]);
  const [savingScoutedToBible, setSavingScoutedToBible] = useState(false);
  const [applyingToFrames, setApplyingToFrames] = useState(false);

  // Cinematography & Camera Analysis state
  const [analyzingCamera, setAnalyzingCamera] = useState(false);
  const [cinematographyOpen, setCinematographyOpen] = useState(false);
  const [cinematographyData, setCinematographyData] = useState<CinematographyAnalysis | null>(null);
  const [selectedShotFraming, setSelectedShotFraming] = useState<Record<number, string>>({});
  const [selectedShotAngle, setSelectedShotAngle] = useState<Record<number, string>>({});
  const [selectedShotMovement, setSelectedShotMovement] = useState<Record<number, string>>({});
  const [applyingCinematography, setApplyingCinematography] = useState(false);
  const [analyzingSingleShotId, setAnalyzingSingleShotId] = useState<string | null>(null);

  // Compute breakdown stats using robust classification
  const stats = {
    day: frames.filter((f) => getFrameLightingCategory(f) === "day"),
    night: frames.filter((f) => getFrameLightingCategory(f) === "night"),
    golden_hour: frames.filter((f) => getFrameLightingCategory(f) === "golden_hour"),
    cloudy: frames.filter((f) => getFrameLightingCategory(f) === "cloudy"),
    rainy: frames.filter((f) => getFrameLightingCategory(f) === "rainy"),
    interior: frames.filter((f) => getFrameLightingCategory(f) === "interior"),
  };

  async function breakdown() {
    const text = story.script.trim() || fullText(chapters);
    if (!text.trim()) {
      toast.error("Write your story or script first.");
      return;
    }
    setBusy(true);
    try {
      const out = await streamWrite(
        { mode: "scenes", text, bible: bibleToText(bible), title: story.title },
        () => {},
      );
      const scenes = parseScenes(out);
      if (!scenes.length) {
        console.warn("[BoardTab] Raw scenes output:", out);
        throw new Error(
          "Could not parse storyboard scenes from the AI's response. Please try again or switch to another model like Google Gemma 4 or Nemotron in Settings.",
        );
      }

      // Delete existing frames for this story
      const uid = auth.currentUser?.uid || "";
      const existingQuery = query(
        collection(db, "frames"),
        where("storyId", "==", story.id),
        where("userId", "==", uid),
      );
      const existingSnap = await getDocs(existingQuery);
      if (!existingSnap.empty) {
        const batch = writeBatch(db);
        existingSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }

      // Add new frames with camera framing & angle defaults
      for (let i = 0; i < scenes.length; i++) {
        const s = scenes[i]!;
        await addDoc(collection(db, "frames"), {
          userId: uid,
          storyId: story.id,
          position: i,
          heading: s.heading,
          description: s.description,
          image_url: null,
          lighting: s.lighting || "day",
          location: s.location || "",
          props: s.props || "",
          cast: s.cast || "",
          framing: s.framing || "Medium Shot (MS)",
          camera_angle: s.camera_angle || "Eye-Level",
          movement: s.movement || "Static",
          createdAt: serverTimestamp(),
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

  async function runCinematographyAnalysis() {
    let sourceText = "";
    if (frames.length > 0) {
      sourceText = frames
        .map(
          (f, idx) =>
            `Shot ${idx + 1}: ${f.heading}\nDescription: ${f.description}\nLocation: ${f.location || "Unspecified"}\nCast: ${f.cast || "None"}\nLighting: ${f.lighting || "day"}\nCurrent Framing: ${f.framing || "None"}\nCurrent Angle: ${f.camera_angle || "None"}`,
        )
        .join("\n\n");
    } else {
      sourceText = (story.script.trim() || fullText(chapters)).trim();
    }

    if (!sourceText) {
      toast.error("Write a script, chapters, or break down scenes first to analyze cinematography.");
      return;
    }

    setAnalyzingCamera(true);
    try {
      const out = await streamWrite(
        {
          mode: "cinematography",
          text: sourceText,
          title: story.title,
          style: story.genre,
          bible: bibleToText(bible),
        },
        () => {},
      );

      const parsed = parseCinematographyAnalysis(out);
      if (!parsed.scenes || parsed.scenes.length === 0) {
        throw new Error("Could not parse cinematography analysis. Please try again.");
      }

      setCinematographyData(parsed);

      // Initialize selection states with AI recommendations
      const initialFraming: Record<number, string> = {};
      const initialAngle: Record<number, string> = {};
      const initialMovement: Record<number, string> = {};
      parsed.scenes.forEach((s, idx) => {
        initialFraming[idx] = s.framing || "Medium Shot (MS)";
        initialAngle[idx] = s.cameraAngle || "Eye-Level";
        initialMovement[idx] = s.movement || "Static";
      });
      setSelectedShotFraming(initialFraming);
      setSelectedShotAngle(initialAngle);
      setSelectedShotMovement(initialMovement);

      setCinematographyOpen(true);
      toast.success(`Analyzed cinematography direction for ${parsed.scenes.length} scenes!`);
    } catch (e) {
      toast.error((e as Error).message || "Failed to analyze cinematography.");
    } finally {
      setAnalyzingCamera(false);
    }
  }

  async function applyCinematographyToFrames() {
    if (!cinematographyData || !cinematographyData.scenes.length || !frames.length) {
      setCinematographyOpen(false);
      return;
    }
    setApplyingCinematography(true);
    try {
      const batch = writeBatch(db);
      frames.forEach((f, idx) => {
        const shot =
          cinematographyData.scenes[idx] ||
          cinematographyData.scenes[idx % cinematographyData.scenes.length];
        if (shot) {
          const framing = selectedShotFraming[idx] || shot.framing || "Medium Shot (MS)";
          const camera_angle = selectedShotAngle[idx] || shot.cameraAngle || "Eye-Level";
          const movement = selectedShotMovement[idx] || shot.movement || "Static";
          const focal_length = shot.focalLength || "";
          const director_notes = shot.directorNotes || "";

          batch.update(doc(db, "frames", f.id), {
            framing,
            camera_angle,
            movement,
            ...(focal_length ? { focal_length } : {}),
            ...(director_notes ? { director_notes } : {}),
          });
        }
      });

      await batch.commit();
      qc.invalidateQueries({ queryKey: ["frames", story.id] });
      toast.success("Applied camera angles, framing, and movement to all storyboard frames!");
      setCinematographyOpen(false);
    } catch (e) {
      toast.error((e as Error).message || "Failed to apply cinematography.");
    } finally {
      setApplyingCinematography(false);
    }
  }

  async function suggestSingleShotFraming(frame: Frame) {
    setAnalyzingSingleShotId(frame.id);
    try {
      const promptText = `Scene: ${frame.heading}\nDescription: ${frame.description}\nLighting: ${frame.lighting || "day"}\nLocation: ${frame.location || ""}\nStory Genre: ${story.genre}`;
      const out = await streamWrite(
        {
          mode: "cinematography",
          text: promptText,
          title: story.title,
          instruction: "Provide optimal framing, camera angle, and camera movement for this specific scene.",
        },
        () => {},
      );
      const parsed = parseCinematographyAnalysis(out);
      const shot = parsed.scenes[0];
      if (shot) {
        await updateFrameField(frame.id, {
          framing: shot.framing,
          camera_angle: shot.cameraAngle,
          movement: shot.movement || "Static",
          focal_length: shot.focalLength || "",
          director_notes: shot.directorNotes || "",
        });
        toast.success(`Framing updated: ${shot.framing} • ${shot.cameraAngle}`);
      }
    } catch (e) {
      toast.error((e as Error).message || "Failed to generate shot suggestion.");
    } finally {
      setAnalyzingSingleShotId(null);
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

  async function runScoutPlaces() {
    const text = (story.script.trim() || fullText(chapters)).trim();
    if (!text) {
      toast.error("Write or import some chapters or a script first to scout locations.");
      return;
    }

    setScoutingLocations(true);
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

      setScoutedLocations(
        parsed.locations.map((loc, i) => ({
          ...loc,
          id: `board-scout-${i}-${Date.now()}`,
          selected: true,
        })),
      );

      toast.success(
        `Scouted real-world places for ${parsed.locations.length} scene${parsed.locations.length === 1 ? "" : "s"}!`,
        { id: toastId },
      );
      setScoutDialogOpen(true);
    } catch (e) {
      toast.error((e as Error).message || "Location scouting failed.", { id: toastId });
    } finally {
      setScoutingLocations(false);
    }
  }

  async function applyScoutedToFrames() {
    if (!frames.length || !scoutedLocations.length) return;
    setApplyingToFrames(true);
    try {
      let appliedCount = 0;
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i]!;
        // Match scouted location by index or heading keywords
        const matched =
          scoutedLocations.find((loc) => {
            if (!loc.scene) return false;
            const sLower = loc.scene.toLowerCase();
            const fLower = f.heading.toLowerCase();
            return fLower.includes(sLower) || sLower.includes(fLower);
          }) || scoutedLocations[i % scoutedLocations.length];

        if (matched) {
          const chosenPlace = matched.name || matched.selectedPlace || matched.recommendedPlace;
          if (chosenPlace) {
            await updateDoc(doc(db, "frames", f.id), { location: chosenPlace });
            appliedCount++;
          }
        }
      }
      qc.invalidateQueries({ queryKey: ["frames", story.id] });
      toast.success(
        `Applied real filming locations to ${appliedCount} storyboard frame${appliedCount === 1 ? "" : "s"}!`,
      );
    } catch (e) {
      toast.error("Failed to update frames: " + (e as Error).message);
    } finally {
      setApplyingToFrames(false);
    }
  }

  async function saveScoutedToBible() {
    setSavingScoutedToBible(true);
    const uid = auth.currentUser?.uid ?? "";
    try {
      const selected = scoutedLocations.filter((l) => l.selected && (l.name.trim() || l.selectedPlace?.trim()));
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
      qc.invalidateQueries({ queryKey: ["bible", story.id] });
      toast.success(`Saved ${selected.length} real locations to Story Bible Places!`);
    } catch (e) {
      toast.error((e as Error).message || "Failed to save places.");
    } finally {
      setSavingScoutedToBible(false);
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
            variant="outline"
            disabled={scoutingLocations || (!story.script.trim() && !chapters.length)}
            onClick={runScoutPlaces}
            className="border-sepia/30 bg-sepia/5 hover:bg-sepia/15 text-foreground"
          >
            <Compass className="mr-2 h-4 w-4 text-sepia" />
            {scoutingLocations ? "Scouting Places…" : "Scout Scene Places"}
          </Button>
          <Button
            variant="outline"
            disabled={analyzingCamera || (!story.script.trim() && !chapters.length && !frames.length)}
            onClick={runCinematographyAnalysis}
            className="border-sepia/30 bg-sepia/5 hover:bg-sepia/15 text-foreground"
          >
            <Video className="mr-2 h-4 w-4 text-sepia" />
            {analyzingCamera ? "Analyzing Framing & Angles…" : "Analyze Camera & Framing"}
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

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-md border p-3 bg-background/50">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Sun className="h-4 w-4 text-amber-500" /> Day Shots
                </span>
                <span className="font-mono font-bold text-sm text-foreground">{stats.day.length}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                {stats.day.map((f) => `#${frames.indexOf(f) + 1}`).join(", ") || "None"}
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
                {stats.night.map((f) => `#${frames.indexOf(f) + 1}`).join(", ") || "None"}
              </p>
            </div>

            <div className="rounded-md border p-3 bg-background/50">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Sun className="h-4 w-4 text-orange-400" /> Golden Hour
                </span>
                <span className="font-mono font-bold text-sm text-foreground">{stats.golden_hour.length}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                {stats.golden_hour.map((f) => `#${frames.indexOf(f) + 1}`).join(", ") || "None"}
              </p>
            </div>

            <div className="rounded-md border p-3 bg-background/50">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Cloud className="h-4 w-4 text-slate-400" /> Cloudy
                </span>
                <span className="font-mono font-bold text-sm text-foreground">{stats.cloudy.length}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                {stats.cloudy.map((f) => `#${frames.indexOf(f) + 1}`).join(", ") || "None"}
              </p>
            </div>

            <div className="rounded-md border p-3 bg-background/50">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CloudRain className="h-4 w-4 text-blue-400" /> Rainy
                </span>
                <span className="font-mono font-bold text-sm text-foreground">{stats.rainy.length}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                {stats.rainy.map((f) => `#${frames.indexOf(f) + 1}`).join(", ") || "None"}
              </p>
            </div>

            <div className="rounded-md border p-3 bg-background/50">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-emerald-500" /> Interior
                </span>
                <span className="font-mono font-bold text-sm text-foreground">{stats.interior.length}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                {stats.interior.map((f) => `#${frames.indexOf(f) + 1}`).join(", ") || "None"}
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
                  {(() => {
                    const cat = getFrameLightingCategory(f);
                    return (
                      <div className="absolute top-2 right-2 bg-background/85 backdrop-blur px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 border shadow-xs">
                        {cat === "night" && <Moon className="h-3 w-3 text-indigo-400" />}
                        {cat === "rainy" && <CloudRain className="h-3 w-3 text-blue-400" />}
                        {cat === "cloudy" && <Cloud className="h-3 w-3 text-slate-400" />}
                        {cat === "day" && <Sun className="h-3 w-3 text-amber-500" />}
                        {cat === "golden_hour" && <Sun className="h-3 w-3 text-orange-400" />}
                        {cat === "interior" && <Layers className="h-3 w-3 text-emerald-500" />}
                        <span className="capitalize">{cat.replace("_", " ")}</span>
                      </div>
                    );
                  })()}
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
                            value={getFrameLightingCategory(f)}
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
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-sepia" /> Filming Location / Place
                            </label>
                            <span className="text-[10px] text-muted-foreground font-mono">Real-world places</span>
                          </div>
                          <Input
                            key={f.location || "empty-loc"}
                            defaultValue={f.location || ""}
                            placeholder="e.g. Goa (Palolem Beach), Gokarna (Om Beach), Udupi"
                            className="h-7 text-xs font-sans"
                            onBlur={(e) => updateFrameField(f.id, { location: e.target.value })}
                          />
                          <div className="flex flex-wrap items-center gap-1 pt-0.5">
                            <span className="text-[10px] text-muted-foreground font-mono">Scouted:</span>
                            {getQuickScenePlaces(f.heading, f.description).map((place) => {
                              const isMatch = (f.location || "")
                                .toLowerCase()
                                .includes(place.toLowerCase().split(" ")[0] || "");
                              return (
                                <button
                                  key={place}
                                  type="button"
                                  onClick={() => updateFrameField(f.id, { location: place })}
                                  className={`px-1.5 py-0.5 rounded text-[10px] transition-colors border ${
                                    isMatch
                                      ? "bg-sepia text-white border-sepia font-medium"
                                      : "bg-muted/50 hover:bg-sepia/10 border-border text-foreground hover:border-sepia/30"
                                  }`}
                                >
                                  {place}
                                </button>
                              );
                            })}
                          </div>
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

                        {/* Cinematography & Framing Controls */}
                        <div className="pt-2 border-t border-border/60 space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-medium text-foreground flex items-center gap-1">
                              <Video className="h-3 w-3 text-sepia" /> Camera & Framing
                            </label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] text-sepia hover:text-sepia hover:bg-sepia/10 font-mono"
                              disabled={analyzingSingleShotId === f.id}
                              onClick={() => suggestSingleShotFraming(f)}
                            >
                              <Sparkles className="h-3 w-3 mr-1" />
                              {analyzingSingleShotId === f.id ? "Analyzing…" : "AI Suggest Shot"}
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[10px] text-muted-foreground">Framing / Shot Size</label>
                              <Select
                                value={f.framing || "Medium Shot (MS)"}
                                onValueChange={(val) => updateFrameField(f.id, { framing: val })}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {FRAMING_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] text-muted-foreground">Camera Angle</label>
                              <Select
                                value={f.camera_angle || "Eye-Level"}
                                onValueChange={(val) => updateFrameField(f.id, { camera_angle: val })}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CAMERA_ANGLE_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground">Camera Movement</label>
                            <Select
                              value={f.movement || "Static"}
                              onValueChange={(val) => updateFrameField(f.id, { movement: val })}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CAMERA_MOVEMENT_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted-foreground">Director's Visual Intent</label>
                            <Input
                              defaultValue={f.director_notes || ""}
                              placeholder="e.g. Slow push-in to heighten psychological claustrophobia"
                              className="h-7 text-xs font-sans"
                              onBlur={(e) => updateFrameField(f.id, { director_notes: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5 text-muted-foreground">
                        {/* Camera Angle & Framing Badges */}
                        {(f.framing || f.camera_angle || f.movement) && (
                          <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                            {f.framing && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-sepia/10 text-sepia border border-sepia/25 font-semibold">
                                <Maximize2 className="h-2.5 w-2.5" />
                                {f.framing}
                              </span>
                            )}
                            {f.camera_angle && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 font-semibold">
                                <Video className="h-2.5 w-2.5" />
                                {f.camera_angle}
                              </span>
                            )}
                            {f.movement && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground border border-border">
                                <Film className="h-2.5 w-2.5" />
                                {f.movement}
                              </span>
                            )}
                          </div>
                        )}

                        {f.director_notes && (
                          <p className="text-[11px] font-serif italic text-foreground/80 line-clamp-2 bg-muted/30 p-1.5 rounded border border-border/40">
                            "{f.director_notes}"
                          </p>
                        )}

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

      {/* Real-World Location Scout Dialog for Board */}
      <Dialog open={scoutDialogOpen} onOpenChange={setScoutDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display flex items-center gap-2">
              <Compass className="h-5 w-5 text-sepia" />
              Scout Real-World Places for Storyboard Scenes
            </DialogTitle>
            <DialogDescription>
              Scouted authentic real-world filming places for each scene in your story (e.g. Goa, Gokarna, Udupi for beach scenes; Manali/Munnar for mountains). Select preferred destinations to apply to your storyboard frames or save to Story Bible Places.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1 pt-3 min-h-0">
            {scoutedLocations.map((loc, idx) => (
              <div
                key={loc.id || idx}
                className={`p-4 rounded-lg border transition-all ${
                  loc.selected ? "border-sepia/40 bg-card shadow-sm" : "border-border/50 opacity-60 bg-muted/20"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={loc.selected ?? true}
                      onChange={(e) => {
                        const updated = [...scoutedLocations];
                        updated[idx] = { ...updated[idx]!, selected: e.target.checked };
                        setScoutedLocations(updated);
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
                      setScoutedLocations(scoutedLocations.filter((_, i) => i !== idx))
                    }
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0 p-1"
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {loc.suggestedPlaces && loc.suggestedPlaces.length > 0 && (
                  <div className="mb-3 rounded-md bg-muted/30 p-2.5 border border-border/60">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-sepia mb-1.5 flex items-center gap-1.5 font-medium">
                      <MapPin className="h-3 w-3" />
                      Suggested Real-World Places (click to select):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {loc.suggestedPlaces.map((place) => {
                        const isChosen = loc.name === place || loc.selectedPlace === place;
                        return (
                          <button
                            key={place}
                            type="button"
                            onClick={() => {
                              const updated = [...scoutedLocations];
                              updated[idx] = {
                                ...updated[idx]!,
                                selectedPlace: place,
                                name: place,
                              };
                              setScoutedLocations(updated);
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

                <div className="mb-3 space-y-1">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Selected Filming Place
                  </label>
                  <Input
                    value={loc.name}
                    onChange={(e) => {
                      const updated = [...scoutedLocations];
                      updated[idx] = { ...updated[idx]!, name: e.target.value };
                      setScoutedLocations(updated);
                    }}
                    placeholder="e.g. Goa (Palolem Beach), Gokarna (Om Beach), Udupi"
                    className="font-bold text-sm h-8 bg-background"
                  />
                </div>

                <div className="mb-2.5 space-y-1">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    Cinematic Atmosphere & Scene Fit
                  </label>
                  <Textarea
                    value={loc.description}
                    onChange={(e) => {
                      const updated = [...scoutedLocations];
                      updated[idx] = { ...updated[idx]!, description: e.target.value };
                      setScoutedLocations(updated);
                    }}
                    placeholder="Visual landscape, sensory details (surf, golden hour, cliffs), mood…"
                    className="text-xs min-h-16 font-serif leading-relaxed"
                  />
                </div>

                {loc.productionNotes && (
                  <div className="rounded border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-muted-foreground flex items-start gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-foreground">Filming Notes:</strong> {loc.productionNotes}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <DialogFooter className="mt-4 pt-3 border-t flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {scoutedLocations.filter((l) => l.selected).length} of {scoutedLocations.length} place{scoutedLocations.length === 1 ? "" : "s"} selected
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setScoutDialogOpen(false)}
              >
                Close
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={saveScoutedToBible}
                disabled={savingScoutedToBible || scoutedLocations.filter((l) => l.selected).length === 0}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                {savingScoutedToBible ? "Saving Places…" : "Save to Story Bible Places"}
              </Button>
              <Button
                type="button"
                onClick={applyScoutedToFrames}
                disabled={applyingToFrames || !frames.length || scoutedLocations.filter((l) => l.selected).length === 0}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {applyingToFrames ? "Applying…" : "Apply Places to Frames"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cinematography & Camera Director Dialog */}
      <Dialog open={cinematographyOpen} onOpenChange={setCinematographyOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display flex items-center gap-2">
              <Video className="h-6 w-6 text-sepia" />
              Cinematography & Framing Analysis
            </DialogTitle>
            <DialogDescription>
              AI Director of Photography breakdown analyzing emotional subtext, visual tension, and scene dynamics to recommend optimal camera angles, shot framing, and camera movement.
            </DialogDescription>
          </DialogHeader>

          {cinematographyData && (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 pt-3 min-h-0">
              {cinematographyData.visualStyle && (
                <div className="p-3.5 rounded-lg border border-sepia/30 bg-sepia/5 text-xs text-foreground/90 space-y-1">
                  <div className="font-semibold text-sepia flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider">
                    <Film className="h-3.5 w-3.5" /> Overarching Visual Philosophy
                  </div>
                  <p className="font-serif leading-relaxed text-sm">{cinematographyData.visualStyle}</p>
                </div>
              )}

              <div className="space-y-3">
                {cinematographyData.scenes.map((scene, idx) => {
                  const currentFraming = selectedShotFraming[idx] || scene.framing || "Medium Shot (MS)";
                  const currentAngle = selectedShotAngle[idx] || scene.cameraAngle || "Eye-Level";
                  const currentMovement = selectedShotMovement[idx] || scene.movement || "Static";

                  return (
                    <div
                      key={idx}
                      className="p-4 rounded-lg border border-border bg-card shadow-xs space-y-3 transition-colors hover:border-sepia/40"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-sepia bg-sepia/10 px-2 py-0.5 rounded">
                            Shot #{idx + 1}
                          </span>
                          <span className="font-mono text-xs font-medium text-foreground line-clamp-1">
                            {scene.heading}
                          </span>
                        </div>
                        {scene.focalLength && (
                          <span className="font-mono text-[11px] text-muted-foreground flex items-center gap-1">
                            <Focus className="h-3 w-3 text-sepia" /> Lens: {scene.focalLength}
                          </span>
                        )}
                      </div>

                      {/* Pill Badges / Controls */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        {/* Framing Selector */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Maximize2 className="h-3 w-3 text-sepia" /> Framing / Shot Size
                          </label>
                          <Select
                            value={currentFraming}
                            onValueChange={(val) =>
                              setSelectedShotFraming((prev) => ({ ...prev, [idx]: val }))
                            }
                          >
                            <SelectTrigger className="h-7 text-xs font-sans">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FRAMING_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Angle Selector */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Video className="h-3 w-3 text-indigo-400" /> Camera Angle
                          </label>
                          <Select
                            value={currentAngle}
                            onValueChange={(val) =>
                              setSelectedShotAngle((prev) => ({ ...prev, [idx]: val }))
                            }
                          >
                            <SelectTrigger className="h-7 text-xs font-sans">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CAMERA_ANGLE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Movement Selector */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Film className="h-3 w-3 text-emerald-400" /> Camera Movement
                          </label>
                          <Select
                            value={currentMovement}
                            onValueChange={(val) =>
                              setSelectedShotMovement((prev) => ({ ...prev, [idx]: val }))
                            }
                          >
                            <SelectTrigger className="h-7 text-xs font-sans">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CAMERA_MOVEMENT_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Director's Visual Rationale */}
                      {scene.directorNotes && (
                        <div className="pt-2 text-xs font-serif text-foreground/80 bg-muted/40 p-2.5 rounded border border-border/50">
                          <span className="font-sans font-semibold text-[10px] uppercase tracking-wider text-sepia block mb-0.5">
                            Director's Visual Intent & Subtext:
                          </span>
                          {scene.directorNotes}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-row items-center justify-between border-t pt-4 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!cinematographyData) return;
                const shotListText = cinematographyData.scenes
                  .map(
                    (s, i) =>
                      `Shot ${i + 1}: ${s.heading}\n• Framing: ${selectedShotFraming[i] || s.framing}\n• Angle: ${selectedShotAngle[i] || s.cameraAngle}\n• Movement: ${selectedShotMovement[i] || s.movement || "Static"}\n• Lens: ${s.focalLength || "50mm"}\n• Director Note: ${s.directorNotes || "None"}`,
                  )
                  .join("\n\n");
                navigator.clipboard.writeText(shotListText);
                toast.success("Cinematography shot list copied to clipboard!");
              }}
            >
              <Copy className="h-4 w-4 mr-1.5" />
              Copy Shot List
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCinematographyOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={applyingCinematography || !frames.length}
                onClick={applyCinematographyToFrames}
                className="bg-sepia hover:bg-sepia/90 text-white"
              >
                <Check className="h-4 w-4 mr-1.5" />
                {applyingCinematography ? "Applying…" : "Apply to Storyboard Frames"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper to sanitize text for standard PDF WinAnsi fonts (removes emojis and strips corrupt glyphs)
function sanitizePdfText(str: string | null | undefined): string {
  if (!str) return "";
  return (
    str
      // Map known emoji prefixes or corrupted WinAnsi byte sequences
      .replace(/(?:🎬|Ø<ß¬)\s*/g, "Scene: ")
      .replace(/(?:📍|Ø=ÜÍ)\s*/g, "Scouted Filming Places: ")
      .replace(/(?:💡|Ø=Ü¡)\s*/g, "Filming Notes: ")
      // Smart punctuation & quotes to standard characters
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\u2026/g, "...")
      // Strip any other surrogate pair / emoji sequences
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
      // Strip control chars except newline and tab
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      // Keep printable ASCII, Latin-1 supplement, and bullet symbol (\u2022)
      .replace(/[^\x20-\x7E\xA0-\xFF\u2022\n\r\t]/g, "")
      .trim()
  );
}

interface ParsedPlace {
  name: string;
  scene?: string;
  visualDesc: string;
  scoutedPlaces?: string;
  filmingNotes?: string;
}

function parsePlaceDetails(c: BibleEntry): ParsedPlace {
  const cleanName = sanitizePdfText(c.name).replace(/\s*\((?:place|character|lore)\)\s*$/i, "").trim();
  const rawDesc = c.description || "";
  const lines = rawDesc.split(/\r?\n/);

  let scene = "";
  let scoutedPlaces = "";
  let filmingNotes = "";
  const descParts: string[] = [];

  for (const rawLine of lines) {
    const line = sanitizePdfText(rawLine).trim();
    if (!line) continue;

    if (/^(?:\[Scene\]|Scene)\s*:/i.test(line)) {
      scene = line.replace(/^(?:\[Scene\]|Scene)\s*:\s*/i, "").trim();
    } else if (/^(?:\[Location\]|Scouted Filming Places|Scouted Places)\s*:/i.test(line)) {
      scoutedPlaces = line.replace(/^(?:\[Location\]|Scouted Filming Places|Scouted Places)\s*:\s*/i, "").trim();
    } else if (/^(?:\[Notes\]|Filming Notes|Notes)\s*:/i.test(line)) {
      filmingNotes = line.replace(/^(?:\[Notes\]|Filming Notes|Notes)\s*:\s*/i, "").trim();
    } else {
      descParts.push(line);
    }
  }

  return {
    name: cleanName,
    scene,
    visualDesc: descParts.join(" "),
    scoutedPlaces,
    filmingNotes,
  };
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
    doc.setFontSize(26);
    doc.text(t, M, M + 20);
    doc.setDrawColor(181, 69, 43);
    doc.setLineWidth(1.2);
    doc.line(M, M + 32, W - M, M + 32);
    doc.setTextColor(31, 26, 20);
  };

  const body = (t: string, y: number, size = 13, slideTitle?: string) => {
    doc.setFont("times", "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(sanitizePdfText(t), W - M * 2);
    let curY = y;
    for (const line of lines) {
      if (curY > H - M - 20) {
        doc.addPage();
        bg();
        if (slideTitle) title(`${slideTitle} (Cont.)`);
        curY = M + 70;
        doc.setFont("times", "normal");
        doc.setFontSize(size);
      }
      doc.text(line, M, curY);
      curY += size * 1.35;
    }
    return curY;
  };

  // 1. Cover Slide with dynamic auto-fitting title, wrapped text, and vertical centering
  bg();
  const rawTitle = sanitizePdfText(story.title || "Untitled");
  const maxTitleWidth = W - M * 2;

  // Dynamically select font size according to title length
  let titleFontSize = 44;
  let titleLineHeight = 50;
  if (rawTitle.length > 55) {
    titleFontSize = 26;
    titleLineHeight = 32;
  } else if (rawTitle.length > 38) {
    titleFontSize = 32;
    titleLineHeight = 38;
  } else if (rawTitle.length > 24) {
    titleFontSize = 38;
    titleLineHeight = 44;
  }

  doc.setFont("times", "bold");
  doc.setFontSize(titleFontSize);
  let titleLines = doc.splitTextToSize(rawTitle, maxTitleWidth);

  // If text wraps to more than 3 lines, step down font size
  while (titleLines.length > 3 && titleFontSize > 22) {
    titleFontSize -= 3;
    titleLineHeight = Math.round(titleFontSize * 1.22);
    doc.setFontSize(titleFontSize);
    titleLines = doc.splitTextToSize(rawTitle, maxTitleWidth);
  }

  const genreText = sanitizePdfText(story.genre || "").toUpperCase();
  const loglineText = sanitizePdfText(story.logline || "");

  doc.setFont("times", "normal");
  doc.setFontSize(15);
  const loglineLines = loglineText ? doc.splitTextToSize(loglineText, maxTitleWidth) : [];

  // Center vertical layout on the page
  const titleBlockH = titleLines.length * titleLineHeight;
  const genreH = genreText ? 24 : 0;
  const loglineH = loglineLines.length * 21;
  const gap1 = genreText ? 14 : 0;
  const gap2 = loglineText ? 24 : 0;
  const totalContentH = titleBlockH + gap1 + genreH + gap2 + loglineH;

  let curCoverY = Math.max(M + 40, (H - totalContentH) / 2 + titleFontSize * 0.75);

  // Render Title
  doc.setFont("times", "bold");
  doc.setFontSize(titleFontSize);
  doc.setTextColor(31, 26, 20);
  titleLines.forEach((line: string) => {
    doc.text(line, M, curCoverY);
    curCoverY += titleLineHeight;
  });

  // Render Genre
  if (genreText) {
    curCoverY += gap1 - (titleLineHeight - titleFontSize);
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    doc.setTextColor(181, 69, 43);
    doc.text(genreText, M, curCoverY);
    curCoverY += 16;
  }

  // Render Logline
  if (loglineLines.length) {
    curCoverY += gap2 - (genreText ? 16 : 0);
    doc.setFont("times", "normal");
    doc.setFontSize(15);
    doc.setTextColor(31, 26, 20);
    loglineLines.forEach((line: string) => {
      doc.text(line, M, curCoverY);
      curCoverY += 21;
    });
  }

  // 2. Synopsis Slide
  doc.addPage();
  bg();
  title("Synopsis");
  body(story.synopsis || "—", M + 70, 13, "Synopsis");

  // 3. Characters & Cast Slide(s)
  const characters = bible.filter((b) => b.kind === "character" && b.name.trim());
  if (characters.length) {
    doc.addPage();
    bg();
    title("Characters & Cast");
    let y = M + 70;

    for (const c of characters) {
      const cleanName = sanitizePdfText(c.name).replace(/\s*\((?:character|place|lore)\)\s*$/i, "").trim();
      const castActor = sanitizePdfText(c.cast || "").trim();
      const cleanDesc = sanitizePdfText(c.description || "").trim();

      const descLines = cleanDesc ? doc.splitTextToSize(cleanDesc, W - M * 2) : [];
      const neededHeight = 22 + (descLines.length ? descLines.length * 15 + 4 : 0) + 16;

      if (y + neededHeight > H - M - 20) {
        doc.addPage();
        bg();
        title("Characters & Cast (Cont.)");
        y = M + 70;
      }

      doc.setFont("times", "bold");
      doc.setFontSize(14);
      doc.setTextColor(31, 26, 20);
      doc.text(cleanName, M, y);

      if (castActor) {
        const nameW = doc.getTextWidth(cleanName);
        doc.setFont("times", "italic");
        doc.setFontSize(11);
        doc.setTextColor(181, 69, 43);
        doc.text(`   [Portrayed by: ${castActor}]`, M + nameW, y);
      }

      if (descLines.length) {
        doc.setFont("times", "normal");
        doc.setFontSize(11.5);
        doc.setTextColor(50, 42, 35);
        doc.text(descLines, M, y + 16);
        y += 16 + descLines.length * 15 + 16;
      } else {
        y += 24;
      }
    }
  }

  // 4. Filming Locations & Setting Slide(s)
  const places = bible.filter((b) => b.kind === "place" && b.name.trim());
  if (places.length) {
    doc.addPage();
    bg();
    title("Filming Locations & Setting");
    let y = M + 70;

    for (const p of places) {
      const parsed = parsePlaceDetails(p);

      const nameLines = doc.splitTextToSize(parsed.name, W - M * 2);
      const sceneLines = parsed.scene ? doc.splitTextToSize(`SCENE: ${parsed.scene}`, W - M * 2) : [];
      const descLines = parsed.visualDesc ? doc.splitTextToSize(parsed.visualDesc, W - M * 2) : [];
      const optLines = parsed.scoutedPlaces
        ? doc.splitTextToSize(`• Alternative Locations: ${parsed.scoutedPlaces}`, W - M * 2 - 12)
        : [];
      const notesLines = parsed.filmingNotes
        ? doc.splitTextToSize(`• Production Notes: ${parsed.filmingNotes}`, W - M * 2 - 12)
        : [];

      const neededHeight =
        nameLines.length * 16 +
        (sceneLines.length ? sceneLines.length * 13 + 3 : 0) +
        (descLines.length ? descLines.length * 14 + 5 : 0) +
        (optLines.length ? optLines.length * 13 + 3 : 0) +
        (notesLines.length ? notesLines.length * 13 + 3 : 0) +
        18;

      if (y + neededHeight > H - M - 20) {
        doc.addPage();
        bg();
        title("Filming Locations & Setting (Cont.)");
        y = M + 70;
      }

      // Location Name
      doc.setFont("times", "bold");
      doc.setFontSize(13.5);
      doc.setTextColor(31, 26, 20);
      doc.text(nameLines, M, y);
      y += nameLines.length * 16;

      // Filmic Scene Context (if present)
      if (sceneLines.length) {
        doc.setFont("times", "bold");
        doc.setFontSize(10);
        doc.setTextColor(181, 69, 43);
        doc.text(sceneLines, M, y);
        y += sceneLines.length * 13 + 3;
      }

      // Visual Description
      if (descLines.length) {
        doc.setFont("times", "normal");
        doc.setFontSize(11);
        doc.setTextColor(45, 38, 30);
        doc.text(descLines, M, y);
        y += descLines.length * 14 + 5;
      }

      // Alternative Scouted Options
      if (optLines.length) {
        doc.setFont("times", "normal");
        doc.setFontSize(10);
        doc.setTextColor(90, 75, 65);
        doc.text(optLines, M + 12, y);
        y += optLines.length * 13 + 3;
      }

      // Production Notes
      if (notesLines.length) {
        doc.setFont("times", "normal");
        doc.setFontSize(10);
        doc.setTextColor(90, 75, 65);
        doc.text(notesLines, M + 12, y);
        y += notesLines.length * 13 + 3;
      }

      y += 12; // Gap to next location card
    }
  }

  // 5. World Lore & Thematic Rules Slide(s)
  const lore = bible.filter((b) => b.kind === "lore" && b.name.trim());
  if (lore.length) {
    doc.addPage();
    bg();
    title("World Lore & Thematic Rules");
    let y = M + 70;

    for (const l of lore) {
      const cleanName = sanitizePdfText(l.name).replace(/\s*\((?:character|place|lore)\)\s*$/i, "").trim();
      const cleanDesc = sanitizePdfText(l.description || "").trim();

      const descLines = cleanDesc ? doc.splitTextToSize(cleanDesc, W - M * 2) : [];
      const neededHeight = 22 + (descLines.length ? descLines.length * 15 + 4 : 0) + 16;

      if (y + neededHeight > H - M - 20) {
        doc.addPage();
        bg();
        title("World Lore & Thematic Rules (Cont.)");
        y = M + 70;
      }

      doc.setFont("times", "bold");
      doc.setFontSize(14);
      doc.setTextColor(181, 69, 43);
      doc.text(cleanName, M, y);

      if (descLines.length) {
        doc.setFont("times", "normal");
        doc.setFontSize(11.5);
        doc.setTextColor(31, 26, 20);
        doc.text(descLines, M, y + 16);
        y += 16 + descLines.length * 15 + 16;
      } else {
        y += 24;
      }
    }
  }

  // 6. Production Breakdown Slide (Shots by Lighting, Weather, Locations, Props, Cast)
  if (frames.length) {
    doc.addPage();
    bg();
    title("Production & Shot Breakdown");

    const dayShots = frames.filter((f) => getFrameLightingCategory(f) === "day");
    const nightShots = frames.filter((f) => getFrameLightingCategory(f) === "night");
    const goldenShots = frames.filter((f) => getFrameLightingCategory(f) === "golden_hour");
    const weatherIntShots = frames.filter((f) =>
      ["cloudy", "rainy", "interior"].includes(getFrameLightingCategory(f)),
    );

    let y = M + 65;

    // Summary Box with accurate totals
    doc.setFillColor(235, 227, 212);
    doc.roundedRect(M, y, W - M * 2, 45, 4, 4, "F");
    doc.setFont("times", "bold");
    doc.setFontSize(11);
    doc.setTextColor(181, 69, 43);
    const summaryLabel = "SHOT SCHEDULE & LIGHTING TOTALS:";
    doc.text(summaryLabel, M + 14, y + 26);
    const labelW = doc.getTextWidth(summaryLabel);

    doc.setTextColor(31, 26, 20);
    doc.setFont("times", "normal");
    doc.setFontSize(10.5);
    const summaryTotalsText = `Day: ${dayShots.length}  |  Night & Evening: ${nightShots.length}  |  Golden Hour: ${goldenShots.length}  |  Weather / Interior: ${weatherIntShots.length}  |  Total Frames: ${frames.length}`;
    doc.text(summaryTotalsText, M + 14 + labelW + 12, y + 26);

    y += 65;

    // Detailed Table Columns
    const colW = (W - M * 2) / 4;
    doc.setFont("times", "bold");
    doc.setFontSize(11);
    doc.text(`DAY SHOTS (${dayShots.length})`, M, y);
    doc.text(`NIGHT & EVENING (${nightShots.length})`, M + colW, y);
    doc.text(`GOLDEN HOUR (${goldenShots.length})`, M + colW * 2, y);
    doc.text(`WEATHER & INTERIOR (${weatherIntShots.length})`, M + colW * 3, y);

    doc.setDrawColor(181, 69, 43);
    doc.setLineWidth(1.2);
    doc.line(M, y + 4, W - M, y + 4);

    const renderShotList = (shots: Frame[], startX: number, startY: number, maxRows = 11) => {
      let curY = startY + 16;
      doc.setFont("times", "normal");
      doc.setFontSize(10);
      if (!shots.length) {
        doc.setTextColor(120, 110, 100);
        doc.text("None", startX, curY);
        doc.setTextColor(31, 26, 20);
        return;
      }
      shots.slice(0, maxRows).forEach((s) => {
        if (curY > H - M - 20) return;
        const sceneNum = frames.indexOf(s) + 1;
        const locOrHeading = s.location || s.heading.slice(0, 24);
        doc.setFont("times", "bold");
        const titleLines = doc.splitTextToSize(`#${sceneNum}: ${sanitizePdfText(locOrHeading)}`, colW - 14);
        doc.text(titleLines[0] || "", startX, curY);
        curY += 12;
        doc.setFont("times", "normal");
        const desc = doc.splitTextToSize(sanitizePdfText(s.description), colW - 14);
        doc.text(desc[0] || "", startX, curY);
        curY += 16;
      });
    };

    renderShotList(dayShots, M, y);
    renderShotList(nightShots, M + colW, y);
    renderShotList(goldenShots, M + colW * 2, y);
    renderShotList(weatherIntShots, M + colW * 3, y);

    // If any column has more than 11 shots, add a continuation slide
    const maxCount = Math.max(dayShots.length, nightShots.length, goldenShots.length, weatherIntShots.length);
    if (maxCount > 11) {
      doc.addPage();
      bg();
      title("Production & Shot Breakdown (Cont.)");
      const contY = M + 70;

      doc.setFont("times", "bold");
      doc.setFontSize(11);
      doc.text(`DAY SHOTS (CONT.)`, M, contY);
      doc.text(`NIGHT & EVENING (CONT.)`, M + colW, contY);
      doc.text(`GOLDEN HOUR (CONT.)`, M + colW * 2, contY);
      doc.text(`WEATHER & INTERIOR (CONT.)`, M + colW * 3, contY);

      doc.setDrawColor(181, 69, 43);
      doc.setLineWidth(1.2);
      doc.line(M, contY + 4, W - M, contY + 4);

      renderShotList(dayShots.slice(11), M, contY);
      renderShotList(nightShots.slice(11), M + colW, contY);
      renderShotList(goldenShots.slice(11), M + colW * 2, contY);
      renderShotList(weatherIntShots.slice(11), M + colW * 3, contY);
    }
  }

  // 7. Locations, Cast & Props Master Manifest Slide
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
    doc.setFontSize(10.5);
    let locY = y + 20;
    allLocations.forEach((loc) => {
      if (locY > H - M - 20) return;
      const cleanLoc = sanitizePdfText(loc);
      const lines = doc.splitTextToSize(`• ${cleanLoc}`, thirdW - 25);
      lines.forEach((l: string) => {
        doc.text(l, M, locY);
        locY += 14;
      });
      locY += 2;
    });

    // Cast Column
    doc.setFont("times", "bold");
    doc.setFontSize(14);
    doc.setTextColor(181, 69, 43);
    doc.text("CAST & CHARACTERS", M + thirdW, y);
    doc.line(M + thirdW, y + 4, M + thirdW * 2 - 20, y + 4);
    doc.setTextColor(31, 26, 20);
    doc.setFont("times", "normal");
    doc.setFontSize(10.5);
    let castY = y + 20;

    const charEntries = bible.filter((b) => b.kind === "character" && b.name.trim());
    if (charEntries.length) {
      charEntries.forEach((c) => {
        if (castY > H - M - 20) return;
        const cName = sanitizePdfText(c.name).replace(/\s*\((?:character|place|lore)\)\s*$/i, "").trim();
        const cCast = sanitizePdfText(c.cast || "").trim();
        const lineText = cCast ? `• ${cName} — played by ${cCast}` : `• ${cName} (TBD Cast)`;
        const lines = doc.splitTextToSize(lineText, thirdW - 25);
        lines.forEach((l: string) => {
          doc.text(l, M + thirdW, castY);
          castY += 14;
        });
        castY += 3;
      });
    }

    const knownNames = new Set(charEntries.flatMap((c) => [c.name.toLowerCase(), (c.cast || "").toLowerCase()]));
    const additionalCast = allCast.filter((act) => !knownNames.has(act.toLowerCase()));
    if (additionalCast.length) {
      additionalCast.forEach((actor) => {
        if (castY > H - M - 20) return;
        const cleanAct = sanitizePdfText(actor);
        doc.text(`• ${cleanAct} (Storyboard Cast)`, M + thirdW, castY);
        castY += 15;
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
    doc.setFontSize(10.5);

    const isDoubleCol = allProps.length > 16;
    const subColW = isDoubleCol ? (thirdW - 14) / 2 : thirdW - 10;
    let propSubCol = 0;
    let propY = y + 20;
    const propStartY = y + 20;
    const maxPropY = H - M - 20;

    allProps.forEach((prop) => {
      const cleanProp = sanitizePdfText(prop);
      if (!cleanProp) return;
      if (propY > maxPropY) {
        if (isDoubleCol && propSubCol === 0) {
          propSubCol = 1;
          propY = propStartY;
        } else {
          return;
        }
      }
      const pX = M + thirdW * 2 + (propSubCol === 1 ? subColW + 10 : 0);
      const lines = doc.splitTextToSize(`• ${cleanProp}`, subColW);
      doc.text(lines[0] || "", pX, propY);
      propY += 14.5;
    });
  }

  // 8. Moodboard Slide
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

  // 9. Individual Storyboard Scene Slides
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
    const headLines = doc.splitTextToSize(sanitizePdfText(f.heading), 260);
    doc.text(headLines, x, y + 10);

    const headH = headLines.length * 14;

    // Camera Framing & Lighting tag
    const framing = f.framing || "Medium Shot";
    const angle = f.camera_angle || "Eye-Level";
    const movement = f.movement || "Static";
    doc.setFont("times", "bold");
    doc.setFontSize(9);
    doc.setTextColor(181, 69, 43);
    doc.text(`SHOT: ${sanitizePdfText(framing).toUpperCase()}  |  ANGLE: ${sanitizePdfText(angle).toUpperCase()}`, x, y + 10 + headH + 12);
    doc.text(`MOVE: ${sanitizePdfText(movement).toUpperCase()}  |  LIGHTING: ${(sanitizePdfText(f.lighting) || "DAY").toUpperCase()}`, x, y + 10 + headH + 24);
    doc.setTextColor(31, 26, 20);

    doc.setFont("times", "normal");
    doc.setFontSize(11);
    const descLines = doc.splitTextToSize(sanitizePdfText(f.description), 260);
    doc.text(descLines, x, y + 10 + headH + 42);

    let metaY = y + 10 + headH + 42 + descLines.length * 15 + 14;
    if (f.director_notes) {
      doc.setFont("times", "italic");
      doc.setFontSize(9);
      doc.setTextColor(110, 95, 80);
      const noteLines = doc.splitTextToSize(`Visual Intent: ${sanitizePdfText(f.director_notes)}`, 260);
      doc.text(noteLines, x, metaY);
      metaY += noteLines.length * 12 + 6;
      doc.setTextColor(31, 26, 20);
    }
    if (f.location) {
      doc.setFont("times", "bold");
      doc.text("Location: ", x, metaY);
      doc.setFont("times", "normal");
      const locLines = doc.splitTextToSize(sanitizePdfText(f.location), 200);
      doc.text(locLines, x + 55, metaY);
      metaY += Math.max(18, locLines.length * 14 + 4);
    }
    if (f.cast) {
      doc.setFont("times", "bold");
      doc.text("Cast: ", x, metaY);
      doc.setFont("times", "normal");
      const castLines = doc.splitTextToSize(sanitizePdfText(f.cast), 220);
      doc.text(castLines, x + 35, metaY);
      metaY += Math.max(18, castLines.length * 14 + 4);
    }
    if (f.props) {
      doc.setFont("times", "bold");
      doc.text("Props: ", x, metaY);
      doc.setFont("times", "normal");
      const propsLines = doc.splitTextToSize(sanitizePdfText(f.props), 215);
      doc.text(propsLines, x + 40, metaY);
    }
  });

  const saveFilename = `${sanitizePdfText(story.title).replace(/[^a-zA-Z0-9_-]/g, "_") || "pitch"}-deck.pdf`;
  doc.save(saveFilename);
}
