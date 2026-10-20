import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, FileUp } from "lucide-react";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "@/integrations/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { streamWrite } from "@/lib/ai/stream-client";
import { parseImportFile } from "@/lib/import-utils";
import type { AiMode } from "@/lib/ai/prompts";
import { STYLES, bibleToText, useBible, useChapters, type Chapter } from "./data";
import { useDebouncedSave } from "./useDebouncedSave";
import type { Story } from "@/routes/_authenticated/stories_.$id";

export function WriteTab({ story, update }: { story: Story; update: (p: Partial<Story>) => void }) {
  const qc = useQueryClient();
  const { data: chapters = [] } = useChapters(story.id);
  const { data: bible = [] } = useBible(story.id);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = chapters.find((c) => c.id === activeId) ?? chapters[0];
  const ref = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState("");
  const [lastMode, setLastMode] = useState<AiMode | null>(null);

  useEffect(() => setResult(""), [active?.id]);

  const save = useDebouncedSave(async (p: Partial<Chapter> & { id?: string }) => {
    const { id, ...rest } = p;
    if (id)
      await updateDoc(doc(db, "chapters", id), {
        ...rest,
        updatedAt: serverTimestamp(),
      });
  });

  function patchChapter(p: Partial<Chapter>) {
    if (!active) return;
    qc.setQueryData<Chapter[]>(["chapters", story.id], (old) =>
      (old ?? []).map((c) => (c.id === active.id ? { ...c, ...p } : c)),
    );
    save({ id: active.id, ...p });
  }

  async function addChapter() {
    const uid = auth.currentUser?.uid ?? "";
    const ref2 = await addDoc(collection(db, "chapters"), {
      userId: uid,
      storyId: story.id,
      title: `Chapter ${chapters.length + 1}`,
      content: "",
      position: chapters.length,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await qc.invalidateQueries({ queryKey: ["chapters", story.id] });
    setActiveId(ref2.id);
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const toastId = toast.loading(`Importing ${file.name}…`);
    try {
      const parsed = await parseImportFile(file);
      const uid = auth.currentUser?.uid ?? "";

      let firstId = "";
      for (let i = 0; i < parsed.chapters.length; i++) {
        const ch = parsed.chapters[i]!;
        const docRef = await addDoc(collection(db, "chapters"), {
          userId: uid,
          storyId: story.id,
          title: ch.title,
          content: ch.content,
          position: chapters.length + i,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        if (i === 0) firstId = docRef.id;
      }
      await qc.invalidateQueries({ queryKey: ["chapters", story.id] });
      if (firstId) setActiveId(firstId);
      toast.success(
        `Imported ${parsed.chapters.length} chapter${parsed.chapters.length === 1 ? "" : "s"}!`,
        { id: toastId },
      );
    } catch (err) {
      toast.error((err as Error).message || "Import failed.", { id: toastId });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function run(mode: AiMode) {
    if (!active) return;
    const el = ref.current;
    const sel = el ? active.content.slice(el.selectionStart, el.selectionEnd) : "";
    const needsSel = mode === "expand" || mode === "rewrite" || mode === "paraphrase";
    const text = needsSel ? sel || active.content : active.content;
    if (needsSel && !text.trim()) {
      toast.error("Write or select some text first.");
      return;
    }
    setBusy(true);
    setLastMode(mode);
    setResult("");
    try {
      await streamWrite(
        {
          mode,
          text,
          style: story.style,
          instruction,
          bible: bibleToText(bible),
          title: story.title,
        },
        setResult,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function apply(replace: boolean) {
    if (!active || !result) return;
    const el = ref.current;
    const s = el?.selectionStart ?? active.content.length;
    const e = el?.selectionEnd ?? active.content.length;
    const content =
      replace && s !== e
        ? active.content.slice(0, s) + result + active.content.slice(e)
        : replace && lastMode !== "draft" && lastMode !== "continue"
          ? result
          : active.content +
            (active.content.endsWith("\n") || !active.content ? "" : "\n\n") +
            result;
    patchChapter({ content });
    setResult("");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr_320px]">
      <aside className="space-y-1">
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-sepia">Chapters</p>
        {chapters.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveId(c.id)}
            className={`block w-full truncate rounded px-2 py-1.5 text-left text-sm ${c.id === active?.id ? "bg-secondary font-medium" : "hover:bg-muted"}`}
          >
            {c.title || "Untitled"}
          </button>
        ))}
        <Button variant="ghost" size="sm" onClick={addChapter} className="w-full justify-start">
          <Plus className="mr-1 h-4 w-4" />
          Add chapter
        </Button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImportFile}
          accept=".pdf,.txt,text/plain,application/pdf"
          className="hidden"
          id="import-chapter-file"
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
          className="w-full justify-start text-muted-foreground"
        >
          <FileUp className="mr-1 h-4 w-4" />
          {importing ? "Importing…" : "Import (.pdf, .txt)"}
        </Button>
      </aside>
      <section className="page rounded-md p-8 md:p-12">
        {active ? (
          <>
            <Input
              value={active.title}
              onChange={(e) => patchChapter({ title: e.target.value })}
              className="mb-4 h-auto border-none bg-transparent px-0 font-display text-3xl shadow-none focus-visible:ring-0"
            />
            <Textarea
              ref={ref}
              value={active.content}
              onChange={(e) => patchChapter({ content: e.target.value })}
              placeholder="It was a dark and stormy night…"
              className="prose-page min-h-[60vh] resize-none border-none bg-transparent p-0 shadow-none focus-visible:ring-0"
            />
          </>
        ) : (
          <p className="text-muted-foreground">Add a chapter to begin.</p>
        )}
      </section>
      <aside className="space-y-4">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-sepia">Voice</p>
          <Select value={story.style} onValueChange={(v) => update({ style: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STYLES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          placeholder="Direction (optional), e.g. more tension"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={busy} onClick={() => run("draft")}>
            Draft scene
          </Button>
          <Button disabled={busy} variant="secondary" onClick={() => run("continue")}>
            Continue
          </Button>
          <Button disabled={busy} variant="outline" onClick={() => run("expand")}>
            Expand
          </Button>
          <Button disabled={busy} variant="outline" onClick={() => run("rewrite")}>
            Rewrite
          </Button>
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => run("paraphrase")}
            className="col-span-2"
          >
            Paraphrase
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Select text in the page to expand, rewrite or paraphrase just that part.
        </p>
        {(busy || result) && (
          <div className="page rounded-md p-4">
            <p className="max-h-80 overflow-auto whitespace-pre-wrap font-serif text-sm">
              {result || "Writing…"}
            </p>
            {!busy && result && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => apply(true)}>
                  Replace
                </Button>
                <Button size="sm" variant="secondary" onClick={() => apply(false)}>
                  Append
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setResult("")}>
                  Discard
                </Button>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
