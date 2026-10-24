// Entry point for the shared church engine.
import { Db, type Dump } from './db.js';
import { createEngine, makeCtx, type Env } from './engine.js';
import { registerAuth } from './modules/auth.js';
import { registerCare } from './modules/care.js';
import { registerCheckin } from './modules/checkin.js';
import { registerChurch } from './modules/church.js';
import { registerComms, runDue } from './modules/comms.js';
import { registerGiving } from './modules/giving.js';
import { registerPeople } from './modules/people.js';
import { registerServing } from './modules/serving.js';
import { registerSongCatalog } from './modules/song-catalog.js';
import { registerTeamAuth } from './modules/team-auth.js';
import { registerDoor } from './modules/door.js';
import { registerNotify } from './modules/notify.js';
import { registerConnections } from './modules/connections.js';
import { registerCalendar } from './modules/calendar.js';
import { registerCalendarFeeds } from './modules/calendar-feeds.js';
import { registerForms } from './modules/forms.js';
import { registerCelebrations } from './modules/celebrations.js';
import { registerMinistry } from './modules/ministry.js';
import { registerPresent } from './modules/present.js';
import { registerWorkflows } from './modules/workflows.js';
import { registerIntegrations, registerPayments } from './modules/integrations.js';
import { createMcp } from './mcp.js';
import { bindAiHandle, registerAi } from './modules/ai.js';
import { registerBilling } from './modules/billing.js';
import { registerRegisters } from './modules/registers.js';
import { registerZones } from './modules/zones.js';
import { registerAccounts } from './modules/accounts.js';
import { registerRazorpaySetup } from './modules/razorpay-setup.js';
import { registerCarols } from './modules/carols.js';
import { registerRides } from './modules/rides.js';
import { registerBenevolence } from './modules/benevolence.js';
import { registerAssets } from './modules/assets.js';
import { registerReading } from './modules/reading.js';
import { registerFeasts } from './modules/feasts.js';
import { registerPractice } from './modules/practice.js';
import { registerPrayerWall } from './modules/prayer-wall.js';
import { registerSmsDigest } from './modules/sms-digest.js';
import { registerRentals } from './modules/rentals.js';
import { registerTeamHub } from './modules/team-hub.js';
import { registerRecurring } from './modules/recurring.js';
import { registerWhatsAppBot } from './modules/whatsapp-bot.js';
import { registerOfferings } from './modules/offerings.js';
import { registerPrivacy } from './modules/privacy.js';
import { registerExportRoutes } from './modules/export.js';
import { registerGettingStarted } from './modules/getting-started.js';
import { registerOfferingQr } from './modules/offering-qr.js';
import { registerBank } from './modules/bank.js';
import { registerSafeguarding } from './modules/safeguarding.js';
import { registerCourses } from './modules/courses.js';
import { registerVigils } from './modules/vigils.js';
import { registerDiscipleship } from './modules/discipleship.js';
import { registerLeaders } from './modules/leaders.js';
import { registerMyDay } from './modules/my-day.js';
import { registerMonthlyReport } from './modules/monthly-report.js';
import { registerDevotions } from './modules/devotions.js';
import { registerBibleAtlas } from './modules/bible-atlas.js';
import { registerLibrary } from './modules/library.js';
import { registerOccasions } from './modules/occasions.js';
import { registerSkills } from './modules/skills.js';
import { registerCamps } from './modules/camps.js';
import { registerBible } from './modules/bible.js';
import { registerBibleStudy } from './modules/bible-study.js';
import { registerSermonPrep } from './modules/sermon-prep.js';
import { registerSermonPlanning } from './modules/sermon-planning.js';
import { registerSermonSunday } from './modules/sermon-sunday.js';
import { registerSermonTranscripts } from './modules/sermon-transcripts.js';
import { registerAskLive } from './modules/ask-live.js';
import { registerMigrantLink } from './modules/migrant-link.js';
import { registerGrief } from './modules/grief.js';
import { registerStoryLine } from './modules/story-line.js';
import { registerJourney } from './modules/journey.js';
import { registerFamilyAltar } from './modules/family-altar.js';
import { registerOutreach } from './modules/outreach.js';
import { registerVoice } from './modules/voice.js';
import { registerAnnualReport } from './modules/annual-report.js';
import { registerCompliance } from './modules/compliance.js';
import { registerBuilding } from './modules/building.js';
import { registerSafety } from './modules/safety.js';
import { registerPrayerWalk } from './modules/prayer-walk.js';
import { registerHospital } from './modules/hospital.js';
import { registerFestivalCare } from './modules/festival-care.js';
import { registerWorshipCues } from './modules/worship-cues.js';
import { registerSingAlong } from './modules/sing-along.js';
import { registerBibleWords } from './modules/bible-words.js';
import { registerBibleCommentary } from './modules/bible-commentary.js';
import { registerPhotos } from './modules/photos.js';
import { registerRegistration } from './modules/registration.js';
import { registerMorningList } from './modules/morning-list.js';
import { registerPager } from './modules/pager.js';
import { registerBulletin } from './modules/bulletin.js';
import { registerSundaySchool } from './modules/sunday-school.js';
import { registerVerses } from './modules/verses.js';
import { registerElections } from './modules/elections.js';
import { registerRecaps } from './modules/recap.js';
import { registerVideoGreetings } from './modules/video-greetings.js';
import { registerAnnualReturn } from './modules/annual-return.js';
import { registerMissedCall } from './modules/missed-call.js';
import { registerMissions } from './modules/missions.js';
import { registerLivestream } from './modules/livestream.js';
import { registerFamily } from './modules/family.js';
import { registerNetworkLink } from './modules/network-link.js';
import { ApiError } from './errors.js';
import { atLeast, effectivePlan, getSubscription } from './plans.js';

export const MODULES = [registerAuth, registerPeople, registerChurch, registerGiving, registerCheckin, registerServing, registerSongCatalog, registerComms, registerCare, registerForms, registerCalendar, registerWorkflows, registerMinistry, registerCelebrations, registerPresent, registerIntegrations, registerAi, registerBilling, registerPayments, registerRegisters, registerZones, registerAccounts, registerRazorpaySetup, registerRecurring, registerWhatsAppBot, registerOfferings, registerPrivacy, registerPager, registerBulletin, registerSundaySchool, registerMissions, registerLivestream, registerFamily, registerNetworkLink, registerTeamAuth, registerDoor, registerNotify, registerConnections, registerTeamHub, registerCarols, registerCalendarFeeds, registerRides, registerBenevolence, registerAssets, registerReading, registerFeasts, registerRentals, registerPractice, registerPrayerWall, registerSmsDigest, registerVerses, registerElections, registerRecaps, registerVideoGreetings, registerAnnualReturn, registerMissedCall, registerExportRoutes, registerGettingStarted, registerOfferingQr, registerBank, registerSafeguarding, registerCourses, registerVigils, registerDiscipleship, registerLibrary, registerOccasions, registerSkills, registerCamps, registerBible, registerBibleStudy, registerSermonPrep, registerSermonPlanning, registerSermonSunday, registerSermonTranscripts, registerAskLive, registerSingAlong, registerWorshipCues, registerFestivalCare, registerHospital, registerMigrantLink, registerGrief, registerStoryLine, registerJourney, registerFamilyAltar, registerOutreach, registerVoice, registerAnnualReport, registerCompliance, registerBuilding, registerSafety, registerPrayerWalk, registerLeaders, registerMyDay, registerMonthlyReport, registerDevotions, registerBibleAtlas, registerBibleWords, registerBibleCommentary, registerPhotos, registerRegistration, registerMorningList];

export function createChurchEngine(db: Db, env: Env) {
  // Older records could hold a null name; store blanks so screens never show "null".
  for (const p of db.all('people')) if (typeof p.firstName !== 'string' || typeof p.lastName !== 'string') db.put('people', { ...p, firstName: String(p.firstName ?? '').trim(), lastName: String(p.lastName ?? '').trim() });
  const engine = createEngine(db, env, MODULES);
  const mcp = createMcp(engine.handle, (key) => {
    const auth = engine.verifyKey(key);
    if (!atLeast(effectivePlan(getSubscription(db), env.now()), 'cathedral')) throw new ApiError(402, 'plan_required', 'Connecting AI assistants is part of the Cathedral plan.');
    return auth;
  });
  bindAiHandle(db, engine.handle);
  return {
    ...engine,
    /** The MCP server: one JSON-RPC message in, the reply out (null for notifications). */
    mcp: (body: unknown, apiKey: string | null | undefined) => mcp(body, apiKey, db.get('settings', 'church')?.name ?? 'the church'),
    /** Runs scheduled messages and daily automations. Safe to call often. */
    tick: () => runDue(makeCtx(db, env, { auth: null })),
    /** A system context, for adapters (e.g. the payment webhook). */
    systemCtx: () => makeCtx(db, env, { auth: null }),
  };
}

export { Db, type Dump, type Env };
export { ApiError };
export * from './plans.js';
export { REGISTER_FIELDS, REGISTER_KINDS, REGISTER_LABELS } from './modules/registers.js';
export { VISIT_PURPOSES } from './modules/zones.js';
export { isRaw } from './engine.js';
export type { RawResult, AiBlock, AiMessage, AiRequest, AiResponse, AuthClaims, DeliveryResult, GoogleKey, HttpRequest, HttpResponse, LyricsFeed, Outgoing, PushMessage, PushResult, SmtpAccount, Request } from './engine.js';
export { onDonationSucceeded } from './modules/giving.js';
export { DEMO_CODE } from './modules/auth.js';
export { PERMISSIONS, ROLE_LABELS } from './perms.js';
export { bootstrapChurch } from './bootstrap.js';
export { applyBillingEvent, billingView, markAiPackPaid } from './modules/billing.js';
export { applyRecurringEvent } from './modules/recurring.js';
export { applyQrCredited } from './modules/offering-qr.js';
export { botConfig, handleBotMessage } from './modules/whatsapp-bot.js';
export { DOC_KINDS, markSetupPaid, ORG_TYPES, SETUP_FEE, SETUP_KIND } from './modules/razorpay-setup.js';
export { createPlatform, slugify, type ChurchEntry, type Platform, type TenantHost } from './platform.js';
export { razorpayConfig } from './modules/integrations.js';
