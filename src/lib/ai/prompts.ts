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
  | "logline"
  | "cinematography";

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
          "You are a master Hollywood screenwriter. Convert prose into an industry-standard screenplay strictly adhering to standard Courier monospaced column indentation:\n\n" +
          "EXACT SCREENPLAY FORMATTING & COLUMN INDENTATION RULES:\n" +
          "1. SCENE HEADINGS (Sluglines): 0 spaces indent (flush left), ALL CAPS (e.g. 'EXT. COFFEE PLACE - DAY' or 'INT. APARTMENT - NIGHT'). Preceded by a blank line.\n" +
          "2. ACTION / SCENE DESCRIPTIONS: 0 spaces indent (flush left), visual present tense. Wrap lines at ~58-60 characters wide.\n" +
          "3. CHARACTER CUES / NAMES: Exactly 24 spaces indent from left margin, ALL CAPS on their own line (e.g. '                        TARUN' or '                        AARADHYA (CONT\\'D)').\n" +
          "4. PARENTHETICALS: Exactly 16 spaces indent from left margin, inside parentheses, max 28 characters wide (e.g. '                (Talking to himself.)' or '                (with a little chuckle)').\n" +
          "5. SPOKEN DIALOGUE: Exactly 10 spaces indent from left margin, wrapped to ~34-36 characters wide per line (e.g. '          Excuse me sir. How can i help you?'). Form a clean spoken column under the character name.\n" +
          "6. TRANSITIONS: Indented ~44 spaces (e.g. '                                            CUT TO:').\n" +
          "7. END OF SCRIPT: Indented 24 spaces: '                        The END'.\n" +
          "8. Output ONLY the plain text screenplay with exact column spaces. Do NOT use markdown code blocks, asterisks, bolding, hashes, or conversational preamble.\n\n" +
          "CRITICAL EXAMPLE FORMAT:\n" +
          "EXT. COFFEE PLACE\n\n" +
          "Smrithi Aaradhya sitting at a table looking blank deeply into\n" +
          "the sunset skies, like she is lost into a cosmic universe.\n\n" +
          "                        WAITER\n" +
          "          Excuse me sir. How can i help you?\n\n" +
          "                        TARUN\n" +
          "          Table no 18\n\n" +
          "                        TARUN (CONT'D)\n" +
          "                (Talking to himself.)\n" +
          "          Right kada.\n\n" +
          "Tarun takes out foldable blind support stick from his pocket\n" +
          "and glassed from his shirt and wears it.\n\n" +
          "CRITICAL COMPLETION REQUIREMENT: Adapt the ENTIRE provided story/chapter completely from beginning to climax and resolution without truncating or stopping prematurely." +
          bible,
        input: `Adapt the complete story/chapter below into a screenplay strictly adhering to the exact 24-space character, 16-space parenthetical, 10-space dialogue, and 0-space action/slugline indentation layout:\n\n${r.text.slice(0, 100000)}`,
      };
    case "scenes":
      return {
        instructions:
          `${BASE} You break stories into visual storyboard frames for production and pitch decks.\n\n` +
          `CRITICAL FORMAT REQUIREMENT:\n` +
          `Output each scene on a single line separated by double pipes ( || ). Do NOT output code fences, markdown tables, preambles, or numbered lists.\n\n` +
          `Exact line format:\n` +
          `HEADING || visual description of key frame || LIGHTING (day, night, cloudy, rainy, golden_hour, or interior) || LOCATION (concrete real-world filming place) || PROPS (comma separated props) || CAST (comma separated characters) || FRAMING (e.g. Close-Up (CU), Wide Shot (WS), Medium Shot (MS), Over-the-Shoulder (OTS)) || CAMERA_ANGLE (e.g. Eye-Level, Low Angle, High Angle, Dutch Angle) || MOVEMENT (e.g. Push-In, Static, Tracking, Handheld)\n\n` +
          `Example lines:\n` +
          `EXT. CLIFFTOP - SUNSET || Protagonist stands at rocky edge staring into the raging ocean || golden_hour || Goa (Vagator Cliffs) || Leather satchel, brass compass || Maya, Julian || Wide Shot (WS) || Low Angle || Push-In / Dolly In\n` +
          `INT. DILAPIDATED STUDY - NIGHT || Candlelight flickers as dust-covered manuscripts are uncovered || night || Chettinad Mansion || Oil lamp, wax seals, ancient ledger || Julian || Close-Up (CU) || Eye-Level || Handheld\n\n` +
          `Break the narrative into between 6 and 12 dramatic cinematic scenes covering the story from opening to climax.` +
          bible,
        input: `Story to break into visual scenes:\n\n${r.text.slice(0, 40000)}`,
      };
    case "cinematography": {
      const sample = sampleTextForBible(r.text, 25000);
      return {
        instructions:
          "You are an elite Hollywood Director of Photography (DoP) and Master Cinematographer (in the tradition of Roger Deakins, Hoyte van Hoytema, and Emmanuel Lubezki). Your task is to analyze the provided storyboard scenes or screenplay and design a professional cinematography shot list with expert camera angles, shot framing, camera movement, lens choices, and director's visual intent.\n\n" +
          "RULES FOR CINEMATOGRAPHY ANALYSIS:\n" +
          "1. For EVERY scene, determine the optimal cinematic choices that amplify emotional subtext and dramatic tension:\n" +
          "   - 'framing': Specific shot size (e.g. 'Extreme Close-Up (ECU)', 'Close-Up (CU)', 'Medium Close-Up (MCU)', 'Medium Shot (MS)', 'Full Shot (FS)', 'Wide Shot (WS)', 'Extreme Wide Shot (EWS)', 'Over-the-Shoulder (OTS)', 'Point-of-View (POV)', 'Cowboy Shot').\n" +
          "   - 'cameraAngle': Camera angle relative to subject (e.g. 'Eye-Level', 'Low Angle', 'High Angle', 'Dutch Angle (Canted)', 'Overhead / Bird\'s Eye', 'Worm\'s Eye', 'Ground Level').\n" +
          "   - 'movement': Camera movement dynamic (e.g. 'Static', 'Push-In / Dolly In', 'Pull-Out / Dolly Out', 'Tracking / Steadicam', 'Handheld', 'Pan / Tilt', 'Whip Pan', 'Crane / Jib').\n" +
          "   - 'focalLength': Recommended focal length (e.g. '24mm Ultra-Wide', '35mm Wide-Standard', '50mm Natural', '85mm Portrait', '135mm Telephoto').\n" +
          "   - 'directorNotes': Concise 1-2 sentence director's note explaining the visual philosophy and emotional psychology behind these shot choices (why this angle/framing enhances the narrative beat).\n" +
          "   - 'lightingAtmosphere': 3-5 word cinematography lighting atmosphere (e.g. 'Chiaroscuro Noir Shadows', 'Soft Diffused Golden Window Light', 'Neon Night Wet Reflection', 'Overcast Cool Atmospheric').\n" +
          "2. Output ONLY a valid JSON object matching the requested schema. No code fences, no markdown formatting, no preamble, no text outside the JSON.",
        input: `Analyze the following scenes/story and provide a cinematography shot list with camera angles and framing for each scene:\n\n${sample}
\nOutput a JSON object with this exact schema:
{
  "visualStyle": "Overarching visual and cinematography philosophy for this story (e.g. Fincher-esque clinical precision with slow creeping push-ins, or Deakins naturalistic poetic lighting)",
  "scenes": [
    {
      "sceneNumber": 1,
      "heading": "Scene heading",
      "framing": "Close-Up (CU)",
      "cameraAngle": "Low Angle",
      "movement": "Push-In / Dolly In",
      "focalLength": "85mm Portrait",
      "lightingAtmosphere": "High-contrast chiaroscuro with deep shadows",
      "directorNotes": "Low angle establishes the protagonist's impending dominance while the slow push-in tightens psychological claustrophobia as the realization dawns."
    }
  ]
}`,
      };
    }
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

function canonicalLighting(heading: string, description: string, rawLighting: string): string {
  const fullText = `${heading} ${description} ${rawLighting}`.toLowerCase();
  if (["day", "night", "cloudy", "rainy", "golden_hour", "interior"].includes(rawLighting)) {
    return rawLighting;
  }
  if (fullText.includes("rain") || fullText.includes("storm") || fullText.includes("downpour") || rawLighting.includes("rain")) {
    return "rainy";
  }
  if (fullText.includes("cloud") || fullText.includes("overcast") || fullText.includes("fog") || fullText.includes("mist") || rawLighting.includes("cloud")) {
    return "cloudy";
  }
  if (fullText.includes("golden hour") || fullText.includes("golden_hour") || fullText.includes("sunset") || fullText.includes("sunrise") || fullText.includes("dawn") || rawLighting.includes("golden")) {
    return "golden_hour";
  }
  if (fullText.includes("night") || fullText.includes("dusk") || fullText.includes("midnight") || fullText.includes("moon") || fullText.includes("dark") || fullText.includes("evening") || rawLighting.includes("night")) {
    return "night";
  }
  if (rawLighting.includes("interior") || rawLighting.includes("indoor") || fullText.includes("interior") || heading.toLowerCase().startsWith("int.")) {
    return "interior";
  }
  return "day";
}

export function parseScenes(text: string) {
  if (!text || !text.trim()) return [];

  const cleanText = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  // 1. Check if model returned JSON
  try {
    const jsonMatch =
      cleanText.match(/\[\s*\{[\s\S]*\}\s*\]/) || cleanText.match(/\{\s*"scenes"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const list = Array.isArray(parsed) ? parsed : parsed.scenes || parsed.frames || [];
      if (Array.isArray(list) && list.length > 0) {
        return list
          .map((item: any, idx: number) => {
            const heading = (item.heading || item.scene || item.title || `Scene ${idx + 1}`).trim();
            const description = (item.description || item.visual || item.action || "").trim();
            const rawLighting = (item.lighting || "").toLowerCase().trim();
            const location = (item.location || item.place || heading).trim();
            const props = Array.isArray(item.props) ? item.props.join(", ") : (item.props || "");
            const cast = Array.isArray(item.cast) ? item.cast.join(", ") : (item.cast || "");
            const framing = (item.framing || item.shot || "").trim();
            const camera_angle = (item.camera_angle || item.cameraAngle || item.angle || "").trim();
            const movement = (item.movement || item.motion || "").trim();
            const lighting = canonicalLighting(heading, description, rawLighting);
            return { heading, description, lighting, location, props, cast, framing, camera_angle, movement };
          })
          .filter((s: any) => s.heading && s.description);
      }
    }
  } catch {
    /* continue to text parsers */
  }

  const lines = cleanText.split("\n").map((l) => l.trim()).filter(Boolean);
  const results: {
    heading: string;
    description: string;
    lighting: string;
    location: string;
    props: string;
    cast: string;
    framing?: string;
    camera_angle?: string;
    movement?: string;
  }[] = [];

  for (const line of lines) {
    // Skip markdown table separators and headers
    if (/^\|?\s*[-:]+[-|\s:]*$/.test(line)) continue;
    if (/^\|\s*(?:Heading|Scene|Number|Frame|#)\s*\|/i.test(line)) continue;

    let parts: string[] = [];

    // Format A: Double pipes ( || )
    if (line.includes("||")) {
      parts = line.split("||").map((p) => p.trim());
    }
    // Format B: Single pipe or markdown table row ( | )
    else if ((line.match(/\|/g) || []).length >= 2) {
      parts = line
        .split("|")
        .map((p) => p.trim())
        .filter((p, i, arr) => !(i === 0 && p === "") && !(i === arr.length - 1 && p === ""));
    }

    if (parts.length >= 2) {
      const heading = (parts[0] ?? "").replace(/^[-*#\d.\s]+/, "").trim();
      const description = parts[1] ?? "";
      if (heading && description) {
        const rawLighting = parts[2] ? parts[2].toLowerCase().trim() : "";
        let location = parts[3] ?? "";
        const props = parts[4] ?? "";
        const cast = parts[5] ?? "";
        const framing = parts[6] ? parts[6].trim() : "";
        const camera_angle = parts[7] ? parts[7].trim() : "";
        const movement = parts[8] ? parts[8].trim() : "";
        const lighting = canonicalLighting(heading, description, rawLighting);

        if (!location) {
          const headingMatch = heading.match(/(?:INT\.|EXT\.|INT\/EXT\.)\s+([^-–—]+)/i);
          location = headingMatch && headingMatch[1] ? headingMatch[1].trim() : heading;
        }

        results.push({
          heading,
          description,
          lighting,
          location,
          props,
          cast,
          framing,
          camera_angle,
          movement,
        });
        continue;
      }
    }

    // Format C: Scene headings with dash or colon, e.g. "INT. ROOM - DAY: Julian discovers the hidden map..."
    const colonMatch = line.match(
      /^(?:(?:\d+\.|\*|-|Scene\s+\d+:?)\s*)?((?:INT\.|EXT\.|INT\/EXT\.)[^-–—:\n]+(?:-[^-–—:\n]+)?)\s*[:–—]\s*(.+)$/i,
    );
    if (colonMatch && colonMatch[1] && colonMatch[2]) {
      const heading = colonMatch[1].replace(/^[-*#\d.\s]+/, "").trim();
      const description = colonMatch[2].trim();
      const lighting = canonicalLighting(heading, description, "");
      const headingMatch = heading.match(/(?:INT\.|EXT\.|INT\/EXT\.)\s+([^-–—]+)/i);
      const location = headingMatch && headingMatch[1] ? headingMatch[1].trim() : heading;
      results.push({
        heading,
        description,
        lighting,
        location,
        props: "",
        cast: "",
      });
      continue;
    }

    // Format D: Numbered scenes, e.g. "1. The Clifftop Confrontation: Julian watches the storm brew..."
    const numberedMatch = line.match(
      /^(?:\d+\.|\bScene\s+\d+:?)\s+([^:–—\n]{3,60})\s*[:–—]\s*(.{10,})$/i,
    );
    if (numberedMatch && numberedMatch[1] && numberedMatch[2]) {
      const heading = numberedMatch[1].trim();
      const description = numberedMatch[2].trim();
      const lighting = canonicalLighting(heading, description, "");
      results.push({
        heading,
        description,
        lighting,
        location: heading,
        props: "",
        cast: "",
      });
      continue;
    }
  }

  // Format E: Multi-line paragraph blocks fallback
  if (results.length === 0) {
    const blocks = cleanText.split(/\n\s*\n+/);
    for (const block of blocks) {
      const blockLines = block.split("\n").map((b) => b.trim()).filter(Boolean);
      if (blockLines.length >= 2) {
        const firstLine = blockLines[0]!.replace(/^[-*#\d.\s]+/, "").trim();
        const remaining = blockLines.slice(1).join(" ").trim();
        if (firstLine.length < 100 && remaining.length > 15) {
          results.push({
            heading: firstLine,
            description: remaining,
            lighting: canonicalLighting(firstLine, remaining, ""),
            location: firstLine,
            props: "",
            cast: "",
          });
        }
      }
    }
  }

  return results;
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

export type CinematographyShot = {
  sceneNumber?: number;
  heading?: string;
  framing: string;
  cameraAngle: string;
  movement?: string;
  focalLength?: string;
  lightingAtmosphere?: string;
  directorNotes?: string;
};

export type CinematographyAnalysis = {
  visualStyle?: string;
  scenes: CinematographyShot[];
};

export function parseCinematographyAnalysis(text: string): CinematographyAnalysis {
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
    const visualStyle =
      typeof parsed.visualStyle === "string" && parsed.visualStyle.trim()
        ? parsed.visualStyle.trim()
        : "Cinematic, atmosphere-driven visual direction with purposeful camera movement and expressive framing.";

    const rawList = Array.isArray(parsed.scenes)
      ? parsed.scenes
      : Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.shots)
          ? parsed.shots
          : [];

    const scenes: CinematographyShot[] = rawList.map((item: any, idx: number) => {
      const heading = (item.heading || item.scene || `Scene ${idx + 1}`).trim();
      const framing = (item.framing || item.shotSize || item.shot || "Medium Shot (MS)").trim();
      const cameraAngle = (item.cameraAngle || item.angle || item.camera_angle || "Eye-Level").trim();
      const movement = (item.movement || item.cameraMovement || item.motion || "Static").trim();
      const focalLength = (item.focalLength || item.lens || "50mm Natural").trim();
      const lightingAtmosphere = (item.lightingAtmosphere || item.lighting || "").trim();
      const directorNotes = (item.directorNotes || item.notes || item.rationale || item.description || "").trim();

      return {
        sceneNumber: typeof item.sceneNumber === "number" ? item.sceneNumber : idx + 1,
        heading,
        framing,
        cameraAngle,
        movement,
        focalLength,
        lightingAtmosphere,
        directorNotes,
      };
    });

    if (scenes.length > 0) {
      return { visualStyle, scenes };
    }
  } catch {
    /* Fallback to text parsing */
  }

  // Fallback heuristic: parse line-by-line if model didn't return valid JSON
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const fallbackScenes: CinematographyShot[] = [];
  let sceneCount = 0;

  for (const line of lines) {
    if (/(?:Scene\s*\d+|Shot\s*\d+|INT\.|EXT\.)/i.test(line)) {
      sceneCount++;
      const parts = line.split(/[|:–—]/).map((p) => p.trim());
      const heading = parts[0] || `Scene ${sceneCount}`;
      const framing = parts.find((p) => /close-up|wide|medium|shot|pov|ots|cowboy/i.test(p)) || "Medium Shot (MS)";
      const cameraAngle = parts.find((p) => /angle|level|overhead|bird|worm|dutch/i.test(p)) || "Eye-Level";
      const movement = parts.find((p) => /push|pull|static|handheld|tracking|pan|tilt/i.test(p)) || "Static";
      const directorNotes = parts.length > 2 ? parts[parts.length - 1] : "";

      fallbackScenes.push({
        sceneNumber: sceneCount,
        heading,
        framing,
        cameraAngle,
        movement,
        directorNotes,
      });
    }
  }

  return {
    visualStyle: "Classic narrative cinematography with motivated framing and emotional shot compositions.",
    scenes: fallbackScenes.length > 0 ? fallbackScenes : [
      {
        sceneNumber: 1,
        heading: "Scene 1: Establishing",
        framing: "Wide Shot (WS)",
        cameraAngle: "Eye-Level",
        movement: "Slow Push-In",
        focalLength: "35mm Wide",
        directorNotes: "Establishes spatial geography and emotional tone before moving closer into the characters' inner world.",
      },
    ],
  };
}
