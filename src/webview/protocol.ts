// The messages between the extension and its two webviews, Properties and the board.
import type { Form, FieldValue } from '../core/form.ts';

export type PropertiesState = { kind: 'empty'; text: string } | { kind: 'form'; form: Form; busy: boolean };

export type PropertiesToExtension =
  | { type: 'ready' }
  | { type: 'set'; field: string; value: FieldValue }
  | { type: 'pick'; field: string }
  | { type: 'remove'; field: string; value: string }
  | { type: 'open'; id: string }
  | { type: 'newTask' }
  | { type: 'openInEidos' }
  | { type: 'openBoard' };

export interface BoardCard {
  id: string;
  title: string;
  type: string | null;
  typeColor: string | null;
  priority: string | null;
  priorityColor: string | null;
  assignees: Array<{ alias: string; initials: string; name: string }>;
  progress: { done: number; total: number } | null;
  blueprints: string[];
  blocked: boolean;
  done: boolean;
}

export interface BoardColumn {
  name: string;
  statuses: string[];
  color: string;
  cards: BoardCard[];
}

export interface BoardChoice {
  value: string;
  label: string;
}

export interface BoardState {
  project: string;
  boards: BoardChoice[];
  board: string | null;
  title: string;
  open: number;
  columns: BoardColumn[];
  search: string;
  filters: {
    milestone: { value: string | null; options: BoardChoice[] };
    assignee: { value: string | null; options: BoardChoice[] };
    type: { value: string | null; options: BoardChoice[] };
    priority: { value: string | null; options: BoardChoice[] };
    assignedToMe: boolean;
    canFilterMe: boolean;
  };
  busy: boolean;
  message: string | null;
}

export type BoardToExtension =
  | { type: 'ready' }
  | { type: 'move'; id: string; column: string }
  | { type: 'open'; id: string }
  | { type: 'newTask' }
  | { type: 'search'; text: string }
  | { type: 'filter'; name: 'milestone' | 'assignee' | 'type' | 'priority' | 'board'; value: string | null }
  | { type: 'assignedToMe'; value: boolean }
  | { type: 'refresh' };
