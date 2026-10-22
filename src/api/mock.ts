// Demo backend used while VITE_USE_MOCKS=true. It implements docs/API.md (member) and
// docs/API-ADMIN.md (admin) against an in-browser database saved to localStorage, so
// edits made in the admin dashboard show up in the member portal and survive a reload.
// It doubles as a reference implementation of the request and response shapes.
import type {
  AdminAnnouncement,
  AdminDonation,
  AdminEvent,
  AdminFund,
  AdminGroup,
  ChurchSettings,
  Dashboard,
  ImportResult,
  JoinRequest,
  PaymentMethod,
  Person,
  PersonInput,
  StaffMember,
} from './admin-types';
import { ApiError } from './errors';
import type { ChurchEvent, Donation, GiveIntentInput, Group, Member, Session } from './types';

export const DEMO_OTP = '123456';
const DB_KEY = 'fw.demoDb';
const DB_VERSION = 1;
const RESEED_AFTER_DAYS = 7; // event dates are relative to the seed day
const DAY = 86_400_000;
const PAGE = 50;
const ME = 'p_priya'; // the member signed in to the member portal

type Db = {
  version: number;
  seededAt: number;
  settings: ChurchSettings;
  people: Person[];
  events: AdminEvent[];
  rsvps: Record<string, string[]>;
  groups: AdminGroup[];
  groupMembers: Record<string, string[]>;
  joinRequests: JoinRequest[];
  funds: Omit<AdminFund, 'raisedThisYear'>[];
  donations: AdminDonation[];
  announcements: AdminAnnouncement[];
  staff: StaffMember[];
  sundayAttendance: { date: string; count: number }[];
  seq: number;
};

// ---------- seed data ----------

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MALE = ['Samuel', 'Joseph', 'Rahul', 'John', 'David', 'Abraham', 'Daniel', 'Thomas', 'Mathew', 'Jacob', 'Arun', 'Vijay', 'Suresh', 'Prakash', 'Anil', 'Kiran', 'Joel', 'Stephen', 'Paul', 'Peter', 'Ravi', 'Sunil', 'Ajay', 'Benny', 'Rajesh', 'Vinod', 'Christopher', 'Emmanuel', 'Noel', 'Aaron'];
const FEMALE = ['Anita', 'Mercy', 'Grace', 'Sarah', 'Esther', 'Ruth', 'Mary', 'Rachel', 'Deborah', 'Sneha', 'Divya', 'Shalini', 'Kavya', 'Asha', 'Lydia', 'Hannah', 'Leena', 'Jessy', 'Sheela', 'Nisha', 'Reena', 'Angel', 'Blessy', 'Jasmine', 'Susan', 'Rebecca', 'Merlin', 'Glory', 'Christina', 'Joy'];
const SURNAMES = ['Varghese', 'Daniel', 'Joseph', 'Mathew', 'Raj', 'Kumar', 'George', 'Abraham', 'Samuel', 'Jacob', 'Philip', 'Chacko', 'Pillai', 'Reddy', 'Rao', 'Das', "D'Souza", 'Fernandes', 'Pereira', 'Masih', 'Paul', 'John', 'Kurian', 'Cherian', 'Ninan', 'Rodrigues', 'Lobo', 'Gomes', 'Prasad', 'Isaac'];
const AREAS = ['Kondapur', 'Gachibowli', 'Madhapur', 'Kukatpally', 'Begumpet', 'Secunderabad', 'Ameerpet', 'Miyapur', 'Banjara Hills', 'Uppal'];
const TAGS = ['Choir', 'Usher', 'Kids church', 'Media team', 'Welcome team', 'Youth', 'Baptised', 'New believer'];

function seed(): Db {
  const r = rng(20261022);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const now = Date.now();
  const at = (days: number, hour: number, minute = 0) => {
    const d = new Date(now + days * DAY);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  const today = new Date();
  const toSunday = (7 - today.getDay()) % 7 || 7;

  // People, grouped into households
  const people: Person[] = [];
  const phone = () => `+91 9${Math.floor(r() * 1e9).toString().padStart(9, '0').replace(/(\d{4})(\d{5})/, '$1 $2')}`;
  const addPerson = (p: Partial<Person> & Pick<Person, 'firstName' | 'lastName'>) => {
    const status = p.status ?? (r() < 0.72 ? 'member' : r() < 0.6 ? 'regular' : r() < 0.6 ? 'visitor' : 'inactive');
    const person: Person = {
      id: p.id ?? `p_${people.length + 1}`,
      phone: phone(),
      email: r() < 0.7 ? `${p.firstName.toLowerCase()}.${p.lastName.toLowerCase().replace(/[^a-z]/g, '')}@example.com` : null,
      gender: null,
      birthDate: `${1955 + Math.floor(r() * 55)}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`,
      householdName: null,
      address: `${pick(AREAS)}, Hyderabad`,
      language: r() < 0.15 ? 'hi' : 'en',
      tags: r() < 0.4 ? [pick(TAGS)] : [],
      notes: null,
      joinedAt: new Date(now - Math.floor(r() * 900) * DAY).toISOString(),
      lastAttendedAt: status === 'inactive' ? new Date(now - (60 + Math.floor(r() * 200)) * DAY).toISOString() : new Date(now - Math.floor(r() * 21) * DAY).toISOString(),
      groups: [],
      ...p,
      status,
    };
    people.push(person);
    return person;
  };

  const thomas = 'Thomas family';
  addPerson({ id: ME, firstName: 'Priya', lastName: 'Thomas', gender: 'female', phone: '+91 98765 43210', email: 'priya@example.com', householdName: thomas, status: 'member', tags: ['Choir'], birthDate: '1991-10-24', address: 'Kondapur, Hyderabad' });
  addPerson({ firstName: 'Arun', lastName: 'Thomas', gender: 'male', householdName: thomas, status: 'member', address: 'Kondapur, Hyderabad' });
  addPerson({ firstName: 'Joel', lastName: 'Thomas', gender: 'male', householdName: thomas, status: 'member', email: null, birthDate: '2015-03-11', tags: ['Kids church'], address: 'Kondapur, Hyderabad' });

  for (let h = 0; h < 48; h++) {
    const last = SURNAMES[h % SURNAMES.length];
    const size = r() < 0.25 ? 1 : r() < 0.5 ? 2 : r() < 0.7 ? 3 : 4;
    const household = size > 1 ? `${last} family` : null;
    const address = `${pick(AREAS)}, Hyderabad`;
    for (let i = 0; i < size; i++) {
      const female = i === 1 ? true : i === 0 ? r() < 0.4 : r() < 0.5;
      addPerson({ firstName: pick(female ? FEMALE : MALE), lastName: last, gender: female ? 'female' : 'male', householdName: household, address });
    }
  }
  // Make sure a few birthdays fall this week for the dashboard
  for (let i = 0; i < 3; i++) {
    const d = new Date(now + (i * 2 + 1) * DAY);
    people[10 + i * 7].birthDate = `19${80 + i * 4}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  // A handful of newcomers this month
  for (let i = 0; i < 6; i++) {
    people[people.length - 1 - i].joinedAt = new Date(now - (i * 3 + 1) * DAY).toISOString();
    people[people.length - 1 - i].status = 'visitor';
  }

  const events: AdminEvent[] = [
    { id: 'ev_1', kind: 'service', title: 'Sunday Worship (English)', description: 'Join us for worship, the Word and fellowship. Kids church runs alongside the service.', startsAt: at(toSunday, 9), endsAt: at(toSunday, 11), location: 'Main Sanctuary', goingCount: 0, capacity: null, imageUrl: null, published: true, attendance: null },
    { id: 'ev_2', kind: 'service', title: 'Sunday Worship (Telugu)', description: 'Telugu service with live English translation on headsets.', startsAt: at(toSunday, 11, 30), endsAt: at(toSunday, 13), location: 'Main Sanctuary', goingCount: 0, capacity: null, imageUrl: null, published: true, attendance: null },
    { id: 'ev_3', kind: 'event', title: 'Youth Night', description: 'Games, worship and a short talk for ages 13 to 19. Snacks provided.', startsAt: at(2, 18, 30), endsAt: at(2, 21), location: 'Fellowship Hall', goingCount: 0, capacity: 120, imageUrl: null, published: true, attendance: null },
    { id: 'ev_4', kind: 'event', title: 'Blood Donation Camp', description: 'Give blood, save lives. Volunteers needed for registration and refreshments.', startsAt: at(6, 9), endsAt: at(6, 15), location: 'Fellowship Hall', goingCount: 0, capacity: 150, imageUrl: null, published: true, attendance: null },
    { id: 'ev_5', kind: 'event', title: 'Marriage Enrichment Evening', description: 'An evening for couples with dinner, a talk and time to connect.', startsAt: at(12, 19), endsAt: at(12, 21, 30), location: 'Banquet Room, 2nd floor', goingCount: 0, capacity: 40, imageUrl: null, published: true, attendance: null },
    { id: 'ev_6', kind: 'event', title: 'Christmas Carol Service', description: 'Carols, readings and the Christmas story. Invite your neighbours!', startsAt: at(60, 18), endsAt: at(60, 20), location: 'Main Sanctuary', goingCount: 0, capacity: null, imageUrl: null, published: false, attendance: null },
    { id: 'ev_7', kind: 'service', title: 'Sunday Worship (English)', description: 'Last week’s service.', startsAt: at(toSunday - 7, 9), endsAt: at(toSunday - 7, 11), location: 'Main Sanctuary', goingCount: 0, capacity: null, imageUrl: null, published: true, attendance: 846 },
    { id: 'ev_8', kind: 'event', title: 'Men’s Breakfast', description: 'Breakfast and a talk on work and faith.', startsAt: at(-5, 8), endsAt: at(-5, 10), location: 'Fellowship Hall', goingCount: 0, capacity: 60, imageUrl: null, published: true, attendance: 47 },
  ];
  const rsvps: Record<string, string[]> = {};
  for (const ev of events) {
    const share = ev.kind === 'service' ? 0.55 : Math.min(0.6, ((ev.capacity ?? 100) * (0.3 + r() * 0.4)) / people.length);
    rsvps[ev.id] = people.filter((p) => p.id !== ME && r() < share).map((p) => p.id);
  }
  rsvps.ev_3 = [...new Set([...rsvps.ev_3, ME])];

  const groups: AdminGroup[] = [
    { id: 'gr_1', name: 'Kondapur Home Group', description: 'Bible study and prayer for families in Kondapur and Gachibowli.', meetingSchedule: 'Wednesdays, 7:30 pm', location: 'Kondapur', leaderName: 'Joseph & Anita', memberCount: 0, isOpen: true, pendingRequests: 0 },
    { id: 'gr_2', name: 'Young Professionals', description: 'For working adults in their 20s and 30s. Meets near HITEC City.', meetingSchedule: 'Fridays, 8:00 pm', location: 'HITEC City', leaderName: 'Rahul Varghese', memberCount: 0, isOpen: true, pendingRequests: 0 },
    { id: 'gr_3', name: "Women's Prayer Fellowship", description: 'Prayer, worship and encouragement every Saturday morning.', meetingSchedule: 'Saturdays, 10:00 am', location: 'Prayer Room', leaderName: 'Mercy Daniel', memberCount: 0, isOpen: true, pendingRequests: 0 },
    { id: 'gr_4', name: 'Worship Team', description: 'Musicians and singers serving on Sundays. Auditions required.', meetingSchedule: 'Thursdays, 7:00 pm', location: 'Main Sanctuary', leaderName: 'David Samuel', memberCount: 0, isOpen: false, pendingRequests: 0 },
    { id: 'gr_5', name: 'Secunderabad Home Group', description: 'A friendly mid-week group for anyone near Secunderabad and Begumpet.', meetingSchedule: 'Tuesdays, 7:30 pm', location: 'Secunderabad', leaderName: 'Paul & Grace Kurian', memberCount: 0, isOpen: true, pendingRequests: 0 },
  ];
  const groupMembers: Record<string, string[]> = {};
  for (const g of groups) groupMembers[g.id] = people.filter(() => r() < 0.12).map((p) => p.id);
  groupMembers.gr_1 = [...new Set([...groupMembers.gr_1, ME])];
  groupMembers.gr_2 = groupMembers.gr_2.filter((id) => id !== ME);
  groupMembers.gr_3 = groupMembers.gr_3.filter((id) => id !== ME);

  const joinRequests: JoinRequest[] = [5, 22, 41, 63].map((i, k) => ({
    id: `jr_${k + 1}`,
    groupId: groups[k % 3 === 0 ? 1 : 4].id,
    groupName: groups[k % 3 === 0 ? 1 : 4].name,
    person: { id: people[i].id, name: `${people[i].firstName} ${people[i].lastName}`, phone: people[i].phone },
    requestedAt: new Date(now - (k + 1) * 0.7 * DAY).toISOString(),
  }));

  const funds: Db['funds'] = [
    { id: 'fd_tithe', name: 'Tithes & Offerings', description: 'General ministry of the church.', taxDeductible: true, active: true, goal: null },
    { id: 'fd_building', name: 'Building Fund', description: 'New sanctuary construction.', taxDeductible: true, active: true, goal: 5_000_000_000 },
    { id: 'fd_missions', name: 'Missions', description: 'Church planting in North India.', taxDeductible: false, active: true, goal: null },
    { id: 'fd_relief', name: 'Flood Relief 2025', description: 'Closed appeal.', taxDeductible: true, active: false, goal: null },
  ];

  const donations: AdminDonation[] = [];
  const amounts = [50000, 100000, 100000, 200000, 250000, 500000, 500000, 1000000, 1500000, 2500000, 5000000];
  for (let i = 0; i < 380; i++) {
    const daysAgo = Math.floor(r() * 180);
    const donor = r() < 0.08 ? null : pick(people.slice(1)); // people[0] is the demo member, who has their own history
    const fund = r() < 0.7 ? funds[0] : r() < 0.6 ? funds[1] : funds[2];
    const methodRoll = r();
    const method = methodRoll < 0.6 ? 'upi' : methodRoll < 0.75 ? 'card' : methodRoll < 0.85 ? 'netbanking' : methodRoll < 0.95 ? 'cash' : 'cheque';
    const foreign = r() < 0.03;
    donations.push({
      id: `dn_${i + 1}`,
      donorId: donor?.id ?? null,
      donorName: donor ? `${donor.firstName} ${donor.lastName}` : 'Anonymous (cash box)',
      fundId: fund.id,
      fundName: fund.name,
      amount: pick(amounts),
      currency: 'INR',
      frequency: r() < 0.3 ? 'monthly' : 'once',
      status: r() < 0.96 ? 'succeeded' : r() < 0.5 ? 'failed' : 'refunded',
      createdAt: new Date(now - daysAgo * DAY - Math.floor(r() * DAY)).toISOString(),
      receiptUrl: null,
      method,
      pan: donor && r() < 0.45 ? `${'ABCDEFGHJK'[Math.floor(r() * 10)]}${'PQRSTU'[Math.floor(r() * 6)]}XPT${Math.floor(1000 + r() * 8999)}${'ABCDEFGH'[Math.floor(r() * 8)]}` : null,
      donorCitizenship: foreign ? 'OTHER' : 'IN',
      fcra: foreign,
    });
  }
  donations.push(
    { id: 'dn_me1', donorId: ME, donorName: 'Priya Thomas', fundId: 'fd_tithe', fundName: 'Tithes & Offerings', amount: 500000, currency: 'INR', frequency: 'monthly', status: 'succeeded', createdAt: at(-20, 10), receiptUrl: null, method: 'upi', pan: 'ABCPT1234K', donorCitizenship: 'IN', fcra: false },
    { id: 'dn_me2', donorId: ME, donorName: 'Priya Thomas', fundId: 'fd_missions', fundName: 'Missions', amount: 100000, currency: 'INR', frequency: 'once', status: 'succeeded', createdAt: at(-45, 12), receiptUrl: null, method: 'card', pan: null, donorCitizenship: 'IN', fcra: false },
  );
  donations.sort((x, y) => y.createdAt.localeCompare(x.createdAt));

  const sundayAttendance = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now + (toSunday - 7 * (12 - i)) * DAY);
    return { date: d.toISOString().slice(0, 10), count: Math.round(760 + i * 8 + r() * 70 - (i === 7 ? 120 : 0)) };
  });
  sundayAttendance[10].count = 812;
  sundayAttendance[11].count = 846;

  return {
    version: DB_VERSION,
    seededAt: now,
    settings: {
      id: 'ch_demo',
      name: 'Grace Community Church',
      city: 'Hyderabad',
      country: 'IN',
      currency: 'INR',
      logoUrl: null,
      paymentProvider: 'razorpay',
      address: 'Plot 12, Road No. 3, Kondapur, Hyderabad, Telangana 500084',
      phone: '+91 40 2345 6789',
      email: 'office@gracechurch.in',
      website: 'https://gracechurch.in',
      timezone: 'Asia/Kolkata',
      languages: ['en', 'hi'],
      payments: { provider: 'razorpay', connected: true, accountId: 'acc_Demo12345' },
      fcra: { registered: true, registrationNumber: '010230456', accountLast4: '4821' },
      receipts80g: { enabled: true, registrationNumber: 'AAATG1234QF20214', pan: 'AAATG1234Q' },
    },
    people,
    events,
    rsvps,
    groups,
    groupMembers,
    joinRequests,
    funds,
    donations,
    announcements: [
      { id: 'an_1', title: 'Christmas choir auditions', body: 'Auditions for the Christmas choir are open after both services this Sunday. Speak to Pastor Samuel at the welcome desk.', publishedAt: at(-1, 9), status: 'published', imageUrl: null },
      { id: 'an_2', title: 'Blood donation drive', body: 'Together with a city blood bank we are hosting a donation camp in the fellowship hall. Please bring a photo ID.', publishedAt: at(-3, 18), status: 'published', imageUrl: null },
      { id: 'an_3', title: 'New sanctuary update', body: 'Draft: the foundation work is complete. Photos and next steps to follow.', publishedAt: at(0, 8), status: 'draft', imageUrl: null },
    ],
    staff: [
      { id: 'st_1', name: 'Pastor Samuel Raj', email: 'pastor@gracechurch.in', phone: '+91 98480 12345', role: 'owner', status: 'active', lastActiveAt: new Date(now).toISOString() },
      { id: 'st_2', name: 'Leena George', email: 'office@gracechurch.in', phone: '+91 98480 22222', role: 'admin', status: 'active', lastActiveAt: at(-1, 17) },
      { id: 'st_3', name: 'Vinod Mathew', email: 'accounts@gracechurch.in', phone: null, role: 'finance', status: 'active', lastActiveAt: at(-4, 11) },
      { id: 'st_4', name: 'Rahul Varghese', email: 'rahul@example.com', phone: null, role: 'leader', status: 'invited', lastActiveAt: null },
    ],
    sundayAttendance,
    seq: 1000,
  };
}

// ---------- persistence ----------

let db = undefined as unknown as Db;
db = load();

function load(): Db {
  try {
    if (db && localStorage.getItem(DB_KEY) === null) return db;
    const saved = JSON.parse(localStorage.getItem(DB_KEY) ?? 'null') as Db | null;
    if (saved && saved.version === DB_VERSION && Date.now() - saved.seededAt < RESEED_AFTER_DAYS * DAY) return saved;
  } catch {
    /* fall through to a fresh seed */
  }
  return seed();
}

function save() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

export function resetDemoData() {
  db = seed();
  save();
}

const nextId = (prefix: string) => `${prefix}_${++db.seq}`;

// ---------- derived views ----------

const fullName = (p: Person) => `${p.firstName} ${p.lastName}`;

function personView(p: Person): Person {
  const groups = db.groups.filter((g) => db.groupMembers[g.id]?.includes(p.id)).map((g) => ({ id: g.id, name: g.name }));
  return { ...p, groups };
}

function eventView(ev: AdminEvent): AdminEvent {
  return { ...ev, goingCount: db.rsvps[ev.id]?.length ?? 0 };
}

function groupView(g: AdminGroup): AdminGroup {
  return { ...g, memberCount: db.groupMembers[g.id]?.length ?? 0, pendingRequests: db.joinRequests.filter((j) => j.groupId === g.id).length };
}

function fundView(f: Db['funds'][number]): AdminFund {
  const yearStart = fiscalYearStart();
  const raisedThisYear = db.donations
    .filter((d) => d.fundId === f.id && d.status === 'succeeded' && new Date(d.createdAt) >= yearStart)
    .reduce((s, d) => s + d.amount, 0);
  return { ...f, raisedThisYear };
}

/** Indian financial year starts 1 April. */
function fiscalYearStart(now = new Date()) {
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(y, 3, 1);
}

function memberProfile(): Member {
  const p = db.people.find((x) => x.id === ME)!;
  return { id: p.id, firstName: p.firstName, lastName: p.lastName, phone: p.phone, email: p.email, language: p.language, householdName: p.householdName, photoUrl: null };
}

function memberEvent(ev: AdminEvent): ChurchEvent {
  const { published: _p, attendance: _a, ...rest } = eventView(ev);
  return { ...rest, myRsvp: db.rsvps[ev.id]?.includes(ME) ? 'going' : null };
}

function memberGroup(g: AdminGroup): Group {
  const { isOpen: _o, pendingRequests: _r, ...rest } = groupView(g);
  const membership = db.groupMembers[g.id]?.includes(ME) ? 'member' : db.joinRequests.some((j) => j.groupId === g.id && j.person.id === ME) ? 'requested' : 'none';
  return { ...rest, membership };
}

function church(): Session['church'] {
  const s = db.settings;
  return { id: s.id, name: s.name, city: s.city, country: s.country, currency: s.currency, logoUrl: s.logoUrl, paymentProvider: s.paymentProvider };
}

function session(scope: 'admin' | 'member'): Session {
  const staff = db.staff[0];
  const member: Member =
    scope === 'member'
      ? memberProfile()
      : { id: staff.id, firstName: 'Samuel', lastName: 'Raj', email: staff.email, phone: staff.phone, language: 'en', householdName: null, photoUrl: null };
  return {
    accessToken: `demo-${scope}-access`,
    refreshToken: `demo-${scope}-refresh`,
    expiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
    member,
    church: church(),
    staff: scope === 'admin' ? { role: staff.role } : null,
  };
}

function upcoming(ev: AdminEvent) {
  return new Date(ev.endsAt).getTime() > Date.now();
}

function page<T>(items: T[], cursor?: string | null) {
  const start = Number(cursor ?? 0) || 0;
  const data = items.slice(start, start + PAGE);
  return { data, nextCursor: start + PAGE < items.length ? String(start + PAGE) : null, total: items.length };
}

function dashboard(): Dashboard {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const ok = db.donations.filter((d) => d.status === 'succeeded');
  const sumBetween = (from: Date, to: Date) => ok.filter((d) => new Date(d.createdAt) >= from && new Date(d.createdAt) < to).reduce((s, d) => s + d.amount, 0);
  const trend = Array.from({ length: 6 }, (_, i) => {
    const from = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - 4 + i, 1);
    return { month: from.toISOString().slice(0, 7), amount: sumBetween(from, to) };
  });
  const weekAhead = Array.from({ length: 7 }, (_, i) => new Date(now.getTime() + i * DAY));
  const birthdays = db.people
    .filter((p) => p.birthDate && p.status !== 'inactive')
    .map((p) => {
      const [, mm, dd] = p.birthDate!.split('-').map(Number);
      const hit = weekAhead.find((d) => d.getMonth() + 1 === mm && d.getDate() === dd);
      return hit ? { id: p.id, name: fullName(p), date: hit.toISOString() } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((x, y) => x.date.localeCompare(y.date));

  return {
    currency: db.settings.currency,
    people: {
      total: db.people.length,
      members: db.people.filter((p) => p.status === 'member').length,
      newThisMonth: db.people.filter((p) => new Date(p.joinedAt) >= monthStart || Date.now() - new Date(p.joinedAt).getTime() < 30 * DAY).length,
    },
    attendance: { lastSunday: db.sundayAttendance.at(-1)?.count ?? 0, trend: db.sundayAttendance },
    giving: { thisMonth: sumBetween(monthStart, now), lastMonth: sumBetween(lastMonthStart, monthStart), trend },
    pendingJoinRequests: db.joinRequests.length,
    upcomingEvents: db.events.filter((e) => e.published && upcoming(e)).sort(bySoonest).slice(0, 4).map(eventView),
    recentDonations: ok.slice(0, 6),
    birthdaysThisWeek: birthdays.slice(0, 6),
  };
}

const bySoonest = (x: AdminEvent, y: AdminEvent) => x.startsAt.localeCompare(y.startsAt);

function requireFields(body: Record<string, unknown>, fields: string[]) {
  const missing: Record<string, string> = {};
  for (const f of fields) if (body[f] === undefined || body[f] === null || String(body[f]).trim() === '') missing[f] = 'Required';
  if (Object.keys(missing).length) throw new ApiError(422, 'invalid', 'Please fill in the required fields.', missing);
}

function importPeople(rows: PersonInput[], dedupeBy: 'phone' | 'email'): ImportResult {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  const norm = (v: string | null | undefined) => (dedupeBy === 'phone' ? (v ?? '').replace(/\D/g, '').slice(-10) : (v ?? '').trim().toLowerCase());
  rows.forEach((row, i) => {
    if (!row.firstName?.trim()) {
      result.errors.push({ row: i + 1, message: 'Missing first name' });
      return;
    }
    const key = norm(dedupeBy === 'phone' ? row.phone : row.email);
    const existing = key ? db.people.find((p) => norm(dedupeBy === 'phone' ? p.phone : p.email) === key) : undefined;
    if (existing) {
      const patch = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined && v !== null && v !== ''));
      if (Object.keys(patch).length <= 2) result.skipped++;
      else {
        Object.assign(existing, patch);
        result.updated++;
      }
      return;
    }
    db.people.push(newPerson(row));
    result.created++;
  });
  return result;
}

function newPerson(input: PersonInput): Person {
  return {
    id: nextId('p'),
    phone: null,
    email: null,
    gender: null,
    birthDate: null,
    status: 'visitor',
    householdName: null,
    address: null,
    language: 'en',
    tags: [],
    notes: null,
    ...input,
    joinedAt: new Date().toISOString(),
    lastAttendedAt: null,
    groups: [],
  };
}

// ---------- router ----------

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Handler = (ctx: { params: string[]; query: URLSearchParams; body: any; scope: 'admin' | 'member' }) => unknown;

const routes: [string, RegExp, Handler][] = [];
const route = (method: string, pattern: string, handler: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/:\w+/g, '([^/]+)')}$`), handler]);

function find<T extends { id: string }>(items: T[], id: string, what: string) {
  const item = items.find((x) => x.id === id);
  if (!item) throw new ApiError(404, 'not_found', `${what} not found.`);
  return item;
}

// Auth (both scopes)
route('POST', '/auth/otp/request', ({ body }) => {
  if (!body?.identifier?.trim()) throw new ApiError(422, 'invalid', 'Enter your phone number or email.', { identifier: 'Required' });
  return { requestId: 'otp_demo', channel: String(body.identifier).includes('@') ? 'email' : 'whatsapp', expiresInSeconds: 300 };
});
route('POST', '/auth/otp/verify', ({ body, scope }) => {
  if (body?.code !== DEMO_OTP) throw new ApiError(422, 'invalid_code', `That code is not right. In demo mode use ${DEMO_OTP}.`);
  return session(scope);
});
route('POST', '/auth/refresh', ({ scope }) => session(scope));
route('POST', '/auth/sign-out', () => undefined);

// Member (mobile contract)
route('GET', '/me', () => memberProfile());
route('PATCH', '/me', ({ body }) => {
  const p = db.people.find((x) => x.id === ME)!;
  for (const k of ['firstName', 'lastName', 'email', 'language'] as const) if (body[k] !== undefined) (p as any)[k] = body[k];
  return memberProfile();
});
route('POST', '/me/devices', () => undefined);
route('GET', '/home', () => {
  const visible = db.events.filter((e) => e.published && upcoming(e)).sort(bySoonest);
  return {
    nextService: visible.find((e) => e.kind === 'service') ? memberEvent(visible.find((e) => e.kind === 'service')!) : null,
    announcements: db.announcements.filter((a) => a.status === 'published').map(({ status: _s, ...a }) => a),
    upcomingEvents: visible.filter((e) => e.kind === 'event').slice(0, 3).map(memberEvent),
  };
});
route('GET', '/events', () => ({ data: db.events.filter((e) => e.published && upcoming(e)).sort(bySoonest).map(memberEvent), nextCursor: null }));
route('GET', '/events/:id', ({ params }) => memberEvent(find(db.events, params[0], 'Event')));
route('PUT', '/events/:id/rsvp', ({ params, body }) => {
  const ev = find(db.events, params[0], 'Event');
  const list = new Set(db.rsvps[ev.id] ?? []);
  if (body.status === 'going') {
    if (ev.capacity && list.size >= ev.capacity && !list.has(ME)) throw new ApiError(409, 'full', 'Sorry, this event is full.');
    list.add(ME);
  } else list.delete(ME);
  db.rsvps[ev.id] = [...list];
  return memberEvent(ev);
});
route('GET', '/groups', () => ({ data: db.groups.filter((g) => g.isOpen).map(memberGroup), nextCursor: null }));
route('POST', '/groups/:id/join-requests', ({ params }) => {
  const g = find(db.groups, params[0], 'Group');
  const me = db.people.find((p) => p.id === ME)!;
  if (!db.joinRequests.some((j) => j.groupId === g.id && j.person.id === ME) && !db.groupMembers[g.id]?.includes(ME)) {
    db.joinRequests.push({ id: nextId('jr'), groupId: g.id, groupName: g.name, person: { id: ME, name: fullName(me), phone: me.phone }, requestedAt: new Date().toISOString() });
  }
  return memberGroup(g);
});
route('GET', '/giving/funds', () => db.funds.filter((f) => f.active).map(({ id, name, description, taxDeductible }) => ({ id, name, description, taxDeductible })));
route('POST', '/giving/intents', ({ body }) => {
  const input = body as GiveIntentInput;
  const fund = find(db.funds, input.fundId, 'Fund');
  if (!input.amount || input.amount < 100) throw new ApiError(422, 'invalid', 'Enter an amount.', { amount: 'Required' });
  if (input.donorCitizenship === 'OTHER' && !db.settings.fcra.registered)
    throw new ApiError(422, 'fcra_not_registered', 'This church cannot accept gifts from foreign citizens or OCI holders.');
  const d: AdminDonation = {
    id: nextId('dn'),
    donorId: ME,
    donorName: fullName(db.people.find((p) => p.id === ME)!),
    fundId: fund.id,
    fundName: fund.name,
    amount: input.amount,
    currency: input.currency,
    frequency: input.frequency,
    status: 'succeeded', // a real backend sets this from the payment webhook
    createdAt: new Date().toISOString(),
    receiptUrl: null,
    method: 'upi',
    pan: input.pan || null,
    donorCitizenship: input.donorCitizenship,
    fcra: input.donorCitizenship === 'OTHER',
  };
  db.donations.unshift(d);
  return { donationId: d.id, checkoutUrl: '' };
});
route('GET', '/giving/donations', () => ({
  data: db.donations
    .filter((d) => d.donorId === ME)
    .map(({ id, fundName, amount, currency, frequency, status, createdAt, receiptUrl }): Donation => ({ id, fundName, amount, currency, frequency, status, createdAt, receiptUrl })),
  nextCursor: null,
}));

// Admin
route('GET', '/admin/dashboard', () => dashboard());

route('GET', '/admin/people', ({ query }) => {
  const q = (query.get('q') ?? '').trim().toLowerCase();
  const status = query.get('status');
  const digits = q.replace(/\D/g, '');
  const list = db.people
    .filter((p) => !status || p.status === status)
    .filter((p) => !q || fullName(p).toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q) || (digits.length >= 3 && (p.phone ?? '').replace(/\D/g, '').includes(digits)) || (p.householdName ?? '').toLowerCase().includes(q))
    .sort((x, y) => x.lastName.localeCompare(y.lastName) || x.firstName.localeCompare(y.firstName))
    .map(personView);
  return page(list, query.get('cursor'));
});
route('POST', '/admin/people', ({ body }) => {
  requireFields(body, ['firstName', 'lastName']);
  const p = newPerson(body);
  db.people.push(p);
  return personView(p);
});
route('POST', '/admin/people/import', ({ body }) => importPeople(body.rows ?? [], body.dedupeBy ?? 'phone'));
route('GET', '/admin/people/:id', ({ params }) => personView(find(db.people, params[0], 'Person')));
route('PATCH', '/admin/people/:id', ({ params, body }) => {
  const p = find(db.people, params[0], 'Person');
  const { id: _i, groups: _g, joinedAt: _j, ...patch } = body;
  Object.assign(p, patch);
  return personView(p);
});
route('DELETE', '/admin/people/:id', ({ params }) => {
  db.people = db.people.filter((p) => p.id !== params[0]);
  for (const g of Object.keys(db.groupMembers)) db.groupMembers[g] = db.groupMembers[g].filter((id) => id !== params[0]);
});

route('GET', '/admin/events', ({ query }) => {
  const past = query.get('when') === 'past';
  const list = db.events.filter((e) => (past ? !upcoming(e) : upcoming(e))).sort(bySoonest);
  return { data: (past ? list.reverse() : list).map(eventView), nextCursor: null };
});
route('POST', '/admin/events', ({ body }) => {
  requireFields(body, ['title', 'startsAt', 'endsAt']);
  const ev: AdminEvent = { imageUrl: null, capacity: null, location: '', description: '', published: true, kind: 'event', ...body, id: nextId('ev'), goingCount: 0, attendance: null };
  db.events.push(ev);
  db.rsvps[ev.id] = [];
  return eventView(ev);
});
route('PATCH', '/admin/events/:id', ({ params, body }) => eventView(Object.assign(find(db.events, params[0], 'Event'), body)));
route('DELETE', '/admin/events/:id', ({ params }) => {
  db.events = db.events.filter((e) => e.id !== params[0]);
});
route('PUT', '/admin/events/:id/attendance', ({ params, body }) => {
  const ev = find(db.events, params[0], 'Event');
  ev.attendance = Number(body.count) || 0;
  if (ev.kind === 'service') {
    const date = ev.startsAt.slice(0, 10);
    const row = db.sundayAttendance.find((s) => s.date === date);
    if (row) row.count = ev.attendance;
  }
  return eventView(ev);
});

route('GET', '/admin/groups/join-requests', () => ({ data: [...db.joinRequests].sort((x, y) => y.requestedAt.localeCompare(x.requestedAt)), nextCursor: null }));
route('POST', '/admin/groups/join-requests/:id/:decision', ({ params }) => {
  const jr = find(db.joinRequests, params[0], 'Request');
  if (params[1] === 'approve') db.groupMembers[jr.groupId] = [...new Set([...(db.groupMembers[jr.groupId] ?? []), jr.person.id])];
  db.joinRequests = db.joinRequests.filter((j) => j.id !== jr.id);
});
route('GET', '/admin/groups', () => ({ data: db.groups.map(groupView), nextCursor: null }));
route('POST', '/admin/groups', ({ body }) => {
  requireFields(body, ['name']);
  const g: AdminGroup = { description: '', meetingSchedule: '', location: '', leaderName: '', isOpen: true, ...body, id: nextId('gr'), memberCount: 0, pendingRequests: 0 };
  db.groups.push(g);
  db.groupMembers[g.id] = [];
  return groupView(g);
});
route('PATCH', '/admin/groups/:id', ({ params, body }) => groupView(Object.assign(find(db.groups, params[0], 'Group'), body)));
route('DELETE', '/admin/groups/:id', ({ params }) => {
  db.groups = db.groups.filter((g) => g.id !== params[0]);
  db.joinRequests = db.joinRequests.filter((j) => j.groupId !== params[0]);
});

route('GET', '/admin/giving/donations', ({ query }) => {
  const fundId = query.get('fundId');
  const from = query.get('from');
  const to = query.get('to');
  const q = (query.get('q') ?? '').toLowerCase();
  const list = db.donations
    .filter((d) => !fundId || d.fundId === fundId)
    .filter((d) => !from || d.createdAt.slice(0, 10) >= from)
    .filter((d) => !to || d.createdAt.slice(0, 10) <= to)
    .filter((d) => !q || d.donorName.toLowerCase().includes(q) || (d.pan ?? '').toLowerCase().includes(q));
  const totalAmount = list.filter((d) => d.status === 'succeeded').reduce((s, d) => s + d.amount, 0);
  return { ...page(list, query.get('cursor')), totalAmount };
});
route('POST', '/admin/giving/donations', ({ body }) => {
  requireFields(body, ['donorName', 'fundId', 'amount']);
  const fund = find(db.funds, body.fundId, 'Fund');
  const d: AdminDonation = {
    id: nextId('dn'),
    donorId: body.donorId ?? null,
    donorName: body.donorName,
    fundId: fund.id,
    fundName: fund.name,
    amount: body.amount,
    currency: db.settings.currency,
    frequency: 'once',
    status: 'succeeded',
    createdAt: body.receivedAt ? new Date(body.receivedAt).toISOString() : new Date().toISOString(),
    receiptUrl: null,
    method: body.method,
    pan: body.pan || null,
    donorCitizenship: body.donorCitizenship ?? 'IN',
    fcra: body.donorCitizenship === 'OTHER',
  };
  db.donations.unshift(d);
  db.donations.sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  return d;
});
route('GET', '/admin/giving/funds', () => db.funds.map(fundView));
route('GET', '/admin/giving/receipts-80g', ({ query }) => {
  const fy = query.get('financialYear') ?? '';
  const start = Number(fy.slice(0, 4)) || fiscalYearStart().getFullYear();
  const from = new Date(start, 3, 1);
  const to = new Date(start + 1, 3, 1);
  const deductible = new Set(db.funds.filter((f) => f.taxDeductible).map((f) => f.id));
  // Not eligible: FCRA gifts, non-80G funds, and cash above Rs 2,000 (Income Tax Act s.80G(5D)).
  const eligible = db.donations.filter((d) => d.status === 'succeeded' && deductible.has(d.fundId) && !d.fcra && !(d.method === 'cash' && d.amount > 200000) && new Date(d.createdAt) >= from && new Date(d.createdAt) < to);
  const byDonor = new Map<string, { donorId: string | null; name: string; pan: string | null; total: number; count: number; modes: PaymentMethod[] }>();
  for (const d of eligible) {
    const key = d.pan ?? `nopan:${d.donorId ?? d.donorName}`;
    const row = byDonor.get(key) ?? { donorId: d.donorId, name: d.donorName, pan: d.pan, total: 0, count: 0, modes: [] };
    row.total += d.amount;
    row.count++;
    if (!row.modes.includes(d.method)) row.modes.push(d.method);
    byDonor.set(key, row);
  }
  return { financialYear: `${start}-${String(start + 1).slice(2)}`, donors: [...byDonor.values()].sort((x, y) => y.total - x.total) };
});
route('POST', '/admin/giving/funds', ({ body }) => {
  requireFields(body, ['name']);
  const f = { description: '', taxDeductible: true, active: true, goal: null, ...body, id: nextId('fd') };
  db.funds.push(f);
  return fundView(f);
});
route('PATCH', '/admin/giving/funds/:id', ({ params, body }) => fundView(Object.assign(find(db.funds, params[0], 'Fund'), body)));

route('GET', '/admin/announcements', () => ({ data: [...db.announcements].sort((x, y) => y.publishedAt.localeCompare(x.publishedAt)), nextCursor: null }));
route('POST', '/admin/announcements', ({ body }) => {
  requireFields(body, ['title', 'body']);
  const a: AdminAnnouncement = { imageUrl: null, status: 'published', ...body, id: nextId('an'), publishedAt: new Date().toISOString() };
  db.announcements.unshift(a);
  return a;
});
route('PATCH', '/admin/announcements/:id', ({ params, body }) => {
  const a = find(db.announcements, params[0], 'Announcement');
  if (body.status === 'published' && a.status === 'draft') a.publishedAt = new Date().toISOString();
  return Object.assign(a, body);
});
route('DELETE', '/admin/announcements/:id', ({ params }) => {
  db.announcements = db.announcements.filter((a) => a.id !== params[0]);
});

route('GET', '/admin/settings', () => db.settings);
route('PATCH', '/admin/settings', ({ body }) => {
  const { id: _i, payments: _p, ...patch } = body;
  db.settings = { ...db.settings, ...patch, fcra: { ...db.settings.fcra, ...patch.fcra }, receipts80g: { ...db.settings.receipts80g, ...patch.receipts80g } };
  return db.settings;
});
route('POST', '/admin/settings/payments/connect', () => {
  db.settings.payments = { ...db.settings.payments, connected: true, accountId: db.settings.payments.accountId ?? 'acc_Demo12345' };
  return { onboardingUrl: '' };
});

route('GET', '/admin/staff', () => db.staff);
route('POST', '/admin/staff', ({ body }) => {
  requireFields(body, ['name', 'email', 'role']);
  const s: StaffMember = { id: nextId('st'), name: body.name, email: body.email, phone: null, role: body.role, status: 'invited', lastActiveAt: null };
  db.staff.push(s);
  return s;
});
route('DELETE', '/admin/staff/:id', ({ params }) => {
  if (db.staff.find((s) => s.id === params[0])?.role === 'owner') throw new ApiError(422, 'owner', 'The church owner cannot be removed.');
  db.staff = db.staff.filter((s) => s.id !== params[0]);
});

export async function mockRequest<T>(scope: 'admin' | 'member', method: string, path: string, body: any, current: Session | null): Promise<T> {
  await wait(180 + Math.random() * 160);
  db = load(); // pick up changes made in another tab (e.g. admin and member side by side)
  const [pathname, search = ''] = path.split('?');
  if (!pathname.startsWith('/auth/') && !current) throw new ApiError(401, 'unauthorized', 'Please sign in again.');
  if (pathname.startsWith('/admin/') && scope !== 'admin') throw new ApiError(403, 'forbidden', 'Staff only.');
  for (const [m, re, handler] of routes) {
    if (m !== method) continue;
    const match = re.exec(pathname);
    if (!match) continue;
    const result = handler({ params: match.slice(1).map(decodeURIComponent), query: new URLSearchParams(search), body: body ?? {}, scope });
    if (method !== 'GET') save();
    // Hand back a copy so screens can't mutate the demo database by accident.
    return (result === undefined ? undefined : structuredClone(result)) as T;
  }
  throw new ApiError(404, 'not_found', `Demo API has no route for ${method} ${pathname}`);
}
