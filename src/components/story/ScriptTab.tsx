import { useState } from "react";
import { toast } from "sonner";
import { Clapperboard, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { streamWrite } from "@/lib/ai/stream-client";
import { bibleToText, fullText, useBible, useChapters } from "./data";
import type { Story } from "@/routes/_authenticated/stories_.$id";

export function ScriptTab({
  story,
  update,
}: {
  story: Story;
  update: (p: Partial<Story>) => void;
}) {
  const { data: chapters = [] } = useChapters(story.id);
  const { data: bible = [] } = useBible(story.id);
  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string>("all");
  const scenes = (story.script || "").split("\n").filter((l) => /^(INT\.|EXT\.|INT\/EXT)/.test(l.trim()));

  async function convertSingle(textToConvert: string, bibleText: string): Promise<string> {
    let result = "";
    await streamWrite(
      { mode: "script", text: textToConvert, bible: bibleText },
      (chunk) => {
        result = chunk;
      },
    );
    return result;
  }

  async function convert() {
    const validChapters = chapters.filter((c) => c.content?.trim());
    if (validChapters.length === 0) {
      toast.error("Write some chapters first.");
      return;
    }

    setBusy(true);
    const bibleText = bibleToText(bible);

    try {
      if (selectedChapterId === "all") {
        if (validChapters.length === 1) {
          const firstChap = validChapters[0]!;
          // Single chapter story
          setProgressMsg("Adapting chapter to screenplay…");
          await streamWrite(
            { mode: "script", text: `${firstChap.title}\n\n${firstChap.content}`, bible: bibleText },
            (s) => update({ script: s }),
          );
        } else {
          // Multi-chapter story: convert sequentially so entire story is converted without truncation
          let fullScript = "";
          for (let i = 0; i < validChapters.length; i++) {
            const chap = validChapters[i]!;
            setProgressMsg(`Adapting Chapter ${i + 1} of ${validChapters.length}: "${chap.title || `Chapter ${i + 1}`}"…`);

            const chapText = `CHAPTER ${i + 1}: ${chap.title}\n\n${chap.content}`;
            const chapScript = await convertSingle(chapText, bibleText);

            if (chapScript.trim()) {
              if (fullScript) {
                fullScript += `\n\n/* ---------------------------------------- */\n/* CHAPTER ${i + 1}: ${chap.title} */\n/* ---------------------------------------- */\n\n` + chapScript.trim();
              } else {
                fullScript = chapScript.trim();
              }
              update({ script: fullScript });
            }
          }
        }
        toast.success("Complete story converted to screenplay!");
      } else {
        // Individual chapter selected
        const chap = validChapters.find((c) => c.id === selectedChapterId);
        if (!chap) {
          toast.error("Selected chapter not found.");
          return;
        }
        setProgressMsg(`Adapting "${chap.title || "Chapter"}"…`);
        const chapText = `${chap.title}\n\n${chap.content}`;
        const newScript = await convertSingle(chapText, bibleText);

        if (newScript.trim()) {
          const combined = story.script.trim()
            ? `${story.script.trim()}\n\n/* ---------------------------------------- */\n/* ${chap.title} */\n/* ---------------------------------------- */\n\n${newScript.trim()}`
            : newScript.trim();
          update({ script: combined });
          toast.success(`Adapted and appended "${chap.title}" to screenplay!`);
        }
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setProgressMsg(null);
    }
  }

  function download() {
    const blob = new Blob([story.script], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${story.title || "script"}.fountain`;
    a.click();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="page rounded-md p-8">
        <Textarea
          value={story.script}
          onChange={(e) => update({ script: e.target.value })}
          placeholder="Your screenplay will appear here."
          className="screenplay min-h-[70vh] resize-none border-none bg-transparent p-0 shadow-none focus-visible:ring-0"
        />
      </div>
      <aside className="space-y-4">
        <div className="rounded-lg border border-sepia/20 bg-card p-4 space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
            Scope
          </label>
          <select
            value={selectedChapterId}
            onChange={(e) => setSelectedChapterId(e.target.value)}
            disabled={busy}
            className="w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">Entire Story (All {chapters.length} Chapters Sequential)</option>
            {chapters.map((c, i) => (
              <option key={c.id} value={c.id}>
                Chapter {i + 1}: {c.title || `Untitled`}
              </option>
            ))}
          </select>

          <Button className="w-full" disabled={busy} onClick={convert}>
            <Clapperboard className="mr-2 h-4 w-4" />
            {busy ? "Adapting Screenplay…" : selectedChapterId === "all" ? "Convert Whole Story" : "Adapt & Append Chapter"}
          </Button>

          {progressMsg && (
            <p className="text-xs text-amber-500 font-mono animate-pulse text-center">
              {progressMsg}
            </p>
          )}
        </div>

        <Button variant="outline" className="w-full" disabled={!story.script} onClick={download}>
          <Download className="mr-2 h-4 w-4" />
          Download script
        </Button>
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-sepia">
            Scene breakdown ({scenes.length})
          </p>
          <ol className="space-y-1 font-mono text-xs">
            {scenes.map((s, i) => (
              <li key={i}>
                {i + 1}. {s.trim()}
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
