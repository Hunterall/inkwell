import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Settings } from "lucide-react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/integrations/firebase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WriteTab } from "@/components/story/WriteTab";
import { BibleTab } from "@/components/story/BibleTab";
import { ScriptTab } from "@/components/story/ScriptTab";
import { BoardTab } from "@/components/story/BoardTab";
import { useDebouncedSave } from "@/components/story/useDebouncedSave";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/stories_/$id")({
  head: () => ({
    meta: [
      { title: "Story workspace — Inkwell" },
      { name: "description", content: "Write, adapt and pitch your story." },
      { property: "og:title", content: "Story workspace — Inkwell" },
      { property: "og:description", content: "Write, adapt and pitch your story." },
    ],
  }),
  component: StoryPage,
});

export type Story = {
  id: string;
  userId?: string;
  title: string;
  logline: string;
  synopsis: string;
  genre: string;
  style: string;
  script: string;
};

function StoryPage() {
  const { id } = Route.useParams();
  const { data: story } = useQuery({
    queryKey: ["story", id],
    queryFn: async () => {
      const snap = await getDoc(doc(db, "stories", id));
      if (!snap.exists()) throw new Error("Story not found");
      const data = snap.data() as Partial<Story>;
      const uid = auth.currentUser?.uid;
      if (data.userId && uid && data.userId !== uid) {
        throw new Error("Access denied: You do not have permission to view this story.");
      }
      return { id: snap.id, ...data } as Story;
    },
  });

  if (!story) return <div className="p-10 text-muted-foreground">Opening notebook…</div>;
  return <Workspace story={story} />;
}

function Workspace({ story }: { story: Story }) {
  const qc = useQueryClient();
  const save = useDebouncedSave(async (patch: Partial<Story>) => {
    await updateDoc(doc(db, "stories", story.id), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
    qc.invalidateQueries({ queryKey: ["stories"] });
  });
  const update = (patch: Partial<Story>) => {
    qc.setQueryData(["story", story.id], { ...story, ...patch });
    save(patch);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex flex-1 items-center gap-4">
            <Link
              to="/stories"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Back to stories"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <Input
              value={story.title}
              onChange={(e) => update({ title: e.target.value })}
              className="h-auto border-none bg-transparent px-0 font-display text-2xl font-semibold shadow-none focus-visible:ring-0"
            />
          </div>
          <Link
            to="/settings"
            className="flex items-center text-xs text-muted-foreground hover:text-foreground"
            title="AI & OpenRouter Settings"
          >
            <Settings className="mr-1.5 h-4 w-4" />
            Settings
          </Link>
        </div>
      </header>
      <Tabs defaultValue="write" className="mx-auto max-w-7xl px-6 py-6">
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="bible">Story bible</TabsTrigger>
          <TabsTrigger value="script">Screenplay</TabsTrigger>
          <TabsTrigger value="board">Storyboard & deck</TabsTrigger>
        </TabsList>
        <TabsContent value="write" className="mt-6">
          <WriteTab story={story} update={update} />
        </TabsContent>
        <TabsContent value="bible" className="mt-6">
          <BibleTab story={story} update={update} />
        </TabsContent>
        <TabsContent value="script" className="mt-6">
          <ScriptTab story={story} update={update} />
        </TabsContent>
        <TabsContent value="board" className="mt-6">
          <BoardTab story={story} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
