// One function per backend endpoint. Screens call these, never fetch() directly.
import type { billingView } from '@/core/modules/billing';
import type { ChurchEntry } from '@/core/platform';
import type { BillingInterval, PlanId, Subscription } from '@/core/plans';
import type { ChurchOrgType, KycDocKind, RazorpaySetup, RazorpaySetupView, RecurringGift, RecurringSummary } from '@/core/types';
import type { AccountHead, AccountsSummary, Certificate, ExpenseMethod, ExpenseStatus, ExpenseView, PaymentsStatus, TallySettings, VisitPurpose, VisitView, ZoneDetail, ZoneFamily, ZoneReportRow, ZoneView, RegisterEntry, RegisterEntryInput, RegisterField, RegisterKind, RegisterSummary } from '@/core/types';

export type BillingView = ReturnType<typeof billingView>;
export type RazorpayKeysInput = { keyId: string; keySecret: string; webhookSecret: string; fcra?: { keyId: string; keySecret: string; webhookSecret: string } | null };
// Member endpoints match the mobile app exactly (docs/API.md); admin ones are in docs/API-ADMIN.md.
import type {
  AdminAnnouncement,
  AiAnswer,
  AiDraft,
  AiPurpose,
  AiSermonKind,
  AiSetlist,
  AiStatus,
  ApiKeyView,
  ChitthiStatus,
  ChitthiTemplate,
  AdminDonation,
  AdminEvent,
  AdminFund,
  AdminGroup,
  AnnouncementInput,
  Assignment,
  AssignmentStatus,
  AtRiskPerson,
  AudiencePreview,
  Audience,
  AuditEntry,
  Automations,
  AvailablePerson,
  Blockout,
  Campus,
  CareCase,
  CareInput,
  Channel,
  ChannelStatus,
  Checkin,
  CheckinFamily,
  CheckinResult,
  CheckinSummary,
  ChurchSettings,
  Dashboard,
  DirectoryEntry,
  DonationPage,
  DonationQuery,
  EventAttendee,
  EventInput,
  FundInput,
  GivingStatement,
  GroupDetail,
  GroupInput,
  GroupMeeting,
  ImportResult,
  ImportSource,
  Insights,
  JoinRequest,
  MemberPreferences,
  Message,
  MessageInput,
  MyServing,
  OfflineDonationInput,
  PeoplePage,
  PeopleQuery,
  Permission,
  Person,
  PersonInput,
  PersonTimeline,
  Plan,
  PlanItem,
  PledgeView,
  PrayerView,
  Receipts80g,
  Room,
  Schedule,
  ScheduleOverview,
  ServiceDetail,
  ServiceSummary,
  Song,
  SongView,
  StaffMember,
  TeamView,
  Template,
  Batch,
  BatchView,
  BookingConflict,
  BookingView,
  CalendarItem,
  CcliRow,
  LowerThird,
  PresentationTheme,
  PresentationView,
  SongStats,
  CustomField,
  FormInput,
  FormResponse,
  FormSubmission,
  FormSubmitResult,
  FormView,
  GroupDetailMember,
  GroupPost,
  GroupResource,
  ListRule,
  LiveView,
  PublicChurch,
  PublicForm,
  PublicGroup,
  PublicPage,
  Resource,
  Sermon,
  Celebration,
  CelebrationKind,
  Greeting,
  MemberCelebrations,
  SmartListView,
  Workflow,
  WorkflowCardView,
  WorkflowView,
} from './admin-types';
import { adminSession, createApi, memberSession, platformApi, qs, type PlatformSession, type SessionStore } from './client';
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
    // Sign-in codes go by email only.
    requestOtp: (email: string) => api.post<OtpRequest>('/auth/otp/request', { email, audience: store.scope }),
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
    update: (patch: Partial<Pick<Member, 'firstName' | 'lastName' | 'email' | 'phone' | 'language'>>) => m.patch<Member>('/me', patch),
    preferences: () => m.get<MemberPreferences>('/me/preferences'),
    updatePreferences: (patch: { consent?: Partial<MemberPreferences['consent']>; campusId?: string | null }) => m.patch<MemberPreferences>('/me/preferences', patch),
    checkinCode: () => m.get<{ code: string; qr: string; name: string }>('/me/checkin-code'),
  },
  home: () => m.get<HomeFeed>('/home'),
  campuses: () => m.get<Campus[]>('/campuses'),
  directory: (q?: string) => m.get<Paginated<DirectoryEntry>>(`/directory${qs({ q })}`),
  events: {
    list: (cursor?: string) => m.get<Paginated<ChurchEvent>>(`/events${qs({ cursor })}`),
    get: (id: string) => m.get<ChurchEvent>(`/events/${id}`),
    rsvp: (id: string, status: RsvpStatus) => m.put<ChurchEvent>(`/events/${id}/rsvp`, { status }),
    buyTicket: (id: string) => m.post<GiveIntent>(`/events/${id}/ticket`),
    checkIn: (id: string) => m.post<ChurchEvent>(`/events/${id}/check-in`),
  },
  groups: {
    list: () => m.get<Paginated<Group>>('/groups'),
    requestToJoin: (id: string) => m.post<Group>(`/groups/${id}/join-requests`),
  },
  giving: {
    funds: () => m.get<Fund[]>('/giving/funds'),
    createIntent: (input: GiveIntentInput) => m.post<GiveIntent>('/giving/intents', input),
    history: (cursor?: string) => m.get<Paginated<Donation>>(`/giving/donations${qs({ cursor })}`),
    statement: (financialYear?: string) => m.get<GivingStatement>(`/giving/statement${qs({ financialYear })}`),
    pledges: () => m.get<PledgeView[]>('/giving/pledges'),
    pledge: (input: { fundId: string; amount: number; endDate: string; startDate?: string; autopay?: boolean; pan?: string }) => m.post<PledgeView & { checkoutUrl?: string; monthly?: number; months?: number }>('/giving/pledges', input),
    recurring: () => m.get<RecurringGift[]>('/giving/recurring'),
    changeRecurring: (id: string, action: 'pause' | 'resume' | 'cancel') => m.post<RecurringGift>(`/giving/recurring/${id}/${action}`),
    removePledge: (id: string) => m.del<void>(`/giving/pledges/${id}`),
  },
  serving: {
    get: () => m.get<MyServing>('/me/serving'),
    respond: (id: string, status: 'accepted' | 'declined', note?: string) => m.post<Assignment>(`/me/serving/${id}/respond`, { status, note }),
    addBlockout: (input: { from: string; to: string; reason?: string }) => m.post<Blockout>('/me/blockouts', input),
    removeBlockout: (id: string) => m.del<void>(`/me/blockouts/${id}`),
  },
  forms: {
    list: () => m.get<(PublicForm & { myStatus: FormResponse['status'] | null })[]>('/forms'),
    get: (id: string) => m.get<PublicForm & { myResponses: FormResponse[] }>(`/forms/${id}`),
    submit: (id: string, input: FormSubmission) => m.post<FormSubmitResult>(`/forms/${id}/responses`, input),
    cancel: (id: string, responseId: string) => m.del<void>(`/forms/${id}/responses/${responseId}`),
  },
  group: {
    get: (id: string) => m.get<GroupDetailMember>(`/groups/${id}`),
    post: (id: string, text: string) => m.post<GroupPost>(`/groups/${id}/posts`, { text }),
    pin: (id: string, postId: string, pinned: boolean) => m.patch<GroupPost>(`/groups/${id}/posts/${postId}`, { pinned }),
    removePost: (id: string, postId: string) => m.del<void>(`/groups/${id}/posts/${postId}`),
    addResource: (id: string, input: { name: string; url: string }) => m.post<GroupResource>(`/groups/${id}/resources`, input),
    removeResource: (id: string, resId: string) => m.del<void>(`/groups/${id}/resources/${resId}`),
  },
  sermons: () => m.get<Sermon[]>('/sermons'),
  celebrations: {
    list: () => m.get<MemberCelebrations>('/celebrations'),
    wish: (personId: string, kind: CelebrationKind, message?: string) => m.post<Greeting>(`/celebrations/${personId}/wish`, { kind, message }),
  },
  prayer: {
    list: () => m.get<Paginated<PrayerView>>('/prayer'),
    create: (text: string, visibility: 'pastors' | 'church') => m.post<PrayerView>('/prayer', { text, visibility }),
    pray: (id: string) => m.post<PrayerView>(`/prayer/${id}/pray`),
    update: (id: string, patch: { status: 'open' | 'answered'; answeredNote?: string }) => m.patch<PrayerView>(`/prayer/${id}`, patch),
  },
};

// ---------- Public pages (no sign-in) ----------
export const PublicApi = {
  church: () => m.get<PublicChurch>('/public/church'),
  sermons: () => m.get<Sermon[]>('/public/sermons'),
  groups: () => m.get<PublicGroup[]>('/public/groups'),
  groupInterest: (id: string, input: { name: string; email: string; phone?: string; message?: string }) => m.post<{ ok: boolean; message: string }>(`/public/groups/${id}/interest`, input),
  form: (id: string) => m.get<PublicForm>(`/public/forms/${id}`),
  screen: (eventId: string, key: string) => m.get<PresentationView>(`/screens/${eventId}${qs({ key })}`),
  submitForm: (id: string, input: FormSubmission) => m.post<FormSubmitResult>(`/public/forms/${id}/responses`, input),
};

// ---------- Many churches: lookup, sign-up and the Flockwise team panel ----------
export type ChurchPublic = { id: string; slug: string; name: string; city: string; logoUrl: string | null; isDefault: boolean };
export type SignupInput = { requestId: string; code: string; churchName: string; ownerName: string; city: string; country: string; slug: string; phone?: string };
export type TeamChurch = ChurchEntry & { plan: PlanId; subscription: Subscription; people: number; staff: number; lastActiveAt: string | null; mrr: number; priceCurrency: 'INR' | 'USD' };
export type TeamChurchDetail = TeamChurch & {
  team: { id: string; name: string; email: string; role: StaffRole; status: string; lastActiveAt: string | null }[];
  activity: AuditEntry[];
  teamLog: AuditEntry[];
};
export type TeamOverview = {
  churches: number;
  activeLast30: number;
  newLast30: number;
  trials: number;
  paying: number;
  pastDue: { id: string; name: string; plan: PlanId }[];
  trialsEnding: { id: string; name: string; trialEndsAt: string }[];
  mrr: { INR: number; USD: number };
  arr: { INR: number; USD: number };
  byPlan: { plan: PlanId; name: string; churches: number }[];
  people: number;
  aiCredits: number;
  messages: number;
  signups: { weekStart: string; signups: number }[];
  razorpaySetupsOpen: number;
};
export type SubscriptionChange = { plan?: PlanId; status?: Subscription['status']; trialDays?: number; peopleLimit?: number | null; founding?: boolean };

export const ChurchesApi = {
  get: (slug: string) => platformApi.get<ChurchPublic>(`/churches/${encodeURIComponent(slug)}`),
  find: (email: string) => platformApi.post<{ sent: boolean; churches?: { slug: string; name: string; city: string }[] }>('/churches/find', { email }),
};

export const SignupApi = {
  slug: (slug: string, name = '', city = '') => platformApi.get<{ slug: string; available: boolean; problem: string | null; suggestion: string }>(`/signup/slug${qs({ slug, name, city })}`),
  start: (email: string) => platformApi.post<OtpRequest>('/signup/start', { email }),
  complete: (input: SignupInput) => platformApi.post<{ church: { id: string; slug: string; name: string }; session: Session }>('/signup/complete', input),
};

export const TeamApi = {
  request: (email: string) => platformApi.post<OtpRequest>('/platform/auth/request', { email }),
  verify: (requestId: string, code: string) => platformApi.post<PlatformSession>('/platform/auth/verify', { requestId, code }),
  signOut: () => platformApi.post<void>('/platform/auth/sign-out'),
  overview: () => platformApi.get<TeamOverview>('/platform/overview'),
  churches: (q: { q?: string; plan?: string; status?: string } = {}) => platformApi.get<TeamChurch[]>(`/platform/churches${qs(q)}`),
  church: (id: string) => platformApi.get<TeamChurchDetail>(`/platform/churches/${id}`),
  update: (id: string, patch: { status?: 'active' | 'suspended'; notes?: string; name?: string; slug?: string }) => platformApi.patch<TeamChurch>(`/platform/churches/${id}`, patch),
  subscription: (id: string, change: SubscriptionChange) => platformApi.post<TeamChurch>(`/platform/churches/${id}/subscription`, change),
  open: (id: string, reason: string) => platformApi.post<{ church: { id: string; slug: string; name: string }; session: Session }>(`/platform/churches/${id}/open`, { reason }),
  audit: () => platformApi.get<AuditEntry[]>('/platform/audit'),
  setups: () => platformApi.get<TeamSetups>('/platform/razorpay-setups'),
  setupDoc: (churchId: string, docId: string) => platformApi.get<{ fileName: string; mime: string; data: string }>(`/platform/razorpay-setups/${churchId}/docs/${docId}`),
  updateSetup: (churchId: string, patch: { status?: RazorpaySetup['status']; teamNote?: string }) => platformApi.patch<TeamSetupRow>(`/platform/razorpay-setups/${churchId}`, patch),
};
export type TeamSetupRow = RazorpaySetup & { churchId: string; churchName: string; city?: string; ownerEmail?: string; missing: KycDocKind[]; keysConnected: boolean; stored?: string[] };
export type TeamSetups = { price: number; open: number; earned: number; rows: TeamSetupRow[] };

// ---------- Church admin dashboard ----------
const a = createApi(adminSession);

export type RoleInfo = { role: StaffRole; label: string; permissions: Permission[] };
export type Duplicate = { reason: string; people: { id: string; name: string; phone: string | null; email: string | null }[] };
export type CampusView = Campus & { people: number };
export type Assignee = { id: string; name: string; role: StaffRole };
export type AdminPrayer = PrayerView & { name: string };
export type BlockoutView = Blockout & { name: string };

export const AdminApi = {
  auth: authApi(adminSession),
  me: () => a.get<{ staff: StaffMember; permissions: Permission[]; roles: RoleInfo[] }>('/admin/me'),
  dashboard: () => a.get<Dashboard>('/admin/dashboard'),
  insights: () => a.get<Insights>('/admin/insights'),
  people: {
    list: (q: PeopleQuery) => a.get<PeoplePage>(`/admin/people${qs(q)}`),
    get: (id: string) => a.get<Person>(`/admin/people/${id}`),
    timeline: (id: string) => a.get<PersonTimeline>(`/admin/people/${id}/timeline`),
    tags: () => a.get<{ tag: string; count: number }[]>('/admin/people/tags'),
    create: (input: PersonInput) => a.post<Person>('/admin/people', input),
    update: (id: string, input: Partial<PersonInput>) => a.patch<Person>(`/admin/people/${id}`, input),
    remove: (id: string) => a.del<void>(`/admin/people/${id}`),
    import: (rows: PersonInput[], source: ImportSource, dedupeBy: 'phone' | 'email') =>
      a.post<ImportResult>('/admin/people/import', { rows, source, dedupeBy }),
    duplicates: () => a.get<Duplicate[]>('/admin/people-duplicates'),
    merge: (keepId: string, mergeId: string) => a.post<Person>('/admin/people/merge', { keepId, mergeId }),
  },
  campuses: {
    list: () => a.get<CampusView[]>('/admin/campuses'),
    create: (input: Omit<Campus, 'id'>) => a.post<Campus>('/admin/campuses', input),
    update: (id: string, input: Partial<Omit<Campus, 'id'>>) => a.patch<Campus>(`/admin/campuses/${id}`, input),
    remove: (id: string) => a.del<void>(`/admin/campuses/${id}`),
  },
  events: {
    list: (when: 'upcoming' | 'past' = 'upcoming') => a.get<Paginated<AdminEvent>>(`/admin/events${qs({ when })}`),
    create: (input: EventInput & { repeatWeeks?: number }) => a.post<AdminEvent>('/admin/events', input),
    update: (id: string, input: Partial<EventInput>) => a.patch<AdminEvent>(`/admin/events/${id}`, input),
    remove: (id: string) => a.del<void>(`/admin/events/${id}`),
    setAttendance: (id: string, count: number) => a.put<AdminEvent>(`/admin/events/${id}/attendance`, { count }),
    attendees: (id: string) => a.get<EventAttendee[]>(`/admin/events/${id}/attendees`),
  },
  groups: {
    list: () => a.get<Paginated<AdminGroup>>('/admin/groups'),
    get: (id: string) => a.get<GroupDetail>(`/admin/groups/${id}`),
    create: (input: GroupInput) => a.post<AdminGroup>('/admin/groups', input),
    update: (id: string, input: Partial<GroupInput>) => a.patch<AdminGroup>(`/admin/groups/${id}`, input),
    remove: (id: string) => a.del<void>(`/admin/groups/${id}`),
    addMembers: (id: string, personIds: string[]) => a.post<AdminGroup>(`/admin/groups/${id}/members`, { personIds }),
    removeMember: (id: string, personId: string) => a.del<void>(`/admin/groups/${id}/members/${personId}`),
    recordMeeting: (id: string, input: { date: string; presentIds: string[]; guests: number; notes: string }) => a.post<GroupMeeting>(`/admin/groups/${id}/meetings`, input),
    joinRequests: () => a.get<Paginated<JoinRequest>>('/admin/groups/join-requests'),
    decide: (requestId: string, decision: 'approve' | 'decline') => a.post<void>(`/admin/groups/join-requests/${requestId}/${decision}`),
  },
  giving: {
    donations: (q: DonationQuery) => a.get<DonationPage>(`/admin/giving/donations${qs(q)}`),
    recordOffline: (input: OfflineDonationInput & { batchId?: string | null }) => a.post<AdminDonation>('/admin/giving/donations', input),
    refund: (id: string) => a.post<AdminDonation>(`/admin/giving/donations/${id}/refund`),
    funds: () => a.get<AdminFund[]>('/admin/giving/funds'),
    createFund: (input: FundInput) => a.post<AdminFund>('/admin/giving/funds', input),
    updateFund: (id: string, input: Partial<FundInput>) => a.patch<AdminFund>(`/admin/giving/funds/${id}`, input),
    receipts80g: (financialYear: string) => a.get<Receipts80g>(`/admin/giving/receipts-80g${qs({ financialYear })}`),
    statement: (personId: string, financialYear?: string) => a.get<GivingStatement>(`/admin/giving/statements/${personId}${qs({ financialYear })}`),
    pledges: () => a.get<PledgeView[]>('/admin/giving/pledges'),
    createPledge: (input: { personId: string; fundId: string; amount: number; endDate: string; startDate?: string }) => a.post<PledgeView>('/admin/giving/pledges', input),
    removePledge: (id: string) => a.del<void>(`/admin/giving/pledges/${id}`),
    recurring: (status?: string) => a.get<{ summary: RecurringSummary; rows: RecurringGift[] }>(`/admin/giving/recurring${qs({ status })}`),
    cancelRecurring: (id: string) => a.post<RecurringGift>(`/admin/giving/recurring/${id}/cancel`),
  },
  checkin: {
    events: () => a.get<AdminEvent[]>('/admin/checkin/events'),
    summary: (eventId: string) => a.get<CheckinSummary>(`/admin/checkin/${eventId}`),
    search: (eventId: string, q: string) => a.get<CheckinFamily[]>(`/admin/checkin/${eventId}/search${qs({ q })}`),
    checkIn: (eventId: string, personIds: string[], method: 'staff' | 'kiosk' = 'staff') => a.post<CheckinResult>(`/admin/checkin/${eventId}`, { personIds, method }),
    scan: (eventId: string, code: string) => a.post<CheckinResult & { alreadyCheckedIn?: boolean }>(`/admin/checkin/${eventId}/scan`, { code }),
    checkout: (checkinId: string, securityCode: string, override = false) => a.post<Checkin>(`/admin/checkin/checkins/${checkinId}/checkout`, { securityCode, override }),
    undo: (checkinId: string) => a.del<void>(`/admin/checkin/checkins/${checkinId}`),
    reprint: (eventId: string, securityCode: string) => a.post<CheckinResult>(`/admin/checkin/${eventId}/reprint`, { securityCode }),
    rooms: () => a.get<Room[]>('/admin/checkin/rooms'),
    createRoom: (input: Omit<Room, 'id'>) => a.post<Room>('/admin/checkin/rooms', input),
    updateRoom: (id: string, input: Partial<Omit<Room, 'id'>>) => a.patch<Room>(`/admin/checkin/rooms/${id}`, input),
    removeRoom: (id: string) => a.del<void>(`/admin/checkin/rooms/${id}`),
  },
  volunteers: {
    teams: () => a.get<TeamView[]>('/admin/volunteers/teams'),
    createTeam: (input: { name: string; description?: string; color?: string; leaderId?: string | null; positions?: { name: string; needed: number }[] }) => a.post<TeamView>('/admin/volunteers/teams', input),
    updateTeam: (id: string, input: { name?: string; description?: string; color?: string; leaderId?: string | null; positions?: { id?: string; name: string; needed: number }[] }) => a.patch<TeamView>(`/admin/volunteers/teams/${id}`, input),
    setMembers: (id: string, members: { personId: string; positionIds: string[] }[]) => a.put<TeamView>(`/admin/volunteers/teams/${id}/members`, { members }),
    removeTeam: (id: string) => a.del<void>(`/admin/volunteers/teams/${id}`),
    overview: () => a.get<ScheduleOverview>('/admin/volunteers/overview'),
    schedule: (eventId: string) => a.get<Schedule>(`/admin/volunteers/schedule/${eventId}`),
    available: (eventId: string, teamId: string, positionId: string) => a.get<AvailablePerson[]>(`/admin/volunteers/schedule/${eventId}/available${qs({ teamId, positionId })}`),
    assign: (input: { eventId: string; teamId: string; positionId: string; personId: string; force?: boolean }) => a.post<Assignment>('/admin/volunteers/assignments', input),
    setStatus: (id: string, status: AssignmentStatus) => a.patch<Assignment>(`/admin/volunteers/assignments/${id}`, { status }),
    unassign: (id: string) => a.del<void>(`/admin/volunteers/assignments/${id}`),
    autofill: (eventId: string) => a.post<{ added: number; schedule: Schedule }>(`/admin/volunteers/autofill/${eventId}`),
    notify: (eventId: string) => a.post<{ notified: number; message: Message }>(`/admin/volunteers/notify/${eventId}`),
    blockouts: () => a.get<BlockoutView[]>('/admin/volunteers/blockouts'),
  },
  services: {
    list: (when: 'upcoming' | 'past' = 'upcoming') => a.get<ServiceSummary[]>(`/admin/services${qs({ when })}`),
    get: (eventId: string) => a.get<ServiceDetail>(`/admin/services/${eventId}`),
    save: (eventId: string, plan: { theme: string; notes: string; items: Partial<PlanItem>[]; rehearsalAt?: string | null; rehearsalNotes?: string }) => a.put<Plan>(`/admin/services/${eventId}`, plan),
    copy: (eventId: string, fromEventId: string) => a.post<Plan>(`/admin/services/${eventId}/copy`, { fromEventId }),
    songs: (q?: string) => a.get<SongView[]>(`/admin/songs${qs({ q })}`),
    createSong: (input: Omit<Song, 'id'>) => a.post<Song>('/admin/songs', input),
    updateSong: (id: string, input: Partial<Omit<Song, 'id'>>) => a.patch<Song>(`/admin/songs/${id}`, input),
    removeSong: (id: string) => a.del<void>(`/admin/songs/${id}`),
  },
  messages: {
    list: () => a.get<Paginated<Message>>('/admin/messages'),
    channels: () => a.get<ChannelStatus>('/admin/messages/channels'),
    preview: (channel: Channel, audience: Audience) => a.post<AudiencePreview>('/admin/messages/audience', { channel, audience }),
    create: (input: MessageInput) => a.post<Message>('/admin/messages', input),
    update: (id: string, input: Partial<MessageInput>) => a.patch<Message>(`/admin/messages/${id}`, input),
    remove: (id: string) => a.del<void>(`/admin/messages/${id}`),
    templates: () => a.get<Template[]>('/admin/messages/templates'),
    createTemplate: (input: Omit<Template, 'id'>) => a.post<Template>('/admin/messages/templates', input),
    updateTemplate: (id: string, input: Partial<Omit<Template, 'id'>>) => a.patch<Template>(`/admin/messages/templates/${id}`, input),
    removeTemplate: (id: string) => a.del<void>(`/admin/messages/templates/${id}`),
    automations: () => a.get<Automations>('/admin/messages/automations'),
    saveAutomations: (patch: Partial<Automations>) => a.put<Automations>('/admin/messages/automations', patch),
  },
  care: {
    list: (q: { status?: string; mine?: boolean } = {}) => a.get<Paginated<CareCase>>(`/admin/care${qs({ status: q.status, mine: q.mine ? 'true' : undefined })}`),
    atRisk: () => a.get<AtRiskPerson[]>('/admin/care/at-risk'),
    assignees: () => a.get<Assignee[]>('/admin/care/assignees'),
    create: (input: Partial<CareInput> & { title: string; personName?: string; prayerId?: string }) => a.post<CareCase>('/admin/care', input),
    update: (id: string, patch: Partial<Pick<CareCase, 'status' | 'assignedTo' | 'priority' | 'dueAt' | 'title' | 'type' | 'confidential'>>) => a.patch<CareCase>(`/admin/care/${id}`, patch),
    addNote: (id: string, text: string) => a.post<CareCase>(`/admin/care/${id}/notes`, { text }),
    remove: (id: string) => a.del<void>(`/admin/care/${id}`),
    prayer: () => a.get<Paginated<AdminPrayer>>('/admin/prayer'),
    updatePrayer: (id: string, patch: { status?: 'open' | 'answered'; visibility?: 'pastors' | 'church'; answeredNote?: string }) => a.patch<AdminPrayer>(`/admin/prayer/${id}`, patch),
    removePrayer: (id: string) => a.del<void>(`/admin/prayer/${id}`),
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
  },
  payments: {
    status: () => a.get<PaymentsStatus>('/admin/settings/payments'),
    connect: (input: RazorpayKeysInput) => a.post<PaymentsStatus>('/admin/settings/payments/razorpay', input),
    disconnect: () => a.del<PaymentsStatus>('/admin/settings/payments/razorpay'),
    setup: () => a.get<RazorpaySetupView>('/admin/settings/payments/setup'),
    buySetup: () => a.post<{ checkoutUrl?: string; activated?: boolean; view?: RazorpaySetupView }>('/admin/settings/payments/setup'),
    updateSetup: (patch: { orgType?: ChurchOrgType; contactPhone?: string }) => a.patch<RazorpaySetupView>('/admin/settings/payments/setup', patch),
    uploadDoc: (input: { kind: KycDocKind; fileName: string; data: string }) => a.post<RazorpaySetupView>('/admin/settings/payments/setup/docs', input),
    removeDoc: (id: string) => a.del<RazorpaySetupView>(`/admin/settings/payments/setup/docs/${id}`),
    submitSetup: () => a.post<RazorpaySetupView>('/admin/settings/payments/setup/submit'),
  },
  billing: {
    get: () => a.get<BillingView>('/admin/billing'),
    checkout: (plan: PlanId, interval: BillingInterval) => a.post<{ activated: boolean; checkoutUrl?: string; billing?: BillingView }>('/admin/billing/checkout', { plan, interval }),
    cancel: () => a.post<BillingView>('/admin/billing/cancel'),
  },
  ai: {
    status: () => a.get<AiStatus>('/admin/ai/status'),
    write: (input: { purpose: AiPurpose; brief: string; channel?: string; language?: string; draft?: string }) => a.post<AiDraft>('/admin/ai/write', input),
    translate: (text: string, to: string) => a.post<{ text: string }>('/admin/ai/translate', { text, to }),
    ask: (question: string, history: { role: 'user' | 'assistant'; text: string }[]) => a.post<AiAnswer>('/admin/ai/ask', { question, history }),
    briefing: () => a.post<AiAnswer>('/admin/ai/briefing', {}),
    sermon: (input: { kind: AiSermonKind; title?: string; passage?: string; notes?: string; language?: string }) => a.post<{ text: string }>('/admin/ai/sermon', input),
    setlist: (theme: string, count: number) => a.post<AiSetlist>('/admin/ai/setlist', { theme, count }),
  },
  integrations: {
    get: () => a.get<{ chitthi: ChitthiStatus }>('/admin/integrations'),
    connectChitthi: (input: { apiKey: string; template?: string; language?: string; params?: number }) => a.post<ChitthiStatus>('/admin/integrations/chitthi', input),
    updateChitthi: (input: { template: string; language: string; params: number }) => a.patch<ChitthiStatus>('/admin/integrations/chitthi', input),
    disconnectChitthi: () => a.del<ChitthiStatus>('/admin/integrations/chitthi'),
    chitthiTemplates: () => a.get<{ available: boolean; data: ChitthiTemplate[] }>('/admin/integrations/chitthi/templates'),
    testChitthi: (phone: string) => a.post<{ ok: true }>('/admin/integrations/chitthi/test', { phone }),
    apiKeys: () => a.get<ApiKeyView[]>('/admin/api-keys'),
    createKey: (input: { name: string; access: 'read' | 'full' }) => a.post<{ key: ApiKeyView; secret: string }>('/admin/api-keys', input),
    revokeKey: (id: string) => a.del<void>(`/admin/api-keys/${id}`),
  },
  staff: {
    list: () => a.get<StaffMember[]>('/admin/staff'),
    invite: (input: { name: string; email: string; role: StaffRole }) => a.post<StaffMember>('/admin/staff', input),
    setRole: (id: string, role: StaffRole) => a.patch<StaffMember>(`/admin/staff/${id}`, { role }),
    remove: (id: string) => a.del<void>(`/admin/staff/${id}`),
  },
  forms: {
    list: () => a.get<FormView[]>('/admin/forms'),
    get: (id: string) => a.get<FormView>(`/admin/forms/${id}`),
    create: (input: Partial<FormInput>) => a.post<FormView>('/admin/forms', input),
    update: (id: string, input: Partial<FormInput>) => a.patch<FormView>(`/admin/forms/${id}`, input),
    duplicate: (id: string) => a.post<FormView>(`/admin/forms/${id}/duplicate`),
    remove: (id: string) => a.del<void>(`/admin/forms/${id}`),
    responses: (id: string) => a.get<FormResponse[]>(`/admin/forms/${id}/responses`),
    setStatus: (id: string, responseId: string, status: 'cancelled' | 'confirmed') => a.patch<FormResponse>(`/admin/forms/${id}/responses/${responseId}`, { status }),
    promote: (id: string, responseId: string) => a.post<{ response: FormResponse; checkoutUrl: string | null }>(`/admin/forms/${id}/responses/${responseId}/promote`),
  },
  calendar: {
    items: (from: string, to: string) => a.get<CalendarItem[]>(`/admin/calendar${qs({ from, to })}`),
    resources: () => a.get<Resource[]>('/admin/resources'),
    createResource: (input: Partial<Resource>) => a.post<Resource>('/admin/resources', input),
    updateResource: (id: string, input: Partial<Resource>) => a.patch<Resource>(`/admin/resources/${id}`, input),
    removeResource: (id: string) => a.del<void>(`/admin/resources/${id}`),
    bookings: (q: { status?: string; when?: 'past' } = {}) => a.get<BookingView[]>(`/admin/bookings${qs(q)}`),
    check: (input: { id?: string; resourceIds: string[]; startsAt: string; endsAt: string; setupMinutes?: number }) => a.post<BookingConflict[]>('/admin/bookings/check', input),
    book: (input: { title: string; resourceIds: string[]; startsAt: string; endsAt: string; setupMinutes?: number; repeatWeeks?: number; notes?: string; eventId?: string | null; force?: boolean }) => a.post<BookingView>('/admin/bookings', input),
    decide: (id: string, decision: 'approve' | 'decline' | 'cancel', note?: string, force?: boolean) => a.post<BookingView>(`/admin/bookings/${id}/${decision}`, { note, force }),
  },
  fields: {
    list: () => a.get<CustomField[]>('/admin/people-fields'),
    create: (input: Omit<CustomField, 'id' | 'order'>) => a.post<CustomField>('/admin/people-fields', input),
    update: (id: string, input: Partial<CustomField>) => a.patch<CustomField>(`/admin/people-fields/${id}`, input),
    remove: (id: string) => a.del<void>(`/admin/people-fields/${id}`),
  },
  lists: {
    list: () => a.get<SmartListView[]>('/admin/lists'),
    preview: (rules: ListRule[], match: 'all' | 'any') => a.post<{ count: number; sample: { id: string; name: string }[] }>('/admin/lists/preview', { rules, match }),
    create: (input: { name: string; description?: string; rules: ListRule[]; match: 'all' | 'any' }) => a.post<SmartListView>('/admin/lists', input),
    update: (id: string, input: { name?: string; description?: string; rules?: ListRule[]; match?: 'all' | 'any' }) => a.patch<SmartListView>(`/admin/lists/${id}`, input),
    remove: (id: string) => a.del<void>(`/admin/lists/${id}`),
    people: (id: string, cursor?: string) => a.get<PeoplePage & { list: SmartListView }>(`/admin/lists/${id}/people${qs({ cursor })}`),
  },
  workflows: {
    list: () => a.get<WorkflowView[]>('/admin/workflows'),
    get: (id: string, status = 'active') => a.get<{ workflow: WorkflowView; cards: WorkflowCardView[] }>(`/admin/workflows/${id}${qs({ status })}`),
    create: (input: Partial<Workflow>) => a.post<WorkflowView>('/admin/workflows', input),
    update: (id: string, input: Partial<Workflow>) => a.patch<WorkflowView>(`/admin/workflows/${id}`, input),
    remove: (id: string) => a.del<void>(`/admin/workflows/${id}`),
    add: (id: string, input: { personIds?: string[]; listId?: string; note?: string }) => a.post<{ added: number }>(`/admin/workflows/${id}/cards`, input),
    cards: (q: { mine?: boolean; personId?: string } = {}) => a.get<WorkflowCardView[]>(`/admin/workflow-cards${qs({ mine: q.mine ? 'true' : undefined, personId: q.personId })}`),
    act: (cardId: string, action: 'advance' | 'back' | 'done' | 'remove' | 'snooze' | 'assign' | 'note', extra: { note?: string; days?: number; assignedTo?: string | null } = {}) => a.patch<WorkflowCardView>(`/admin/workflow-cards/${cardId}`, { action, ...extra }),
  },
  batches: {
    list: () => a.get<BatchView[]>('/admin/giving/batches'),
    get: (id: string) => a.get<{ batch: BatchView; donations: AdminDonation[] }>(`/admin/giving/batches/${id}`),
    create: (input: { name?: string; date?: string; expectedTotal?: number | null; notes?: string }) => a.post<BatchView>('/admin/giving/batches', input),
    update: (id: string, input: Partial<Batch>) => a.patch<BatchView>(`/admin/giving/batches/${id}`, input),
    commit: (id: string, force = false) => a.post<BatchView>(`/admin/giving/batches/${id}/commit`, { force }),
    reopen: (id: string) => a.post<BatchView>(`/admin/giving/batches/${id}/reopen`),
    remove: (id: string) => a.del<void>(`/admin/giving/batches/${id}`),
  },
  live: {
    get: (eventId: string) => a.get<LiveView>(`/admin/services/${eventId}/live`),
    act: (eventId: string, action: 'start' | 'next' | 'prev' | 'goto' | 'stop' | 'reset', index?: number) => a.post<LiveView>(`/admin/services/${eventId}/live`, { action, index }),
  },
  presentation: {
    get: (eventId: string) => a.get<PresentationView>(`/admin/services/${eventId}/presentation`),
    act: (eventId: string, action: 'next' | 'prev' | 'goto' | 'item' | 'blank' | 'logo' | 'live' | 'message' | 'countdown' | 'lower' | 'lowerClear' | 'queue' | 'overlay',
      extra: { index?: number; message?: string; until?: string; lowerThird?: Partial<LowerThird>; lowerThirds?: Partial<LowerThird>[]; on?: boolean } = {}) =>
      a.post<PresentationView>(`/admin/services/${eventId}/presentation`, { action, ...extra }),
    theme: () => a.get<PresentationTheme>('/admin/presentation-theme'),
    saveTheme: (input: Partial<PresentationTheme>) => a.put<PresentationTheme>('/admin/presentation-theme', input),
    resetKey: () => a.post<{ screenKey: string }>('/admin/presentation-key/reset'),
  },
  songStats: () => a.get<SongStats>('/admin/songs/stats'),
  ccli: (from?: string, to?: string) => a.get<{ from: string; to: string; rows: CcliRow[] }>(`/admin/songs/ccli-report${qs({ from, to })}`),
  headcounts: {
    record: (eventId: string, area: string, count: number) => a.post<CheckinSummary>(`/admin/checkin/${eventId}/headcounts`, { area, count }),
    remove: (id: string) => a.del<void>(`/admin/checkin/headcounts/${id}`),
  },
  groupPosts: {
    list: (groupId: string) => a.get<{ posts: GroupPost[]; resources: GroupResource[] }>(`/admin/groups/${groupId}/posts`),
    remove: (postId: string) => a.del<void>(`/admin/groups/posts/${postId}`),
  },
  accounts: {
    summary: (fy?: string) => a.get<AccountsSummary>(`/admin/accounts/summary${qs({ fy })}`),
    heads: () => a.get<AccountHead[]>('/admin/accounts/heads'),
    createHead: (input: { name: string; tallyName?: string | null; tallyGroup?: string; budget?: string; fy?: string }) => a.post<AccountHead>('/admin/accounts/heads', input),
    updateHead: (id: string, input: Partial<{ name: string; tallyName: string | null; tallyGroup: string; budget: string; fy: string; active: boolean }>) => a.patch<AccountHead>(`/admin/accounts/heads/${id}`, input),
    tally: () => a.get<TallySettings>('/admin/accounts/tally'),
    saveTally: (input: Partial<TallySettings>) => a.patch<TallySettings>('/admin/accounts/tally', input),
    tallyExport: (f: { from: string; to: string; gifts?: '0'; expenses?: '0'; ledgers?: '0'; daily?: '1' }) => a.get<{ filename: string; xml: string; receipts: number; payments: number; incomeTotal: number; expenseTotal: number; ledgers: number }>(`/admin/accounts/tally-export${qs(f)}`),
  },
  expenses: {
    list: (f: { status?: ExpenseStatus; headId?: string; mine?: '1' } = {}) => a.get<ExpenseView[]>(`/admin/expenses${qs(f)}`),
    create: (input: { headId: string; amount: string; payee: string; description: string; date?: string; method?: ExpenseMethod | null; reference?: string; fcra?: boolean; billUrl?: string; paid?: boolean }) => a.post<ExpenseView>('/admin/expenses', input),
    decide: (id: string, approve: boolean, note?: string) => a.post<ExpenseView>(`/admin/expenses/${id}/decide`, { approve, note }),
    pay: (id: string, input: { method: ExpenseMethod; date?: string; reference?: string; fcra?: boolean }) => a.post<ExpenseView>(`/admin/expenses/${id}/pay`, input),
    remove: (id: string) => a.del<void>(`/admin/expenses/${id}`),
  },
  zones: {
    list: () => a.get<ZoneView[]>('/admin/zones'),
    get: (id: string) => a.get<ZoneDetail>(`/admin/zones/${id}`),
    create: (input: { name: string; parentId?: string | null; leaderIds?: string[]; meetingDay?: string | null; area?: string | null; notes?: string | null }) => a.post<ZoneView>('/admin/zones', input),
    update: (id: string, input: Partial<{ name: string; parentId: string | null; leaderIds: string[]; meetingDay: string | null; area: string | null; notes: string | null; active: boolean }>) => a.patch<ZoneView>(`/admin/zones/${id}`, input),
    remove: (id: string) => a.del<void>(`/admin/zones/${id}`),
    addPeople: (id: string, personIds: string[]) => a.post<{ families: number; people: number }>(`/admin/zones/${id}/members`, { personIds }),
    removeFamily: (id: string, key: string) => a.del<{ people: number }>(`/admin/zones/${id}/families/${encodeURIComponent(key)}`),
    report: (since?: string) => a.get<{ since: string; rows: ZoneReportRow[] }>(`/admin/zones/report${qs({ since })}`),
  },
  visits: {
    list: (f: { status?: 'planned' | 'done' | 'cancelled'; zoneId?: string; mine?: '1'; familyKey?: string }) => a.get<VisitView[]>(`/admin/visits${qs(f)}`),
    due: (f: { since?: string; zoneId?: string }) => a.get<{ since: string; families: ZoneFamily[] }>(`/admin/visits/due${qs(f)}`),
    create: (input: { personId?: string; familyKey?: string; date: string; status?: 'done'; purpose: VisitPurpose; visitorIds?: string[]; visitorNames?: string[]; notes?: string; prayerPoints?: string; followUp?: string; confidential?: boolean }) => a.post<VisitView>('/admin/visits', input),
    update: (id: string, input: Partial<{ status: 'planned' | 'done' | 'cancelled'; date: string; purpose: VisitPurpose; notes: string; prayerPoints: string; followUp: string; confidential: boolean; visitorIds: string[]; visitorNames: string[] }>) => a.patch<VisitView>(`/admin/visits/${id}`, input),
    remove: (id: string) => a.del<void>(`/admin/visits/${id}`),
  },
  registers: {
    summary: () => a.get<{ kinds: RegisterSummary[]; fields: Record<RegisterKind, RegisterField[]>; labels: Record<RegisterKind, { name: string; certificate: string; prefix: string; person: string; date: string }> }>('/admin/registers/summary'),
    list: (f: { kind?: RegisterKind; q?: string; year?: string; status?: 'void' | 'all'; cursor?: string }) => a.get<{ data: RegisterEntry[]; nextCursor: string | null; total: number }>(`/admin/registers${qs(f)}`),
    forPerson: (personId: string) => a.get<RegisterEntry[]>(`/admin/people/${personId}/registers`),
    create: (input: RegisterEntryInput & { markInactive?: boolean }) => a.post<RegisterEntry>('/admin/registers', input),
    update: (id: string, input: Partial<RegisterEntryInput> & { reason?: string }) => a.patch<RegisterEntry>(`/admin/registers/${id}`, input),
    note: (id: string, text: string) => a.post<RegisterEntry>(`/admin/registers/${id}/notes`, { text }),
    void: (id: string, reason: string) => a.post<RegisterEntry>(`/admin/registers/${id}/void`, { reason }),
    certificate: (id: string) => a.post<Certificate>(`/admin/registers/${id}/certificate`),
  },
  sermons: {
    list: () => a.get<Sermon[]>('/admin/sermons'),
    create: (input: Partial<Sermon>) => a.post<Sermon>('/admin/sermons', input),
    update: (id: string, input: Partial<Sermon>) => a.patch<Sermon>(`/admin/sermons/${id}`, input),
    remove: (id: string) => a.del<void>(`/admin/sermons/${id}`),
  },
  celebrations: {
    list: (days: number, kind?: CelebrationKind) => a.get<Celebration[]>(`/admin/celebrations${qs({ days: String(days), kind })}`),
    greet: (input: { personId: string; kind: CelebrationKind; channel: Channel; subject?: string; body: string }) => a.post<Greeting>('/admin/celebrations/greet', input),
  },
  publicPage: {
    get: () => a.get<PublicPage>('/admin/public-page'),
    save: (input: Partial<PublicPage>) => a.put<PublicPage>('/admin/public-page', input),
  },
  audit: (q?: string, cursor?: string) => a.get<Paginated<AuditEntry>>(`/admin/audit${qs({ q, cursor })}`),
};
