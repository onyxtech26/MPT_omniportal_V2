// Outlet codes seen across the real POS exports. The list a given report
// actually contains varies by file (e.g. HQ appears in 2025, MIL only from
// 2026) — the backend validates the selection against the uploaded data and
// reports any outlet it had to skip.
export const ALL_OUTLETS = [
  'AM', 'CS', 'GPL', 'HQ', 'JCI', 'JKL', 'KLT', 'KMT',
  'MFW', 'MIL', 'MRT', 'SAT', 'TBT', 'TSB', 'WZ',
];

// The six main branches the manager reports on — same order as the agenda
// template rows (TARGET_BRANCHES in backend/agenda/engine.py).
export const DEFAULT_OUTLETS = ['JCI', 'KMT', 'GPL', 'MRT', 'MFW', 'SAT'];

// The Meeting Agenda template physically has six branch slots (rows 6–17).
export const AGENDA_SLOTS = 6;
