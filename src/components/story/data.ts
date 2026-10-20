import { useQuery } from "@tanstack/react-query";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { db } from "@/integrations/firebase/client";

export type Chapter = { id: string; title: string; content: string; position: number };
export type BibleEntry = { id: string; kind: string; name: string; description: string };
export type Frame = {
  id: string;
  position: number;
  heading: string;
  description: string;
  image_url: string | null;
};

export function useChapters(storyId: string) {
  return useQuery({
    queryKey: ["chapters", storyId],
    queryFn: async () => {
      const q = query(
        collection(db, "chapters"),
        where("storyId", "==", storyId),
      );
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
      const q = query(
        collection(db, "bible_entries"),
        where("storyId", "==", storyId),
      );
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
      const q = query(
        collection(db, "frames"),
        where("storyId", "==", storyId),
      );
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
    .map((e) => `[${e.kind}] ${e.name}: ${e.description}`)
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
