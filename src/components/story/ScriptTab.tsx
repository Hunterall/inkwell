import { useState } from "react";
import { toast } from "sonner";
import { Clapperboard, Download, FileText, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { streamWrite } from "@/lib/ai/stream-client";
import { formatScreenplay, exportScreenplayPdf } from "@/lib/screenplay";
import { auth } from "@/integrations/firebase/client";
import { bibleToText, useBible, useChapters } from "./data";
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
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // PDF Export dialog state
  const [pdfTitle, setPdfTitle] = useState(story.title || "Untitled Screenplay");
  const [pdfAuthor, setPdfAuthor] = useState(auth.currentUser?.displayName || "");
  const [pdfAddress, setPdfAddress] = useState("");
  const [pdfPhone, setPdfPhone] = useState("");
  const [pdfEmail, setPdfEmail] = useState(auth.currentUser?.email || "");

  const scenes = (story.script || "")
    .split("\n")
    .filter((l) => /^(INT\.|EXT\.|INT\/EXT|EXT\/INT|I\/E\.)/i.test(l.trim()));

  async function convertSingle(textToConvert: string, bibleText: string): Promise<string> {
    let result = "";
    await streamWrite(
      { mode: "script", text: textToConvert, bible: bibleText },
      (chunk) => {
        result = chunk;
      },
    );
    return formatScreenplay(result);
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
          setProgressMsg("Adapting chapter to screenplay…");
          let rawResult = "";
          await streamWrite(
            { mode: "script", text: `${firstChap.title}\n\n${firstChap.content}`, bible: bibleText },
            (s) => {
              rawResult = s;
              update({ script: s });
            },
          );
          if (rawResult) {
            update({ script: formatScreenplay(rawResult) });
          }
        } else {
          let fullScript = "";
          for (let i = 0; i < validChapters.length; i++) {
            const chap = validChapters[i]!;
            setProgressMsg(
              `Adapting Chapter ${i + 1} of ${validChapters.length}: "${chap.title || `Chapter ${i + 1}`}"…`,
            );

            const chapText = `CHAPTER ${i + 1}: ${chap.title}\n\n${chap.content}`;
            const chapScript = await convertSingle(chapText, bibleText);

            if (chapScript.trim()) {
              if (fullScript) {
                fullScript +=
                  `\n\n/* ---------------------------------------- */\n/* CHAPTER ${i + 1}: ${chap.title} */\n/* ---------------------------------------- */\n\n` +
                  chapScript.trim();
              } else {
                fullScript = chapScript.trim();
              }
              update({ script: fullScript });
            }
          }
        }
        toast.success("Complete story converted to formatted screenplay!");
      } else {
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

  function handleAutoFormat() {
    if (!story.script?.trim()) {
      toast.error("No script content to format.");
      return;
    }
    const formatted = formatScreenplay(story.script);
    update({ script: formatted });
    toast.success("Screenplay formatted to standard theatrical Courier layout!");
  }

  function handleExportPdf() {
    if (!story.script?.trim()) {
      toast.error("Screenplay is empty. Write or generate one first.");
      return;
    }
    try {
      exportScreenplayPdf({
        title: pdfTitle || story.title || "Untitled Screenplay",
        author: pdfAuthor || "Screenwriter",
        script: story.script,
        contact: {
          address: pdfAddress.trim() || undefined,
          phone: pdfPhone.trim() || undefined,
          email: pdfEmail.trim() || undefined,
        },
      });
      setExportModalOpen(false);
      toast.success("Screenplay PDF downloaded successfully!");
    } catch (err) {
      toast.error("Failed to generate PDF: " + (err as Error).message);
    }
  }

  function downloadFountain() {
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
          className="screenplay min-h-[70vh] resize-none border-none bg-transparent p-0 shadow-none focus-visible:ring-0 leading-relaxed"
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
            {busy
              ? "Adapting Screenplay…"
              : selectedChapterId === "all"
                ? "Convert Whole Story"
                : "Adapt & Append Chapter"}
          </Button>

          {progressMsg && (
            <p className="text-xs text-amber-500 font-mono animate-pulse text-center">
              {progressMsg}
            </p>
          )}
        </div>

        {/* Formatting & Export Actions */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Tools & Export
          </p>

          <Button
            variant="outline"
            className="w-full justify-start text-xs"
            disabled={!story.script?.trim() || busy}
            onClick={handleAutoFormat}
          >
            <Wand2 className="mr-2 h-3.5 w-3.5 text-sepia" />
            Format Screenplay (Courier Layout)
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start text-xs border-sepia/30 hover:bg-sepia/10"
            disabled={!story.script?.trim()}
            onClick={() => {
              setPdfTitle(story.title || "Untitled Screenplay");
              setPdfAuthor(auth.currentUser?.displayName || "");
              setPdfEmail(auth.currentUser?.email || "");
              setExportModalOpen(true);
            }}
          >
            <FileText className="mr-2 h-3.5 w-3.5 text-sepia" />
            Export Screenplay (PDF)
          </Button>

          <Button
            variant="ghost"
            className="w-full justify-start text-xs text-muted-foreground"
            disabled={!story.script}
            onClick={downloadFountain}
          >
            <Download className="mr-2 h-3.5 w-3.5" />
            Download Fountain (.fountain)
          </Button>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-widest text-sepia">
              Scene breakdown ({scenes.length})
            </p>
          </div>
          {scenes.length > 0 && (
            <p className="mb-2 text-[11px] text-muted-foreground leading-relaxed">
              💡 <em>Tip: Scout real-world filming destinations (e.g. Goa, Gokarna, Udupi for beaches; Manali for mountains) in <strong>Story Bible &rarr; Places</strong> or <strong>Storyboard</strong>.</em>
            </p>
          )}
          <ol className="space-y-1 font-mono text-xs max-h-60 overflow-y-auto pr-1">
            {scenes.map((s, i) => (
              <li key={i} className="line-clamp-1 hover:text-sepia transition-colors">
                {i + 1}. {s.trim()}
              </li>
            ))}
          </ol>
        </div>
      </aside>

      {/* Screenplay PDF Export Dialog */}
      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-sepia" />
              Export Theatrical Screenplay PDF
            </DialogTitle>
            <DialogDescription>
              Exports your script to industry-standard theatrical screenplay format with Courier 12pt,
              exact margins, cover page, and scene numbering.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <div className="space-y-1">
              <Label htmlFor="pdf-title" className="text-xs font-medium">
                Screenplay Title
              </Label>
              <Input
                id="pdf-title"
                value={pdfTitle}
                onChange={(e) => setPdfTitle(e.target.value)}
                placeholder="The Blind Date"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="pdf-author" className="text-xs font-medium">
                Written By (Author Name)
              </Label>
              <Input
                id="pdf-author"
                value={pdfAuthor}
                onChange={(e) => setPdfAuthor(e.target.value)}
                placeholder="Author Name"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="pdf-email" className="text-xs font-medium">
                  Contact E-mail
                </Label>
                <Input
                  id="pdf-email"
                  value={pdfEmail}
                  onChange={(e) => setPdfEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pdf-phone" className="text-xs font-medium">
                  Phone (Optional)
                </Label>
                <Input
                  id="pdf-phone"
                  value={pdfPhone}
                  onChange={(e) => setPdfPhone(e.target.value)}
                  placeholder="+1 (555) 0123"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="pdf-address" className="text-xs font-medium">
                Address / Agency (Optional)
              </Label>
              <Input
                id="pdf-address"
                value={pdfAddress}
                onChange={(e) => setPdfAddress(e.target.value)}
                placeholder="City, State"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setExportModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExportPdf}>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
