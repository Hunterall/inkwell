import { useQuery } from "@tanstack/react-query";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "@/integrations/firebase/client";

export type Chapter = { id: string; title: string; content: string; position: number };
export type BibleEntry = {
  id: string;
  kind: string;
  name: string;
  description: string;
  cast?: string;
};
export type Frame = {
  id: string;
  position: number;
  heading: string;
  description: string;
  image_url: string | null;
  lighting?: "day" | "night" | "cloudy" | "rainy" | "golden_hour" | "interior" | string;
  location?: string;
  props?: string;
  cast?: string;
  camera_angle?: string;
  framing?: string;
  movement?: string;
  focal_length?: string;
  director_notes?: string;
};

export const FRAMING_OPTIONS = [
  { value: "Close-Up (CU)", label: "Close-Up (CU) — Facial emotion & intimate tension" },
  { value: "Medium Close-Up (MCU)", label: "Medium Close-Up (MCU) — Chest-up character & reaction" },
  { value: "Medium Shot (MS)", label: "Medium Shot (MS) — Waist-up conversation & body language" },
  { value: "Wide Shot (WS)", label: "Wide Shot (WS) — Environment & character geography" },
  { value: "Extreme Wide Shot (EWS)", label: "Extreme Wide Shot (EWS) — Epic scale & vast isolation" },
  { value: "Extreme Close-Up (ECU)", label: "Extreme Close-Up (ECU) — Eyes, micro-details & objects" },
  { value: "Full Shot (FS)", label: "Full Shot (FS) — Full body action & movement" },
  { value: "Over-the-Shoulder (OTS)", label: "Over-the-Shoulder (OTS) — Dialogue & relational dynamic" },
  { value: "Point-of-View (POV)", label: "Point-of-View (POV) — Subjective character perspective" },
  { value: "Cowboy Shot", label: "Cowboy Shot — Mid-thigh confrontation & suspense" },
];

export const CAMERA_ANGLE_OPTIONS = [
  { value: "Eye-Level", label: "Eye-Level — Grounded, natural human perspective" },
  { value: "Low Angle", label: "Low Angle — Power, dominance, heroism or looming threat" },
  { value: "High Angle", label: "High Angle — Vulnerability, weakness, isolation" },
  { value: "Dutch Angle (Canted)", label: "Dutch Angle (Canted) — Psychological tension, disorientation & dread" },
  { value: "Overhead / Bird's Eye", label: "Overhead / Bird's Eye — Omniscient scale & spatial geometry" },
  { value: "Worm's Eye", label: "Worm's Eye — Colossal scale from floor looking straight up" },
  { value: "Ground Level", label: "Ground Level — Gritty, boots-on-the-ground visceral immersion" },
];

export const CAMERA_MOVEMENT_OPTIONS = [
  { value: "Static", label: "Static — Locked-off frame, formal tension or stillness" },
  { value: "Push-In / Dolly In", label: "Push-In / Dolly In — Rising realization, dread or intensity" },
  { value: "Pull-Out / Dolly Out", label: "Pull-Out / Dolly Out — Abandonment, shock or widening context" },
  { value: "Tracking / Steadicam", label: "Tracking / Steadicam — Fluid dynamic momentum following characters" },
  { value: "Handheld", label: "Handheld — Kinetic urgency, chaos & documentary realism" },
  { value: "Pan / Tilt", label: "Pan / Tilt — Surveying surroundings or tracking motion" },
  { value: "Whip Pan", label: "Whip Pan — High-energy sudden transition" },
  { value: "Crane / Jib", label: "Crane / Jib — Sweeping vertical elevation over the scene" },
];

export function useChapters(storyId: string) {
  return useQuery({
    queryKey: ["chapters", storyId],
    queryFn: async () => {
      const uid = auth.currentUser?.uid;
      const constraints = [where("storyId", "==", storyId)];
      if (uid) constraints.push(where("userId", "==", uid));
      const q = query(collection(db, "chapters"), ...constraints);
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Chapter[];
      items.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      return items;
    },
  });
}

export function useBible(storyId: string) {
  return useQuery({
    queryKey: ["bible", storyId],
    queryFn: async () => {
      const uid = auth.currentUser?.uid;
      const constraints = [where("storyId", "==", storyId)];
      if (uid) constraints.push(where("userId", "==", uid));
      const q = query(collection(db, "bible_entries"), ...constraints);
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as BibleEntry[];
      return items;
    },
  });
}

export function useFrames(storyId: string) {
  return useQuery({
    queryKey: ["frames", storyId],
    queryFn: async () => {
      const uid = auth.currentUser?.uid;
      const constraints = [where("storyId", "==", storyId)];
      if (uid) constraints.push(where("userId", "==", uid));
      const q = query(collection(db, "frames"), ...constraints);
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Frame[];
      items.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      return items;
    },
  });
}

export function bibleToText(entries: BibleEntry[]) {
  return entries
    .filter((e) => e.name.trim())
    .map((e) => {
      const castInfo = e.cast?.trim() ? ` (Cast/Actor: ${e.cast.trim()})` : "";
      return `[${e.kind}] ${e.name}${castInfo}: ${e.description}`;
    })
    .join("\n");
}

export function fullText(chapters: Chapter[]) {
  return chapters.map((c) => `${c.title}\n\n${c.content}`).join("\n\n");
}

export const STYLES = [
  "Literary",
  "Hardboiled noir",
  "Lyrical and dreamlike",
  "Fast-paced thriller",
  "Cozy and warm",
  "Gothic horror",
  "Epic fantasy",
  "Wry and comic",
  "Minimalist (Hemingway-like)",
  "Young adult",
];
