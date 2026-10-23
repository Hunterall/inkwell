export type AiMode =
  | "draft"
  | "continue"
  | "expand"
  | "rewrite"
  | "paraphrase"
  | "script"
  | "scenes"
  | "bible"
  | "locations"
  | "logline";

export type AiRequest = {
  mode: AiMode;
  text: string;
  style?: string | undefined;
  instruction?: string | undefined;
  bible?: string | undefined;
  title?: string | undefined;
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
          "You are a professional screenwriter. Convert prose to a screenplay in standard plain-text format: scene headings like 'INT. KITCHEN - NIGHT' in caps, action lines, CHARACTER NAMES in caps on their own line before dialogue, parentheticals in (brackets), transitions like 'CUT TO:' right-aligned is not needed. Output only screenplay text, no markdown. Crucial requirement: Adapt the ENTIRE provided story/chapter completely from beginning to climax and ending without cutting off prematurely or omitting scenes." +
          bible,
        input: `Adapt the complete story/chapter below into a screenplay. Ensure all key scenes and dialogue are adapted through to the end:\n\n${r.text.slice(0, 100000)}`,
      };
    case "scenes":
      return {
        instructions:
          "You break stories into visual storyboard frames for production and pitch decks. Output one scene per line in exactly this form: HEADING || visual description of key frame || LIGHTING (day, night, cloudy, rainy, golden_hour, or interior) || LOCATION (suggest a concrete real-world filming place tailored for the scene setting, e.g. for a beach scene suggest 'Goa (Palolem)' or 'Gokarna'; for mountains suggest 'Manali' or 'Munnar'; for palace suggest 'Udaipur City Palace'; or specific landmark/city) || PROPS (comma separated key props) || CAST (comma separated characters present). No numbering or extra text. Between 5 and 12 lines." +
          bible,
        input: r.text.slice(0, 40000),
      };
    case "locations": {
      const sample = sampleTextForBible(r.text);
      return {
        instructions:
          "You are an expert film location scout and production designer. Your job is to analyze the provided story or screenplay scene-by-scene, identify each distinct scene and environmental setting, and suggest SPECIFIC, AUTHENTIC REAL-WORLD filming places and destinations tailored to each scene's visual and dramatic requirements.\n\n" +
          "CRITICAL RULES FOR REAL-WORLD LOCATION SCOUTING:\n" +
          "1. NEVER suggest vague, generic, or fictional set names (do NOT say 'Spooky Manor', 'Mystic Forest', 'Sunny Beach').\n" +
          "2. ALWAYS suggest real-world geographical destinations and specific places:\n" +
          "   - For Beach / Coastal scenes: Analyze the scene and suggest famous real-world beaches and coastal destinations like Goa (Palolem Beach, Vagator Cliffs), Gokarna (Om Beach, Kudle Beach), Udupi (Kapu Beach Lighthouse, Malpe Beach), or Varkala.\n" +
          "   - For Mountain / Hill Station / Valley scenes: Suggest real mountain destinations like Manali (Solang Valley), Munnar (Top Station), Leh-Ladakh, Ooty, or Kashmir (Gulmarg).\n" +
          "   - For Heritage Palace / Fort scenes: Suggest real royal heritage locations like Udaipur (City Palace), Jaipur (Amer Fort), Mysore Palace, or Chettinad Mansions.\n" +
          "   - For Coffee/Tea Plantation / Rainforest scenes: Suggest real places like Coorg (Madikeri), Chikmagalur, Wayanad, or Valparai.\n" +
          "   - For River / Backwater scenes: Suggest Alappuzha (Alleppey), Kumarakom, Varanasi Ghats, or Rishikesh.\n" +
          "   - For Urban / Alley / Skyline scenes: Suggest real city districts (e.g. Mumbai Marine Drive / Fort, Old Delhi Chandni Chowk, Bangalore MG Road, London Soho, NYC Brooklyn).\n" +
          "   - If the script is explicitly set internationally, provide real-world places fitting that setting or offer top regional/international options.\n" +
          "3. For every scene, provide a list of 2 to 4 real-world alternative destinations (e.g. Goa, Gokarna, Udupi) in `suggestedPlaces`, plus one top `recommendedPlace`.\n" +
          "4. Detail the atmospheric visual fit (why this place matches the scene's emotional tone, cinematography, lighting) and practical production notes (accessibility, permits, golden hour, audio/crowd considerations).\n" +
          "5. Output ONLY a valid JSON object matching the requested schema. No markdown formatting, no code fences, no preamble, no text outside the JSON object.",
        input: `Analyze the following story/script "${r.title || ""}" scene-by-scene and scout real-world filming places for each scene.

Output a JSON object with this exact schema:
{
  "genre": "Story genre / tone",
  "locations": [
    {
      "scene": "Exact scene heading or scene name from the story (e.g. 'EXT. BEACH - SUNSET' or 'Scene 3: Beach Confrontation')",
      "sceneType": "Setting category (e.g. 'Beach / Coastal', 'Hill Station / Mountain Valley', 'Heritage Palace / Fort', 'Coffee Plantation / Rainforest')",
      "suggestedPlaces": [
        "Goa (Palolem Beach & Vagator Cliffs)",
        "Gokarna (Om Beach & Kudle Beach)",
        "Udupi (Kapu Beach Lighthouse & Malpe Beach)"
      ],
      "recommendedPlace": "Goa (Palolem Beach)",
      "name": "Goa (Palolem Beach)",
      "description": "Rich atmospheric description detailing why these real-world places fit the scene visually, sensory elements (sounds of breaking surf, golden sunset lighting, rocky headlands), mood, and emotional resonance.",
      "productionNotes": "Practical filming logistics (e.g. Best filming season Oct-Feb; quiet stretch available for sound recording; permits needed; drone-friendly)."
    }
  ]
}

Story text:
${sample}`,
      };
    }
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
    case "logline": {
      const sample = sampleTextForBible(r.text, 12000);
      const current = r.instruction?.trim()
        ? `\nCurrent or previous logline that needs improvement / refresh:\n"${r.instruction}"\n`
        : "";
      return {
        instructions:
          "You are an elite Hollywood script doctor, developmental book editor, and logline specialist. Your task is to craft irresistible, high-concept loglines that instantly hook producers, publishers, and audiences.\n\n" +
          "RULES FOR CRAFTING EXCEPTIONAL LOGLINES:\n" +
          "1. A great logline must clearly convey: (a) Protagonist with an evocative trait or flaw, (b) Inciting incident / premise, (c) Core dramatic goal & formidable antagonist / obstacle, (d) High stakes (what catastrophic consequence happens if they fail).\n" +
          "2. Avoid tired clichés ('must fight for survival', 'embarks on a journey', 'things take a dark turn'). Use active, visceral, suspenseful verbs and vivid phrasing.\n" +
          "3. Keep each logline concise and impactful (1–2 sentences, roughly 25–45 words).\n" +
          "4. Provide 4 distinct stylistic angles:\n" +
          "   - 'High-Concept Hook': Highlights the unique premise, irony, or dramatic twist.\n" +
          "   - 'Character & Conflict': Focuses on the protagonist's internal struggle and personal stakes.\n" +
          "   - 'High-Stakes Thriller': Emphasizes urgency, ticking clock, and catastrophic consequence.\n" +
          "   - 'Punchy & Iconic': Ultra-crisp, memorable, pitch-ready punchline.\n" +
          "5. Output ONLY a valid JSON object matching the requested schema. No markdown code fences, no commentary, no text outside the JSON.",
        input: `Analyze the following story/script "${r.title || ""}" and craft 4 fresh, compelling, distinct logline options.${current}

Output a JSON object with this exact schema:
{
  "recommended": "The single strongest, most captivating logline sentence",
  "options": [
    {
      "angle": "High-Concept Hook",
      "text": "Captivating logline sentence..."
    },
    {
      "angle": "Character & Conflict",
      "text": "Captivating logline sentence..."
    },
    {
      "angle": "High-Stakes Thriller",
      "text": "Captivating logline sentence..."
    },
    {
      "angle": "Punchy & Iconic",
      "text": "Captivating logline sentence..."
    }
  ]
}

Story text:
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
      const parts = l.split("||").map((p) => p.trim());
      const heading = (parts[0] ?? "").replace(/^[-*\d.\s]+/, "").trim();
      const description = parts[1] ?? "";
      const rawLighting = parts[2] ? parts[2].toLowerCase().trim() : "";
      let location = parts[3] ?? "";
      const props = parts[4] ?? "";
      const cast = parts[5] ?? "";

      // Robust canonical lighting classification
      const fullText = `${heading} ${description} ${rawLighting}`.toLowerCase();
      let lighting = "day";
      if (["day", "night", "cloudy", "rainy", "golden_hour", "interior"].includes(rawLighting)) {
        lighting = rawLighting;
      } else if (fullText.includes("rain") || fullText.includes("storm") || fullText.includes("downpour") || rawLighting.includes("rain")) {
        lighting = "rainy";
      } else if (fullText.includes("cloud") || fullText.includes("overcast") || fullText.includes("fog") || fullText.includes("mist") || rawLighting.includes("cloud")) {
        lighting = "cloudy";
      } else if (fullText.includes("golden hour") || fullText.includes("golden_hour") || fullText.includes("sunset") || fullText.includes("sunrise") || fullText.includes("dawn") || rawLighting.includes("golden")) {
        lighting = "golden_hour";
      } else if (fullText.includes("night") || fullText.includes("dusk") || fullText.includes("midnight") || fullText.includes("moon") || fullText.includes("dark") || fullText.includes("evening") || rawLighting.includes("night")) {
        lighting = "night";
      } else if (rawLighting.includes("day") || fullText.includes("day") || fullText.includes("morning") || fullText.includes("afternoon")) {
        lighting = "day";
      } else if (rawLighting.includes("interior") || rawLighting.includes("indoor") || fullText.includes("interior") || heading.toLowerCase().startsWith("int.")) {
        lighting = "interior";
      } else {
        lighting = "day";
      }

      if (!location) {
        // e.g. "INT. KITCHEN - DAY" or "EXT. ROOFTOP - NIGHT"
        const headingMatch = heading.match(/(?:INT\.|EXT\.|INT\/EXT\.)\s+([^-–—]+)/i);
        if (headingMatch && headingMatch[1]) {
          location = headingMatch[1].trim();
        } else {
          location = heading;
        }
      }

      return {
        heading,
        description,
        lighting,
        location,
        props,
        cast,
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

export type SuggestedLocation = {
  id?: string | undefined;
  name: string;
  scene: string;
  sceneType?: string | undefined;
  suggestedPlaces: string[];
  recommendedPlace: string;
  selectedPlace?: string | undefined;
  description: string;
  productionNotes?: string | undefined;
  selected?: boolean | undefined;
};

export type SuggestedLocationsResult = {
  genre: string;
  locations: SuggestedLocation[];
};

export function parseSuggestedLocations(text: string): SuggestedLocationsResult {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    const rawLocations = Array.isArray(parsed.locations)
      ? parsed.locations
      : Array.isArray(parsed.places)
        ? parsed.places
        : [];

    const locations: SuggestedLocation[] = rawLocations
      .filter((loc: any) => loc && typeof loc === "object")
      .map((loc: any) => {
        const scene = String(
          loc.scene || loc.sceneHeading || loc.heading || loc.sceneType || "Scene",
        ).trim();
        const sceneType =
          typeof loc.sceneType === "string" && loc.sceneType.trim()
            ? loc.sceneType.trim()
            : undefined;

        let suggestedPlaces: string[] = [];
        if (Array.isArray(loc.suggestedPlaces)) {
          suggestedPlaces = loc.suggestedPlaces
            .map((p: any) => String(p).trim())
            .filter(Boolean);
        } else if (typeof loc.suggestedPlaces === "string" && loc.suggestedPlaces.trim()) {
          suggestedPlaces = loc.suggestedPlaces
            .split(/[,;\n]+/)
            .map((p: string) => p.trim())
            .filter(Boolean);
        } else if (Array.isArray(loc.places)) {
          suggestedPlaces = loc.places
            .map((p: any) => String(p).trim())
            .filter(Boolean);
        }

        const recommendedPlace = String(
          loc.recommendedPlace ||
            loc.topPlace ||
            loc.primaryPlace ||
            suggestedPlaces[0] ||
            loc.name ||
            "",
        ).trim();

        if (!suggestedPlaces.length && recommendedPlace) {
          suggestedPlaces = [recommendedPlace];
        }

        const name = String(
          loc.name || recommendedPlace || suggestedPlaces[0] || "Location",
        ).trim();
        const description = String(loc.description || loc.atmosphere || "").trim();
        const productionNotes =
          typeof loc.productionNotes === "string" && loc.productionNotes.trim()
            ? loc.productionNotes.trim()
            : typeof loc.filmingNotes === "string" && loc.filmingNotes.trim()
              ? loc.filmingNotes.trim()
              : undefined;

        return {
          scene: scene || "Major Scene",
          sceneType,
          suggestedPlaces,
          recommendedPlace: recommendedPlace || name,
          selectedPlace: recommendedPlace || name,
          name,
          description,
          productionNotes,
          selected: true,
        };
      })
      .filter((loc: SuggestedLocation) => loc.name || loc.suggestedPlaces.length);

    return {
      genre: typeof parsed.genre === "string" ? parsed.genre.trim() : "",
      locations,
    };
  } catch (err) {
    return {
      genre: "",
      locations: [],
    };
  }
}

export type LoglineOption = {
  angle: string;
  text: string;
};

export type LoglineResult = {
  recommended: string;
  options: LoglineOption[];
};

export function parseLoglineResult(text: string): LoglineResult {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    const recommended = typeof parsed.recommended === "string" ? parsed.recommended.trim() : "";
    let options: LoglineOption[] = [];

    if (Array.isArray(parsed.options)) {
      options = parsed.options
        .filter((o: any) => o && (typeof o.text === "string" || typeof o === "string"))
        .map((o: any) => ({
          angle: typeof o.angle === "string" && o.angle.trim() ? o.angle.trim() : "Variation",
          text: String(o.text || o).trim(),
        }))
        .filter((o: LoglineOption) => o.text);
    }

    if (!recommended && options.length > 0) {
      return {
        recommended: options[0]!.text,
        options,
      };
    }

    if (recommended && !options.some((o) => o.text === recommended)) {
      options.unshift({ angle: "Top Pick", text: recommended });
    }

    return {
      recommended: recommended || (options[0]?.text ?? ""),
      options,
    };
  } catch (err) {
    // Fallback: parse lines if model returned plain list
    const lines = cleaned
      .split("\n")
      .map((l) => l.replace(/^[-*\d.)"\s]+/, "").replace(/["\s]+$/, "").trim())
      .filter((l) => l.length > 20);

    const first = lines[0] || cleaned.replace(/^["'\s]+|["'\s]+$/g, "");
    return {
      recommended: first,
      options: lines.map((l, i) => ({ angle: `Option ${i + 1}`, text: l })),
    };
  }
}
