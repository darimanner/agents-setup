#!/usr/bin/env node
// Fails when files contain typography the project bans: long dashes, curly quotes, the
// ellipsis character, minus sign and non-breaking or thin spaces. Usage: check-typography.mjs <files...>
import { readFileSync } from "node:fs";

// Code points, not literal characters, so this file passes its own check.
const BANNED = new Map([
  [0x2014, "em dash, use - or a comma"],
  [0x2013, "en dash, use -"],
  [0x2011, "non-breaking hyphen, use -"],
  [0x2012, "figure dash, use -"],
  [0x2015, "horizontal bar, use -"],
  [0x2212, "minus sign, use -"],
  [0x201c, 'curly quote, use "'],
  [0x201d, 'curly quote, use "'],
  [0x2018, "curly quote, use '"],
  [0x2019, "curly quote, use '"],
  [0x2026, "ellipsis character, use ..."],
  [0x00a0, "no-break space, use a plain space"],
  [0x202f, "narrow no-break space, use a plain space"],
  [0x2009, "thin space, use a plain space"],
]);

let failed = false;
for (const file of process.argv.slice(2)) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  text.split("\n").forEach((line, index) => {
    for (const char of line) {
      const code = char.codePointAt(0);
      if (!BANNED.has(code)) continue;
      failed = true;
      const hex = code.toString(16).toUpperCase().padStart(4, "0");
      console.error(`${file}:${index + 1}: U+${hex} ${BANNED.get(code)}`);
      return;
    }
  });
}
process.exitCode = failed ? 1 : 0;
