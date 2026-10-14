import './styles.css';
import { DAYS, TERM, type State, type Identity, type Meeting, type Preference, type Section } from './domain';
import { assess, assignedCredits, minutes, recommendations } from './matching';
import { assignmentsCsv, DemoError, LocalAdapter, STORAGE_KEY, type Command } from './store';

const adapter = new LocalAdapter();
let state: State;
let identity: Identity = { role: 'scheduler', facultyId: 'FAC-001' };
let page = 'overview';
let query = '';
let sectionFilter = 'all';
let scheduleMode = 'week';
let scheduleFaculty = 'FAC-001';
let busy = false;
const app = document.querySelector<HTMLDivElement>('#app')!;
const dialog = document.querySelector<HTMLDialogElement>('#dialog')!;
const toast = document.querySelector<HTMLDivElement>('#toast')!;
let toastTimer: ReturnType<typeof setTimeout>;
const e = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const iconPaths: Record<string, string> = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  book: '<path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1v15"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-13 4h2m4 0h2m-8 3h2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  refresh: '<path d="M20 10a8 8 0 1 0-2 8M20 3v7h-7"/>',
  sliders: '<path d="M4 7h7m4 0h5M4 17h11m4 0h1"/><circle cx="13" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>',
  spark: '<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
};
const icon = (name: string, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.grid}</svg>`;
const badge = (text: string, color = '') => `<span class="badge ${color}"><span class="dot"></span>${e(text)}</span>`;
const person = (id: string) => state.faculty.find(f => f.id === id)!;
const course = (section: Section) => state.courses.find(c => c.id === section.courseId)!;
const meetingText = (section: Section) => [...new Set(section.meetings.map(m => `${m.start}–${m.end}`))].length === 1 ? `${section.meetings.map(m => m.day).join(' / ')} · ${section.meetings[0].start}–${section.meetings[0].end}` : section.meetings.map(m => `${m.day} ${m.start}–${m.end}`).join(', ');
const empty = (title: string, detail: string) => `<div class="empty">${icon('book')}<h3>${e(title)}</h3><p>${e(detail)}</p></div>`;
function notify(message: string, error = false) { clearTimeout(toastTimer); toast.textContent = message; toast.className = `show ${error ? 'error' : ''}`; toastTimer = setTimeout(() => toast.className = '', 6500); }
function titleBlock(eyebrow: string, title: string, subtitle: string, action = '') { return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`; }
function metric(label: string, value: string | number, detail: string, glyph: string, color = '') { return `<div class="metric"><div class="metric-label">${label}${icon(glyph, color)}</div><div class="metric-value">${value}</div><div class="metric-detail">${detail}</div></div>`; }
function shell() {
  const scheduler = identity.role === 'scheduler';
  const nav = [['overview', 'grid', 'Overview'], ['sections', 'book', 'Course sections'], ...(scheduler ? [['faculty', 'users', 'Faculty directory']] : [['preferences', 'sliders', 'My preferences']]), ['schedule', 'calendar', scheduler ? 'Teaching schedules' : 'My schedule'], ['history', 'clock', 'Activity & history']];
  const name = scheduler ? 'Department scheduler' : person(identity.facultyId).name;
  app.innerHTML = `<aside class="sidebar"><a class="brand" href="#overview" aria-label="FacultyPlan home"><span class="brand-icon">${icon('book')}</span><span>Faculty<span class="brand-light">Plan</span><small>PROFESSOR SCHEDULER</small></span></a><div class="workspace"><span class="workspace-symbol">N</span><div>Northfield University<small>Computer Science</small></div></div><div class="nav-label">WORKSPACE</div><nav aria-label="Main navigation">${nav.map(([id, glyph, label]) => `<button class="nav-item ${page === id ? 'active' : ''}" data-page="${id}" ${page === id ? 'aria-current="page"' : ''}>${icon(glyph)}${label}${id === 'sections' ? '<span class="nav-count">60</span>' : ''}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="term-card"><span class="dot"></span> ${TERM}<small>Planning in progress</small></div><button class="nav-item" data-action="guide">${icon('spark')} Demo walkthrough</button><div class="sidebar-note">A fictional department.<br>A clearer way to plan.</div></div></aside>
  <div class="workspace-main"><header class="topbar"><div class="breadcrumb">Workspace <span>/</span> <strong>${nav.find(n => n[0] === page)?.[2] ?? 'Overview'}</strong></div><div class="identity-controls"><label class="sr-only" for="role">Demo role</label><select id="role" aria-label="Demo role"><option value="scheduler" ${scheduler ? 'selected' : ''}>Scheduler view</option><option value="faculty" ${!scheduler ? 'selected' : ''}>Professor view</option></select>${!scheduler ? `<label class="sr-only" for="faculty-identity">Demo professor</label><select id="faculty-identity" aria-label="Demo professor">${state.faculty.map(f => `<option value="${f.id}" ${f.id === identity.facultyId ? 'selected' : ''}>${e(f.name)}</option>`).join('')}</select>` : ''}<span class="avatar small" title="${e(name)}">${scheduler ? 'DS' : person(identity.facultyId).initials}</span></div></header>
  <div class="prototype-bar"><span><span class="dot"></span> Prototype - synthetic data <span class="prototype-detail">· Saved in this browser · Demo identity</span></span><button data-action="reset">${icon('refresh')} Reset demo</button></div><main id="main" tabindex="-1">${content()}</main><footer><span>FacultyPlan <span class="footer-sep">/</span> Computer Science · ${TERM}</span><span>Meeting times: America/New_York</span></footer></div>`;
  bind();
}
function content(): string {
  if (page === 'overview') return overview();
  if (page === 'sections') return sectionsPage();
  if (page === 'preferences') return preferencesPage();
  if (page === 'faculty') return facultyPage();
  if (page === 'schedule') return schedulePage();
  return historyPage();
}
function overview() {
  const scheduler = identity.role === 'scheduler';
  const submitted = state.preferences.filter(p => p.status === 'submitted').length;
  const approved = state.assignments.length;
  const open = state.sections.filter(s => !state.assignments.some(a => a.sectionId === s.id));
  if (!scheduler) {
    const f = person(identity.facultyId), pref = state.preferences.find(p => p.facultyId === f.id)!;
    const eligible = open.filter(s => assess(state, s, f).eligible);
    const own = state.assignments.filter(a => a.facultyId === f.id);
    return titleBlock('YOUR TEACHING, AT A GLANCE', `Welcome, ${e(f.name.split(' ')[0])}.`, `Let’s shape a semester that works for you. Here’s your ${TERM} plan.`, `<button class="button primary" data-page="preferences">Edit preferences ${icon('arrow')}</button>`) +
      `<div class="metrics">${metric('Preference status', pref.status === 'submitted' ? 'Submitted' : 'Draft', 'Update your preferences anytime', 'check')}${metric('Assigned credits', `${assignedCredits(state, f.id)} <span>/ ${f.maxCredits}</span>`, 'Your approved teaching load', 'book')}${metric('Eligible sections', eligible.length, 'Based on your current availability', 'spark')}${metric('Approved sections', own.length, 'Ready to view in your schedule', 'calendar')}</div>
      <div class="dashboard-columns"><section class="panel"><div class="panel-heading"><div><h2>Your approved assignments</h2><p>Confirmed by the department scheduler.</p></div><button class="text-button" data-page="schedule">View schedule ${icon('arrow')}</button></div>${own.length ? sectionTable(own.map(a => state.sections.find(s => s.id === a.sectionId)!), false) : empty('Your schedule is taking shape', 'Submit your preferences so the scheduler can review your matches.')}</section><aside class="panel next-step"><span class="feature-icon">${icon('sliders')}</span><div class="eyebrow">YOUR NEXT STEP</div><h2>Make your preferences count.</h2><p>Rank courses you enjoy teaching and tell us when you’re available. Hard availability is always respected.</p><button class="button primary" data-page="preferences">Review my preferences ${icon('arrow')}</button><div class="tip">${icon('shield')} Preferences guide recommendations. The scheduler makes the final assignment.</div></aside></div>
      <section class="panel"><div class="panel-heading"><div><h2>Explore your matches</h2><p>Eligible, unassigned sections you could teach.</p></div><button class="text-button" data-page="sections">Browse all ${icon('arrow')}</button></div><div class="course-cards">${eligible.slice(0, 3).map(s => `<article class="course-card"><div>${badge(s.courseId, 'blue')}<span class="muted">Section ${s.number}</span></div><h3>${e(course(s).name)}</h3><p>${e(meetingText(s))}</p><small>${e(assess(state, s, f).explanation.join(' · '))}</small></article>`).join('') || empty('No eligible matches', 'Review your availability or ask the scheduler about your qualifications.')}</div></section>`;
  }
  const pct = Math.round(approved / state.sections.length * 100);
  return titleBlock('DEPARTMENT OVERVIEW', 'A clear view of the semester.', `Review preferences, find the right fit, and build your ${TERM} teaching plan.`, `<button class="button" data-action="export">${icon('download')} Export assignments</button>`) +
    `<div class="metrics">${metric('Course sections', state.sections.length, '12 courses · fixed meeting times', 'book')}${metric('Faculty members', state.faculty.length, 'Computer Science department', 'users')}${metric('Preferences submitted', `${submitted} <span>/ 25</span>`, `${25 - submitted} faculty still in draft`, 'sliders')}${metric('Assignments approved', `${approved} <span>/ 60</span>`, `${60 - approved} sections awaiting assignment`, 'check', 'green')}</div>
    <div class="dashboard-columns"><section class="progress-panel"><div><div class="eyebrow">SEMESTER READINESS</div><h2>A good plan starts with the right people.</h2><p>Match faculty strengths with course needs, one thoughtful assignment at a time.</p><button class="button primary" data-page="sections">Review recommendations ${icon('arrow')}</button></div><div class="progress-ring" style="--progress:${pct}%"><div><strong>${pct}<span>%</span></strong><small>assigned</small></div></div><div class="progress-caption"><span><span class="dot"></span> ${approved} approved</span><span>${60 - approved} to go</span></div></section><aside class="panel attention"><div class="panel-heading"><h2>Needs your attention</h2>${badge('3 items', 'amber')}</div><button data-page="sections"><span class="attention-icon blue">${icon('spark')}</span><span><strong>${open.length} sections to assign</strong><small>Review eligible faculty and approve</small></span>${icon('arrow')}</button><button data-page="faculty"><span class="attention-icon amber">${icon('clock')}</span><span><strong>${25 - submitted} drafts in progress</strong><small>Check faculty submission status</small></span>${icon('arrow')}</button><button data-action="no-match"><span class="attention-icon lilac">${icon('calendar')}</span><span><strong>Early-morning capstone</strong><small>Explore a no-eligible-match example</small></span>${icon('arrow')}</button></aside></div>
    <section class="panel"><div class="panel-heading"><div><h2>Ready for your review</h2><p>Start with these unassigned course sections.</p></div><button class="text-button" data-page="sections">View all sections ${icon('arrow')}</button></div>${sectionTable(open.slice(0, 5), true)}</section>
    <div class="bottom-note">${icon('shield')} Every approval checks qualifications, availability, schedule conflicts, and teaching capacity.</div>`;
}
function sectionTable(sections: Section[], scheduler: boolean) {
  if (!sections.length) return empty('No sections found', 'Try another search or filter.');
  return `<div class="table-scroll"><table><thead><tr><th scope="col">Course / section</th><th scope="col">Meeting times</th><th scope="col">${scheduler ? 'Faculty match' : 'Eligibility'}</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead><tbody>${sections.map(s => {
    const assignment = state.assignments.find(a => a.sectionId === s.id);
    const eligible = scheduler ? recommendations(state, s.id).filter(c => c.eligible) : [];
    const own = assess(state, s, person(identity.facultyId));
    return `<tr><td><strong>${e(s.courseId)} <span class="section-number">· ${s.number}</span></strong><span class="cell-sub">${e(course(s).name)}</span></td><td><span class="meeting">${e(meetingText(s))}</span><span class="cell-sub">${course(s).credits} credits · ${s.seats} seats</span></td><td>${assignment ? `<div class="person-cell"><span class="avatar tiny">${person(assignment.facultyId).initials}</span>${e(person(assignment.facultyId).name)}</div>` : scheduler ? eligible.length ? `<span class="match-label">${icon('spark')} ${eligible.length} eligible faculty</span><span class="cell-sub">Top match: ${e(eligible[0].faculty.name)}</span>` : '<span class="muted">No eligible match</span>' : own.eligible ? '<span class="match-label">Eligible for you</span>' : `<span class="muted">${e(own.reasons[0])}</span>`}</td><td>${badge(assignment ? 'Approved' : 'Unassigned', assignment ? 'green' : 'amber')}</td><td>${scheduler ? `<button class="button compact ${assignment ? '' : 'soft'}" data-review="${s.id}">${assignment ? 'Manage' : 'Review'} ${icon('arrow')}</button>` : `<button class="text-button" data-review="${s.id}">Details</button>`}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function sectionsPage() {
  const scheduler = identity.role === 'scheduler';
  const filtered = state.sections.filter(s => {
    const assigned = state.assignments.some(a => a.sectionId === s.id);
    return `${s.courseId} ${s.number} ${course(s).name}`.toLowerCase().includes(query.toLowerCase()) && (sectionFilter === 'all' || sectionFilter === 'approved' && assigned || sectionFilter === 'unassigned' && !assigned || sectionFilter === 'eligible' && assess(state, s, person(identity.facultyId)).eligible || sectionFilter === 'no-match' && !assigned && !recommendations(state, s.id).some(c => c.eligible));
  });
  return titleBlock('COURSE CATALOG', 'Find the right fit.', 'Browse fixed-time sections and review eligibility for the upcoming semester.', scheduler ? `<button class="button" data-action="export">${icon('download')} Export assignments</button>` : '') + `<section class="panel"><div class="table-toolbar"><div class="search-input">${icon('search')}<input id="section-search" aria-label="Search sections" placeholder="Search courses or sections…" value="${e(query)}"></div><label class="sr-only" for="section-filter">Section status</label><select id="section-filter"><option value="all">All sections</option><option value="unassigned" ${sectionFilter === 'unassigned' ? 'selected' : ''}>Unassigned</option><option value="approved" ${sectionFilter === 'approved' ? 'selected' : ''}>Approved</option>${scheduler ? `<option value="no-match" ${sectionFilter === 'no-match' ? 'selected' : ''}>No eligible match</option>` : `<option value="eligible" ${sectionFilter === 'eligible' ? 'selected' : ''}>Eligible for me</option>`}</select><span class="muted result-count">${filtered.length} sections</span></div>${sectionTable(filtered, scheduler)}</section>`;
}
function timeRows(name: string, windows: Meeting[]) {
  return DAYS.map(day => {
    const window = windows.find(w => w.day === day);
    return `<div class="time-row"><label class="day-check"><input type="checkbox" name="${name}-${day}-enabled" ${window ? 'checked' : ''}>${day}</label><label><span class="sr-only">${name} ${day} start</span><input type="time" name="${name}-${day}-start" value="${window?.start ?? '09:00'}" required></label><span class="muted">to</span><label><span class="sr-only">${name} ${day} end</span><input type="time" name="${name}-${day}-end" value="${window?.end ?? '17:00'}" required></label></div>`;
  }).join('');
}
function preferencesPage() {
  const f = person(identity.facultyId), pref = state.preferences.find(p => p.facultyId === f.id)!;
  return titleBlock('FACULTY PREFERENCES', 'Your semester, your preferences.', 'Tell us what you’d like to teach and when you’re available. All times are America/New_York.', badge(pref.status === 'submitted' ? 'Submitted' : 'Draft', pref.status === 'submitted' ? 'green' : 'amber')) +
    `<form id="preferences-form"><div class="form-error" role="alert" hidden></div><section class="panel preference-ranking"><div class="panel-heading"><div><h2>01 <span>Rank your preferred courses</span></h2><p>First choice has the highest priority. Unranked courses remain eligible when qualified.</p></div></div><div class="rank-grid">${Array.from({ length: 5 }, (_, i) => `<label><span class="field-label">${i + 1}${['st', 'nd', 'rd'][i] ?? 'th'} choice</span><select name="rank-${i}"><option value="">No preference</option>${state.courses.map(c => `<option value="${c.id}" ${pref.rankedCourses[i] === c.id ? 'selected' : ''}>${c.id} · ${e(c.name)}</option>`).join('')}</select></label>`).join('')}</div></section>
    <div class="dashboard-columns equal"><section class="panel time-panel"><div class="panel-heading"><div><h2>02 <span>Hard availability</span></h2><p>You can only be assigned within these hours.</p></div>${badge('Required', 'blue')}</div>${timeRows('available', pref.availability)}</section><section class="panel time-panel"><div class="panel-heading"><div><h2>03 <span>Preferred hours</span></h2><p>We’ll favor these days and windows when ranking matches.</p></div>${badge('Optional')}</div>${timeRows('preferred', pref.preferred)}</section></div>
    <div class="form-bottom"><p>${icon('shield')} Your scheduler manages qualifications and your ${f.maxCredits}-credit teaching limit.</p><div><button class="button" type="submit" name="intent" value="draft">Save draft</button><button class="button primary" type="submit" name="intent" value="submitted">Submit preferences ${icon('arrow')}</button></div></div></form>`;
}
function facultyPage() {
  return titleBlock('FACULTY DIRECTORY', 'People behind the plan.', 'Maintain course qualifications and credit limits. Review submission progress across the department.') + `<section class="panel"><div class="panel-heading"><h2>Faculty members <span class="count-pill">25</span></h2>${badge(`${state.preferences.filter(p => p.status === 'submitted').length} submitted`, 'green')}</div><div class="table-scroll"><table><thead><tr><th>Faculty</th><th>Qualified courses</th><th>Teaching load</th><th>Preferences</th><th><span class="sr-only">Action</span></th></tr></thead><tbody>${state.faculty.map(f => {
    const credits = assignedCredits(state, f.id), pref = state.preferences.find(p => p.facultyId === f.id)!;
    return `<tr><td><div class="person-cell"><span class="avatar">${f.initials}</span><div><strong>${e(f.name)}</strong><span class="cell-sub">${f.title}</span></div></div></td><td><div class="qualification-tags">${f.qualified.map(c => `<span>${c}</span>`).join('') || '<span>None</span>'}</div></td><td><strong>${credits} / ${f.maxCredits}</strong> <span class="muted">credits</span><div class="mini-progress"><span style="width:${f.maxCredits ? credits / f.maxCredits * 100 : 0}%"></span></div></td><td>${badge(pref.status === 'submitted' ? 'Submitted' : 'Draft', pref.status === 'submitted' ? 'green' : 'amber')}</td><td><button class="button compact" data-faculty="${f.id}">Manage</button></td></tr>`;
  }).join('')}</tbody></table></div></section>`;
}
function schedulePage() {
  const id = identity.role === 'faculty' ? identity.facultyId : scheduleFaculty;
  const sections = state.assignments.filter(a => a.facultyId === id).map(a => state.sections.find(s => s.id === a.sectionId)!);
  const meetings = sections.flatMap(s => s.meetings);
  const startHour = Math.min(7, ...meetings.map(m => Math.floor(minutes(m.start) / 60)));
  const endHour = Math.max(19, ...meetings.map(m => Math.ceil(minutes(m.end) / 60)));
  const hours = endHour - startHour;
  return titleBlock('APPROVED TEACHING PLAN', 'A week in view.', `Recurring meeting times for ${TERM}. Only approved assignments appear here.`) +
    `<section class="panel"><div class="table-toolbar">${identity.role === 'scheduler' ? `<label class="sr-only" for="schedule-faculty">Schedule for faculty</label><select id="schedule-faculty">${state.faculty.map(f => `<option value="${f.id}" ${f.id === id ? 'selected' : ''}>${e(f.name)}</option>`).join('')}</select>` : `<h2>${e(person(id).name)}</h2>`}<span class="muted">${assignedCredits(state, id)} / ${person(id).maxCredits} credits</span><div class="segmented"><button data-schedule-mode="week" aria-pressed="${scheduleMode === 'week'}">Week</button><button data-schedule-mode="list" aria-pressed="${scheduleMode === 'list'}">List</button></div></div>${!sections.length ? empty('No approved assignments yet', 'Approved sections will appear here after scheduler review.') : scheduleMode === 'list' ? sectionTable(sections, identity.role === 'scheduler') : `<div class="calendar-scroll"><div class="calendar-head"><span>ET</span>${DAYS.map(day => `<strong>${day}</strong>`).join('')}</div><div class="calendar-body" style="height:${hours * 56}px"><div class="hour-labels" style="grid-template-rows:repeat(${hours},56px)">${Array.from({ length: hours }, (_, i) => `<span>${String(i + startHour).padStart(2, '0')}:00</span>`).join('')}</div>${DAYS.map(day => `<div class="calendar-day" role="group" aria-label="${day}">${sections.flatMap((s, i) => s.meetings.filter(m => m.day === day).map(m => `<button class="calendar-event color-${i % 3}" style="top:${(minutes(m.start) - startHour * 60) / 60 * 56}px;height:${Math.max((minutes(m.end) - minutes(m.start)) / 60 * 56, 43)}px" data-review="${s.id}" aria-label="${e(s.courseId)} section ${s.number}, ${day} ${m.start} to ${m.end}"><strong>${s.courseId} · ${s.number}</strong><span>${m.start}–${m.end}</span></button>`)).join('')}</div>`).join('')}</div></div>`}</section><p class="muted schedule-note">The list view provides a compact, accessible alternative to the weekly calendar.</p>`;
}
function historyPage() {
  const events = state.audit.filter(a => identity.role === 'scheduler' || a.facultyId === identity.facultyId);
  return titleBlock('ACTIVITY & HISTORY', 'Every decision, accounted for.', 'Review preference changes, approvals, removals, and the reasons behind them. Timestamps shown in UTC.') + `<section class="panel"><div class="panel-heading"><h2>Activity log</h2>${badge(`${events.length} events`)}</div>${events.length ? `<ol class="timeline">${events.map(a => `<li><span class="timeline-icon">${icon(a.action.includes('removed') ? 'refresh' : 'check')}</span><div><strong>${e(a.action)}</strong><p>${e(a.detail)}</p><small>${e(a.actor)} · <time datetime="${a.at}">${e(new Date(a.at).toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }))} UTC</time></small></div></li>`).join('')}</ol>` : empty('No activity yet', 'Your preference submissions and assignment decisions will appear here.')}</section>`;
}
function navigate(target: string) { page = target; query = ''; sectionFilter = 'all'; shell(); document.querySelector<HTMLElement>('#main')?.focus({ preventScroll: true }); window.scrollTo(0, 0); }
function modal(title: string, body: string) {
  dialog.innerHTML = `<div class="dialog-header"><div class="eyebrow">${TERM} · COMPUTER SCIENCE</div><button class="close-dialog" aria-label="Close dialog">×</button><h2 id="dialog-title">${title}</h2></div><div class="dialog-body">${body}</div>`;
  dialog.querySelector('.close-dialog')!.addEventListener('click', () => dialog.close());
  if (!dialog.open) dialog.showModal();
}
function review(sectionId: string) {
  const section = state.sections.find(s => s.id === sectionId)!;
  const assignment = state.assignments.find(a => a.sectionId === sectionId);
  const summary = `<p class="dialog-subtitle">${e(course(section).name)}<br><span>${e(meetingText(section))} · ${course(section).credits} credits · ${e(section.room)}</span></p>`;
  if (identity.role === 'faculty') {
    const candidate = assess(state, section, person(identity.facultyId));
    modal(`${section.courseId} · Section ${section.number}`, summary + (assignment ? `<div class="info-banner">${badge('Approved', 'green')} Assigned to ${e(person(assignment.facultyId).name)}.</div>` : `<div class="info-banner">${badge(candidate.eligible ? 'Eligible for you' : 'Not eligible', candidate.eligible ? 'green' : 'amber')}</div><ul class="explanation-list">${(candidate.eligible ? candidate.explanation : candidate.reasons).map(r => `<li>${e(r)}</li>`).join('')}</ul>`) + '<p class="muted">Recommendations do not reserve a section. Your scheduler approves assignments.</p>');
    return;
  }
  const editButton = `<button class="text-button edit-section" data-edit-section="${section.id}">Edit section information</button>`;
  if (assignment) {
    modal(`${section.courseId} · Section ${section.number}`, summary + `<div class="info-banner">${badge('Approved', 'green')} ${e(person(assignment.facultyId).name)}</div><form id="remove-form"><div class="form-error" role="alert" hidden></div><label class="field-label" for="remove-reason">Reason for removing this assignment</label><textarea id="remove-reason" name="reason" required maxlength="500" placeholder="Explain why this assignment needs to change…"></textarea><div class="dialog-actions">${editButton}<button class="button danger" type="submit">Remove assignment</button></div></form>`);
    const revision = state.revision;
    dialog.querySelector<HTMLFormElement>('#remove-form')!.onsubmit = async event => { event.preventDefault(); await save({ type: 'remove', assignmentId: assignment.id, reason: String(new FormData(event.currentTarget as HTMLFormElement).get('reason')) }, revision, 'Assignment removed.', true); };
  } else {
    const ranked = recommendations(state, sectionId), eligible = ranked.filter(c => c.eligible), excluded = ranked.filter(c => !c.eligible);
    modal(`${section.courseId} · Section ${section.number}`, summary + `<div class="recommendation-note">${icon('spark')} Ranked by course choice, preferred hours, teaching load, then faculty ID.</div><form id="approve-form"><div class="form-error" role="alert" hidden></div>${eligible.length ? `<fieldset class="candidates"><legend>${eligible.length} eligible candidates</legend>${eligible.map((c, i) => `<label class="candidate"><input type="radio" name="candidate" value="${c.faculty.id}" ${i === 0 ? 'checked' : ''}><span class="avatar">${c.faculty.initials}</span><span class="candidate-detail"><strong>${e(c.faculty.name)} ${i === 0 ? '<span class="top-match">Top match</span>' : ''}</strong><span>${c.explanation.map(text => `<small>${e(text)}</small>`).join('')}</span>${state.preferences.find(p => p.facultyId === c.faculty.id)?.status === 'draft' ? '<small class="draft-note">Preferences currently saved as draft</small>' : ''}</span><span class="candidate-rank">#${i + 1}</span></label>`).join('')}</fieldset><label class="field-label" for="approval-reason">Decision note <span class="muted">— required for a lower-ranked candidate</span></label><textarea id="approval-reason" name="reason" maxlength="500" placeholder="Optional context for this assignment…"></textarea>` : empty('No eligible match', 'No faculty member meets all hard constraints. Review availability, qualifications, or existing assignments.')}<details class="excluded"><summary>Why ${excluded.length} faculty are ineligible</summary>${excluded.map(c => `<p><strong>${e(c.faculty.name)}</strong><br>${e(c.reasons.join(' · '))}</p>`).join('')}</details><div class="dialog-actions">${editButton}<button class="button primary" type="submit" ${!eligible.length ? 'disabled' : ''}>${icon('check')} Approve assignment</button></div></form>`);
    const revision = state.revision;
    dialog.querySelector<HTMLFormElement>('#approve-form')!.onsubmit = async event => { event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement); await save({ type: 'approve', sectionId, facultyId: String(data.get('candidate')), reason: String(data.get('reason')) }, revision, 'Assignment approved. The professor’s schedule has been updated.', true); };
  }
  dialog.querySelector('[data-edit-section]')?.addEventListener('click', () => editSection(section.id));
}
function editFaculty(id: string) {
  const f = person(id), revision = state.revision;
  modal(e(f.name), `<form id="faculty-form"><div class="form-error" role="alert" hidden></div><label class="field-label" for="max-credits">Maximum teaching load (credit hours)</label><input id="max-credits" name="maxCredits" type="number" min="0" max="24" step="1" value="${f.maxCredits}" required><fieldset class="qualification-options"><legend>Qualified courses</legend>${state.courses.map(c => `<label><input type="checkbox" name="qualification" value="${c.id}" ${f.qualified.includes(c.id) ? 'checked' : ''}><span><strong>${c.id}</strong> ${e(c.name)}</span></label>`).join('')}</fieldset><div class="dialog-actions"><span class="muted">Existing assignments must remain valid.</span><button class="button primary" type="submit">Save faculty</button></div></form>`);
  dialog.querySelector<HTMLFormElement>('#faculty-form')!.onsubmit = async event => { event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement); await save({ type: 'faculty', faculty: { ...f, maxCredits: Number(data.get('maxCredits')), qualified: data.getAll('qualification').map(String) } }, revision, 'Faculty qualifications and capacity saved.', true); };
}
function editSection(id: string) {
  const section = state.sections.find(s => s.id === id)!, revision = state.revision;
  modal(`Edit ${section.courseId} · ${section.number}`, `<form id="section-form"><div class="form-error" role="alert" hidden></div><div class="two-fields"><label><span class="field-label">Room</span><input name="room" value="${e(section.room)}" maxlength="80" required></label><label><span class="field-label">Seats</span><input name="seats" type="number" min="1" max="500" value="${section.seats}" required></label></div><fieldset class="meeting-editor"><legend>Existing meeting times</legend>${timeRows('meeting', section.meetings)}</fieldset><p class="muted">Changes are checked against the approved professor’s availability and schedule.</p><div class="dialog-actions"><button class="button primary" type="submit">Save section</button></div></form>`);
  dialog.querySelector<HTMLFormElement>('#section-form')!.onsubmit = async event => { event.preventDefault(); const data = new FormData(event.currentTarget as HTMLFormElement); await save({ type: 'section', section: { ...section, room: String(data.get('room')), seats: Number(data.get('seats')), meetings: readWindows(data, 'meeting') } }, revision, 'Section information saved.', true); };
}
function readWindows(data: FormData, prefix: string): Meeting[] { return DAYS.filter(day => data.has(`${prefix}-${day}-enabled`)).map(day => ({ day, start: String(data.get(`${prefix}-${day}-start`)), end: String(data.get(`${prefix}-${day}-end`)) })); }
async function save(command: Command, revision: number, message: string, closeDialog = false) {
  if (busy) return;
  busy = true;
  const root = closeDialog ? dialog : app;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('button[type="submit"]')];
  buttons.forEach(b => { b.disabled = true; b.setAttribute('aria-busy', 'true'); });
  const errorBox = root.querySelector<HTMLElement>('.form-error');
  let stale = false;
  if (errorBox) errorBox.hidden = true;
  try {
    state = await adapter.execute(identity, command, revision);
    if (closeDialog) dialog.close();
    shell(); notify(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
    if (errorBox) { errorBox.textContent = message; errorBox.hidden = false; errorBox.scrollIntoView({ block: 'nearest' }); }
    else notify(message, true);
    if (error instanceof DemoError && error.code === 'CONFLICT') {
      stale = true;
      state = await adapter.load(); shell();
      if (closeDialog && errorBox) {
        const refresh = document.createElement('button');
        refresh.type = 'button'; refresh.className = 'button'; refresh.textContent = 'Reload current details';
        refresh.onclick = () => {
          if (command.type === 'approve') review(command.sectionId);
          else if (command.type === 'faculty') editFaculty(command.faculty.id);
          else if (command.type === 'section') editSection(command.section.id);
          else { dialog.close(); notify('Latest data loaded. Open the assignment again to continue.'); }
        };
        errorBox.append(document.createElement('br'), refresh);
      } else notify(message, true);
    }
  } finally { busy = false; buttons.forEach(b => { b.disabled = stale; b.removeAttribute('aria-busy'); }); }
}
function bind() {
  app.querySelectorAll<HTMLButtonElement>('[data-page]').forEach(b => b.onclick = () => navigate(b.dataset.page!));
  app.querySelector<HTMLAnchorElement>('.brand')!.onclick = event => { event.preventDefault(); navigate('overview'); };
  app.querySelector<HTMLSelectElement>('#role')!.onchange = event => { identity.role = (event.target as HTMLSelectElement).value as Identity['role']; navigate('overview'); };
  const facultySelect = app.querySelector<HTMLSelectElement>('#faculty-identity');
  if (facultySelect) facultySelect.onchange = () => { identity.facultyId = facultySelect.value; shell(); };
  app.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b => b.onclick = () => action(b.dataset.action!));
  app.querySelectorAll<HTMLButtonElement>('[data-review]').forEach(b => b.onclick = () => review(b.dataset.review!));
  app.querySelectorAll<HTMLButtonElement>('[data-faculty]').forEach(b => b.onclick = () => editFaculty(b.dataset.faculty!));
  const search = app.querySelector<HTMLInputElement>('#section-search');
  if (search) search.oninput = () => { const position = search.selectionStart; query = search.value; shell(); const next = app.querySelector<HTMLInputElement>('#section-search')!; next.focus(); next.setSelectionRange(position, position); };
  const filter = app.querySelector<HTMLSelectElement>('#section-filter');
  if (filter) filter.onchange = () => { sectionFilter = filter.value; shell(); app.querySelector<HTMLElement>('#section-filter')?.focus(); };
  const scheduleSelect = app.querySelector<HTMLSelectElement>('#schedule-faculty');
  if (scheduleSelect) scheduleSelect.onchange = () => { scheduleFaculty = scheduleSelect.value; shell(); };
  app.querySelectorAll<HTMLButtonElement>('[data-schedule-mode]').forEach(b => b.onclick = () => { scheduleMode = b.dataset.scheduleMode!; shell(); });
  const form = app.querySelector<HTMLFormElement>('#preferences-form');
  if (form) form.onsubmit = async event => {
    event.preventDefault(); const data = new FormData(form), intent = (event.submitter as HTMLButtonElement)?.value || 'draft';
    const pref: Preference = { facultyId: identity.facultyId, rankedCourses: Array.from({ length: 5 }, (_, i) => String(data.get(`rank-${i}`))).filter(Boolean), availability: readWindows(data, 'available'), preferred: readWindows(data, 'preferred'), status: intent as Preference['status'], updatedAt: new Date().toISOString() };
    await save({ type: 'preference', preference: pref }, state.revision, intent === 'submitted' ? 'Preferences submitted. Your scheduler can now review them.' : 'Draft saved in this browser.');
  };
}
function action(name: string) {
  if (name === 'export') {
    const blob = new Blob(['\uFEFF' + assignmentsCsv(state)], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'facultyplan-spring-2027.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); notify('Approved assignments exported.');
  }
  if (name === 'no-match') review('SEC-060');
  if (name === 'reset') {
    modal('Reset the demo?', '<p>This restores the original 25 professors, 60 sections, and sample assignments. Changes saved in this browser will be cleared.</p><div class="dialog-actions"><button class="button" id="cancel-reset">Keep my changes</button><button class="button danger" id="confirm-reset">Reset demo data</button></div>');
    dialog.querySelector<HTMLButtonElement>('#cancel-reset')!.onclick = () => dialog.close();
    dialog.querySelector<HTMLButtonElement>('#confirm-reset')!.onclick = async () => { try { state = await adapter.reset(); dialog.close(); navigate('overview'); notify('Demo reset to the original synthetic dataset.'); } catch (error) { notify((error as Error).message, true); } };
  }
  if (name === 'guide') {
    modal('Try the complete journey', '<ol class="guide"><li><strong>Become a professor.</strong> Use the role selector and choose Maya Chen.</li><li><strong>Submit preferences.</strong> Open My preferences, adjust course choices, and submit.</li><li><strong>Review as scheduler.</strong> Switch back, open Course sections, and review an unassigned section.</li><li><strong>Approve a match.</strong> Read the explanations and approve an eligible professor.</li><li><strong>See the result.</strong> Switch to that professor and open My schedule. Reload to verify persistence.</li></ol><div class="info-banner">This prototype stores synthetic data in your browser. Role switching simulates identity; it is not real authentication.</div><h3>Explore a failure state</h3><p class="muted">The next save or approval will fail once, without changing any data.</p><button class="button" id="simulate-failure">Simulate next save failure</button>');
    dialog.querySelector<HTMLButtonElement>('#simulate-failure')!.onclick = () => { adapter.failNext = true; dialog.close(); notify('Demo failure armed. The next save will show a recoverable error.'); };
  }
}
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) notify('Demo data changed in another tab. Your next save will recheck the latest version.'); });
async function start() {
  try { state = await adapter.load(); shell(); }
  catch (error) {
    app.innerHTML = `<main class="startup-error"><h1>Let’s restore your workspace.</h1><p role="alert">${e((error as Error).message)}</p><button class="button primary" id="restore">Reset demo data</button><button class="button" id="retry">Try again</button></main>`;
    app.querySelector<HTMLButtonElement>('#restore')!.onclick = async () => { try { state = await adapter.reset(); shell(); } catch (err) { notify((err as Error).message, true); } };
    app.querySelector<HTMLButtonElement>('#retry')!.onclick = () => void start();
  }
}
void start();
