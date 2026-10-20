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
  const scenes = story.script.split("\n").filter((l) => /^(INT\.|EXT\.|INT\/EXT)/.test(l.trim()));

  async function convert() {
    const text = fullText(chapters);
    if (!text.trim()) {
      toast.error("Write some chapters first.");
      return;
    }
    setBusy(true);
    try {
      await streamWrite({ mode: "script", text, bible: bibleToText(bible) }, (s) =>
        update({ script: s }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
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
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="page rounded-md p-8">
        <Textarea
          value={story.script}
          onChange={(e) => update({ script: e.target.value })}
          placeholder="Your screenplay will appear here."
          className="screenplay min-h-[70vh] resize-none border-none bg-transparent p-0 shadow-none focus-visible:ring-0"
        />
      </div>
      <aside className="space-y-4">
        <Button className="w-full" disabled={busy} onClick={convert}>
          <Clapperboard className="mr-2 h-4 w-4" />
          {busy ? "Adapting…" : "Convert story to script"}
        </Button>
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
