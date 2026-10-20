export type AiMode =
  | "draft"
  | "continue"
  | "expand"
  | "rewrite"
  | "paraphrase"
  | "script"
  | "scenes"
  | "bible";

export type AiRequest = {
  mode: AiMode;
  text: string;
  style?: string;
  instruction?: string;
  bible?: string;
  title?: string;
};

const BASE =
  "You are a skilled fiction collaborator. Output only the requested text: no preamble, no commentary, no markdown headings or bold.";

function sampleTextForBible(text: string, maxLen = 16000): string {
  if (text.length <= maxLen) return text;
  const partLen = Math.floor(maxLen / 3);
  const beginning = text.slice(0, partLen);
  const middleStart = Math.floor(text.length / 2) - Math.floor(partLen / 2);
  const middle = text.slice(middleStart, middleStart + partLen);
  const end = text.slice(-partLen);
  return `${beginning}\n\n[...narrative continues...]\n\n${middle}\n\n[...narrative continues...]\n\n${end}`;
}

export function buildPrompt(r: AiRequest): { instructions: string; input: string } {
  const style = r.style?.trim() || "literary";
  const bible = r.bible?.trim() ? `\n\nSTORY BIBLE (stay consistent with it):\n${r.bible}` : "";
  const extra = r.instruction?.trim() ? `\nExtra direction from the author: ${r.instruction}` : "";
  switch (r.mode) {
    case "draft":
      return {
        instructions: `${BASE} Write in a ${style} style.${bible}`,
        input: `Draft a new scene of about 400 words for the story "${r.title ?? ""}".${extra}\n\nStory so far (may be empty):\n${r.text.slice(-6000)}`,
      };
    case "continue":
      return {
        instructions: `${BASE} Write in a ${style} style.${bible}`,
        input: `Continue the passage seamlessly for about 250 words. Do not repeat what is written.${extra}\n\n${r.text.slice(-6000)}`,
      };
    case "expand":
      return {
        instructions: `${BASE} Write in a ${style} style.${bible}`,
        input: `Expand this passage with richer sensory detail, interiority and pacing, roughly doubling its length. Keep its events.${extra}\n\n${r.text}`,
      };
    case "rewrite":
      return {
        instructions: `${BASE}${bible}`,
        input: `Rewrite this passage in a ${style} style, keeping meaning and events.${extra}\n\n${r.text}`,
      };
    case "paraphrase":
      return {
        instructions: BASE,
        input: `Paraphrase this passage in fresh wording at a similar length, in a ${style} register.${extra}\n\n${r.text}`,
      };
    case "script":
      return {
        instructions:
          "You are a professional screenwriter. Convert prose to a screenplay in standard plain-text format: scene headings like 'INT. KITCHEN - NIGHT' in caps, action lines, CHARACTER NAMES in caps on their own line before dialogue, parentheticals in (brackets), transitions like 'CUT TO:' right-aligned is not needed. Output only screenplay text, no markdown." +
          bible,
        input: `Adapt this story into a screenplay. Start with FADE IN:\n\n${r.text.slice(0, 40000)}`,
      };
    case "scenes":
      return {
        instructions:
          "You break stories into visual scenes for a storyboard. Output one scene per line in exactly this form: HEADING || one-sentence visual description of the key frame. No numbering, no other text. Between 4 and 10 lines." +
          bible,
        input: r.text.slice(0, 40000),
      };
    case "bible": {
      const sample = sampleTextForBible(r.text);
      return {
        instructions:
          "You are an expert story analyst and literary consultant. Analyze the provided story manuscript or screenplay and extract key story elements into JSON. Output ONLY a valid JSON object matching the requested schema. No markdown formatting, no code fences, no preamble, no text outside the JSON object.",
        input: `Analyze the following story/script and output a JSON object with this exact schema:
{
  "genre": "one concise genre or subgenre (e.g. Comedy Crime Satire, Cyberpunk Noir)",
  "logline": "one single captivating sentence summarizing protagonist, conflict, and stakes",
  "synopsis": "a 2-3 paragraph summary of the overarching plot and character arcs",
  "characters": [
    { "name": "Character Name", "description": "Personality traits, backstory, role in story, relationships" }
  ],
  "places": [
    { "name": "Location Name", "description": "Atmosphere, sensory details, and narrative significance" }
  ],
  "lore": [
    { "name": "World Rule, Organization, History, or Concept", "description": "Rules of this world, backstory, cultural/political dynamics, or history" }
  ]
}

Identify all notable characters (protagonists, antagonists, supporting characters), memorable locations, and world lore.
Story content:
${sample}`,
      };
    }
  }
}

export function parseScenes(text: string) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.includes("||"))
    .map((l) => {
      const [heading, ...rest] = l.split("||");
      return {
        heading: (heading ?? "").replace(/^[-*\d.\s]+/, "").trim(),
        description: rest.join("||").trim(),
      };
    })
    .filter((s) => s.heading && s.description);
}

export type ExtractedBible = {
  genre: string;
  logline: string;
  synopsis: string;
  characters: { name: string; description: string }[];
  places: { name: string; description: string }[];
  lore: { name: string; description: string }[];
};

export function parseBibleJson(text: string): ExtractedBible {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  const parsed = JSON.parse(cleaned);
  return {
    genre: typeof parsed.genre === "string" ? parsed.genre.trim() : "",
    logline: typeof parsed.logline === "string" ? parsed.logline.trim() : "",
    synopsis: typeof parsed.synopsis === "string" ? parsed.synopsis.trim() : "",
    characters: Array.isArray(parsed.characters)
      ? parsed.characters
          .filter((c: any) => c && typeof c.name === "string" && c.name.trim())
          .map((c: any) => ({
            name: String(c.name).trim(),
            description: String(c.description || "").trim(),
          }))
      : [],
    places: Array.isArray(parsed.places)
      ? parsed.places
          .filter((p: any) => p && typeof p.name === "string" && p.name.trim())
          .map((p: any) => ({
            name: String(p.name).trim(),
            description: String(p.description || "").trim(),
          }))
      : [],
    lore: Array.isArray(parsed.lore)
      ? parsed.lore
          .filter((l: any) => l && typeof l.name === "string" && l.name.trim())
          .map((l: any) => ({
            name: String(l.name).trim(),
            description: String(l.description || "").trim(),
          }))
      : [],
  };
}
