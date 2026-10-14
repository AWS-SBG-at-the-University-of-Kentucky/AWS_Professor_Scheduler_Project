import type { Candidate, Faculty, Meeting, Preference, Section, State } from './domain';

export const minutes = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
export const overlaps = (a: Meeting, b: Meeting) => a.day === b.day && minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end);
// Adjacent availability intervals are a continuous window; adjacent classes do not overlap.
export function covered(meeting: Meeting, windows: Meeting[]) {
  let cursor = minutes(meeting.start);
  for (const window of windows.filter(w => w.day === meeting.day).sort((a, b) => minutes(a.start) - minutes(b.start))) {
    if (minutes(window.start) > cursor) break;
    if (minutes(window.end) > cursor) cursor = minutes(window.end);
    if (cursor >= minutes(meeting.end)) return true;
  }
  return false;
}
export function assignedCredits(state: State, facultyId: string) {
  return state.assignments.filter(a => a.facultyId === facultyId).reduce((total, assignment) => {
    const section = state.sections.find(s => s.id === assignment.sectionId)!;
    return total + state.courses.find(c => c.id === section.courseId)!.credits;
  }, 0);
}
export function assess(state: State, section: Section, faculty: Faculty): Candidate {
  const pref = state.preferences.find(p => p.facultyId === faculty.id);
  const credits = assignedCredits(state, faculty.id);
  const course = state.courses.find(c => c.id === section.courseId)!;
  const reasons: string[] = [];
  if (state.assignments.some(a => a.sectionId === section.id)) reasons.push('Section already assigned');
  if (!faculty.qualified.includes(section.courseId)) reasons.push('Not qualified for this course');
  if (!pref || !section.meetings.every(m => covered(m, pref.availability))) reasons.push('Outside hard availability');
  const existing = state.assignments.filter(a => a.facultyId === faculty.id).map(a => state.sections.find(s => s.id === a.sectionId)!);
  if (existing.some(s => s.meetings.some(a => section.meetings.some(b => overlaps(a, b))))) reasons.push('Overlaps an approved assignment');
  if (credits + course.credits > faculty.maxCredits) reasons.push('Exceeds teaching capacity');
  const index = pref?.rankedCourses.indexOf(section.courseId) ?? -1;
  const courseRank = index < 0 ? Number.MAX_SAFE_INTEGER : index + 1;
  const outsidePreferred = section.meetings.filter(m => !covered(m, pref?.preferred ?? [])).length;
  return {
    faculty, eligible: reasons.length === 0, reasons, courseRank, outsidePreferred, credits,
    load: faculty.maxCredits > 0 ? credits / faculty.maxCredits : 1,
    explanation: [index < 0 ? 'Course not ranked' : `Course preference #${index + 1}`, outsidePreferred ? `${outsidePreferred} meeting${outsidePreferred === 1 ? '' : 's'} outside preferred hours` : 'All meetings within preferred hours', `${credits} of ${faculty.maxCredits} credits assigned`],
  };
}
export function recommendations(state: State, sectionId: string) {
  const section = state.sections.find(s => s.id === sectionId);
  if (!section) throw new Error('Section not found.');
  return state.faculty.map(f => assess(state, section, f)).sort((a, b) =>
    Number(b.eligible) - Number(a.eligible) || a.courseRank - b.courseRank || a.outsidePreferred - b.outsidePreferred || a.load - b.load || (a.faculty.id < b.faculty.id ? -1 : a.faculty.id > b.faculty.id ? 1 : 0));
}
export function validatePreference(pref: Preference, state: State) {
  if (!['draft', 'submitted'].includes(pref.status)) throw new Error('Invalid preference status.');
  if (new Set(pref.rankedCourses).size !== pref.rankedCourses.length) throw new Error('Choose each preferred course only once.');
  if (pref.rankedCourses.some(id => !state.courses.some(c => c.id === id))) throw new Error('Choose a valid course.');
  const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  for (const window of [...pref.availability, ...pref.preferred]) {
    if (!['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(window.day) || !validTime.test(window.start) || !validTime.test(window.end) || minutes(window.start) >= minutes(window.end)) throw new Error('Every time window needs a valid start time before its end time.');
  }
  if (pref.status === 'submitted' && !pref.availability.length) throw new Error('Add at least one available day before submitting.');
  for (const assignment of state.assignments.filter(a => a.facultyId === pref.facultyId)) {
    const section = state.sections.find(s => s.id === assignment.sectionId)!;
    if (!section.meetings.every(m => covered(m, pref.availability))) throw new Error(`These hours would invalidate ${section.courseId} · ${section.number}. Ask the scheduler to remove that assignment first.`);
  }
}
