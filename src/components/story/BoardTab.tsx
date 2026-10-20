import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileDown, ImageIcon, Sparkles } from "lucide-react";
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
import type { Story } from "@/routes/_authenticated/stories_.$id";

export function BoardTab({ story }: { story: Story }) {
  const qc = useQueryClient();
  const { data: chapters = [] } = useChapters(story.id);
  const { data: bible = [] } = useBible(story.id);
  const { data: frames = [] } = useFrames(story.id);
  const genImage = useServerFn(generateFrameImage);
  const [busy, setBusy] = useState(false);
  const [painting, setPainting] = useState<Record<string, boolean>>({});

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
        });
      }

      qc.invalidateQueries({ queryKey: ["frames", story.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function paint(f: Frame) {
    setPainting((p) => ({ ...p, [f.id]: true }));
    try {
      const res = await genImage({
        data: {
          frameId: f.id,
          heading: f.heading,
          description: f.description,
          style: `${story.genre} ${story.style}`.trim(),
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
    <div>
      <div className="mb-6 flex flex-wrap gap-3">
        <Button disabled={busy} onClick={breakdown}>
          <Sparkles className="mr-2 h-4 w-4" />
          {busy ? "Breaking down…" : "Break into scenes"}
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
          Export pitch deck
        </Button>
      </div>
      {!frames.length && (
        <p className="font-serif text-muted-foreground">
          Break your story into scenes to build a storyboard.
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {frames.map((f, i) => (
          <div key={f.id} className="page overflow-hidden rounded-md">
            <div className="flex aspect-[3/2] items-center justify-center bg-muted">
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
            </div>
            <div className="p-4">
              <p className="font-mono text-xs text-sepia">
                {i + 1}. {f.heading}
              </p>
              <p className="mt-1 font-serif text-sm">{f.description}</p>
              {f.image_url && (
                <button
                  className="mt-2 text-xs text-muted-foreground underline"
                  disabled={painting[f.id]}
                  onClick={() => paint(f)}
                >
                  Redraw
                </button>
              )}
            </div>
          </div>
        ))}
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

  bg();
  doc.setFont("times", "bold");
  doc.setFontSize(48);
  doc.text(story.title || "Untitled", M, H / 2 - 20);
  doc.setFontSize(14);
  doc.setTextColor(181, 69, 43);
  doc.text((story.genre || "").toUpperCase(), M, H / 2 + 10);
  doc.setTextColor(31, 26, 20);
  body(story.logline, H / 2 + 40, 16);

  doc.addPage();
  bg();
  title("Synopsis");
  body(story.synopsis || "—", M + 70);

  const chars = bible.filter((b) => b.name.trim());
  if (chars.length) {
    doc.addPage();
    bg();
    title("Characters & world");
    let y = M + 70;
    for (const c of chars) {
      if (y > H - M) {
        doc.addPage();
        bg();
        y = M + 20;
      }
      doc.setFont("times", "bold");
      doc.setFontSize(15);
      doc.text(`${c.name}  (${c.kind})`, M, y);
      y = body(c.description, y + 18, 12) + 12;
    }
  }

  const imgs = frames.filter((f) => f.image_url);
  if (imgs.length) {
    doc.addPage();
    bg();
    title("Moodboard");
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

  frames.forEach((f, i) => {
    doc.addPage();
    bg();
    title(`Scene ${i + 1}`);
    const y = M + 60;
    if (f.image_url) {
      const iw = W - M * 2 - 260,
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
    doc.setFont("courier", "bold");
    doc.setFontSize(11);
    const x = W - M - 230;
    doc.text(doc.splitTextToSize(f.heading, 230), x, y + 10);
    doc.setFont("times", "normal");
    doc.setFontSize(12);
    doc.text(doc.splitTextToSize(f.description, 230), x, y + 40);
  });

  doc.save(`${story.title || "pitch"}-deck.pdf`);
}
