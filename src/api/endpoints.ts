// One function per backend endpoint. Screens call these, never fetch() directly.
import type { ImportGiftRow, ImportPersonRow } from '@/core/import-presets';
import type { billingView } from '@/core/modules/billing';
import type { ChurchEntry } from '@/core/platform';
import type { BillingInterval, PlanId, Subscription } from '@/core/plans';
import type { AssetCategory, AssetCondition, AssetLogEntry, AssetView, AssetsHub, MyReading, ReadingHub, ReadingPlanView, ReadingReader, ReadingTemplate, FeastDish, FeastSplit, FeastView, FeastsHub, PublicRental, PublicRentals, RentalOffer, RentalView, RentalsHub, MyPractice, PracticeSong, PracticeView, PracticesHub, SongPartName, CertificateCheck, PrayerKiosk, PrayerWall, PublicPrayerInfo, WallRequest } from '@/core/types';
import type { CalendarFeedLink, CarolNightView, CarolSeason, CarolSeasonView, CarolStopStatus, Currency, MyCarols, MyRides, RideOfferView, RideRequestView, RidesHub, AidKind, AidRequest, AidSummary, BenevolenceHub, MyAid } from '@/core/types';
import type { OfferingQrHub, OfferingQrView, PublicOfferingQr, BankAccountId, BankLineView, BankUploadResult, BankView, AdminDonation as CoreAdminDonation } from '@/core/types';
import type { BankLineInput } from '@/core/bank-presets';
import type { SafeguardCheck, SafeguardHub, SafeguardPersonView, SafeguardSettings } from '@/core/types';
import type { CanvaExportFormat, CanvaExportResult } from '@/core/types';
import type { MorningCallOutcome, MorningListView } from '@/core/types';
import type { BibleBookInfo, BibleChapter, BibleMark, BibleMarkColor, BibleTranslationInfo } from '@/core/types';
import type { PublicRegistrationForm, RegistrationMember, RegistrationSettings, RegistrationView, RegistrationsHub } from '@/core/types';
import type { LibraryBook, LibraryHub, MyLibrary } from '@/core/types';
import type { MySkills, SkillsHub } from '@/core/types';
import type { Camp, CampDetail, CampSignup, CampView, MyCamp } from '@/core/types';
import type { MyOccasion, OccasionKind, OccasionStatus, OccasionsHub, OccasionView } from '@/core/types';
export type OccasionInput = { kind: OccasionKind; personIds: string[]; title: string; date: string | null; time: string | null; place: string; pastorId: string | null; contactName: string; contactPhone: string; notes: string };
import type { DiscipleshipHub, MentorFocus, MentorshipDetail, MyMentoring } from '@/core/types';
import type { MyVigil, Vigil, VigilDetail, VigilView } from '@/core/types';
import type { Course, CourseDetail, CourseSession, CoursesHub, MyCourse } from '@/core/types';
import type { ChitthiSetup, ChitthiSetupStatus, HubChannelDetail, HubChannelView, HubPost, HubView, MyTask } from '@/core/types';
import type { ChurchOrgType, KycDocKind, RazorpaySetup, RazorpaySetupView, RecurringGift, RecurringSummary, WaBotStatus, AuctionLot, CampaignDetail, CampaignKind, CampaignView, InKindGift, MemberCampaign, OfferingEnvelope, PaymentMethod, ConsentEvent, DataRequest, DataRequestKind, DataRequestStatus, MemberPrivacy, PrivacyOverview, PrivacySettings, PageReason, ParentPage, Bulletin, BulletinSection, BulletinView, MemberSundaySchool, MemberMission, MissionaryDetail, MissionPayout, MissionsOverview, SsClass, SsClassDetail, SsExamResults, SsExamView, SsLesson, SsOverview, SsPerson, SsPrizes, SsRegister, OfflineItem, OfflinePack, OfflineSyncResult, LiveNow, LiveOverview, LiveSettings, LiveStatus, LiveStreamDetail, LiveStreamView, FamilyCheckinEvent, FamilyCheckinResult, FamilyMember, FamilyView, ChurchNetworkLink, NetworkKind, NetworkOverview, NetworkSummary } from '@/core/types';
export type ReturnTemplateSummary = { id: string; name: string; body: string; unit: string; above: string; lines: number };
export type FeastMenuInput = (Omit<FeastDish, 'id' | 'cookName'> & { id?: string })[];

export type AssetInput = {
  name: string; tag?: string; category: AssetCategory; quantity: number; location: string; serial: string; vendor: string;
  purchasedOn: string | null; cost: number | null; warrantyUntil: string | null;
  amc: { vendor: string; phone: string; until: string | null; note: string } | null;
  serviceEveryMonths: number | null; lastServicedOn: string | null; condition: AssetCondition; custodianId: string | null; notes: string; photoUrl: string | null;
};

export type MissionaryInput = { name: string; field?: string; organisation?: string; work?: string; prayerPoints?: string; monthlyNeed?: number | null; since?: string | null; email?: string | null; phone?: string | null; photoUrl?: string | null; showPublic?: boolean };
export type ReportDelivery = { sent: number; failed: number; unreachable: number };
export type CampaignInput = { name: string; kind: CampaignKind; description?: string; goal?: number | null; startsOn?: string; endsOn?: string | null; showPublic?: boolean };
import type { AccountHead, AccountsSummary, Certificate, ExpenseMethod, ExpenseStatus, ExpenseView, PaymentsStatus, TallySettings, VisitPurpose, VisitView, ZoneDetail, ZoneFamily, ZoneReportRow, ZoneView, RegisterEntry, RegisterEntryInput, RegisterField, RegisterKind, RegisterSummary } from '@/core/types';

export type BillingView = ReturnType<typeof billingView>;
export type CountSheetInput = Pick<CountSheet, 'notes' | 'coins' | 'cheques' | 'upi'> & { photoUrl?: string | null };
/** The carol rounds page: this year's season, the areas and teams to plan with, and the funds offerings can go to. */
export type CarolsHub = { season: CarolSeasonView | null; seasons: { id: string; name: string; from: string; to: string }[]; zones: { id: string; name: string; homes: number }[]; teams: { id: string; name: string }[]; funds: { id: string; name: string }[]; currency: Currency };
export type CarolSeasonInput = Partial<Pick<CarolSeason, 'name' | 'from' | 'to' | 'startTime' | 'minutesPerHouse' | 'travelMinutes' | 'housesPerNight' | 'offDays' | 'fundId' | 'message'>>;
export type RazorpayKeysInput = { keyId: string; keySecret: string; webhookSecret: string; fcra?: { keyId: string; keySecret: string; webhookSecret: string } | null };
// Member endpoints match the mobile app exactly (docs/API.md); admin ones are in docs/API-ADMIN.md.
import type {
  AdminAnnouncement,
  AiAnswer,
  AiDraft,
  AiPurpose,
  AiSermonKind,
  AiSetlist,
  AiSongScan,
  AiStatus,
  ApiKeyView,
  ChitthiStatus,
  ConnectionsStatus,
  ZoomStatus,
  GcsStatus,
  CanvaStatus,
  CanvaDesign,
  MediaFolder,
  MediaItem,
  MediaList,
  MediaUpload,
  BotIntent,
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
  GiftImportResult,
  ExportBundle,
  GettingStarted,
  ExportSummary,
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
  PrayerChain,
  PrayerView,
  Receipts80g,
  Room,
  Schedule,
  ScheduleOverview,
  ServiceDetail,
  ServiceSummary,
  SmsDigestPreview,
  SmsDigestStatus,
  AiVisitNotes,
  VisitAction,
  VisitActionItem,
  MemberVerses,
  ElectionRoll,
  ElectionView,
  VideoGreeting,
  VideoGreetingKind,
  VideoGreetingsHub,
  GreetingLinkView,
  AnnualReturnView,
  ReturnHeader,
  MissedCall,
  MissedCallHub,
  MissedCallSettings,
  CaptionLine,
  AddedItem,
  BiblePassage,
  CaptionsSettings,
  PublicGreeting,
  Recap,
  RecapFacts,
  RecapSlide,
  RecapSunday,
  MemberRecap,
  MemberElection,
  ReceiptCheck,
  VoteReceipt,
  SsVerseBoards,
  VerseAnswerResult,
  VerseLevel,
  Song,
  SongView,
  StaffMember,
  StaffView,
  PersonAccess,
  CustomRole,
  RoleScope,
  TeamLoginView,
  DoorQr,
  EmailAccountStatus,
  NotificationKind,
  NotificationRule,
  NotificationsView,
  TeamView,
  Template,
  Batch,
  BatchView,
  CountSheet,
  BookingConflict,
  BookingView,
  CalendarItem,
  CcliRow,
  LowerThird,
  PresentationTheme,
  ObsSettings,
  PresentationView,
  SongStats,
  CatalogList,
  CatalogSong,
  CatalogSongDetail,
  SongLicenceStatus,
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
import { adminSession, createApi, memberSession, networkApi, platformApi, qs, type PlatformSession, type SessionStore } from './client';
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
  bibleMarks: (book?: string, chapter?: number) => m.get<BibleMark[]>(`/me/bible/marks${qs({ book, chapter: chapter ? String(chapter) : undefined })}`),
  bibleMark: (book: string, chapter: number, verse: number, patch: { color?: BibleMarkColor | null; bookmark?: boolean; note?: string }) => m.put<{ mark: BibleMark | null }>(`/me/bible/marks/${book}/${chapter}/${verse}`, patch),
  auth: authApi(memberSession),
  me: {
    get: () => m.get<Member>('/me'),
    update: (patch: Partial<Pick<Member, 'firstName' | 'lastName' | 'email' | 'phone' | 'language'>>) => m.patch<Member>('/me', patch),
    setPhoto: (image: string) => m.put<PhotoResult>('/me/photo', { image }),
    removePhoto: () => m.del<PhotoResult>('/me/photo'),
    setAvatar: (avatar: number | null) => m.put<PhotoResult>('/me/avatar', { avatar }),
    preferences: () => m.get<MemberPreferences>('/me/preferences'),
    updatePreferences: (patch: { consent?: Partial<MemberPreferences['consent']>; campusId?: string | null; prayerChain?: boolean; titheDay?: number | null; titheAmount?: number | null }) => m.patch<MemberPreferences>('/me/preferences', patch),
    privacy: () => m.get<MemberPrivacy>('/me/privacy'),
    exportData: () => m.get<Record<string, unknown>>('/me/privacy/export'),
    privacyRequest: (kind: DataRequestKind, details: string) => m.post<DataRequest>('/me/privacy/requests', { kind, details }),
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
    campaigns: () => m.get<MemberCampaign[]>('/giving/campaigns'),
    removePledge: (id: string) => m.del<void>(`/giving/pledges/${id}`),
  },
  calendar: {
    get: () => m.get<CalendarFeedLink>('/me/calendar'),
    reset: () => m.post<CalendarFeedLink>('/me/calendar/reset'),
  },
  carols: {
    get: () => m.get<MyCarols>('/me/carols'),
    request: (input: { preferredDates: string[]; note?: string }) => m.post<NonNullable<MyCarols['request']>>('/me/carols/request', input),
    cancel: () => m.del<void>('/me/carols/request'),
  },
  aid: {
    get: () => m.get<MyAid>('/me/aid'),
    request: (input: { kind: AidKind; amount: number; reason: string }) => m.post<MyAid>('/me/aid', input),
    withdraw: (id: string) => m.del<MyAid>(`/me/aid/${id}`),
  },
  camps: {
    get: () => m.get<{ camps: MyCamp[] }>('/me/camps'),
    signUp: (id: string, input: { personIds: string[]; emergencyName: string; emergencyPhone: string; needsBus: boolean; medical: Record<string, string> }) => m.post<{ camps: MyCamp[] }>(`/me/camps/${id}`, input),
    cancel: (id: string, personId: string) => m.del<{ camps: MyCamp[] }>(`/me/camps/${id}/${personId}`),
  },
  skills: {
    get: () => m.get<MySkills>('/me/skills'),
    save: (input: { skills: string[]; note: string; serve: boolean; share: boolean }) => m.put<MySkills>('/me/skills', input),
    post: (input: { kind: 'job' | 'need' | 'offer'; title: string; body: string; place: string }) => m.post<MySkills>('/me/board', input),
    close: (id: string) => m.post<MySkills>(`/me/board/${id}/close`, {}),
  },
  occasions: {
    get: () => m.get<{ occasions: MyOccasion[] }>('/me/occasions'),
    request: (input: { kind: OccasionKind; date?: string; time?: string; place?: string; phone?: string; title?: string; note?: string }) => m.post<{ occasions: MyOccasion[] }>('/me/occasions', input),
    withdraw: (id: string) => m.del<{ occasions: MyOccasion[] }>(`/me/occasions/${id}`),
  },
  library: {
    get: () => m.get<MyLibrary>('/me/library'),
    request: (bookId: string) => m.post<MyLibrary>(`/me/library/${bookId}/request`, {}),
    withdraw: (bookId: string) => m.del<MyLibrary>(`/me/library/${bookId}/request`),
  },
  mentoring: {
    get: () => m.get<MyMentoring>('/me/mentoring'),
    met: (id: string, input: { date: string; topic: string }) => m.post<MyMentoring>(`/me/mentoring/${id}/meetings`, input),
  },
  vigils: {
    get: () => m.get<{ vigils: MyVigil[] }>('/me/vigils'),
    take: (id: string, slotStart: string) => m.post<{ vigils: MyVigil[] }>(`/me/vigils/${id}/slots`, { slotStart }),
    leave: (id: string, slotStart: string) => m.del<{ vigils: MyVigil[] }>(`/me/vigils/${id}/slots?slotStart=${encodeURIComponent(slotStart)}`),
  },
  courses: {
    get: () => m.get<{ courses: MyCourse[] }>('/me/courses'),
    enroll: (id: string) => m.post<{ courses: MyCourse[] }>(`/me/courses/${id}/enroll`, {}),
    leave: (id: string) => m.del<{ courses: MyCourse[] }>(`/me/courses/${id}`),
  },
  reading: {
    get: () => m.get<MyReading>('/me/reading'),
    join: (planId: string) => m.post<MyReading>(`/me/reading/${planId}/join`, {}),
    leave: (planId: string) => m.del<MyReading>(`/me/reading/${planId}`),
    done: (planId: string, day: number, done = true) => m.post<MyReading>(`/me/reading/${planId}/done`, { day, done }),
  },
  /** Choir practice: the next rehearsal, songs with part recordings, my attendance; leaders record who came. */
  recaps: {
    list: () => m.get<MemberRecap[]>('/me/recaps'),
    get: (id: string) => m.get<MemberRecap>(`/me/recaps/${id}`),
  },
  elections: {
    list: () => m.get<MemberElection[]>('/me/elections'),
    vote: (id: string, choices: string[]) => m.post<VoteReceipt>(`/me/elections/${id}/vote`, { choices }),
    receipt: (id: string, code: string) => m.get<ReceiptCheck>(`/me/elections/${id}/receipt/${encodeURIComponent(code)}`),
  },
  verses: {
    get: () => m.get<MemberVerses>('/me/verses'),
    answer: (childId: string, input: { level: VerseLevel; answers?: string[]; text?: string }) => m.post<VerseAnswerResult>(`/me/verses/${childId}/answer`, input),
  },
  practice: {
    get: (teamId?: string) => m.get<MyPractice>(`/me/practice${qs({ teamId })}`),
    record: (input: PracticeInput & { teamId: string }) => m.post<PracticeView>('/me/practice', input),
    update: (id: string, input: Partial<PracticeInput>) => m.patch<PracticeView>(`/me/practice/${id}`, input),
  },
  rides: {
    get: (sunday?: string) => m.get<MyRides>(`/me/rides${qs({ sunday })}`),
    request: (input: { sunday?: string; people?: number; weekly?: boolean; note?: string }) => m.post<MyRides>('/me/rides/request', input),
    cancelRequest: (sunday?: string) => m.del<MyRides>(`/me/rides/request${qs({ sunday })}`),
    offer: (input: { sunday?: string; seats?: number; weekly?: boolean; note?: string }) => m.post<MyRides>('/me/rides/offer', input),
    cancelOffer: (sunday?: string) => m.del<MyRides>(`/me/rides/offer${qs({ sunday })}`),
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
  sundaySchool: () => m.get<MemberSundaySchool>('/me/sunday-school'),
  missions: {
    list: () => m.get<MemberMission[]>('/missions'),
    support: (id: string, amount: number) => m.put<MemberMission>(`/missions/${id}/support`, { amount }),
    stop: (id: string) => m.del<MemberMission>(`/missions/${id}/support`),
  },
  family: {
    get: () => m.get<FamilyView>('/me/family'),
    add: (input: FamilyMemberInput) => m.post<FamilyMember>('/me/family/members', input),
    update: (id: string, input: Partial<FamilyMemberInput>) => m.patch<FamilyMember>(`/me/family/members/${id}`, input),
    checkinEvents: () => m.get<FamilyCheckinEvent[]>('/me/family/checkin'),
    checkIn: (eventId: string, personIds: string[]) => m.post<FamilyCheckinResult>(`/me/family/checkin/${eventId}`, { personIds }),
  },
  // Door QR attendance: scanned from the leader's phone at the entrance.
  door: {
    get: (eventId: string, token: string) => m.get<FamilyCheckinEvent>(`/door/${eventId}${qs({ t: token })}`),
    checkIn: (eventId: string, token: string, personIds: string[]) => m.post<FamilyCheckinResult>(`/door/${eventId}`, { token, personIds }),
  },
  bulletins: {
    list: () => m.get<{ id: string; title: string; date: string }[]>('/bulletins'),
    latest: () => m.get<BulletinView | null>('/bulletins/latest'),
    get: (id: string) => m.get<BulletinView>(`/bulletins/${id}`),
  },
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

export type FamilyMemberInput = { firstName: string; lastName?: string; birthDate: string | null; gender?: 'male' | 'female' | null; allergies?: string | null; medicalNotes?: string | null; phone?: string | null };

// ---------- Public pages (no sign-in) ----------
export const PublicApi = {
  bibleTranslations: () => m.get<{ featured: string[]; translations: BibleTranslationInfo[] }>('/public/bible/translations'),
  bibleBooks: (tr: string) => m.get<BibleBookInfo[]>(`/public/bible/${encodeURIComponent(tr)}/books`),
  bibleChapter: (tr: string, book: string, chapter: number) => m.get<BibleChapter>(`/public/bible/${encodeURIComponent(tr)}/${book}/${chapter}`),
  church: () => m.get<PublicChurch>('/public/church'),
  sermons: () => m.get<Sermon[]>('/public/sermons'),
  recap: (id: string) => m.get<MemberRecap>(`/public/recaps/${id}`),
  greeting: (token: string) => m.get<PublicGreeting>(`/public/greetings/${token}`),
  qr: (id: string) => m.get<PublicOfferingQr>(`/public/qr/${id}`),
  greetingWatched: (token: string) => m.post<{ ok: boolean }>(`/public/greetings/${token}/watched`, {}),
  greetingReply: (token: string, message: string) => m.post<{ ok: boolean; message: string }>(`/public/greetings/${token}/reply`, { message }),
  groups: () => m.get<PublicGroup[]>('/public/groups'),
  groupInterest: (id: string, input: { name: string; email: string; phone?: string; message?: string }) => m.post<{ ok: boolean; message: string }>(`/public/groups/${id}/interest`, input),
  form: (id: string) => m.get<PublicForm>(`/public/forms/${id}`),
  screen: (eventId: string, key: string) => m.get<PresentationView>(`/screens/${eventId}${qs({ key })}`),
  bulletin: (id: string, k: string) => m.get<BulletinView>(`/public/bulletins/${id}${qs({ k })}`),
  submitForm: (id: string, input: FormSubmission) => m.post<FormSubmitResult>(`/public/forms/${id}/responses`, input),
  /** Signed-in members are counted by name; everyone else by a random id kept in their browser. */
  live: () => m.get<LiveNow>('/public/live'),
  livePing: (streamId: string, viewer: string) => m.post<{ ok: boolean; status: LiveStatus; watching: number }>(`/public/live/${streamId}/ping`, { viewer }),
  /** Hall, ground and room hire by outsiders: the spaces, a request, and the renter's own page by token. */
  /** Prayer cards and the lobby kiosk: anyone can send a request; the wall needs the kiosk key. */
  registrationForm: () => m.get<PublicRegistrationForm>('/public/registration'),
  register: (input: { householdName?: string; phone: string; email: string; address: string; area: string; previousChurch?: string; howHeard?: string; note?: string; wantsMembership: boolean; agree: boolean; website?: string; consent: { whatsapp: boolean; email: boolean; directory: boolean }; members: Partial<RegistrationMember>[] }) =>
    m.post<{ ok: true; householdName?: string; count?: number }>('/public/registration', input),
  prayerInfo: () => m.get<PublicPrayerInfo>('/public/prayer'),
  sendPrayer: (input: { text: string; name?: string; phone?: string; share?: boolean; source?: 'card' | 'kiosk' }) => m.post<{ ok: true; id: string; message: string }>('/public/prayer', input),
  prayerWall: (k: string, device: string) => m.get<PrayerWall>(`/public/prayer/wall${qs({ k, device })}`),
  prayWall: (id: string, k: string, device: string) => m.post<WallRequest>(`/public/prayer/wall/${id}/pray${qs({ k })}`, { device }),
  /** The QR on a register certificate: confirms it was issued and is not void. */
  verifyCertificate: (code: string) => m.get<CertificateCheck>(`/public/verify/${encodeURIComponent(code)}`),
  rentals: () => m.get<PublicRentals>('/public/rentals'),
  requestRental: (input: RentalRequestInput) => m.post<PublicRental>('/public/rentals', input),
  rental: (token: string) => m.get<PublicRental>(`/public/rentals/${token}`),
  payRental: (token: string) => m.post<{ checkoutUrl: string; rental: PublicRental }>(`/public/rentals/${token}/pay`, {}),
  cancelRental: (token: string) => m.post<PublicRental>(`/public/rentals/${token}/cancel`, {}),
};
export type PracticeInput = { at: string; minutes?: number; eventId?: string | null; songIds?: string[]; presentIds?: string[]; notes?: string };
export type ElectionInput = { title: string; kind?: 'election' | 'resolution'; description?: string; seats?: number; candidates?: { id?: string; personId?: string | null; name: string; note?: string }[]; eligibility?: 'members' | 'members_18' | 'everyone_18'; meetingAt?: string | null; venue?: string; closesAt?: string | null; returningOfficer?: string };
export type RentalRequestInput = { resourceId: string; name: string; phone: string; email?: string; organisation?: string; purpose: string; guests?: number; startsAt: string; endsAt: string };

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
  chitthiSetupsOpen: number;
};
export type TeamChitthiRow = ChitthiSetup & { connected: boolean; churchId: string; churchName: string; city: string; ownerEmail: string; plan: PlanId };
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

/** A church network or diocese office (/network). Totals only; never anyone's details. */
export const NetworkApi = {
  request: (email: string) => networkApi.post<OtpRequest>('/networks/auth/request', { email }),
  verify: (requestId: string, code: string) => networkApi.post<PlatformSession>('/networks/auth/verify', { requestId, code }),
  signOut: () => networkApi.post<void>('/networks/auth/sign-out'),
  mine: () => networkApi.get<NetworkSummary[]>('/networks/mine'),
  create: (input: { name: string; kind: NetworkKind }) => networkApi.post<NetworkSummary>('/networks/new', input),
  overview: (id: string) => networkApi.get<NetworkOverview>(`/networks/${id}`),
  update: (id: string, patch: { name?: string; kind?: NetworkKind; admins?: string[] }) => networkApi.patch<NetworkOverview>(`/networks/${id}`, patch),
  newCode: (id: string) => networkApi.post<NetworkOverview>(`/networks/${id}/code`),
  removeChurch: (id: string, churchId: string) => networkApi.del<NetworkOverview>(`/networks/${id}/churches/${churchId}`),
  remove: (id: string) => networkApi.del<void>(`/networks/${id}`),
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
  chitthiSetups: () => platformApi.get<{ open: number; rows: TeamChitthiRow[] }>('/platform/chitthi-setups'),
  updateChitthi: (churchId: string, patch: { status?: ChitthiSetupStatus; teamNote?: string; apiKey?: string }) => platformApi.patch<TeamChitthiRow>(`/platform/chitthi-setups/${churchId}`, patch),
  setupDoc: (churchId: string, docId: string) => platformApi.get<{ fileName: string; mime: string; data: string }>(`/platform/razorpay-setups/${churchId}/docs/${docId}`),
  updateSetup: (churchId: string, patch: { status?: RazorpaySetup['status']; teamNote?: string }) => platformApi.patch<TeamSetupRow>(`/platform/razorpay-setups/${churchId}`, patch),
  // The shared song database: public-domain songs the team adds or corrects.
  songs: (q: { q?: string; lang?: string } = {}) => platformApi.get<{ total: number; songs: TeamSongRow[] }>(`/platform/songs${qs(q)}`),
  song: (id: string) => platformApi.get<CatalogSong & { edited: boolean }>(`/platform/songs/${encodeURIComponent(id)}`),
  addSong: (input: TeamSongInput) => platformApi.post<CatalogSong>('/platform/songs', input),
  saveSong: (id: string, input: TeamSongInput) => platformApi.put<CatalogSong>(`/platform/songs/${encodeURIComponent(id)}`, input),
  removeSong: (id: string) => platformApi.del<void>(`/platform/songs/${encodeURIComponent(id)}`),
};
export type TeamSongRow = Omit<CatalogSong, 'lyrics' | 'chordChart'> & { hasLyrics: boolean; hasChords: boolean; edited: boolean };
export type TeamSongInput = Omit<CatalogSong, 'id' | 'copyright'>;
export type TeamSetupRow = RazorpaySetup & { churchId: string; churchName: string; city?: string; ownerEmail?: string; missing: KycDocKind[]; keysConnected: boolean; stored?: string[] };
export type TeamSetups = { price: number; open: number; earned: number; rows: TeamSetupRow[] };

// ---------- Church admin dashboard ----------
const a = createApi(adminSession);

export type RoleInfo = { role: StaffRole; label: string; permissions: Permission[] };
/** A built-in role, or a custom role with the zones/groups/teams it covers. */
export type RoleChoice = { role: StaffRole; roleId?: string | null; scopeIds?: string[] };
export type RoleView = CustomRole & { holders: number };
export type RoleInput = { name: string; description?: string; permissions: Permission[]; scope: RoleScope };
export type PhotoResult = { id: string; photoUrl: string | null; avatar: number | null };
export type Duplicate = { reason: string; people: { id: string; name: string; phone: string | null; email: string | null }[] };
export type CampusView = Campus & { people: number };
export type Assignee = { id: string; name: string; role: StaffRole };
export type AdminPrayer = PrayerView & { name: string };
export type BlockoutView = Blockout & { name: string };

export const AdminApi = {
  morningList: {
    get: () => a.get<MorningListView>('/admin/morning-list'),
    done: (personId: string, outcome: MorningCallOutcome, note?: string) => a.post<MorningListView>(`/admin/morning-list/${personId}/done`, { outcome, note }),
    undo: (personId: string) => a.post<MorningListView>(`/admin/morning-list/${personId}/undo`, {}),
    settings: (input: { enabled?: boolean; count?: number; hour?: number }) => a.put<MorningListView>('/admin/morning-list/settings', input),
  },
  registrations: {
    get: () => a.get<RegistrationsHub>('/admin/registrations'),
    settings: (input: Partial<RegistrationSettings>) => a.put<RegistrationSettings>('/admin/registration-settings', input),
    approve: (id: string, input: { status?: 'visitor' | 'regular' | 'member'; link?: Record<number, string>; note?: string }) => a.post<RegistrationView>(`/admin/registrations/${id}/approve`, input),
    decline: (id: string, note?: string) => a.post<RegistrationView>(`/admin/registrations/${id}/decline`, { note }),
    remove: (id: string) => m.del<{ ok: true }>(`/admin/registrations/${id}`),
  },
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
    setPhoto: (id: string, image: string) => a.put<PhotoResult>(`/admin/people/${id}/photo`, { image }),
    removePhoto: (id: string) => a.del<PhotoResult>(`/admin/people/${id}/photo`),
    setAvatar: (id: string, avatar: number | null) => a.put<PhotoResult>(`/admin/people/${id}/avatar`, { avatar }),
    import: (rows: ImportPersonRow[], source: ImportSource, dedupeBy: 'phone' | 'email') =>
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
  calendarLinks: {
    feeds: () => a.get<{ church: CalendarFeedLink; teams: CalendarFeedLink[] }>('/admin/calendar/feeds'),
    reset: (id: string) => a.post<CalendarFeedLink>(`/admin/calendar/feeds/${id}/reset`),
  },
  assets: {
    hub: (q?: { status?: 'active' | 'retired' | 'all'; category?: string; q?: string }) => a.get<AssetsHub>(`/admin/assets${qs({ status: q?.status, category: q?.category, q: q?.q })}`),
    create: (input: AssetInput) => a.post<AssetView>('/admin/assets', input),
    update: (id: string, input: Partial<AssetInput> & { status?: 'active' }) => a.patch<AssetView>(`/admin/assets/${id}`, input),
    log: (id: string, input: { kind: AssetLogEntry['kind']; text: string; date?: string; cost?: number | null; location?: string }) => a.post<AssetView>(`/admin/assets/${id}/log`, input),
    retire: (id: string, reason: string) => a.del<{ ok: true }>(`/admin/assets/${id}${qs({ reason })}`),
  },
  benevolence: {
    hub: (status?: string) => a.get<BenevolenceHub>(`/admin/benevolence${qs({ status })}`),
    setFund: (fundId: string | null) => a.put<AidSummary>('/admin/benevolence/settings', { fundId }),
    create: (input: { personId: string; kind: AidKind; amount: number; reason: string }) => a.post<AidRequest>('/admin/benevolence', input),
    update: (id: string, input: { status?: 'reviewing' | 'approved' | 'declined' | 'withdrawn'; approved?: number; note?: string }) => a.patch<AidRequest>(`/admin/benevolence/${id}`, input),
    pay: (id: string, input: { via: string; reference?: string; date?: string; amount?: number }) => a.post<AidRequest>(`/admin/benevolence/${id}/pay`, input),
    addNote: (id: string, text: string) => a.post<AidRequest>(`/admin/benevolence/${id}/notes`, { text }),
  },
  feasts: {
    hub: (all = false) => a.get<FeastsHub>(`/admin/feasts${qs({ all: all ? '1' : undefined })}`),
    get: (id: string) => a.get<FeastView>(`/admin/feasts/${id}`),
    create: (input: { eventId: string; template: string; name?: string; extraHeads?: number }) => a.post<FeastView>('/admin/feasts', input),
    update: (id: string, input: { name?: string; menu?: FeastMenuInput; extraHeads?: number; headsOverride?: number | null; split?: FeastSplit; notes?: string }) => a.patch<FeastView>(`/admin/feasts/${id}`, input),
    remove: (id: string) => a.del<{ ok: true }>(`/admin/feasts/${id}`),
  },
  /** Hall hire: which spaces are for hire and at what rate, and the requests from outsiders. */
  rentals: {
    hub: (status?: 'open' | 'paid' | 'closed') => a.get<RentalsHub>(`/admin/rentals${qs({ status })}`),
    setSpace: (id: string, input: Partial<Omit<RentalOffer, 'id'>>) => a.put<{ resource: Resource; offer: RentalOffer }>(`/admin/rentals/spaces/${id}`, input),
    approve: (id: string, input: { amount?: number; deposit?: number; note?: string; force?: boolean }) => a.post<RentalView>(`/admin/rentals/${id}/approve`, input),
    decline: (id: string, note: string) => a.post<RentalView>(`/admin/rentals/${id}/decline`, { note }),
    markPaid: (id: string, input: { via: 'cash' | 'bank_transfer' | 'cheque' | 'upi'; reference?: string }) => a.post<RentalView>(`/admin/rentals/${id}/paid`, input),
    refund: (id: string, note: string) => a.post<RentalView>(`/admin/rentals/${id}/refund`, { note }),
    addNote: (id: string, text: string) => a.post<RentalView>(`/admin/rentals/${id}/notes`, { text }),
  },
  reading: {
    hub: (status?: 'active' | 'archived' | 'all') => a.get<ReadingHub>(`/admin/reading${qs({ status })}`),
    create: (input: { template: ReadingTemplate; name?: string; description?: string; startsOn: string; readings?: string }) => a.post<ReadingPlanView>('/admin/reading', input),
    update: (id: string, input: { name?: string; description?: string; status?: 'active' | 'archived' }) => a.patch<ReadingPlanView>(`/admin/reading/${id}`, input),
    readers: (id: string) => a.get<ReadingReader[]>(`/admin/reading/${id}/readers`),
  },
  practices: {
    hub: (teamId?: string) => a.get<PracticesHub>(`/admin/practices${qs({ teamId })}`),
    create: (input: PracticeInput & { teamId: string }) => a.post<PracticeView>('/admin/practices', input),
    update: (id: string, input: Partial<PracticeInput>) => a.patch<PracticeView>(`/admin/practices/${id}`, input),
    remove: (id: string) => a.del<{ ok: true }>(`/admin/practices/${id}`),
    addPart: (songId: string, input: { part: SongPartName; url?: string; mediaId?: string; name?: string; replace?: boolean }) => a.post<PracticeSong>(`/admin/songs/${songId}/parts`, input),
    removePart: (songId: string, partId: string) => a.del<PracticeSong>(`/admin/songs/${songId}/parts/${partId}`),
  },
  rides: {
    hub: (sunday?: string) => a.get<RidesHub>(`/admin/rides${qs({ sunday })}`),
    match: (sunday: string, anyZone = false) => a.post<RidesHub & { made: number }>('/admin/rides/match', { sunday, anyZone }),
    addRequest: (input: { personId: string; sunday: string; people?: number; weekly?: boolean; note?: string }) => a.post<RideRequestView>('/admin/rides/requests', input),
    updateRequest: (id: string, input: { offerId?: string | null; people?: number; note?: string; status?: 'cancelled' }) => a.patch<RideRequestView>(`/admin/rides/requests/${id}`, input),
    removeRequest: (id: string) => a.del<void>(`/admin/rides/requests/${id}`),
    addOffer: (input: { personId: string; sunday: string; seats?: number; weekly?: boolean; note?: string }) => a.post<RideOfferView>('/admin/rides/offers', input),
    updateOffer: (id: string, input: { seats?: number; note?: string; weekly?: boolean }) => a.patch<RideOfferView>(`/admin/rides/offers/${id}`, input),
    removeOffer: (id: string) => a.del<void>(`/admin/rides/offers/${id}`),
  },
  carols: {
    get: () => a.get<CarolsHub>('/admin/carols'),
    season: (id: string) => a.get<CarolSeasonView>(`/admin/carols/seasons/${id}`),
    createSeason: (input: CarolSeasonInput) => a.post<CarolSeasonView>('/admin/carols/seasons', input),
    updateSeason: (id: string, input: CarolSeasonInput) => a.patch<CarolSeasonView>(`/admin/carols/seasons/${id}`, input),
    removeSeason: (id: string) => a.del<void>(`/admin/carols/seasons/${id}`),
    plan: (id: string, input: { zoneIds: string[]; teamIds: string[]; onlyRequests?: boolean }) => a.post<CarolSeasonView>(`/admin/carols/seasons/${id}/plan`, input),
    addNight: (id: string, input: { date: string; teamId?: string | null; startTime?: string; area?: string }) => a.post<CarolNightView>(`/admin/carols/seasons/${id}/nights`, input),
    updateNight: (id: string, input: { date?: string; startTime?: string; teamId?: string | null; area?: string; notes?: string; order?: string[] }) => a.patch<CarolNightView>(`/admin/carols/nights/${id}`, input),
    removeNight: (id: string) => a.del<void>(`/admin/carols/nights/${id}`),
    addStop: (id: string, input: { personId?: string; familyKey?: string }) => a.post<CarolNightView>(`/admin/carols/nights/${id}/stops`, input),
    removeStop: (id: string, key: string) => a.del<CarolNightView>(`/admin/carols/nights/${id}/stops/${encodeURIComponent(key)}`),
    updateStop: (id: string, key: string, input: { status?: CarolStopStatus; offering?: number | null; note?: string }) => a.patch<CarolNightView>(`/admin/carols/nights/${id}/stops/${encodeURIComponent(key)}`, input),
  },
  teamHub: {
    get: () => a.get<HubView>('/admin/team-hub'),
    createChannel: (input: { name: string; memberKeys: string[]; teamId?: string | null }) => a.post<HubChannelView>('/admin/team-hub/channels', input),
    channel: (id: string, cursor?: string | null) => a.get<HubChannelDetail>(`/admin/team-hub/channels/${id}${qs({ cursor })}`),
    post: (id: string, input: { kind: HubPost['kind']; text: string; pinned?: boolean; task?: { assigneeKey: string; dueAt?: string | null } }) => a.post<HubPost>(`/admin/team-hub/channels/${id}/posts`, input),
    updateChannel: (id: string, input: { name?: string; memberKeys?: string[]; archived?: boolean }) => a.patch<HubChannelView>(`/admin/team-hub/channels/${id}`, input),
    updatePost: (id: string, input: { text?: string; pinned?: boolean; done?: boolean }) => a.patch<HubPost>(`/admin/team-hub/posts/${id}`, input),
    removePost: (id: string) => a.del<void>(`/admin/team-hub/posts/${id}`),
    myTasks: () => a.get<MyTask[]>('/me/tasks'),
  },
  media: {
    list: (folder?: MediaFolder) => a.get<MediaList>(`/admin/media${qs({ folder })}`),
    start: (input: { name: string; contentType: string; size: number; folder: MediaFolder }) => a.post<MediaUpload>('/admin/media/uploads', input),
    complete: (id: string, input: { size?: number; previewUrl?: string }) => a.post<MediaItem>(`/admin/media/${id}/complete`, input),
    remove: (id: string) => a.del<void>(`/admin/media/${id}`),
  },
  canva: {
    designs: () => a.get<CanvaDesign[]>('/admin/canva/designs'),
    open: (input: { kind: string; title: string; imageDataUrl?: string }) => a.post<CanvaDesign>('/admin/canva/designs', input),
    refresh: (id: string) => a.post<CanvaDesign>(`/admin/canva/designs/${id}/refresh`, {}),
    save: (id: string, format: CanvaExportFormat) => a.post<CanvaExportResult>(`/admin/canva/designs/${id}/export`, { format }),
  },
  events: {
    list: (when: 'upcoming' | 'past' = 'upcoming') => a.get<Paginated<AdminEvent>>(`/admin/events${qs({ when })}`),
    createZoom: (id: string) => a.post<AdminEvent>(`/admin/events/${id}/zoom`),
    removeZoom: (id: string) => a.del<AdminEvent>(`/admin/events/${id}/zoom`),
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
  gettingStarted: {
    get: () => a.get<GettingStarted>('/admin/getting-started'),
    dismiss: (undo = false) => a.post<GettingStarted>('/admin/getting-started/dismiss', { undo }),
  },
  exportAll: {
    summary: () => a.get<ExportSummary>('/admin/export'),
    bundle: () => a.post<ExportBundle>('/admin/export', {}),
  },
  safeguarding: {
    hub: () => a.get<SafeguardHub>('/admin/safeguarding'),
    settings: (patch: Partial<SafeguardSettings>) => a.patch<SafeguardHub>('/admin/safeguarding/settings', patch),
    addCheck: (personId: string, input: Pick<SafeguardCheck, 'kind' | 'issuedOn'> & { expiresOn?: string | null; reference?: string; note?: string }) => a.post<SafeguardPersonView>(`/admin/safeguarding/${personId}/checks`, input),
    removeCheck: (personId: string, checkId: string) => a.del<SafeguardPersonView>(`/admin/safeguarding/${personId}/checks/${checkId}`),
  },
  courses: {
    hub: () => a.get<CoursesHub>('/admin/courses'),
    get: (id: string) => a.get<CourseDetail>(`/admin/courses/${id}`),
    create: (input: Partial<Omit<Course, 'id' | 'sessions' | 'status' | 'createdAt'>> & { sessions?: Partial<CourseSession>[] }) => a.post<CourseDetail>('/admin/courses', input),
    update: (id: string, patch: Partial<Omit<Course, 'id' | 'createdAt'>>) => a.patch<CourseDetail>(`/admin/courses/${id}`, patch),
    enroll: (id: string, personIds: string[]) => a.post<CourseDetail>(`/admin/courses/${id}/enroll`, { personIds }),
    attendance: (id: string, sessionId: string, present: string[]) => a.post<CourseDetail>(`/admin/courses/${id}/attendance`, { sessionId, present }),
    drop: (id: string, eid: string) => a.post<CourseDetail>(`/admin/courses/${id}/enrollments/${eid}/drop`, {}),
    complete: (id: string, eid: string) => a.post<CourseDetail>(`/admin/courses/${id}/enrollments/${eid}/complete`, {}),
  },
  camps: {
    list: () => a.get<{ camps: CampView[] }>('/admin/camps'),
    get: (id: string) => a.get<CampDetail>(`/admin/camps/${id}`),
    create: (input: Partial<Omit<Camp, 'id' | 'createdAt'>>) => a.post<CampDetail>('/admin/camps', input),
    update: (id: string, patch: Partial<Omit<Camp, 'id' | 'createdAt'>>) => a.patch<CampDetail>(`/admin/camps/${id}`, patch),
    remove: (id: string) => a.del<{ ok: true }>(`/admin/camps/${id}`),
    add: (id: string, personIds: string[]) => a.post<CampDetail>(`/admin/camps/${id}/signups`, { personIds }),
    setSignup: (id: string, signupId: string, patch: Partial<Pick<CampSignup, 'roomId' | 'busId' | 'paid' | 'status' | 'medical' | 'needsBus'>>) => a.patch<CampDetail>(`/admin/camps/${id}/signups/${signupId}`, patch),
    assign: (id: string) => a.post<CampDetail>(`/admin/camps/${id}/assign`, {}),
  },
  skills: {
    hub: () => a.get<SkillsHub>('/admin/skills'),
    set: (personId: string, input: { skills: string[]; note?: string; serve?: boolean; share?: boolean }) => a.patch<SkillsHub>(`/admin/skills/${personId}`, input),
    moderate: (postId: string, action: 'hide' | 'show') => a.post<SkillsHub>(`/admin/board/${postId}/${action}`, {}),
  },
  occasions: {
    hub: () => a.get<OccasionsHub>('/admin/occasions'),
    create: (input: OccasionInput) => a.post<OccasionView>('/admin/occasions', input),
    update: (id: string, patch: Partial<OccasionInput> & { status?: OccasionStatus }) => a.patch<OccasionView>(`/admin/occasions/${id}`, patch),
    checklist: (id: string, op: { toggle: string } | { remove: string } | { label: string }) => a.post<OccasionView>(`/admin/occasions/${id}/checklist`, op),
    remove: (id: string) => a.del<{ ok: true }>(`/admin/occasions/${id}`),
  },
  library: {
    hub: () => a.get<LibraryHub>('/admin/library'),
    settings: (loanDays: number) => a.patch<LibraryHub>('/admin/library/settings', { loanDays }),
    add: (books: Partial<Omit<LibraryBook, 'id' | 'addedAt'>>[]) => a.post<LibraryHub>('/admin/library/books', { books }),
    update: (id: string, patch: Partial<Omit<LibraryBook, 'id' | 'addedAt'>>) => a.patch<LibraryHub>(`/admin/library/books/${id}`, patch),
    remove: (id: string) => a.del<LibraryHub>(`/admin/library/books/${id}`),
    lend: (bookId: string, personId: string) => a.post<LibraryHub>('/admin/library/loans', { bookId, personId }),
    act: (loanId: string, action: 'issue' | 'ready' | 'return' | 'renew' | 'cancel') => a.post<LibraryHub>(`/admin/library/loans/${loanId}/${action}`, {}),
  },
  discipleship: {
    hub: () => a.get<DiscipleshipHub>('/admin/discipleship'),
    get: (id: string) => a.get<MentorshipDetail>(`/admin/discipleship/${id}`),
    create: (input: { mentorId: string; menteeId: string; focus: MentorFocus; goal: string; everyDays: number }) => a.post<MentorshipDetail>('/admin/discipleship', input),
    update: (id: string, patch: Partial<{ focus: MentorFocus; goal: string; everyDays: number; status: 'active' | 'paused' | 'completed' }>) => a.patch<MentorshipDetail>(`/admin/discipleship/${id}`, patch),
    log: (id: string, input: { date: string; topic: string; note: string }) => a.post<MentorshipDetail>(`/admin/discipleship/${id}/meetings`, input),
    unlog: (id: string, meetingId: string) => a.del<MentorshipDetail>(`/admin/discipleship/${id}/meetings/${meetingId}`),
  },
  vigils: {
    list: () => a.get<{ vigils: VigilView[] }>('/admin/vigils'),
    get: (id: string) => a.get<VigilDetail>(`/admin/vigils/${id}`),
    create: (input: Partial<Omit<Vigil, 'id' | 'status' | 'createdAt' | 'createdBy'>>) => a.post<VigilDetail>('/admin/vigils', input),
    update: (id: string, patch: Partial<Omit<Vigil, 'id' | 'createdAt' | 'createdBy'>>) => a.patch<VigilDetail>(`/admin/vigils/${id}`, patch),
    remove: (id: string) => a.del<void>(`/admin/vigils/${id}`),
    add: (id: string, personId: string, slotStart: string) => a.post<VigilDetail>(`/admin/vigils/${id}/signups`, { personId, slotStart }),
    drop: (id: string, signupId: string) => a.del<VigilDetail>(`/admin/vigils/${id}/signups/${signupId}`),
  },
  bank: {
    view: (q: { account?: BankAccountId; from?: string; to?: string }) => a.get<BankView>(`/admin/bank${qs(q)}`),
    upload: (input: { account: BankAccountId; bankName: string; lines: BankLineInput[] }) => a.post<BankUploadResult>('/admin/bank/statements', input),
    removeStatement: (id: string) => a.del(`/admin/bank/statements/${id}`),
    match: (id: string, kind: 'gift' | 'expense' | 'batch', targetId: string) => a.post<BankLineView>(`/admin/bank/lines/${id}/match`, { kind, id: targetId }),
    unmatch: (id: string) => a.post<BankLineView>(`/admin/bank/lines/${id}/unmatch`, {}),
    ignore: (id: string, as: 'charges' | 'interest' | 'settlement' | 'ignored', note?: string) => a.post<BankLineView>(`/admin/bank/lines/${id}/ignore`, { as, note }),
    recordGift: (id: string, input: { fundId: string; donorId?: string | null; donorName?: string; pan?: string }) => a.post<{ line: BankLineView; gift: CoreAdminDonation }>(`/admin/bank/lines/${id}/record-gift`, input),
    recordExpense: (id: string, input: { headId: string; payee?: string; description?: string }) => a.post<{ line: BankLineView; expense: ExpenseView }>(`/admin/bank/lines/${id}/record-expense`, input),
  },
  giving: {
    donations: (q: DonationQuery) => a.get<DonationPage>(`/admin/giving/donations${qs(q)}`),
    import: (rows: ImportGiftRow[], source: ImportSource) => a.post<GiftImportResult>('/admin/giving/import', { rows, source }),
    qr: {
      hub: () => a.get<OfferingQrHub>('/admin/giving/qr'),
      create: (input: { fundId: string; name?: string }) => a.post<OfferingQrView>('/admin/giving/qr', input),
      close: (id: string) => a.post<OfferingQrView>(`/admin/giving/qr/${id}/close`, {}),
      /** Demo only: pretend someone scanned the code. */
      testGift: (id: string, amount: number) => a.post<{ gift: unknown; code: OfferingQrView }>(`/admin/giving/qr/${id}/test-gift`, { amount }),
    },
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
  privacy: {
    get: () => a.get<PrivacyOverview>('/admin/privacy'),
    saveSettings: (input: Partial<PrivacySettings>) => a.put<PrivacyOverview>('/admin/privacy/settings', input),
    create: (input: { personId?: string | null; personName?: string; contact?: string; kind: DataRequestKind; details?: string }) => a.post<DataRequest>('/admin/privacy/requests', input),
    update: (id: string, input: { status?: DataRequestStatus; response?: string }) => a.patch<DataRequest>(`/admin/privacy/requests/${id}`, input),
    erase: (id: string) => a.post<DataRequest>(`/admin/privacy/requests/${id}/erase`),
    exportPerson: (personId: string) => a.get<Record<string, unknown>>(`/admin/people/${personId}/export`),
    consentLog: (personId: string) => a.get<ConsentEvent[]>(`/admin/people/${personId}/consent`),
  },
  missions: {
    overview: () => a.get<MissionsOverview>('/admin/missions'),
    create: (input: MissionaryInput) => a.post<MissionaryDetail>('/admin/missions', input),
    get: (id: string) => a.get<MissionaryDetail>(`/admin/missions/${id}`),
    update: (id: string, input: Partial<MissionaryInput> & { status?: 'active' | 'ended' }) => a.patch<MissionaryDetail>(`/admin/missions/${id}`, input),
    remove: (id: string) => a.del<{ ok: true }>(`/admin/missions/${id}`),
    addSupport: (id: string, input: { personId?: string | null; name?: string; amount: number; kind?: 'member' | 'church'; startedOn?: string }) => a.post<MissionaryDetail>(`/admin/missions/${id}/support`, input),
    updateSupport: (id: string, sid: string, input: { amount?: number; endedOn?: string | null; name?: string }) => a.patch<MissionaryDetail>(`/admin/missions/${id}/support/${sid}`, input),
    removeSupport: (id: string, sid: string) => a.del<MissionaryDetail>(`/admin/missions/${id}/support/${sid}`),
    addPayout: (id: string, input: { amount: number; date: string; method: MissionPayout['method']; reference?: string; note?: string }) => a.post<MissionaryDetail>(`/admin/missions/${id}/payouts`, input),
    removePayout: (id: string, pid: string) => a.del<MissionaryDetail>(`/admin/missions/${id}/payouts/${pid}`),
    addReport: (id: string, input: { title: string; body: string; prayerPoints: string; date?: string; published: boolean; send: boolean }) => a.post<MissionaryDetail & { delivery?: ReportDelivery }>(`/admin/missions/${id}/reports`, input),
    sendReport: (id: string, rid: string) => a.post<MissionaryDetail & { delivery: ReportDelivery }>(`/admin/missions/${id}/reports/${rid}/send`),
    removeReport: (id: string, rid: string) => a.del<MissionaryDetail>(`/admin/missions/${id}/reports/${rid}`),
  },
  videoGreetings: {
    hub: () => a.get<VideoGreetingsHub>('/admin/video-greetings'),
    save: (kind: VideoGreetingKind, input: Partial<Pick<VideoGreeting, 'videoUrl' | 'mediaId' | 'posterUrl' | 'fromName' | 'message' | 'enabled'>>) => a.put<VideoGreeting>(`/admin/video-greetings/${kind}`, input),
    remove: (kind: VideoGreetingKind) => a.del<{ ok: boolean }>(`/admin/video-greetings/${kind}`),
    test: (kind: VideoGreetingKind, personId?: string) => a.post<GreetingLinkView>(`/admin/video-greetings/${kind}/test`, personId ? { personId } : {}),
    links: () => a.get<GreetingLinkView[]>('/admin/video-greetings/links'),
  },
  annualReturn: {
    templates: () => a.get<ReturnTemplateSummary[]>('/admin/annual-return/templates'),
    get: (template?: string, year?: number) => a.get<AnnualReturnView>(`/admin/annual-return${qs({ template, year: year === undefined ? undefined : String(year) })}`),
    save: (input: { template: string; year: number; values?: Record<string, string | number | null>; header?: Partial<ReturnHeader>; notes?: string }) => a.put<AnnualReturnView>('/admin/annual-return', input),
    submit: (template: string, year: number) => a.post<AnnualReturnView>('/admin/annual-return/submit', { template, year }),
    reopen: (template: string, year: number) => a.post<AnnualReturnView>('/admin/annual-return/reopen', { template, year }),
    exportCsv: (template: string, year: number) => a.get<{ csv: string }>(`/admin/annual-return/export.csv${qs({ template, year: String(year) })}`),
  },
  missedCall: {
    hub: () => a.get<MissedCallHub>('/admin/missed-call'),
    save: (input: Partial<MissedCallSettings> & { newKey?: boolean }) => a.put<MissedCallHub>('/admin/missed-call', input),
    try: (from: string, to?: string) => a.post<MissedCall>('/admin/missed-call/try', { from, to }),
    link: (id: string, personId: string) => a.post<MissedCall>(`/admin/missed-call/${id}/link`, { personId }),
  },
  recaps: {
    list: () => a.get<Recap[]>('/admin/recaps'),
    sundays: () => a.get<RecapSunday[]>('/admin/recaps/sundays'),
    facts: (eventId?: string, includeGiving?: boolean) => a.get<RecapFacts>(`/admin/recaps/facts${qs({ eventId, includeGiving: includeGiving ? '1' : undefined })}`),
    create: (input: { eventId?: string; language?: string; includeGiving?: boolean }) => a.post<Recap>('/admin/recaps', input),
    update: (id: string, input: { headline?: string; caption?: string; slides?: RecapSlide[] }) => a.patch<Recap>(`/admin/recaps/${id}`, input),
    publish: (id: string) => a.post<Recap>(`/admin/recaps/${id}/publish`, {}),
    remove: (id: string) => a.del<{ ok: boolean }>(`/admin/recaps/${id}`),
  },
  elections: {
    list: () => a.get<ElectionView[]>('/admin/elections'),
    create: (input: ElectionInput) => a.post<ElectionView>('/admin/elections', input),
    get: (id: string) => a.get<ElectionView>(`/admin/elections/${id}`),
    update: (id: string, input: Partial<ElectionInput>) => a.patch<ElectionView>(`/admin/elections/${id}`, input),
    remove: (id: string) => a.del<{ ok: boolean }>(`/admin/elections/${id}`),
    open: (id: string, closesAt: string) => a.post<ElectionView>(`/admin/elections/${id}/open`, { closesAt }),
    close: (id: string) => a.post<ElectionView>(`/admin/elections/${id}/close`, {}),
    paper: (id: string, counts: Record<string, number>, invalid: number) => a.put<ElectionView>(`/admin/elections/${id}/paper`, { counts, invalid }),
    roll: (id: string) => a.get<ElectionRoll>(`/admin/elections/${id}/roll`),
    markRoll: (id: string, personId: string, voted: boolean) => a.post<{ voted: 'app' | 'paper' | null }>(`/admin/elections/${id}/roll/${personId}`, { voted }),
    publish: (id: string) => a.post<ElectionView>(`/admin/elections/${id}/publish`, {}),
  },
  sundaySchool: {
    overview: () => a.get<SsOverview>('/admin/sunday-school'),
    verses: (week?: string) => a.get<SsVerseBoards>(`/admin/sunday-school/verses${qs({ week })}`),
    setup: () => a.post<{ placed: number }>('/admin/sunday-school/setup'),
    enroll: () => a.post<{ placed: number }>('/admin/sunday-school/enroll'),
    promote: () => a.post<{ moved: number; graduated: SsPerson[] }>('/admin/sunday-school/promote'),
    createClass: (input: Partial<Omit<SsClass, 'id' | 'createdAt'>> & { name: string }) => a.post<SsClassDetail>('/admin/sunday-school/classes', input),
    getClass: (id: string) => a.get<SsClassDetail>(`/admin/sunday-school/classes/${id}`),
    updateClass: (id: string, input: Partial<Omit<SsClass, 'id' | 'createdAt'>>) => a.patch<SsClassDetail>(`/admin/sunday-school/classes/${id}`, input),
    removeClass: (id: string) => a.del<{ ok: true }>(`/admin/sunday-school/classes/${id}`),
    register: (id: string, date?: string) => a.get<SsRegister>(`/admin/sunday-school/classes/${id}/register${qs({ date })}`),
    saveRegister: (id: string, input: { date: string; present: string[]; verse: string[]; visitors: number; offering: number }) => a.put<SsRegister>(`/admin/sunday-school/classes/${id}/register`, input),
    lessons: () => a.get<SsLesson[]>('/admin/sunday-school/lessons'),
    createLesson: (input: Omit<SsLesson, 'id'>) => a.post<SsLesson>('/admin/sunday-school/lessons', input),
    updateLesson: (id: string, input: Partial<Omit<SsLesson, 'id'>>) => a.patch<SsLesson>(`/admin/sunday-school/lessons/${id}`, input),
    removeLesson: (id: string) => a.del<{ ok: true }>(`/admin/sunday-school/lessons/${id}`),
    exams: () => a.get<SsExamView[]>('/admin/sunday-school/exams'),
    createExam: (input: { name: string; date: string; maxMarks: number; classIds?: string[] }) => a.post<SsExamResults>('/admin/sunday-school/exams', input),
    exam: (id: string) => a.get<SsExamResults>(`/admin/sunday-school/exams/${id}`),
    updateExam: (id: string, input: { name?: string; date?: string; maxMarks?: number; status?: 'open' | 'published' }) => a.patch<SsExamResults>(`/admin/sunday-school/exams/${id}`, input),
    removeExam: (id: string) => a.del<{ ok: true }>(`/admin/sunday-school/exams/${id}`),
    saveMarks: (id: string, classId: string, marks: Record<string, number | null | ''>) => a.put<SsExamResults>(`/admin/sunday-school/exams/${id}/marks`, { classId, marks }),
    sendResults: (id: string) => a.post<{ channel: string; sent: number; failed: number; noParent: string[] }>(`/admin/sunday-school/exams/${id}/send`),
    prizes: (from?: string, to?: string) => a.get<SsPrizes>(`/admin/sunday-school/prizes${qs({ from, to })}`),
  },
  networks: {
    list: () => a.get<{ available: boolean; networks: ChurchNetworkLink[] }>('/admin/networks'),
    preview: (code: string) => a.get<{ id: string; name: string; kind: NetworkKind; churches: number }>(`/admin/networks/preview${qs({ code })}`),
    join: (code: string, shareGiving: boolean) => a.post<ChurchNetworkLink>('/admin/networks/join', { code, shareGiving }),
    update: (id: string, shareGiving: boolean) => a.patch<ChurchNetworkLink>(`/admin/networks/${id}`, { shareGiving }),
    leave: (id: string) => a.del<void>(`/admin/networks/${id}`),
  },
  livestream: {
    overview: () => a.get<LiveOverview>('/admin/livestream'),
    settings: (input: Partial<LiveSettings>) => a.put<LiveSettings>('/admin/livestream/settings', input),
    create: (input: { url: string; title?: string; eventId?: string | null; startsAt?: string }) => a.post<LiveStreamView>('/admin/livestream/streams', input),
    get: (id: string) => a.get<LiveStreamDetail>(`/admin/livestream/streams/${id}`),
    update: (id: string, input: { url?: string; title?: string; eventId?: string | null; startsAt?: string }) => a.patch<LiveStreamDetail>(`/admin/livestream/streams/${id}`, input),
    remove: (id: string) => a.del<void>(`/admin/livestream/streams/${id}`),
    start: (id: string) => a.post<LiveStreamDetail>(`/admin/livestream/streams/${id}/start`),
    end: (id: string) => a.post<LiveStreamDetail>(`/admin/livestream/streams/${id}/end`),
  },
  bulletins: {
    list: () => a.get<Bulletin[]>('/admin/bulletins'),
    create: (input: { eventId?: string | null; date?: string; title?: string } = {}) => a.post<BulletinView>('/admin/bulletins', input),
    get: (id: string) => a.get<BulletinView>(`/admin/bulletins/${id}`),
    update: (id: string, input: Partial<Pick<Bulletin, 'title' | 'intro' | 'verse' | 'date' | 'eventId' | 'status'>> & { sections?: BulletinSection[] }) => a.patch<BulletinView>(`/admin/bulletins/${id}`, input),
    remove: (id: string) => a.del<{ ok: true }>(`/admin/bulletins/${id}`),
  },
  offerings: {
    list: () => a.get<CampaignView[]>('/admin/offerings'),
    create: (input: CampaignInput & { fundId?: string | null }) => a.post<CampaignDetail>('/admin/offerings', input),
    get: (id: string) => a.get<CampaignDetail>(`/admin/offerings/${id}`),
    update: (id: string, input: Partial<CampaignInput> & { status?: 'active' | 'closed' }) => a.patch<CampaignDetail>(`/admin/offerings/${id}`, input),
    remove: (id: string) => a.del<{ ok: true }>(`/admin/offerings/${id}`),
    giveEnvelopes: (id: string, input: { blank?: number; promised?: number | null; zoneId?: string }) => a.post<{ made: number; campaign: CampaignDetail }>(`/admin/offerings/${id}/envelopes`, input),
    updateEnvelope: (id: string, envId: string, input: { personId?: string | null; familyName?: string; promised?: number | null }) => a.patch<OfferingEnvelope>(`/admin/offerings/${id}/envelopes/${envId}`, input),
    receiveEnvelope: (id: string, envId: string, input: { amount: number; method: PaymentMethod; donorName?: string; pan?: string }) => a.post<OfferingEnvelope>(`/admin/offerings/${id}/envelopes/${envId}/receive`, input),
    removeEnvelope: (id: string, envId: string) => a.del<{ ok: true }>(`/admin/offerings/${id}/envelopes/${envId}`),
    addInKind: (id: string, input: { donorId?: string | null; donorName?: string; item: string; quantity?: string; value?: number; forAuction?: boolean; note?: string }) => a.post<InKindGift>(`/admin/offerings/${id}/in-kind`, input),
    removeInKind: (id: string, itemId: string) => a.del<{ ok: true }>(`/admin/offerings/${id}/in-kind/${itemId}`),
    addLot: (id: string, input: { inKindId?: string | null; title?: string; bidderId?: string | null; bidderName?: string; amount: number; paidNow?: boolean; method?: PaymentMethod }) => a.post<AuctionLot>(`/admin/offerings/${id}/lots`, input),
    payLot: (id: string, lotId: string, method: PaymentMethod) => a.post<AuctionLot>(`/admin/offerings/${id}/lots/${lotId}/pay`, { method }),
    removeLot: (id: string, lotId: string) => a.del<{ ok: true }>(`/admin/offerings/${id}/lots/${lotId}`),
  },
  notifications: {
    get: () => a.get<NotificationsView>('/admin/notifications'),
    update: (kind: NotificationKind, rule: NotificationRule) => a.put<NotificationsView>(`/admin/notifications/${kind}`, rule),
  },
  checkin: {
    events: () => a.get<AdminEvent[]>('/admin/checkin/events'),
    door: (eventId: string) => a.get<DoorQr>(`/admin/checkin/${eventId}/door`),
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
    parents: (checkinId: string) => a.get<{ id: string; name: string; phone: string | null }[]>(`/admin/checkin/checkins/${checkinId}/parents`),
    page: (checkinId: string, reason: PageReason, note = '') => a.post<ParentPage>(`/admin/checkin/checkins/${checkinId}/page`, { reason, note }),
    pages: (eventId: string) => a.get<ParentPage[]>(`/admin/checkin/${eventId}/pages`),
    resolvePage: (id: string) => a.post<ParentPage>(`/admin/checkin/pages/${id}/resolve`),
    settings: () => a.get<{ phoneCheckin: boolean }>('/admin/checkin-settings'),
    saveSettings: (input: { phoneCheckin: boolean }) => a.put<{ phoneCheckin: boolean }>('/admin/checkin-settings', input),
    offlinePack: (eventId: string) => a.get<OfflinePack>(`/admin/checkin/${eventId}/offline`),
    sync: (eventId: string, items: OfflineItem[]) => a.post<{ results: OfflineSyncResult[] }>(`/admin/checkin/${eventId}/sync`, { items }),
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
    // Team app logins (the volunteers' mobile app).
    logins: () => a.get<TeamLoginView[]>('/admin/team-logins'),
    sendLogin: (personId: string) => a.post<TeamLoginView>('/admin/team-logins', { personId }),
    resetLogin: (personId: string) => a.post<TeamLoginView>(`/admin/team-logins/${personId}/reset`),
    disableLogin: (personId: string) => a.del<void>(`/admin/team-logins/${personId}`),
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
  // The shared song database (public-domain hymns) and the church's song licences.
  songCatalog: {
    list: (q: { q?: string; lang?: string; theme?: string; limit?: string; offset?: string } = {}) => a.get<CatalogList>(`/admin/song-catalog${qs(q)}`),
    get: (id: string) => a.get<CatalogSongDetail>(`/admin/song-catalog/${encodeURIComponent(id)}`),
    add: (id: string) => a.post<{ song: Song; created: boolean; licensed: boolean }>(`/admin/song-catalog/${encodeURIComponent(id)}/add`),
    licence: () => a.get<SongLicenceStatus>('/admin/song-catalog/licence'),
    saveLicence: (input: { ccliLicence: string; streamingLicence: string; otherLicences: string }) => a.put<SongLicenceStatus>('/admin/song-catalog/licence', input),
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
    smsDigest: () => a.get<SmsDigestStatus>('/admin/messages/sms-digest'),
    smsDigestPreview: (q: { personId?: string; language?: string } = {}) => a.get<SmsDigestPreview>(`/admin/messages/sms-digest/preview${qs(q)}`),
    sendSmsDigest: () => a.post<{ messageId: string; recipients: number; sent: number; failed: number }>('/admin/messages/sms-digest/send', {}),
  },
  care: {
    list: (q: { status?: string; mine?: boolean } = {}) => a.get<Paginated<CareCase>>(`/admin/care${qs({ status: q.status, mine: q.mine ? 'true' : undefined })}`),
    atRisk: () => a.get<AtRiskPerson[]>('/admin/care/at-risk'),
    assignees: () => a.get<Assignee[]>('/admin/care/assignees'),
    create: (input: Partial<CareInput> & { title: string; personName?: string; prayerId?: string }) => a.post<CareCase>('/admin/care', input),
    /** POST, not GET: the first call mints the kiosk key, and the demo saves only on writes. */
    kiosk: () => a.post<PrayerKiosk>('/admin/prayer/kiosk', {}),
    setKiosk: (input: { enabled?: boolean; rotate?: boolean }) => a.post<PrayerKiosk>('/admin/prayer/kiosk', input),
    update: (id: string, patch: Partial<Pick<CareCase, 'status' | 'assignedTo' | 'priority' | 'dueAt' | 'title' | 'type' | 'confidential'>>) => a.patch<CareCase>(`/admin/care/${id}`, patch),
    addNote: (id: string, text: string) => a.post<CareCase>(`/admin/care/${id}/notes`, { text }),
    remove: (id: string) => a.del<void>(`/admin/care/${id}`),
    prayer: () => a.get<Paginated<AdminPrayer>>('/admin/prayer'),
    updatePrayer: (id: string, patch: { status?: 'open' | 'answered'; visibility?: 'pastors' | 'church'; answeredNote?: string }) => a.patch<AdminPrayer>(`/admin/prayer/${id}`, patch),
    removePrayer: (id: string) => a.del<void>(`/admin/prayer/${id}`),
    chain: () => a.get<PrayerChain>('/admin/prayer/chain'),
    sendChain: (id: string) => a.post<AdminPrayer>(`/admin/prayer/${id}/chain`),
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
    checkout: (plan: PlanId, interval: BillingInterval, chitthi?: boolean) => a.post<{ activated: boolean; checkoutUrl?: string; billing?: BillingView }>('/admin/billing/checkout', { plan, interval, chitthi }),
    /** WhatsApp by Chitthi on the plan: on asks our team to set it up (and bills it unless included), off removes it. */
    chitthi: (input: { on: boolean; phone?: string; businessName?: string }) => a.post<{ activated: boolean; checkoutUrl?: string; billing?: BillingView }>('/admin/billing/chitthi', input),
    cancel: () => a.post<BillingView>('/admin/billing/cancel'),
    buyAiPack: () => a.post<{ activated: boolean; checkoutUrl?: string; billing?: BillingView }>('/admin/billing/ai-pack'),
  },
  ai: {
    status: () => a.get<AiStatus>('/admin/ai/status'),
    write: (input: { purpose: AiPurpose; brief: string; channel?: string; language?: string; draft?: string }) => a.post<AiDraft>('/admin/ai/write', input),
    translate: (text: string, to: string) => a.post<{ text: string }>('/admin/ai/translate', { text, to }),
    ask: (question: string, history: { role: 'user' | 'assistant'; text: string }[]) => a.post<AiAnswer>('/admin/ai/ask', { question, history }),
    briefing: () => a.post<AiAnswer>('/admin/ai/briefing', {}),
    sermon: (input: { kind: AiSermonKind; title?: string; passage?: string; notes?: string; language?: string }) => a.post<{ text: string }>('/admin/ai/sermon', input),
    visitNotes: (input: { transcript: string; familyName?: string; date?: string; language?: string }) => a.post<AiVisitNotes>('/admin/ai/visit-notes', input),
    setlist: (theme: string, count: number) => a.post<AiSetlist>('/admin/ai/setlist', { theme, count }),
    songScan: (images: { mediaType: string; data: string }[], hint?: string) => a.post<AiSongScan>('/admin/ai/song-scan', { images, hint }),
  },
  integrations: {
    get: () => a.get<ConnectionsStatus>('/admin/integrations'),
    connectZoom: (input: { accountId: string; clientId: string; clientSecret: string }) => a.post<ZoomStatus>('/admin/integrations/zoom', input),
    disconnectZoom: () => a.del<ZoomStatus>('/admin/integrations/zoom'),
    connectGcs: (input: { bucket: string; serviceAccount: string }) => a.post<GcsStatus>('/admin/integrations/gcs', input),
    disconnectGcs: () => a.del<GcsStatus>('/admin/integrations/gcs'),
    canvaConnect: () => a.get<{ url: string; state: string }>('/admin/integrations/canva/connect'),
    canvaCallback: (input: { code: string; state: string }) => a.post<{ ok: boolean }>('/integrations/canva/callback', input),
    disconnectCanva: () => a.del<CanvaStatus>('/admin/integrations/canva'),
    connectEmail: (input: { host: string; port: number; user: string; password: string; from: string; fromName: string }) => a.post<EmailAccountStatus>('/admin/integrations/email', input),
    testEmail: (to?: string) => a.post<{ ok: true }>('/admin/integrations/email/test', { to }),
    disconnectEmail: () => a.del<EmailAccountStatus>('/admin/integrations/email'),
    connectChitthi: (input: { apiKey: string; template?: string; language?: string; params?: number }) => a.post<ChitthiStatus>('/admin/integrations/chitthi', input),
    updateChitthi: (input: { template: string; language: string; params: number }) => a.patch<ChitthiStatus>('/admin/integrations/chitthi', input),
    disconnectChitthi: () => a.del<ChitthiStatus>('/admin/integrations/chitthi'),
    chitthiTemplates: () => a.get<{ available: boolean; data: ChitthiTemplate[] }>('/admin/integrations/chitthi/templates'),
    testChitthi: (phone: string) => a.post<{ ok: true }>('/admin/integrations/chitthi/test', { phone }),
    bot: () => a.get<WaBotStatus>('/admin/integrations/whatsapp-bot'),
    enableBot: (input: { welcome?: string }) => a.post<WaBotStatus>('/admin/integrations/whatsapp-bot', input),
    disableBot: () => a.del<WaBotStatus>('/admin/integrations/whatsapp-bot'),
    tryBot: (text: string) => a.post<{ intent: BotIntent; reply: string }>('/admin/integrations/whatsapp-bot/try', { text }),
    apiKeys: () => a.get<ApiKeyView[]>('/admin/api-keys'),
    createKey: (input: { name: string; access: 'read' | 'full' }) => a.post<{ key: ApiKeyView; secret: string }>('/admin/api-keys', input),
    revokeKey: (id: string) => a.del<void>(`/admin/api-keys/${id}`),
  },
  staff: {
    list: () => a.get<StaffView[]>('/admin/staff'),
    invite: (input: { name: string; email: string } & RoleChoice) => a.post<StaffView>('/admin/staff', input),
    setRole: (id: string, choice: RoleChoice) => a.patch<StaffView>(`/admin/staff/${id}`, choice),
    remove: (id: string) => a.del<void>(`/admin/staff/${id}`),
    /** Office access shown on a person's record. */
    accessOf: (personId: string) => a.get<PersonAccess>(`/admin/people/${personId}/access`),
    setAccess: (personId: string, choice: RoleChoice | { role: null }) => a.put<PersonAccess>(`/admin/people/${personId}/access`, choice),
  },
  roles: {
    list: () => a.get<RoleView[]>('/admin/roles'),
    create: (input: RoleInput) => a.post<RoleView>('/admin/roles', input),
    update: (id: string, input: Partial<RoleInput>) => a.patch<RoleView>(`/admin/roles/${id}`, input),
    remove: (id: string) => a.del<void>(`/admin/roles/${id}`),
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
    commit: (id: string, force = false, looseFundId?: string) => a.post<BatchView>(`/admin/giving/batches/${id}/commit`, { force, looseFundId }),
    count: (id: string, input: { notes: Record<string, number>; coins: number; cheques: number; upi: number; photoUrl?: string | null }) => a.put<BatchView>(`/admin/giving/batches/${id}/count`, input),
    sign: (id: string, name?: string) => a.post<BatchView>(`/admin/giving/batches/${id}/sign`, { name }),
    unsign: (id: string) => a.del<BatchView>(`/admin/giving/batches/${id}/sign`),
    reopen: (id: string) => a.post<BatchView>(`/admin/giving/batches/${id}/reopen`),
    remove: (id: string) => a.del<void>(`/admin/giving/batches/${id}`),
  },
  live: {
    get: (eventId: string) => a.get<LiveView>(`/admin/services/${eventId}/live`),
    act: (eventId: string, action: 'start' | 'next' | 'prev' | 'goto' | 'stop' | 'reset', index?: number) => a.post<LiveView>(`/admin/services/${eventId}/live`, { action, index }),
  },
  presentation: {
    get: (eventId: string) => a.get<PresentationView>(`/admin/services/${eventId}/presentation`),
    act: (eventId: string, action: 'next' | 'prev' | 'goto' | 'item' | 'blank' | 'logo' | 'live' | 'clear' | 'message' | 'countdown' | 'lower' | 'lowerClear' | 'queue' | 'overlay' | 'captions' | 'add' | 'removeAdded' | 'stageMessage' | 'timer' | 'background',
      extra: { index?: number; message?: string; until?: string; lowerThird?: Partial<LowerThird>; lowerThirds?: Partial<LowerThird>[]; on?: boolean; captions?: Partial<CaptionsSettings>;
        added?: Partial<AddedItem>; live?: boolean; id?: string; minutes?: number; label?: string; stopwatch?: boolean; clear?: boolean; itemId?: string; url?: string } = {}) =>
      a.post<PresentationView>(`/admin/services/${eventId}/presentation`, { action, ...extra }),
    caption: (eventId: string, text: string) => a.post<{ line: CaptionLine; count: number }>(`/admin/services/${eventId}/captions`, { text }),
    captions: (eventId: string) => a.get<{ lines: CaptionLine[]; count: number }>(`/admin/services/${eventId}/captions`),
    clearCaptions: (eventId: string) => a.del<{ ok: boolean }>(`/admin/services/${eventId}/captions`),
    theme: () => a.get<PresentationTheme>('/admin/presentation-theme'),
    saveTheme: (input: Partial<PresentationTheme>) => a.put<PresentationTheme>('/admin/presentation-theme', input),
    obs: () => a.get<ObsSettings>('/admin/presentation-obs'),
    saveObs: (input: Partial<ObsSettings>) => a.put<ObsSettings>('/admin/presentation-obs', input),
    resetKey: () => a.post<{ screenKey: string }>('/admin/presentation-key/reset'),
  },
  bible: (ref: string, tr = 'kjv') => a.get<BiblePassage>(`/admin/bible${qs({ ref, tr })}`),
  songStats: () => a.get<SongStats>('/admin/songs/stats'),
  faces: () => a.get<Record<string, { p: string | null; a: number | null }>>('/admin/faces'),
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
    actions: (f: { mine?: '1'; all?: '1' } = {}) => a.get<VisitActionItem[]>(`/admin/visits/actions${qs(f)}`),
    toggleAction: (id: string, index: number, done?: boolean) => a.post<VisitView>(`/admin/visits/${id}/actions/${index}`, done === undefined ? {} : { done }),
    create: (input: { personId?: string; familyKey?: string; date: string; status?: 'done'; purpose: VisitPurpose; visitorIds?: string[]; visitorNames?: string[]; notes?: string; prayerPoints?: string; followUp?: string; confidential?: boolean; voiceNote?: string; actions?: VisitAction[] }) => a.post<VisitView>('/admin/visits', input),
    update: (id: string, input: Partial<{ status: 'planned' | 'done' | 'cancelled'; date: string; purpose: VisitPurpose; notes: string; prayerPoints: string; followUp: string; confidential: boolean; visitorIds: string[]; visitorNames: string[]; voiceNote: string; actions: VisitAction[] }>) => a.patch<VisitView>(`/admin/visits/${id}`, input),
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
