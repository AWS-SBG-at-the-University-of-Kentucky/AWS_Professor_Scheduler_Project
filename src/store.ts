import type { AuditEvent, Faculty, Identity, Preference, Section, State } from './domain';
import { assess, assignedCredits, recommendations, validatePreference } from './matching';
import { createSeed } from './seed';

export const STORAGE_KEY = 'facultyplan.demo.v1';
export class DemoError extends Error {
  constructor(message: string, public code = 'VALIDATION') { super(message); }
}
export type Command =
  | { type: 'preference'; preference: Preference }
  | { type: 'approve'; sectionId: string; facultyId: string; reason: string }
  | { type: 'remove'; assignmentId: string; reason: string }
  | { type: 'faculty'; faculty: Faculty }
  | { type: 'section'; section: Section };

// Pure command handler shared by local persistence and tests; future API handlers can use the same rules.
export function applyCommand(input: State, identity: Identity, command: Command, expectedRevision: number): State {
  if (input.revision !== expectedRevision) throw new DemoError('This view is out of date. The latest data has been loaded; review it and try again.', 'CONFLICT');
  if (command.type !== 'preference' && identity.role !== 'scheduler') throw new DemoError('Only a scheduler can perform this action.', 'FORBIDDEN');
  const state = structuredClone(input);
  const at = new Date().toISOString();
  let event: Omit<AuditEvent, 'id' | 'at' | 'actor'>;
  if (command.type === 'preference') {
    const pref = command.preference;
    if (identity.role !== 'faculty' || identity.facultyId !== pref.facultyId) throw new DemoError('You can only edit your own preferences.', 'FORBIDDEN');
    if (!state.faculty.some(f => f.id === pref.facultyId)) throw new DemoError('Faculty member not found.');
    validatePreference(pref, state);
    state.preferences = state.preferences.filter(p => p.facultyId !== pref.facultyId);
    state.preferences.push({ ...pref, updatedAt: at });
    event = { action: pref.status === 'submitted' ? 'Preferences submitted' : 'Draft saved', detail: `${state.faculty.find(f => f.id === pref.facultyId)!.name} updated teaching preferences`, facultyId: pref.facultyId };
  } else if (command.type === 'approve') {
    const candidates = recommendations(state, command.sectionId).filter(c => c.eligible);
    const selected = candidates.find(c => c.faculty.id === command.facultyId);
    if (!selected) throw new DemoError('This assignment is no longer eligible. Review the current recommendations.', 'CONFLICT');
    if (candidates[0].faculty.id !== command.facultyId && !command.reason.trim()) throw new DemoError('Add a reason for selecting a lower-ranked candidate.');
    state.assignments.push({ id: crypto.randomUUID(), sectionId: command.sectionId, facultyId: command.facultyId, reason: command.reason.trim(), approvedAt: at });
    const section = state.sections.find(s => s.id === command.sectionId)!;
    event = { action: 'Assignment approved', detail: `${selected.faculty.name} → ${section.courseId} · ${section.number}${command.reason.trim() ? ` — ${command.reason.trim()}` : ''}`, facultyId: command.facultyId };
  } else if (command.type === 'remove') {
    if (!command.reason.trim()) throw new DemoError('A removal reason is required.');
    const assignment = state.assignments.find(a => a.id === command.assignmentId);
    if (!assignment) throw new DemoError('This assignment has already been removed.', 'CONFLICT');
    state.assignments = state.assignments.filter(a => a.id !== assignment.id);
    const section = state.sections.find(s => s.id === assignment.sectionId)!;
    event = { action: 'Assignment removed', detail: `${state.faculty.find(f => f.id === assignment.facultyId)!.name} · ${section.courseId} · ${section.number} — ${command.reason.trim()}`, facultyId: assignment.facultyId };
  } else if (command.type === 'faculty') {
    const faculty = command.faculty;
    if (!state.faculty.some(f => f.id === faculty.id)) throw new DemoError('Faculty member not found.');
    if (!Number.isInteger(faculty.maxCredits) || faculty.maxCredits < 0 || faculty.maxCredits > 24) throw new DemoError('Teaching capacity must be a whole number from 0 to 24 credits.');
    if (faculty.qualified.some(id => !state.courses.some(c => c.id === id))) throw new DemoError('Unknown qualification.');
    if (assignedCredits(state, faculty.id) > faculty.maxCredits || state.assignments.some(a => a.facultyId === faculty.id && !faculty.qualified.includes(state.sections.find(s => s.id === a.sectionId)!.courseId))) throw new DemoError('Remove affected assignments before changing qualifications or reducing capacity.');
    state.faculty = state.faculty.map(f => f.id === faculty.id ? faculty : f);
    event = { action: 'Faculty updated', detail: `Qualifications and teaching capacity updated for ${faculty.name}`, facultyId: faculty.id };
  } else {
    const section = command.section;
    if (!state.sections.some(s => s.id === section.id)) throw new DemoError('Section not found.');
    if (!state.courses.some(c => c.id === section.courseId) || !section.meetings.length || !Number.isInteger(section.seats) || section.seats < 1 || section.seats > 500) throw new DemoError('Provide a course, at least one meeting, and 1–500 seats.');
    validatePreference({ facultyId: '', rankedCourses: [], availability: section.meetings, preferred: [], status: 'draft', updatedAt: at }, { ...state, assignments: [] });
    state.sections = state.sections.map(s => s.id === section.id ? section : s);
    const assigned = state.assignments.find(a => a.sectionId === section.id);
    if (assigned) {
      const without = { ...state, assignments: state.assignments.filter(a => a.id !== assigned.id) };
      const result = assess(without, section, state.faculty.find(f => f.id === assigned.facultyId)!);
      if (!result.eligible) throw new DemoError(`Remove the current assignment before this change: ${result.reasons.join('; ')}.`);
    }
    event = { action: 'Section updated', detail: `${section.courseId} · ${section.number} meeting information updated` };
  }
  state.audit.unshift({ ...event, id: crypto.randomUUID(), at, actor: identity.role === 'scheduler' ? 'Demo scheduler' : state.faculty.find(f => f.id === identity.facultyId)!.name });
  state.revision++;
  return state;
}
export interface DataAdapter {
  load(): Promise<State>;
  execute(identity: Identity, command: Command, revision: number): Promise<State>;
  reset(): Promise<State>;
}
export class LocalAdapter implements DataAdapter {
  failNext = false;
  private read(): State {
    let raw: string | null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch { throw new DemoError('Browser storage is unavailable. Allow site storage and reload.', 'STORAGE'); }
    if (!raw) return createSeed();
    try {
      const state = JSON.parse(raw) as State;
      if (state.version !== 1 || !Number.isInteger(state.revision) || !Array.isArray(state.faculty) || state.faculty.length !== 25 || !Array.isArray(state.courses) || !Array.isArray(state.sections) || !Array.isArray(state.assignments) || !Array.isArray(state.preferences) || !Array.isArray(state.audit)) throw new Error();
      return state;
    } catch { throw new DemoError('Saved demo data cannot be read. Use Reset demo to restore the synthetic dataset.', 'STORAGE'); }
  }
  private async delay() {
    await new Promise(resolve => setTimeout(resolve, 160));
    if (this.failNext) { this.failNext = false; throw new DemoError('Simulated connection failure. Nothing was saved. Please try again.', 'NETWORK'); }
  }
  async load() { await this.delay(); return this.read(); }
  async execute(identity: Identity, command: Command, revision: number) {
    await this.delay();
    if (!navigator.locks) throw new DemoError('Open this demo at localhost in a modern browser to enable safe local approvals.');
    return navigator.locks.request(STORAGE_KEY, () => {
      const state = applyCommand(this.read(), identity, command, revision);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { throw new DemoError('Browser storage is full or unavailable. Nothing was saved.', 'STORAGE'); }
      return state;
    });
  }
  async reset() {
    if (!navigator.locks) throw new DemoError('Open this demo at localhost in a modern browser.');
    return navigator.locks.request(STORAGE_KEY, () => {
      const state = createSeed();
      // Avoid revision reuse when an old review tab is still open.
      try { state.revision = this.read().revision + 1; } catch { state.revision = Date.now(); }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return state;
    });
  }
}
export function assignmentsCsv(state: State) {
  const escape = (value: string | number) => `"${String(value).replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
  const rows: (string | number)[][] = [['Section', 'Course', 'Faculty', 'Credits', 'Meetings (America/New_York)', 'Approved (UTC)', 'Reason']];
  for (const assignment of state.assignments) {
    const section = state.sections.find(s => s.id === assignment.sectionId)!;
    rows.push([`${section.courseId}-${section.number}`, state.courses.find(c => c.id === section.courseId)!.name, state.faculty.find(f => f.id === assignment.facultyId)!.name, state.courses.find(c => c.id === section.courseId)!.credits, section.meetings.map(m => `${m.day} ${m.start}–${m.end}`).join('; '), assignment.approvedAt, assignment.reason]);
  }
  return rows.map(row => row.map(escape).join(',')).join('\r\n');
}
