// One function per backend endpoint. Screens call these, never fetch() directly.
// Member endpoints match the mobile app exactly (docs/API.md); admin ones are in docs/API-ADMIN.md.
import type {
  AdminAnnouncement,
  AdminDonation,
  AdminEvent,
  AdminFund,
  AdminGroup,
  AnnouncementInput,
  ChurchSettings,
  Dashboard,
  DonationPage,
  DonationQuery,
  EventInput,
  FundInput,
  GroupInput,
  ImportResult,
  ImportSource,
  JoinRequest,
  OfflineDonationInput,
  PeoplePage,
  PeopleQuery,
  Person,
  PersonInput,
  Receipts80g,
  StaffMember,
} from './admin-types';
import { adminSession, createApi, memberSession, qs, type SessionStore } from './client';
import type {
  ChurchEvent,
  Donation,
  Fund,
  GiveIntent,
  GiveIntentInput,
  Group,
  HomeFeed,
  Member,
  OtpRequest,
  Paginated,
  RsvpStatus,
  Session,
  StaffRole,
} from './types';

function authApi(store: SessionStore) {
  const api = createApi(store);
  return {
    requestOtp: (identifier: string) => api.post<OtpRequest>('/auth/otp/request', { identifier, audience: store.scope }),
    verifyOtp: (requestId: string, code: string) => api.post<Session>('/auth/otp/verify', { requestId, code }),
    signOut: (refreshToken: string) => api.post<void>('/auth/sign-out', { refreshToken }),
  };
}

// ---------- Member portal (same endpoints as the mobile app) ----------
const m = createApi(memberSession);

export const MemberApi = {
  auth: authApi(memberSession),
  me: {
    get: () => m.get<Member>('/me'),
    update: (patch: Partial<Pick<Member, 'firstName' | 'lastName' | 'email' | 'language'>>) => m.patch<Member>('/me', patch),
  },
  home: () => m.get<HomeFeed>('/home'),
  events: {
    list: (cursor?: string) => m.get<Paginated<ChurchEvent>>(`/events${qs({ cursor })}`),
    get: (id: string) => m.get<ChurchEvent>(`/events/${id}`),
    rsvp: (id: string, status: RsvpStatus) => m.put<ChurchEvent>(`/events/${id}/rsvp`, { status }),
  },
  groups: {
    list: () => m.get<Paginated<Group>>('/groups'),
    requestToJoin: (id: string) => m.post<Group>(`/groups/${id}/join-requests`),
  },
  giving: {
    funds: () => m.get<Fund[]>('/giving/funds'),
    createIntent: (input: GiveIntentInput) => m.post<GiveIntent>('/giving/intents', input),
    history: (cursor?: string) => m.get<Paginated<Donation>>(`/giving/donations${qs({ cursor })}`),
  },
};

// ---------- Church admin dashboard ----------
const a = createApi(adminSession);

export const AdminApi = {
  auth: authApi(adminSession),
  dashboard: () => a.get<Dashboard>('/admin/dashboard'),
  people: {
    list: (q: PeopleQuery) => a.get<PeoplePage>(`/admin/people${qs(q)}`),
    get: (id: string) => a.get<Person>(`/admin/people/${id}`),
    create: (input: PersonInput) => a.post<Person>('/admin/people', input),
    update: (id: string, input: Partial<PersonInput>) => a.patch<Person>(`/admin/people/${id}`, input),
    remove: (id: string) => a.del<void>(`/admin/people/${id}`),
    import: (rows: PersonInput[], source: ImportSource, dedupeBy: 'phone' | 'email') =>
      a.post<ImportResult>('/admin/people/import', { rows, source, dedupeBy }),
  },
  events: {
    list: (when: 'upcoming' | 'past' = 'upcoming') => a.get<Paginated<AdminEvent>>(`/admin/events${qs({ when })}`),
    create: (input: EventInput) => a.post<AdminEvent>('/admin/events', input),
    update: (id: string, input: Partial<EventInput>) => a.patch<AdminEvent>(`/admin/events/${id}`, input),
    remove: (id: string) => a.del<void>(`/admin/events/${id}`),
    setAttendance: (id: string, count: number) => a.put<AdminEvent>(`/admin/events/${id}/attendance`, { count }),
  },
  groups: {
    list: () => a.get<Paginated<AdminGroup>>('/admin/groups'),
    create: (input: GroupInput) => a.post<AdminGroup>('/admin/groups', input),
    update: (id: string, input: Partial<GroupInput>) => a.patch<AdminGroup>(`/admin/groups/${id}`, input),
    remove: (id: string) => a.del<void>(`/admin/groups/${id}`),
    joinRequests: () => a.get<Paginated<JoinRequest>>('/admin/groups/join-requests'),
    decide: (requestId: string, decision: 'approve' | 'decline') => a.post<void>(`/admin/groups/join-requests/${requestId}/${decision}`),
  },
  giving: {
    donations: (q: DonationQuery) => a.get<DonationPage>(`/admin/giving/donations${qs(q)}`),
    recordOffline: (input: OfflineDonationInput) => a.post<AdminDonation>('/admin/giving/donations', input),
    funds: () => a.get<AdminFund[]>('/admin/giving/funds'),
    createFund: (input: FundInput) => a.post<AdminFund>('/admin/giving/funds', input),
    updateFund: (id: string, input: Partial<FundInput>) => a.patch<AdminFund>(`/admin/giving/funds/${id}`, input),
    receipts80g: (financialYear: string) => a.get<Receipts80g>(`/admin/giving/receipts-80g${qs({ financialYear })}`),
  },
  announcements: {
    list: () => a.get<Paginated<AdminAnnouncement>>('/admin/announcements'),
    create: (input: AnnouncementInput) => a.post<AdminAnnouncement>('/admin/announcements', input),
    update: (id: string, input: Partial<AnnouncementInput>) => a.patch<AdminAnnouncement>(`/admin/announcements/${id}`, input),
    remove: (id: string) => a.del<void>(`/admin/announcements/${id}`),
  },
  settings: {
    get: () => a.get<ChurchSettings>('/admin/settings'),
    update: (patch: Partial<ChurchSettings>) => a.patch<ChurchSettings>('/admin/settings', patch),
    connectPayments: () => a.post<{ onboardingUrl: string }>('/admin/settings/payments/connect'),
  },
  staff: {
    list: () => a.get<StaffMember[]>('/admin/staff'),
    invite: (input: { name: string; email: string; role: StaffRole }) => a.post<StaffMember>('/admin/staff', input),
    remove: (id: string) => a.del<void>(`/admin/staff/${id}`),
  },
};
