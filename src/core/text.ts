// Reading a file's text for what the editor features hang on: ids anywhere in
// the workspace (REQ10), and a task's checklist lines and sections (REQ6).
import type { SectionDeclaration } from './shapes.ts';

export interface IdMatch {
  id: string;
  // a requirement label after a blueprint id, `REQ6` in `B-A45 REQ6`
  requirement: string | null;
  start: number;
  end: number;
}

// A blueprint id is B- and three or more letters or digits (B-A45, B-5M5A); a task id is T-, letters or digits, and a subtask's places
const idPattern = /(?<![\w-])(B-[0-9A-Z]{3,12})(?:\s+(REQ\d+))?(?![\w-])|(?<![\w-])(T-[0-9A-Z]{1,24}(?:\.\d+)*)(?![\w-])/g;

export function findIds(line: string): IdMatch[] {
  const matches: IdMatch[] = [];
  for (const match of line.matchAll(idPattern)) {
    const start = match.index;
    const id = match[1] ?? match[3];
    if (id === undefined) continue;
    matches.push({ id, requirement: match[2] ?? null, start, end: start + match[0].length });
  }
  return matches;
}

export function idAt(line: string, character: number): IdMatch | null {
  for (const match of findIds(line)) {
    if (character >= match.start && character <= match.end) return match;
  }
  return null;
}

// The line a requirement is defined on: `- **REQ6:**`, else its first mention
export function requirementLine(text: string, requirement: string): number | null {
  const lines = text.split(/\r?\n/);
  const definition = new RegExp(`^\\s*[-*]?\\s*\\**${requirement}\\b\\**\\s*:`);
  const defined = lines.findIndex((line) => definition.test(line));
  if (defined !== -1) return defined;
  const mention = new RegExp(`\\b${requirement}\\b`);
  const mentioned = lines.findIndex((line) => mention.test(line));
  if (mentioned !== -1) return mentioned;
  return null;
}

export interface SectionPlace {
  key: string;
  title: string;
  type: string;
  // the heading's line, where a lens over the section sits
  line: number;
}

export interface ChecklistPlace {
  key: string;
  n: number;
  done: boolean;
  text: string;
  line: number;
}

const regionOpen = /^\s*<!--\s*backlog:([a-z0-9-]+)\s*-->\s*$/;
const regionClose = /^\s*<!--\s*\/backlog:([a-z0-9-]+)\s*-->\s*$/;
const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const checklistLine = /^\s*[-*]\s+\[( |x|X)\]\s+#(\d+)\b\s*(.*)$/;

// A task's sections as its type declares them, each found by its region (`<!-- backlog:<key> -->`) or, in an older file, its bare heading
export function taskLayout(text: string, sections: SectionDeclaration[]): { sections: SectionPlace[]; checklist: ChecklistPlace[] } {
  const lines = text.split(/\r?\n/);
  const byKey = new Map(sections.map((section) => [section.key, section]));
  const byTitle = new Map(sections.map((section) => [section.title.toLowerCase(), section]));
  const places: SectionPlace[] = [];
  const checklist: ChecklistPlace[] = [];

  let current: SectionDeclaration | null = null;
  let inRegion = false;
  let inFrontmatter = lines[0]?.trim() === '---';
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (inFrontmatter) {
      if (i > 0 && line.trim() === '---') inFrontmatter = false;
      continue;
    }
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const opened = regionOpen.exec(line);
    if (opened) {
      const declared = byKey.get(opened[1] ?? '');
      if (declared) {
        current = declared;
        inRegion = true;
      }
      continue;
    }
    const closed = regionClose.exec(line);
    if (closed) {
      if (inRegion && closed[1] === current?.key) {
        inRegion = false;
        current = null;
      }
      continue;
    }

    const headed = heading.exec(line);
    if (headed) {
      // a heading inside a section's region is that section's own text
      if (inRegion) continue;
      current = byTitle.get((headed[2] ?? '').toLowerCase()) ?? null;
      if (current) places.push({ key: current.key, title: current.title, type: current.type, line: i });
      continue;
    }

    const item = checklistLine.exec(line);
    if (item && current?.type === 'checklist') {
      checklist.push({ key: current.key, n: Number(item[2]), done: item[1] !== ' ', text: item[3] ?? '', line: i });
    }
  }
  return { sections: places, checklist };
}

// A text section a note is appended to: a notes section the type declares (`implementation-notes`, or any `…notes`)
export function isNotesSection(section: { key: string; type: string }): boolean {
  return section.type === 'text' && /(^|-)notes$/.test(section.key);
}
