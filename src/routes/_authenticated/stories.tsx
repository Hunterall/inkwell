import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Plus, LogOut, Trash2, FileUp, Settings } from "lucide-react";
import { toast } from "sonner";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/integrations/firebase/client";
import { Button } from "@/components/ui/button";
import { parseImportFile } from "@/lib/import-utils";

export const Route = createFileRoute("/_authenticated/stories")({
  head: () => ({
    meta: [
      { title: "Your stories — Inkwell" },
      { name: "description", content: "All your stories, scripts and decks." },
      { property: "og:title", content: "Your stories — Inkwell" },
      { property: "og:description", content: "All your stories, scripts and decks." },
    ],
  }),
  component: StoriesPage,
});

function StoriesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [uid, setUid] = useState(() => auth.currentUser?.uid ?? "");
  const [currentUser, setCurrentUser] = useState(() => auth.currentUser);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? "");
      setCurrentUser(user);
    });
    return unsub;
  }, []);

  const { data: stories = [], isLoading } = useQuery({
    queryKey: ["stories", uid],
    enabled: !!uid,
    queryFn: async () => {
      const q = query(
        collection(db, "stories"),
        where("userId", "==", uid),
      );
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as {
        id: string;
        title: string;
        logline: string;
        genre: string;
        createdAt?: { seconds: number } | null;
        updatedAt?: { seconds: number } | null;
      }[];
      items.sort((a, b) => {
        const tA = a.updatedAt?.seconds ?? a.createdAt?.seconds ?? 0;
        const tB = b.updatedAt?.seconds ?? b.createdAt?.seconds ?? 0;
        return tB - tA;
      });
      return items;
    },
  });

  async function create() {
    const storyRef = await addDoc(collection(db, "stories"), {
      userId: uid,
      title: "Untitled story",
      logline: "",
      synopsis: "",
      genre: "",
      style: "",
      script: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await addDoc(collection(db, "chapters"), {
      userId: uid,
      storyId: storyRef.id,
      title: "Chapter One",
      content: "",
      position: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await qc.invalidateQueries({ queryKey: ["stories"] });
    navigate({ to: "/stories/$id", params: { id: storyRef.id } });
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const activeUid = auth.currentUser?.uid ?? uid;
    if (!activeUid) {
      toast.error("Please sign in to import stories.");
      return;
    }
    setImporting(true);
    const toastId = toast.loading(`Importing ${file.name}…`);
    try {
      const parsed = await parseImportFile(file);

      // Create story
      const storyRef = await addDoc(collection(db, "stories"), {
        userId: activeUid,
        title: parsed.title,
        logline: "",
        synopsis: "",
        genre: "",
        style: "",
        script: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Create chapters
      for (let i = 0; i < parsed.chapters.length; i++) {
        const ch = parsed.chapters[i]!;
        await addDoc(collection(db, "chapters"), {
          userId: activeUid,
          storyId: storyRef.id,
          title: ch.title,
          content: ch.content,
          position: i,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      toast.success(
        `Imported "${parsed.title}" with ${parsed.chapters.length} chapter${parsed.chapters.length === 1 ? "" : "s"}!`,
        { id: toastId },
      );
      await qc.invalidateQueries({ queryKey: ["stories"] });
      navigate({ to: "/stories/$id", params: { id: storyRef.id } });
    } catch (err) {
      toast.error((err as Error).message || "Import failed.", { id: toastId });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this story and everything in it?")) return;
    await deleteDoc(doc(db, "stories", id));
    await qc.invalidateQueries({ queryKey: ["stories"] });
  }

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await signOut(auth);
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-6 py-8">
      <header className="flex items-center justify-between border-b rule-ink pb-6">
        <Link to="/" className="font-display text-2xl font-extrabold">
          Inkwell
        </Link>
        <div className="flex items-center gap-3">
          {currentUser && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground mr-1">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || "Avatar"}
                  className="h-6 w-6 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="h-6 w-6 rounded-full bg-sepia/20 text-sepia font-semibold flex items-center justify-center text-[10px]">
                  {(currentUser.displayName || currentUser.email || "W")[0]?.toUpperCase()}
                </div>
              )}
              <span className="max-w-[150px] truncate font-medium text-foreground/80">
                {currentUser.displayName || currentUser.email}
              </span>
            </div>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link to="/settings">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>
      <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold">Your stories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Write, outline, and storyboard your narratives.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            accept=".pdf,.txt,text/plain,application/pdf"
            className="hidden"
            id="import-story-file"
          />
          <Button
            variant="outline"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp className="mr-2 h-4 w-4" />
            {importing ? "Importing…" : "Import (.pdf, .txt)"}
          </Button>
          <Button onClick={create}>
            <Plus className="mr-2 h-4 w-4" />
            New story
          </Button>
        </div>
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && <p className="text-muted-foreground">Loading…</p>}
        {!isLoading && stories.length === 0 && (
          <p className="font-serif text-lg text-muted-foreground">
            An empty shelf. Start your first story.
          </p>
        )}
        {stories.map((s) => (
          <div
            key={s.id}
            className="page group relative rounded-md p-6 transition-transform hover:-translate-y-0.5"
          >
            <Link to="/stories/$id" params={{ id: s.id }} className="block">
              <p className="font-mono text-xs uppercase tracking-widest text-sepia">
                {s.genre || "Story"}
              </p>
              <h2 className="mt-2 text-2xl font-semibold">{s.title}</h2>
              <p className="mt-2 line-clamp-3 font-serif text-muted-foreground">
                {s.logline || "No logline yet."}
              </p>
            </Link>
            <button
              aria-label="Delete story"
              onClick={() => remove(s.id)}
              className="absolute right-3 top-3 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
