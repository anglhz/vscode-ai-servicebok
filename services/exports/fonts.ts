import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { create, type Font } from "fontkit";

const paths = {
  regular: join(process.cwd(), "assets/fonts/dejavu/DejaVuSans.ttf"),
  bold: join(process.cwd(), "assets/fonts/dejavu/DejaVuSans-Bold.ttf"),
};
const cache = new Map<string, { bytes:Buffer; font:Font }>();
export function exportFont(bold=false) {
  const path = bold ? paths.bold : paths.regular;
  const cached = cache.get(path);
  if (cached) return cached;
  const bytes = readFileSync(path), font = create(bytes);
  if (!("glyphsForString" in font)) throw new Error("Invalid export font");
  const result = {bytes,font}; cache.set(path,result);
  return result;
}

export function pdfText(value:string) {
  // Preserve punctuation and joining controls (ZWJ/ZWNJ). Strip injected bidi
  // overrides and nonprinting controls, never replace linguistic text with '?'.
  return value.normalize("NFC").replace(/\r\n?/g,"\n").replace(/\t/g," ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200b\u200e\u200f\u202a-\u202e\u2066-\u206f\ufeff]/g,"");
}

export function assertGlyphCoverage(value:string,bold=false) {
  const {font} = exportFont(bold);
  for (const char of value) {
    if (/^[\n\u200c\u200d\ufe0e\ufe0f]$/.test(char)) continue;
    if (!font.hasGlyphForCodePoint(char.codePointAt(0)!)) {
      // Fail closed rather than deliver a report with silently missing user data.
      // No user text is included in the error or logs.
      throw new Error("PDF font does not support all supplied characters");
    }
  }
}
