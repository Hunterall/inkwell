/**
 * Utility functions for importing and parsing .txt and .pdf files
 */

export type ParsedChapter = {
  title: string;
  content: string;
};

export type ImportResult = {
  title: string;
  chapters: ParsedChapter[];
  rawText: string;
};

/**
 * Extracts plain text from a PDF file using pdfjs-dist in the browser
 */
export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjs = await import("pdfjs-dist");

  // Ensure worker is configured for browser execution
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter((s) => s.trim().length > 0);

    if (strings.length > 0) {
      pageTexts.push(strings.join(" "));
    }
  }

  return pageTexts.join("\n\n");
}

/**
 * Heuristically splits long story text into chapters based on headings,
 * or returns a single chapter if no clear division is found.
 */
export function splitIntoChapters(text: string): ParsedChapter[] {
  const clean = text.trim();
  if (!clean) return [{ title: "Chapter 1", content: "" }];

  // Look for common chapter patterns at the start of a line/paragraph
  const chapterRegex =
    /(?:^|\n\n+)(?:[#*_\s]*)(Chapter\s+[0-9IVXLCDM]+|Chapter\s+[A-Za-z]+|ACT\s+[0-9IVXLCDM]+|Scene\s+[0-9IVXLCDM]+|PROLOGUE|EPILOGUE)[^\n]*/gi;

  const matches = [...clean.matchAll(chapterRegex)];

  if (matches.length >= 2) {
    const chapters: ParsedChapter[] = [];

    // Optional text before the first detected chapter
    const firstMatch = matches[0]!;
    if (firstMatch.index! > 0) {
      const intro = clean.slice(0, firstMatch.index!).trim();
      if (intro) {
        chapters.push({ title: "Prologue", content: intro });
      }
    }

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]!;
      const rawTitle = match[0].trim().replace(/^[#*_\s]+/, "").replace(/[#*_\s]+$/, "");
      const startIndex = match.index! + match[0].length;
      const endIndex = i + 1 < matches.length ? matches[i + 1]!.index! : clean.length;
      const chapterContent = clean.slice(startIndex, endIndex).trim();

      chapters.push({
        title: rawTitle || `Chapter ${chapters.length + 1}`,
        content: chapterContent,
      });
    }

    return chapters;
  }

  // If text is very long (over 60,000 chars) and has double newlines, divide into parts
  if (clean.length > 60000) {
    const parts: ParsedChapter[] = [];
    const paragraphs = clean.split(/\n\n+/);
    let currentPart = "";
    let partIndex = 1;

    for (const p of paragraphs) {
      if ((currentPart + "\n\n" + p).length > 20000 && currentPart.trim()) {
        parts.push({
          title: `Part ${partIndex++}`,
          content: currentPart.trim(),
        });
        currentPart = p;
      } else {
        currentPart = currentPart ? `${currentPart}\n\n${p}` : p;
      }
    }
    if (currentPart.trim()) {
      parts.push({
        title: `Part ${partIndex}`,
        content: currentPart.trim(),
      });
    }
    return parts;
  }

  return [{ title: "Chapter 1", content: clean }];
}

/**
 * Extracts title and chapters from a File (.pdf or .txt)
 */
export async function parseImportFile(file: File): Promise<ImportResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const baseTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ");

  let rawText = "";
  if (ext === "pdf") {
    rawText = await extractTextFromPdf(file);
  } else if (ext === "txt") {
    rawText = await file.text();
  } else {
    throw new Error(`Unsupported file type: .${ext}. Please select a .pdf or .txt file.`);
  }

  const cleanText = rawText.trim();
  if (!cleanText) {
    throw new Error("The selected file appears to be empty or contains no readable text.");
  }

  const chapters = splitIntoChapters(cleanText);

  return {
    title: baseTitle || "Imported Story",
    chapters,
    rawText: cleanText,
  };
}
