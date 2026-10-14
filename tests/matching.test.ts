import { describe, expect, it } from 'vitest';
import { assess, covered, overlaps, recommendations, validatePreference } from '../src/matching';
import { createSeed } from '../src/seed';
import { applyCommand, assignmentsCsv } from '../src/store';
import type { Identity, State } from '../src/domain';

const scheduler: Identity = { role: 'scheduler', facultyId: 'FAC-001' };
const simple = () => {
  const state = createSeed();
  state.assignments = [];
  state.preferences.forEach(p => { p.availability = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => ({ day: day as 'Mon', start: '08:00', end: '18:00' })); });
  return state;
};
function approve(state: State, sectionId = 'SEC-001', facultyId = 'FAC-001', reason = 'Workshop demo') {
  return applyCommand(state, scheduler, { type: 'approve', sectionId, facultyId, reason }, state.revision);
}
describe('synthetic dataset', () => {
  it('has the promised size and repeatable initial data', () => {
    const state = createSeed();
    expect(state.faculty).toHaveLength(25); expect(state.sections).toHaveLength(60); expect(createSeed()).toEqual(state);
  });
  it('all initial assignments satisfy the hard constraints', () => {
    const state = createSeed();
    for (const a of state.assignments) {
      const check = { ...state, assignments: state.assignments.filter(other => other.id !== a.id) };
      expect(assess(check, state.sections.find(s => s.id === a.sectionId)!, state.faculty.find(f => f.id === a.facultyId)!).reasons).toEqual([]);
    }
  });
  it('includes an intentional no-match section', () => expect(recommendations(createSeed(), 'SEC-060').filter(c => c.eligible)).toEqual([]));
});
describe('hard eligibility rules', () => {
  it('allows adjacent classes but detects partial overlaps', () => {
    const a = { day: 'Mon' as const, start: '09:00', end: '10:00' };
    expect(overlaps(a, { ...a, start: '10:00', end: '11:00' })).toBe(false);
    expect(overlaps(a, { ...a, start: '09:30', end: '11:00' })).toBe(true);
    expect(overlaps(a, { ...a, day: 'Tue' })).toBe(false);
  });
  it('unions contiguous availability and rejects gaps', () => {
    const m = { day: 'Mon' as const, start: '09:00', end: '11:00' };
    expect(covered(m, [{ ...m, end: '10:00' }, { ...m, start: '10:00' }])).toBe(true);
    expect(covered(m, [{ ...m, end: '09:59' }, { ...m, start: '10:00' }])).toBe(false);
  });
  it('requires qualification', () => {
    const s = simple(); s.faculty[0].qualified = [];
    expect(assess(s, s.sections[0], s.faculty[0]).reasons).toContain('Not qualified for this course');
    expect(() => approve(s)).toThrow('no longer eligible');
  });
  it('requires availability for every meeting', () => {
    const s = simple(); s.preferences[0].availability = [{ day: 'Mon', start: '08:00', end: '18:00' }];
    expect(() => approve(s)).toThrow('no longer eligible');
  });
  it('rejects overlapping assignments across different sections', () => {
    let s = simple(); s.sections[1].meetings = structuredClone(s.sections[0].meetings); s = approve(s);
    expect(() => approve(s, 'SEC-002')).toThrow('no longer eligible');
  });
  it('uses credit hours and permits exactly full capacity', () => {
    let s = simple(); s.faculty[0].maxCredits = 3; s = approve(s);
    expect(s.assignments).toHaveLength(1);
    expect(() => approve(s, 'SEC-002')).toThrow('no longer eligible');
  });
  it('cannot approve an assigned section twice', () => {
    const s = approve(simple());
    expect(() => approve(s, 'SEC-001', 'FAC-004')).toThrow('no longer eligible');
  });
});
describe('deterministic ranking', () => {
  it('ranks by course preference, preferred meetings, load fraction, then ID', () => {
    const s = simple(); s.faculty = s.faculty.slice(0, 4); s.preferences = s.preferences.slice(0, 4);
    s.faculty.forEach(f => f.qualified = ['CS 101']);
    s.preferences.forEach(p => { p.rankedCourses = ['CS 101']; p.preferred = structuredClone(p.availability); });
    expect(recommendations(s, 'SEC-001').map(c => c.faculty.id)).toEqual(['FAC-001', 'FAC-002', 'FAC-003', 'FAC-004']);
    s.preferences[0].rankedCourses = [];
    expect(recommendations(s, 'SEC-001').at(-1)!.faculty.id).toBe('FAC-001');
    s.preferences[1].preferred = [];
    expect(recommendations(s, 'SEC-001').map(c => c.faculty.id)).toEqual(['FAC-003', 'FAC-004', 'FAC-002', 'FAC-001']);
    s.assignments.push({ id: 'load', facultyId: 'FAC-003', sectionId: 'SEC-002', approvedAt: '', reason: '' });
    expect(recommendations(s, 'SEC-001')[0].faculty.id).toBe('FAC-004');
    expect(recommendations(s, 'SEC-001')).toEqual(recommendations(s, 'SEC-001'));
  });
  it('uses load proportions instead of raw credits', () => {
    const s = simple(); s.faculty = [s.faculty[0], s.faculty[3]]; s.preferences = [s.preferences[0], s.preferences[3]];
    s.faculty[0].maxCredits = 6; s.faculty[1].maxCredits = 12;
    s.preferences.forEach(p => { p.rankedCourses = ['CS 101']; p.preferred = structuredClone(p.availability); });
    s.assignments = s.faculty.map((f, i) => ({ id: String(i), facultyId: f.id, sectionId: 'SEC-002', reason: '', approvedAt: '' }));
    expect(recommendations(s, 'SEC-001')[0].faculty.id).toBe('FAC-004');
  });
  it('counts meetings outside preferred hours in its explanation', () => {
    const s = simple(); s.preferences[0].preferred = [];
    const c = assess(s, s.sections[0], s.faculty[0]); expect(c.outsidePreferred).toBe(3); expect(c.explanation[1]).toBe('3 meetings outside preferred hours');
  });
});
describe('commands and persistence contract', () => {
  it('writes an assignment and audit event in one new state without mutating input', () => {
    const before = simple(), after = approve(before);
    expect(before.assignments).toHaveLength(0); expect(after.assignments).toHaveLength(1);
    expect(after.audit[0].action).toBe('Assignment approved'); expect(after.revision).toBe(before.revision + 1);
    expect(after.audit[0].at.endsWith('Z')).toBe(true);
  });
  it('rejects a competing approval based on a stale revision', () => {
    const s = approve(simple());
    expect(() => applyCommand(s, scheduler, { type: 'approve', sectionId: 'SEC-001', facultyId: 'FAC-004', reason: '' }, 0)).toThrow('out of date');
  });
  it('requires a reason for lower-ranked selection', () => {
    const s = simple(), candidates = recommendations(s, 'SEC-001').filter(c => c.eligible);
    expect(() => approve(s, 'SEC-001', candidates[1].faculty.id, '')).toThrow('reason');
    expect(approve(s, 'SEC-001', candidates[1].faculty.id, 'Course continuity').assignments).toHaveLength(1);
  });
  it('rejects scheduler commands from faculty and edits to another professor', () => {
    const s = simple(), identity: Identity = { role: 'faculty', facultyId: 'FAC-001' };
    expect(() => applyCommand(s, identity, { type: 'approve', sectionId: 'SEC-001', facultyId: 'FAC-001', reason: '' }, 0)).toThrow('Only a scheduler');
    expect(() => applyCommand(s, identity, { type: 'preference', preference: s.preferences[1] }, 0)).toThrow('your own');
  });
  it('requires a removal reason and records it', () => {
    const s = approve(simple()), assignmentId = s.assignments[0].id;
    expect(() => applyCommand(s, scheduler, { type: 'remove', assignmentId, reason: ' ' }, s.revision)).toThrow('reason');
    const after = applyCommand(s, scheduler, { type: 'remove', assignmentId, reason: 'Faculty leave' }, s.revision);
    expect(after.assignments).toHaveLength(0); expect(after.audit[0].detail).toContain('Faculty leave');
  });
  it('protects approved assignments when changing availability', () => {
    const s = approve(simple());
    expect(() => validatePreference({ ...s.preferences[0], availability: [] }, s)).toThrow();
  });
  it('rejects duplicate ranked courses and invalid time windows', () => {
    const s = simple();
    expect(() => validatePreference({ ...s.preferences[0], rankedCourses: ['CS 101', 'CS 101'] }, s)).toThrow('only once');
    expect(() => validatePreference({ ...s.preferences[0], availability: [{ day: 'Mon', start: '17:00', end: '09:00' }] }, s)).toThrow('start time');
  });
  it('rejects removing qualifications or capacity needed for approved assignments', () => {
    const s = approve(simple());
    expect(() => applyCommand(s, scheduler, { type: 'faculty', faculty: { ...s.faculty[0], qualified: [] } }, s.revision)).toThrow('Remove affected assignments');
    expect(() => applyCommand(s, scheduler, { type: 'faculty', faculty: { ...s.faculty[0], maxCredits: 0 } }, s.revision)).toThrow('Remove affected assignments');
  });
  it('rejects section changes that violate an approved professor’s availability', () => {
    const s = approve(simple());
    expect(() => applyCommand(s, scheduler, { type: 'section', section: { ...s.sections[0], meetings: [{ day: 'Mon', start: '07:00', end: '07:50' }] } }, s.revision)).toThrow('Remove the current assignment');
  });
  it('escapes quotes and neutralizes spreadsheet formulas in CSV', () => {
    const s = approve(simple(), 'SEC-001', 'FAC-001', '=HYPERLINK("test")');
    const csv = assignmentsCsv(s); expect(csv).toContain("\"'=HYPERLINK(\"\"test\"\")\""); expect(csv.split('\r\n')).toHaveLength(2);
  });
});
