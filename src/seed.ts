import { DAYS, type State, type Meeting } from './domain';
export function createSeed(): State {
  const names = ['Maya Chen', 'James Wilson', 'Aisha Patel', 'Daniel Brooks', 'Sofia Ramirez', 'Ethan Park', 'Olivia Bennett', 'Noah Williams', 'Isabella Reed', 'Lucas Morgan', 'Amara Okafor', 'Henry Sullivan', 'Elena Petrova', 'Liam Anderson', 'Zoe Thompson', 'Arjun Mehta', 'Grace Kim', 'Mateo Garcia', 'Chloe Martin', 'Owen Davis', 'Layla Hassan', 'Leo Fischer', 'Nora Ellis', 'Samuel Wright', 'Priya Shah'];
  const courseNames = ['Introduction to Computing', 'Programming I', 'Programming II', 'Discrete Mathematics', 'Data Structures', 'Computer Organization', 'Database Systems', 'Software Engineering', 'Operating Systems', 'Computer Networks', 'Artificial Intelligence', 'Capstone Studio'];
  const codes = ['CS 101', 'CS 115', 'CS 215', 'CS 220', 'CS 315', 'CS 325', 'CS 405', 'CS 410', 'CS 420', 'CS 425', 'CS 450', 'CS 499'];
  const courses = courseNames.map((name, i) => ({ id: codes[i], name, credits: 3, area: i < 4 ? 'Foundations' : i < 8 ? 'Core curriculum' : 'Advanced studies' }));
  const faculty = names.map((name, i) => ({ id: `FAC-${String(i + 1).padStart(3, '0')}`, name, initials: name.split(' ').map(n => n[0]).join(''), title: i % 3 === 0 ? 'Associate Professor' : i % 3 === 1 ? 'Professor' : 'Assistant Professor', qualified: codes.filter((_, j) => (j + i) % 3 === 0 || j === i % 12), maxCredits: i % 5 === 0 ? 6 : 9 }));
  const windows = (days: readonly string[], start: string, end: string) => days.map(day => ({ day, start, end })) as Meeting[];
  const preferences = faculty.map((f, i) => ({ facultyId: f.id, rankedCourses: [...f.qualified].sort((a, b) => ((codes.indexOf(a) + i) % 12) - ((codes.indexOf(b) + i) % 12)), availability: windows(DAYS, i % 4 === 0 ? '09:00' : '08:00', i % 6 === 0 ? '16:00' : '18:00'), preferred: windows(i % 2 ? ['Tue', 'Thu'] : ['Mon', 'Wed', 'Fri'], i % 3 ? '09:00' : '10:00', i % 3 ? '13:00' : '16:00'), status: i < 19 ? 'submitted' as const : 'draft' as const, updatedAt: '2026-10-12T14:00:00Z' }));
  const starts = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00'];
  const sections = Array.from({ length: 60 }, (_, i) => {
    const index = Math.floor(i / 5), slot = i % 5;
    const start = starts[(index + slot) % 6];
    const end = `${start.slice(0, 2)}:50`;
    return { id: `SEC-${String(i + 1).padStart(3, '0')}`, courseId: codes[index], number: String(slot + 1).padStart(3, '0'), meetings: windows(slot % 2 ? ['Tue', 'Thu'] : ['Mon', 'Wed', 'Fri'], start, end), seats: slot % 2 ? 30 : 40, room: `Science ${100 + index * 10 + slot}` };
  });
  // A deliberate no-match fixture for the demo: every professor is unavailable at 07:00.
  sections[59].meetings = windows(['Mon', 'Wed', 'Fri'], '07:00', '07:50');
  const state: State = { version: 1, revision: 0, faculty, courses, sections, preferences, assignments: [], audit: [] };
  // Known-valid examples leave a clear starting point for the approval journey.
  for (const [si, fi] of [[0, 0], [6, 2], [11, 1], [15, 3], [21, 5], [26, 4], [30, 6], [36, 8], [41, 7], [45, 9], [51, 11], [56, 10]]) {
    const section = sections[si], person = faculty[fi];
    const at = '2026-10-13T14:00:00Z';
    state.assignments.push({ id: `seed-${si}`, facultyId: person.id, sectionId: section.id, approvedAt: at, reason: 'Initial demo assignment' });
    state.audit.push({ id: `audit-${si}`, at, actor: 'Demo scheduler', action: 'Assignment approved', detail: `${person.name} → ${section.courseId} · ${section.number}`, facultyId: person.id });
  }
  return state;
}
