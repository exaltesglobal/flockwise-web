import { createBrowserRouter, createMemoryRouter, Navigate } from 'react-router';

import { AdminLayout, AdminSignIn } from '@/admin/layout';
import { LegalPage } from '@/legal/legal';
import { AnnouncementsPage } from '@/admin/pages/announcements';
import { BulletinPage } from '@/admin/pages/bulletin';
import { SundaySchoolPage } from '@/admin/pages/sunday-school';
import { MissionsPage } from '@/admin/pages/missions';
import { LivestreamPage } from '@/admin/pages/livestream';
import { CalendarPage } from '@/admin/pages/calendar';
import { CarePage } from '@/admin/pages/care';
import { CelebrationsPage } from '@/admin/pages/celebrations';
import { RegistersPage } from '@/admin/pages/registers';
import { ZonesPage } from '@/admin/pages/zones';
import { AccountsPage } from '@/admin/pages/accounts';
import { OfferingsPage } from '@/admin/pages/offerings';
import { RazorpaySetupPage } from '@/admin/pages/razorpay-setup';
import { CheckinPage } from '@/admin/pages/checkin';
import { DashboardPage } from '@/admin/pages/dashboard';
import { EventsPage } from '@/admin/pages/events';
import { FormsPage } from '@/admin/pages/forms';
import { GivingPage } from '@/admin/pages/giving';
import { GroupsPage } from '@/admin/pages/groups';
import { ImportPage } from '@/admin/pages/import';
import { InsightsPage } from '@/admin/pages/insights';
import { ListsPage, WorkflowsPage } from '@/admin/pages/lists';
import { LiveServicePage } from '@/admin/pages/live';
import { MediaPage } from '@/admin/pages/media';
import { TeamHubPage } from '@/admin/pages/team-hub';
import { CarolsPage } from '@/admin/pages/carols';
import { RidesPage } from '@/admin/pages/rides';
import { BenevolencePage } from '@/admin/pages/benevolence';
import { AssetsPage } from '@/admin/pages/assets';
import { BankPage } from '@/admin/pages/bank';
import { ReadingPlansPage } from '@/admin/pages/reading';
import { FeastsPage } from '@/admin/pages/feasts';
import { RentalsPage } from '@/admin/pages/rentals';
import { PracticePage } from '@/admin/pages/practice';
import { MessagesPage } from '@/admin/pages/messages';
import { PeoplePage } from '@/admin/pages/people';
import { SermonsPage } from '@/admin/pages/publishing';
import { SermonPrepPage } from '@/admin/pages/sermon-prep';
import { ServicesPage } from '@/admin/pages/services';
import { SettingsPage } from '@/admin/pages/settings';
import { AssistantPage } from '@/admin/ai';
import { VolunteersPage } from '@/admin/pages/volunteers';
import { Landing } from '@/landing';
import { ChurchRoute } from '@/platform/church';
import { SignupPage } from '@/platform/signup';
import { NetworkPanel } from '@/platform/network';
import { TeamPanel } from '@/platform/team';
import { FormReturnPage, PublicBulletinPage, PublicLivePage, PublicChurchPage, PublicFormPage } from '@/public/public';
import { PublicRentPage, PublicRentalPage, RentalReturnPage } from '@/public/rentals';
import { VerifyCertificatePage } from '@/public/verify';
import { PrayPage, PrayerWallPage } from '@/public/pray';
import { BandPage } from '@/present/band';
import { OverlayPage, PresenterPage, ScreenPage, StagePage } from '@/present/present';
import { PreachPage } from '@/present/preach';
import { StudioPage } from '@/present/studio';
import { MemberLayout, MemberSignIn } from '@/member/layout';
import { MemberBulletinPage } from '@/member/pages/bulletin';
import { MemberMissionsPage } from '@/member/pages/missions';
import { MemberLivePage } from '@/member/pages/live';
import { MemberFamilyPage } from '@/member/pages/family';
import { MemberEventPage, MemberEventsPage } from '@/member/pages/events';
import { MemberFormPage, MemberFormsPage } from '@/member/pages/forms';
import { MemberGroupPage } from '@/member/pages/group';
import { MemberSermonsPage } from '@/member/pages/sermons';
import { MemberGivePage } from '@/member/pages/give';
import { MemberGroupsPage } from '@/member/pages/groups';
import { MemberHomePage } from '@/member/pages/home';
import { MemberDirectoryPage } from '@/member/pages/directory';
import { MemberMePage } from '@/member/pages/me';
import { MemberDoorPage } from '@/member/pages/door';
import { MemberPrayerPage } from '@/member/pages/prayer';
import { MemberServingPage } from '@/member/pages/serving';
import { MemberCarolsPage } from '@/member/pages/carols';
import { MemberRidesPage } from '@/member/pages/rides';
import { MemberAidPage } from '@/member/pages/aid';
import { MemberReadingPage } from '@/member/pages/reading';
import { MemberBiblePage } from '@/member/pages/bible';
import { MemberPracticePage } from '@/member/pages/practice';
import { MemberVersesPage } from '@/member/pages/verses';
import { MemberVotePage } from '@/member/pages/vote';
import { MemberRecapPage, MemberRecapStoryPage, PublicRecapPage } from '@/member/pages/recap';
import { RecapPage } from '@/admin/pages/recap';
import { VideoGreetingsPage } from '@/admin/pages/video-greetings';
import { AnnualReturnPage } from '@/admin/pages/annual-return';
import { MissedCallPage } from '@/admin/pages/missed-call';
import { GreetingPage } from '@/public/greeting';
import { PublicQrPage } from '@/public/qr';
import { ElectionsPage } from '@/admin/pages/elections';
import { SafeguardingPage } from '@/admin/pages/safeguarding';
import { CoursesPage } from '@/admin/pages/courses';
import { VigilsPage } from '@/admin/pages/vigils';
import { DiscipleshipPage } from '@/admin/pages/discipleship';
import { CounsellingPage } from '@/admin/pages/counselling';
import { LeaderPipelinePage } from '@/admin/pages/leader-pipeline';
import { MeetingsPage } from '@/admin/pages/meetings';
import { MonthlyReportPage } from '@/admin/pages/monthly-report';
import { AnnualReportPage } from '@/admin/pages/annual-report';
import { CompliancePage } from '@/admin/pages/compliance';
import { BuildingPage } from '@/admin/pages/building';
import { SafetyPage } from '@/admin/pages/safety';
import { MemberSafetyPage } from '@/member/safety';
import { PublicAlertPage } from '@/public/alert';
import { MemberBuildingPage } from '@/member/building';
import { MyDayPage } from '@/admin/pages/my-day';
import { DevotionsPage } from '@/admin/pages/devotions';
import { AskLivePage } from '@/admin/pages/ask-live';
import { AskCodePage, AskPhonePage, AskScreenPage } from '@/public/ask';
import { MemberSingPage, PublicSingPage } from '@/member/sing';
import { MemberCuesPage } from '@/member/cues';
import { MemberHospitalPage } from '@/member/hospital';
import { MemberMovingPage } from '@/member/moving';
import { LibraryPage } from '@/admin/pages/library';
import { MemberLibraryPage } from '@/member/pages/library';
import { OccasionsPage } from '@/admin/pages/occasions';
import { MemberOccasionsPage } from '@/member/pages/occasions';
import { SkillsPage } from '@/admin/pages/skills';
import { MemberSkillsPage } from '@/member/pages/skills';
import { CampsPage } from '@/admin/pages/camps';
import { RegistrationsPage } from '@/admin/pages/registrations';
import { MorningListPage } from '@/admin/pages/morning-list';
import { FestivalCarePage } from '@/admin/pages/festival-care';
import { HospitalPage } from '@/admin/pages/hospital';
import { MovesPage } from '@/admin/pages/moves';
import { GriefPage } from '@/admin/pages/grief';
import { StoryLinePage } from '@/admin/pages/story-line';
import { JourneyPage } from '@/admin/pages/journey';
import { MemberJourneyPage } from '@/member/journey';
import { AltarPage } from '@/admin/pages/altar';
import { MemberAltarPage } from '@/member/altar';
import { OutreachPage } from '@/admin/pages/outreach';
import { MemberTalentPage } from '@/member/talent';
import { PublicOutreachPage } from '@/public/outreach';
import { PublicStoryPage } from '@/public/story';
import { RegisterPage } from '@/public/register';
import { MemberCampsPage } from '@/member/pages/camps';
import { MemberMentoringPage } from '@/member/pages/mentoring';
import { MemberVigilsPage } from '@/member/pages/vigils';
import { MemberCoursesPage } from '@/member/pages/courses';

const routes = [
  { path: '/', element: <Landing /> },
  { path: '/admin/sign-in', element: <AdminSignIn /> },
  { path: '/start', element: <SignupPage /> },
  { path: '/c/:slug/*', element: <ChurchRoute /> },
  { path: '/c/:slug', element: <ChurchRoute /> },
  { path: '/platform/*', element: <TeamPanel /> },
  { path: '/network', element: <NetworkPanel /> },
  { path: '/network/:id', element: <NetworkPanel /> },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'people', element: <PeoplePage /> },
      { path: 'people/:id', element: <PeoplePage /> },
      { path: 'import', element: <ImportPage /> },
      { path: 'events', element: <EventsPage /> },
      { path: 'checkin', element: <CheckinPage /> },
      { path: 'volunteers', element: <VolunteersPage /> },
      { path: 'services', element: <ServicesPage /> },
      { path: 'services/:eventId/live', element: <LiveServicePage /> },
      { path: 'sermons', element: <SermonsPage /> },
      { path: 'sermon-prep', element: <SermonPrepPage /> },
      { path: 'forms', element: <FormsPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'lists', element: <ListsPage /> },
      { path: 'workflows', element: <WorkflowsPage /> },
      { path: 'celebrations', element: <CelebrationsPage /> },
      { path: 'registers', element: <RegistersPage /> },
      { path: 'zones', element: <ZonesPage /> },
      { path: 'accounts', element: <AccountsPage /> },
      { path: 'sunday-school', element: <SundaySchoolPage /> },
      { path: 'sunday-school/class/:classId', element: <SundaySchoolPage /> },
      { path: 'sunday-school/exam/:examId', element: <SundaySchoolPage /> },
      { path: 'missions', element: <MissionsPage /> },
      { path: 'missions/:id', element: <MissionsPage /> },
      { path: 'livestream', element: <LivestreamPage /> },
      { path: 'livestream/:id', element: <LivestreamPage /> },
      { path: 'offerings', element: <OfferingsPage /> },
      { path: 'offerings/:id', element: <OfferingsPage /> },
      { path: 'razorpay-setup', element: <RazorpaySetupPage /> },
      { path: 'groups', element: <GroupsPage /> },
      { path: 'giving', element: <GivingPage /> },
      { path: 'messages', element: <MessagesPage /> },
      { path: 'announcements', element: <AnnouncementsPage /> },
      { path: 'bulletin', element: <BulletinPage /> },
      { path: 'bulletin/:id', element: <BulletinPage /> },
      { path: 'media', element: <MediaPage /> },
      { path: 'team-hub', element: <TeamHubPage /> },
      { path: 'carols', element: <CarolsPage /> },
      { path: 'rides', element: <RidesPage /> },
      { path: 'benevolence', element: <BenevolencePage /> },
      { path: 'assets', element: <AssetsPage /> },
      { path: 'bank', element: <BankPage /> },
      { path: 'compliance', element: <CompliancePage /> },
      { path: 'building', element: <BuildingPage /> },
      { path: 'safety', element: <SafetyPage /> },
      { path: 'reading', element: <ReadingPlansPage /> },
      { path: 'feasts', element: <FeastsPage /> },
      { path: 'rentals', element: <RentalsPage /> },
      { path: 'elections', element: <ElectionsPage /> },
      { path: 'safeguarding', element: <SafeguardingPage /> },
      { path: 'courses', element: <CoursesPage /> },
      { path: 'vigils', element: <VigilsPage /> },
      { path: 'discipleship', element: <DiscipleshipPage /> },
      { path: 'leader-pipeline', element: <LeaderPipelinePage /> },
      { path: 'meetings', element: <MeetingsPage /> },
      { path: 'counselling', element: <CounsellingPage /> },
      { path: 'my-day', element: <MyDayPage /> },
      { path: 'devotions', element: <DevotionsPage /> },
      { path: 'ask', element: <AskLivePage /> },
      { path: 'monthly-report', element: <MonthlyReportPage /> },
      { path: 'annual-report', element: <AnnualReportPage /> },
      { path: 'library', element: <LibraryPage /> },
      { path: 'occasions', element: <OccasionsPage /> },
      { path: 'skills', element: <SkillsPage /> },
      { path: 'camps', element: <CampsPage /> },
      { path: 'registrations', element: <RegistrationsPage /> },
      { path: 'morning-list', element: <MorningListPage /> },
      { path: 'festival-care', element: <FestivalCarePage /> },
      { path: 'hospital', element: <HospitalPage /> },
      { path: 'moves', element: <MovesPage /> },
      { path: 'grief', element: <GriefPage /> },
      { path: 'stories', element: <StoryLinePage /> },
      { path: 'journey', element: <JourneyPage /> },
      { path: 'altar', element: <AltarPage /> },
      { path: 'outreach', element: <OutreachPage /> },
      { path: 'recap', element: <RecapPage /> },
      { path: 'video-greetings', element: <VideoGreetingsPage /> },
      { path: 'annual-return', element: <AnnualReturnPage /> },
      { path: 'missed-call', element: <MissedCallPage /> },
      { path: 'practice', element: <PracticePage /> },
      { path: 'care', element: <CarePage /> },
      { path: 'insights', element: <InsightsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'assistant', element: <AssistantPage /> },
    ],
  },
  { path: '/preach/:id', element: <PreachPage /> },
  { path: '/present/:eventId', element: <PresenterPage /> },
  { path: '/present/:eventId/screen', element: <ScreenPage /> },
  { path: '/present/:eventId/stage', element: <StagePage /> },
  { path: '/present/:eventId/band', element: <BandPage /> },
  { path: '/present/:eventId/overlay', element: <OverlayPage /> },
  { path: '/present/:eventId/studio', element: <StudioPage /> },
  { path: '/app/sign-in', element: <MemberSignIn /> },
  { path: '/legal/:slug', element: <LegalPage /> },
  { path: '/church', element: <PublicChurchPage /> },
  { path: '/bulletin/:id', element: <PublicBulletinPage /> },
  { path: '/live', element: <PublicLivePage /> },
  { path: '/forms/return', element: <FormReturnPage /> },
  { path: '/forms/:id', element: <PublicFormPage /> },
  { path: '/rent', element: <PublicRentPage /> },
  { path: '/verify/:code', element: <VerifyCertificatePage /> },
  { path: '/r/:id', element: <PublicRecapPage /> },
  { path: '/g/:token', element: <GreetingPage /> },
  { path: '/qr/:id', element: <PublicQrPage /> },
  { path: '/sing', element: <PublicSingPage /> },
  { path: '/story/:token', element: <PublicStoryPage /> },
  { path: '/outreach/:token', element: <PublicOutreachPage /> },
  { path: '/alert/:token', element: <PublicAlertPage /> },
  { path: '/ask', element: <AskCodePage /> },
  { path: '/ask/:code', element: <AskPhonePage /> },
  { path: '/ask/:id/screen', element: <AskScreenPage mode="screen" /> },
  { path: '/ask/:id/stage', element: <AskScreenPage mode="stage" /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/pray', element: <PrayPage /> },
  { path: '/pray/wall', element: <PrayerWallPage /> },
  { path: '/verify', element: <VerifyCertificatePage /> },
  { path: '/rent/return', element: <RentalReturnPage /> },
  { path: '/rent/pay/:token', element: <PublicRentalPage /> },
  {
    path: '/app',
    element: <MemberLayout />,
    children: [
      { index: true, element: <MemberHomePage /> },
      { path: 'events', element: <MemberEventsPage /> },
      { path: 'events/:id', element: <MemberEventPage /> },
      { path: 'groups', element: <MemberGroupsPage /> },
      { path: 'groups/:id', element: <MemberGroupPage /> },
      { path: 'forms', element: <MemberFormsPage /> },
      { path: 'forms/:id', element: <MemberFormPage /> },
      { path: 'sermons', element: <MemberSermonsPage /> },
      { path: 'bulletin', element: <MemberBulletinPage /> },
      { path: 'missions', element: <MemberMissionsPage /> },
      { path: 'live', element: <MemberLivePage /> },
      { path: 'family', element: <MemberFamilyPage /> },
      { path: 'bulletin/:id', element: <MemberBulletinPage /> },
      { path: 'give', element: <MemberGivePage /> },
      { path: 'serving', element: <MemberServingPage /> },
      { path: 'carols', element: <MemberCarolsPage /> },
      { path: 'rides', element: <MemberRidesPage /> },
      { path: 'aid', element: <MemberAidPage /> },
      { path: 'reading', element: <MemberReadingPage /> },
      { path: 'bible', element: <MemberBiblePage /> },
      { path: 'sing', element: <MemberSingPage /> },
      { path: 'cues/:eventId', element: <MemberCuesPage /> },
      { path: 'hospital', element: <MemberHospitalPage /> },
      { path: 'moving', element: <MemberMovingPage /> },
      { path: 'journey', element: <MemberJourneyPage /> },
      { path: 'altar', element: <MemberAltarPage /> },
      { path: 'talent', element: <MemberTalentPage /> },
      { path: 'building', element: <MemberBuildingPage /> },
      { path: 'building/:id', element: <MemberBuildingPage /> },
      { path: 'safety', element: <MemberSafetyPage /> },
      { path: 'safety/respond/:id', element: <MemberSafetyPage /> },
      { path: 'courses', element: <MemberCoursesPage /> },
      { path: 'vigils', element: <MemberVigilsPage /> },
      { path: 'mentoring', element: <MemberMentoringPage /> },
      { path: 'library', element: <MemberLibraryPage /> },
      { path: 'occasions', element: <MemberOccasionsPage /> },
      { path: 'skills', element: <MemberSkillsPage /> },
      { path: 'camps', element: <MemberCampsPage /> },
      { path: 'practice', element: <MemberPracticePage /> },
      { path: 'verses', element: <MemberVersesPage /> },
      { path: 'vote', element: <MemberVotePage /> },
      { path: 'recap', element: <MemberRecapPage /> },
      { path: 'recap/:id', element: <MemberRecapStoryPage /> },
      { path: 'prayer', element: <MemberPrayerPage /> },
      { path: 'directory', element: <MemberDirectoryPage /> },
      { path: 'me', element: <MemberMePage /> },
      { path: 'door', element: <MemberDoorPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];

// The shareable preview build runs inside a frame where the URL can't change, so it routes in memory.
export const router = import.meta.env.VITE_PREVIEW === 'true' ? createMemoryRouter(routes) : createBrowserRouter(routes);
