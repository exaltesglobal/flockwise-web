// Shapes used only by the church admin dashboard (/admin/* endpoints). See docs/API-ADMIN.md.
import type { Announcement, Church, ChurchEvent, Currency, Donation, Fund, Group, LanguageCode, StaffRole } from './types';

export type PersonStatus = 'member' | 'regular' | 'visitor' | 'inactive';

export type Person = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  gender: 'male' | 'female' | null;
  birthDate: string | null; // YYYY-MM-DD
  status: PersonStatus;
  householdName: string | null;
  address: string | null;
  language: LanguageCode;
  tags: string[];
  notes: string | null;
  joinedAt: string; // when added to Flockwise
  lastAttendedAt: string | null;
  groups: { id: string; name: string }[];
};

export type PersonInput = Partial<Omit<Person, 'id' | 'joinedAt' | 'lastAttendedAt' | 'groups'>> & {
  firstName: string;
  lastName: string;
};

export type PeopleQuery = { q?: string; status?: PersonStatus | ''; cursor?: string };
export type PeoplePage = { data: Person[]; nextCursor: string | null; total: number };

export type ImportSource = 'excel' | 'csv' | 'elvanto' | 'planning_center';
export type ImportResult = { created: number; updated: number; skipped: number; errors: { row: number; message: string }[] };

export type AdminEvent = Omit<ChurchEvent, 'myRsvp'> & {
  published: boolean;
  attendance: number | null; // headcount entered after the event
};
export type EventInput = Omit<AdminEvent, 'id' | 'goingCount' | 'attendance'>;

export type AdminGroup = Omit<Group, 'membership'> & {
  isOpen: boolean; // shown to members in the app
  pendingRequests: number;
};
export type GroupInput = Omit<AdminGroup, 'id' | 'memberCount' | 'pendingRequests'>;

export type JoinRequest = {
  id: string;
  groupId: string;
  groupName: string;
  person: { id: string; name: string; phone: string | null };
  requestedAt: string;
};

export type PaymentMethod = 'upi' | 'card' | 'netbanking' | 'wallet' | 'cash' | 'cheque' | 'bank_transfer';

export type AdminDonation = Donation & {
  donorId: string | null;
  donorName: string;
  fundId: string;
  method: PaymentMethod;
  pan: string | null;
  donorCitizenship: 'IN' | 'OTHER';
  /** True when the gift was routed to the church's FCRA account. */
  fcra: boolean;
};
export type OfflineDonationInput = {
  donorId: string | null;
  donorName: string;
  fundId: string;
  amount: number;
  method: 'cash' | 'cheque' | 'bank_transfer';
  pan?: string;
  donorCitizenship: 'IN' | 'OTHER';
  receivedAt: string;
};
export type DonationQuery = { fundId?: string; from?: string; to?: string; q?: string; cursor?: string };
export type DonationPage = { data: AdminDonation[]; nextCursor: string | null; total: number; totalAmount: number };

export type AdminFund = Fund & { active: boolean; raisedThisYear: number; goal: number | null };
export type FundInput = Omit<AdminFund, 'id' | 'raisedThisYear'>;

export type AdminAnnouncement = Announcement & { status: 'draft' | 'published' };
export type AnnouncementInput = Pick<AdminAnnouncement, 'title' | 'body' | 'status'>;

export type Dashboard = {
  currency: Currency;
  people: { total: number; members: number; newThisMonth: number };
  attendance: { lastSunday: number; trend: { date: string; count: number }[] };
  giving: { thisMonth: number; lastMonth: number; trend: { month: string; amount: number }[] };
  pendingJoinRequests: number;
  upcomingEvents: AdminEvent[];
  recentDonations: AdminDonation[];
  birthdaysThisWeek: { id: string; name: string; date: string }[];
};

export type ChurchSettings = Church & {
  address: string;
  phone: string;
  email: string;
  website: string;
  timezone: string;
  languages: LanguageCode[];
  payments: { provider: 'razorpay' | 'stripe'; connected: boolean; accountId: string | null };
  fcra: { registered: boolean; registrationNumber: string | null; accountLast4: string | null };
  receipts80g: { enabled: boolean; registrationNumber: string | null; pan: string | null };
};

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  status: 'active' | 'invited';
  lastActiveAt: string | null;
};

/** Donors eligible for an 80G deduction in one Indian financial year (feeds Form 10BD / 10BE). */
export type Receipts80g = {
  financialYear: string; // e.g. "2026-27"
  donors: { donorId: string | null; name: string; pan: string | null; total: number; count: number; modes: PaymentMethod[] }[];
};
