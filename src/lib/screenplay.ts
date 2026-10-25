import { jsPDF } from "jspdf";

/**
 * Screenplay Layout Specifications (Courier 10-pitch standard):
 * - Scene Headings (Sluglines): 0 spaces indent (flush left), ALL CAPS
 * - Action / Descriptions: 0 spaces indent (flush left), wrapped to ~60 chars
 * - Character Cues: 24 spaces indent, ALL CAPS
 * - Parentheticals: 16 spaces indent, wrapped to ~28 chars
 * - Dialogue: 10 spaces indent, wrapped to ~36 chars
 * - Transitions: 44 spaces indent, ALL CAPS (e.g. CUT TO:)
 * - Script Ending: 24 spaces indent (e.g. The END)
 */

export function wrapScreenplayText(text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!word) continue;
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxWidth) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

export function isScreenplaySlugline(line: string): boolean {
  return /^(?:[0-9]+\.?\s*)?(?:INT\.|EXT\.|INT\/EXT\.|EXT\/INT\.|I\/E\.)/i.test(line.trim());
}

export function isScreenplayTransition(line: string): boolean {
  return /^(?:CUT TO:|FADE IN:|FADE OUT\.|DISSOLVE TO:|SMASH CUT:|MATCH CUT:|FADE TO BLACK\.|JUMP CUT TO:)/i.test(
    line.trim(),
  );
}

export function isScreenplayEnd(line: string): boolean {
  return /^(?:THE END|The END|FIN)$/i.test(line.trim());
}

export function isScreenplayParenthetical(line: string): boolean {
  return /^\s*\(.*?\)\s*$/.test(line.trim());
}

export function isScreenplayComment(line: string): boolean {
  return /^(?:\/\*|<!--|#|\/\/)/.test(line.trim());
}

export function isScreenplayCharacterCue(line: string, nextLine?: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (
    isScreenplaySlugline(trimmed) ||
    isScreenplayTransition(trimmed) ||
    isScreenplayParenthetical(trimmed) ||
    isScreenplayEnd(trimmed) ||
    isScreenplayComment(trimmed)
  ) {
    return false;
  }

  // Strip extension like (CONT'D), (V.O.), (O.S.)
  const base = trimmed.replace(/\s*\([A-Z0-9\s'\-._/]+\)$/i, "").trim();
  if (!base || base.length > 35 || /[.!?]$/.test(base)) return false;

  const isAllUpper = /^[A-Z0-9\s'\-._&#/]+$/.test(base) && base === base.toUpperCase();
  if (!isAllUpper) return false;

  if (nextLine !== undefined && nextLine.trim().length > 0) {
    if (isScreenplaySlugline(nextLine) || isScreenplayTransition(nextLine) || isScreenplayComment(nextLine)) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Formats any raw screenplay text into studio-standard Courier monospaced indentation:
 * - Sluglines: 0 spaces
 * - Action: 0 spaces (wrapped at 60 chars)
 * - Characters: 24 spaces
 * - Parentheticals: 16 spaces (wrapped at 28 chars)
 * - Dialogue: 10 spaces (wrapped at 36 chars)
 */
export function formatScreenplay(raw: string): string {
  if (!raw || !raw.trim()) return "";

  const rawLines = raw.split("\n");
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const l = rawLines[i]!;
    if (!l.trim()) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
    } else {
      currentBlock.push(l.trim());
    }
  }
  if (currentBlock.length > 0) blocks.push(currentBlock);

  const outputLines: string[] = [];

  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b]!;
    let idx = 0;

    while (idx < block.length) {
      const line = block[idx]!;

      // 1. Comments
      if (isScreenplayComment(line)) {
        outputLines.push(line);
        idx++;
        continue;
      }

      // 2. Sluglines (Scene Headings)
      if (isScreenplaySlugline(line)) {
        outputLines.push(line.toUpperCase());
        idx++;
        continue;
      }

      // 3. Transitions
      if (isScreenplayTransition(line)) {
        outputLines.push("                                            " + line.toUpperCase());
        idx++;
        continue;
      }

      // 4. Ending
      if (isScreenplayEnd(line)) {
        outputLines.push("                        " + line);
        idx++;
        continue;
      }

      // 5. Character Cue & following dialogue
      const nextLine = block[idx + 1];
      if (isScreenplayCharacterCue(line, nextLine)) {
        outputLines.push("                        " + line.toUpperCase());
        idx++;

        while (idx < block.length) {
          const dialLine = block[idx]!;
          if (
            isScreenplaySlugline(dialLine) ||
            isScreenplayTransition(dialLine) ||
            isScreenplayEnd(dialLine) ||
            isScreenplayComment(dialLine)
          ) {
            break;
          }
          if (isScreenplayCharacterCue(dialLine, block[idx + 1])) {
            break;
          }

          if (isScreenplayParenthetical(dialLine)) {
            const wrapped = wrapScreenplayText(dialLine, 28);
            for (const wl of wrapped) {
              outputLines.push("                " + wl);
            }
          } else {
            const wrapped = wrapScreenplayText(dialLine, 36);
            for (const wl of wrapped) {
              outputLines.push("          " + wl);
            }
          }
          idx++;
        }
        continue;
      }

      // 6. Action line
      const wrapped = wrapScreenplayText(line, 60);
      for (const wl of wrapped) {
        outputLines.push(wl);
      }
      idx++;
    }

    if (b < blocks.length - 1) {
      outputLines.push("");
    }
  }

  return outputLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export interface ExportScreenplayPdfOptions {
  title: string;
  author?: string;
  script: string;
  contact?: {
    address?: string;
    phone?: string;
    email?: string;
  };
}

/**
 * Generates and downloads a multi-page PDF formatted to standard theatrical screenplay layout:
 * - Cover page (Title, written by, author, bottom-left contact info)
 * - Monospace Courier 12pt with standard margins
 * - Top-right page numbering ("2.", "3.") starting on script page 2
 * - Orphan prevention for character cues
 */
export function exportScreenplayPdf({
  title,
  author,
  script,
  contact,
}: ExportScreenplayPdfOptions): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter", // 612 x 792 pt (standard US Letter screenplay format)
  });

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const marginLeft = 72; // 1.0 inch
  const marginRight = 72;
  const marginTop = 72;
  const marginBottom = 72;
  const lineHeight = 14.4; // standard 6 lines per inch for Courier 12

  // ------------------------------------------------------------------
  // Page 1: Cover / Title Page (Matching uploaded PDF Page 1)
  // ------------------------------------------------------------------
  doc.setFont("courier", "normal");
  doc.setFontSize(18);
  const cleanTitle = (title || "Untitled Screenplay").trim();
  doc.text(cleanTitle, W / 2, 280, { align: "center" });

  doc.setFontSize(12);
  doc.text("written by", W / 2, 330, { align: "center" });

  const cleanAuthor = (author || "Writer").trim();
  doc.text(cleanAuthor, W / 2, 370, { align: "center" });

  // Contact info block at bottom-left
  const contactLines: string[] = [];
  if (contact?.address) contactLines.push(contact.address);
  else contactLines.push("Address");

  if (contact?.phone) contactLines.push(contact.phone);
  else contactLines.push("Phone");

  if (contact?.email) contactLines.push(contact.email);
  else contactLines.push("E-mail");

  doc.setFontSize(11);
  let contactY = H - 120;
  for (const line of contactLines) {
    doc.text(line, marginLeft, contactY);
    contactY += 14;
  }

  // ------------------------------------------------------------------
  // Format screenplay body
  // ------------------------------------------------------------------
  const formatted = formatScreenplay(script);
  const scriptLines = formatted.split("\n");

  // ------------------------------------------------------------------
  // Page 2+: Script Body Pages
  // ------------------------------------------------------------------
  doc.addPage();
  doc.setFont("courier", "normal");
  doc.setFontSize(12);

  let currentY = marginTop;
  let scriptPageNum = 1; // Script page 1 (PDF page 2) is unnumbered; script page 2 (PDF page 3) gets "2."

  for (let i = 0; i < scriptLines.length; i++) {
    const line = scriptLines[i]!;

    // Check if next item is an orphaned character cue near the bottom margin
    const isCharCue = line.startsWith("                        ") && !line.includes("The END");
    const nearBottom = currentY > H - marginBottom - lineHeight * 2.5;

    if (currentY > H - marginBottom || (isCharCue && nearBottom)) {
      doc.addPage();
      scriptPageNum++;
      currentY = marginTop;

      // Header: top-right page number ("2.", "3.", etc.)
      doc.setFont("courier", "normal");
      doc.setFontSize(12);
      doc.text(`${scriptPageNum}.`, W - marginRight, 45, { align: "right" });
    }

    if (line.trim().length > 0) {
      doc.text(line, marginLeft, currentY);
    }
    currentY += lineHeight;
  }

  const safeFilename = `${(cleanTitle || "Screenplay").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
  doc.save(safeFilename);
}
