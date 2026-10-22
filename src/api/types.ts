// Shapes returned by the Flockwise REST API. Keep in sync with docs/API.md.
// Copied from the mobile app (flockwise-mobile/src/api/types.ts); keep the two identical.
// Admin-only shapes live in admin-types.ts.
// Money is always in minor units (paise / cents) with an ISO 4217 currency code.
// Timestamps are ISO 8601 strings in UTC.

export type Currency = 'INR' | 'USD' | 'GBP' | 'AUD' | 'AED' | 'CAD' | 'EUR' | 'SGD';
export type LanguageCode = 'en' | 'hi';

export type Church = {
  id: string;
  name: string;
  city: string;
  country: string; // ISO 3166-1 alpha-2, e.g. "IN"
  currency: Currency;
  logoUrl?: string | null;
  paymentProvider: 'razorpay' | 'stripe';
};

export type Member = {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  photoUrl?: string | null;
  language: LanguageCode;
  householdName?: string | null;
};

export type Session = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  member: Member;
  church: Church;
  /** Present only when the person is church staff. The web admin requires it; the mobile app ignores it. */
  staff?: { role: StaffRole } | null;
};

export type StaffRole = 'owner' | 'admin' | 'pastor' | 'finance' | 'leader';

export type OtpRequest = { requestId: string; channel: 'sms' | 'whatsapp' | 'email'; expiresInSeconds: number };

export type Announcement = {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  imageUrl?: string | null;
};

export type RsvpStatus = 'going' | 'not_going';

export type ChurchEvent = {
  id: string;
  kind: 'service' | 'event';
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location: string;
  imageUrl?: string | null;
  goingCount: number;
  capacity?: number | null;
  myRsvp: RsvpStatus | null;
};

export type HomeFeed = {
  nextService: ChurchEvent | null;
  announcements: Announcement[];
  upcomingEvents: ChurchEvent[];
};

export type Group = {
  id: string;
  name: string;
  description: string;
  meetingSchedule: string; // human readable, already localised by the server
  location: string;
  leaderName: string;
  memberCount: number;
  membership: 'member' | 'requested' | 'none';
};

export type Fund = {
  id: string;
  name: string;
  description: string;
  taxDeductible: boolean; // e.g. 80G in India
};

export type GiveFrequency = 'once' | 'monthly';

export type GiveIntentInput = {
  fundId: string;
  amount: number; // minor units
  currency: Currency;
  frequency: GiveFrequency;
  /** Needed for FCRA routing in India: gifts from non-Indian citizens/OCI go to the FCRA account. */
  donorCitizenship: 'IN' | 'OTHER';
  /** Optional PAN for 80G receipts (India). */
  pan?: string;
};

export type GiveIntent = {
  donationId: string;
  /** Hosted Razorpay/Stripe checkout page created by the backend with the church's own account. */
  checkoutUrl: string;
};

export type Donation = {
  id: string;
  fundName: string;
  amount: number;
  currency: Currency;
  frequency: GiveFrequency;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  createdAt: string;
  receiptUrl?: string | null;
};

export type Paginated<T> = { data: T[]; nextCursor: string | null };

export type ApiErrorBody = { error: { code: string; message: string; fields?: Record<string, string> } };
