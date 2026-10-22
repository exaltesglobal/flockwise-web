// Flockwise policy pages. Shared word for word by the web app (app.flockwise.church/legal/...)
// and the landing site (flockwise.church/...). Edit here, then copy this file to the other repo.
// Plain ESM with HTML strings so the landing site can build it without TypeScript.
// Links between pages are written href="@slug"; each site rewrites them to its own URLs.

export const BUSINESS = {
  product: 'Flockwise',
  brand: 'Agape Labs',
  company: 'Exaltes Global Private Limited',
  email: 'hello@flockwise.church',
  website: 'https://flockwise.church',
  app: 'https://app.flockwise.church',
  // Fill these in before submitting the site to Razorpay. Empty values are left out of the pages.
  address: '',
  phone: '',
  hours: 'Monday to Saturday, 10:00 to 18:00 IST',
  jurisdiction: 'India',
};

export const UPDATED = '22 October 2026';

const who = `${BUSINESS.product} is a product of ${BUSINESS.brand}, a brand of ${BUSINESS.company}, a company incorporated in India`;
const mail = `<a href="mailto:${BUSINESS.email}">${BUSINESS.email}</a>`;

function contactBlock() {
  const rows = [
    ['Business', `${BUSINESS.brand} (${BUSINESS.company})`],
    ['Product', BUSINESS.product],
    ['Email', mail],
    BUSINESS.phone && ['Phone', `<a href="tel:${BUSINESS.phone.replace(/\s+/g, '')}">${BUSINESS.phone}</a>`],
    BUSINESS.address && ['Registered office', BUSINESS.address],
    ['Support hours', BUSINESS.hours],
    ['Website', `<a href="${BUSINESS.website}">${BUSINESS.website.replace('https://', '')}</a>`],
  ].filter(Boolean);
  return `<dl class="legal-contact">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

/** @type {{ slug: string, title: string, summary: string, body: string }[]} */
export const LEGAL_PAGES = [
  {
    slug: 'terms',
    title: 'Terms and Conditions',
    summary: 'The agreement between your church, its members and Agape Labs when you use Flockwise.',
    body: `
<p>These terms apply to the Flockwise website, web app and mobile apps (together, “Flockwise”). ${who} (“Agape Labs”, “we”, “us”). By creating an account, signing in or giving through Flockwise you agree to these terms.</p>

<h2>1. Who uses Flockwise</h2>
<p><strong>Churches</strong> (and other ministries) subscribe to Flockwise to manage their people, services, check-in, volunteers, groups, giving and messages. The person who signs up a church confirms they are authorised to act for it.</p>
<p><strong>Members and visitors</strong> are invited by their church, or sign in with their email, to see events, join groups, serve and give. Your church decides what it records about you and who in the church office can see it.</p>

<h2>2. Accounts and sign-in</h2>
<ul>
<li>Sign-in uses a one-time code sent to your email. Keep access to your email account secure; anyone who can read it can sign in as you.</li>
<li>Church administrators are responsible for inviting the right staff, giving them the right role and removing access when someone leaves.</li>
<li>You must give accurate information and must not sign in as someone else.</li>
</ul>

<h2>3. Subscriptions and fees for churches</h2>
<ul>
<li>Plans, prices and what each includes are shown before you subscribe or on your invoice. Prices are in Indian Rupees and exclude GST unless stated.</li>
<li>Subscriptions renew automatically each month or year until cancelled. You can cancel at any time from Settings or by emailing ${mail}; cancellation takes effect at the end of the current billing period.</li>
<li>Payments are processed by Razorpay Software Private Limited. We do not store card, UPI or bank details.</li>
<li>Refunds are covered by our <a href="@refunds">Refund and Cancellation Policy</a>.</li>
</ul>

<h2>4. Donations, offerings and event tickets</h2>
<ul>
<li>When a member gives or buys an event ticket, the payment goes through the church’s own Razorpay account and is settled directly to the church’s bank account. Agape Labs does not receive, hold or control these funds.</li>
<li>The church is the recipient of the gift. The church is responsible for how gifts are used, for issuing correct 80G receipts and Form 10BD reports, and for complying with the Foreign Contribution (Regulation) Act, 2010 where it applies. Flockwise provides tools to help but does not give tax or legal advice.</li>
<li>Gifts from donors who are not Indian citizens are routed to the church’s FCRA-designated account when the church has one, and are declined when it does not.</li>
<li>Requests to refund a gift or ticket go to the church. See the <a href="@refunds">Refund and Cancellation Policy</a>.</li>
</ul>

<h2>5. Acceptable use</h2>
<p>You must not use Flockwise to break the law, send spam or messages to people who have not agreed to receive them, upload harmful code, try to access data you are not permitted to see, or harass anyone. Churches must collect consent before messaging people by email, SMS or WhatsApp, and Flockwise records and respects each person’s choices.</p>

<h2>6. Your data</h2>
<p>The church owns the information it puts into Flockwise, and is the data fiduciary for its members’ personal data under the Digital Personal Data Protection Act, 2023. Agape Labs processes that data on the church’s behalf to provide the service. How we handle personal data is explained in our <a href="@privacy">Privacy Policy</a>. A church can export its data at any time.</p>

<h2>7. Availability and changes</h2>
<p>We work to keep Flockwise available and secure, but it may occasionally be unavailable for maintenance or reasons outside our control. We may improve or change features. If we make a change that materially reduces what a paid plan includes, we will tell the church in advance.</p>

<h2>8. Intellectual property</h2>
<p>Flockwise, its software, design and the Flockwise name and logo belong to ${BUSINESS.company}. You may use Flockwise only as these terms allow. Content your church adds remains yours.</p>

<h2>9. Suspension and termination</h2>
<p>A church may stop using Flockwise at any time. We may suspend or close an account that breaks these terms, does not pay, or puts other users at risk, and will give notice where reasonable. After an account closes, the church can request an export of its data for 30 days, after which we delete it, except where the law requires us to keep it.</p>

<h2>10. Liability</h2>
<p>Flockwise is provided “as is”. To the extent the law allows, Agape Labs is not liable for indirect or consequential losses, and our total liability for any claim is limited to the fees the church paid us in the 12 months before the claim. Nothing in these terms limits liability that cannot be limited by law.</p>

<h2>11. Governing law</h2>
<p>These terms are governed by the laws of ${BUSINESS.jurisdiction}. Courts at the place of the registered office of ${BUSINESS.company} have exclusive jurisdiction.</p>

<h2>12. Changes to these terms</h2>
<p>We may update these terms. The date at the top shows the latest version. If a change is significant we will tell churches by email or in the app before it takes effect.</p>

<h2>13. Contact</h2>
${contactBlock()}
`,
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    summary: 'What personal data Flockwise collects, why, who it is shared with and the choices you have.',
    body: `
<p>${who}. This policy explains how Agape Labs handles personal data in Flockwise, in line with the Digital Personal Data Protection Act, 2023 (DPDP Act) and the Information Technology Act, 2000.</p>

<h2>1. Our role</h2>
<ul>
<li>For the people a church records in Flockwise (members, visitors, children, volunteers, donors), <strong>the church is the data fiduciary</strong>. It decides what is collected and why. Agape Labs is its <strong>data processor</strong> and handles the data only to run Flockwise for that church.</li>
<li>For church staff who sign up for or administer a Flockwise account, and for visitors to flockwise.church, Agape Labs is the data fiduciary.</li>
</ul>

<h2>2. What we collect</h2>
<ul>
<li><strong>Identity and contact</strong>: name, email, phone number, household, date of birth, anniversary, campus.</li>
<li><strong>Church life</strong>: attendance, check-ins, groups, serving schedules, event RSVPs, prayer requests you choose to share, and pastoral care notes recorded by authorised church staff.</li>
<li><strong>Children</strong>: names, rooms, allergy or medical notes and the guardians allowed to collect them, recorded by the church with a parent’s or guardian’s consent.</li>
<li><strong>Giving</strong>: amount, fund, date, receipt number, and PAN where you give it for an 80G receipt. Card, UPI and bank details are entered on Razorpay’s pages and never reach us.</li>
<li><strong>Consent choices</strong>: whether you agree to email, SMS and WhatsApp messages and to appear in the church directory.</li>
<li><strong>Technical</strong>: sign-in times, device type and IP address, kept for security and to fix problems. We do not use advertising trackers.</li>
</ul>

<h2>3. Why we use it</h2>
<ul>
<li>To provide Flockwise: sign-in, records, check-in, scheduling, giving, receipts and messages the church sends.</li>
<li>To keep children safe at check-in and pickup.</li>
<li>To secure accounts, prevent fraud and meet legal duties such as tax record keeping.</li>
<li>To support churches and improve Flockwise using aggregated information that does not identify anyone.</li>
</ul>
<p>We do not sell personal data, and we do not use it for advertising.</p>

<h2>4. Who we share it with</h2>
<ul>
<li><strong>Your church</strong>, and only the staff whose role allows it. Confidential care notes are limited to pastors.</li>
<li><strong>Other members</strong>, only through the directory and only if you opt in.</li>
<li><strong>Service providers</strong> that help us run Flockwise: Razorpay (payments), Hostinger (hosting and email), and SMS and WhatsApp providers the church connects (such as MSG91, Twilio or Meta’s WhatsApp Business Platform). They may use the data only to provide their service.</li>
<li><strong>Authorities</strong>, where the law requires it.</li>
</ul>

<h2>5. How long we keep it</h2>
<p>We keep data while the church uses Flockwise. If a church closes its account, we delete its data 30 days later, except giving and receipt records, which may need to be kept for up to 8 years under Indian tax law. A church can delete a person’s record at any time.</p>

<h2>6. Security</h2>
<p>Data is encrypted in transit (HTTPS). Access is limited by role and every change in the church office is logged. Sign-in uses one-time email codes, so there are no passwords to steal.</p>

<h2>7. Your rights and choices</h2>
<ul>
<li>See and update your profile and messaging choices in the app under <strong>Me</strong>.</li>
<li>Ask your church to access, correct or erase your data, or to withdraw consent. You can also write to us and we will pass the request to your church and help it respond.</li>
<li>Nominate another person to exercise your rights if you die or are unable to, as the DPDP Act allows.</li>
<li>Withdrawing consent stops future messages or processing based on it. It does not affect what was done before.</li>
</ul>

<h2>8. Children</h2>
<p>Children’s records are created by the church with the verifiable consent of a parent or guardian, and are used only for their care and safety. Children do not sign in to Flockwise.</p>

<h2>9. Grievance Officer</h2>
<p>If you have a question or complaint about your personal data, contact our Grievance Officer at ${mail} with the subject “Privacy”. We will acknowledge it within 48 hours and resolve it within 30 days. If you are not satisfied, you may approach the Data Protection Board of India.</p>

<h2>10. Changes</h2>
<p>We will post any update here and change the date at the top. Significant changes will be notified in the app or by email.</p>

<h2>11. Contact</h2>
${contactBlock()}
`,
  },
  {
    slug: 'refunds',
    title: 'Refund and Cancellation Policy',
    summary: 'How to cancel a Flockwise subscription, when refunds apply, and how donation and ticket refunds work.',
    body: `
<p>${who}. This policy covers payments made through Flockwise.</p>

<h2>1. Flockwise subscriptions (paid by churches)</h2>
<ul>
<li><strong>Cancelling</strong>: a church can cancel at any time from Settings, or by emailing ${mail} from the account owner’s email. The subscription stays active until the end of the period already paid for and does not renew.</li>
<li><strong>First payment</strong>: if you are not satisfied, ask for a refund within <strong>7 days</strong> of your first subscription payment and we will refund it in full.</li>
<li><strong>Renewals</strong>: monthly renewals are not refundable once the new month has started. For annual plans cancelled after the first 7 days, we refund the unused full months, less any discount that applied to the annual term.</li>
<li><strong>Billing errors</strong>: if you were charged twice or charged the wrong amount, we refund the difference in full.</li>
</ul>

<h2>2. Donations and offerings (paid by members to their church)</h2>
<ul>
<li>Gifts are paid into the church’s own Razorpay account, so the <strong>church</strong> decides on refunds. To ask for one, contact your church office, or reply to your receipt email.</li>
<li>If a gift was made by mistake (for example a duplicate payment or a wrong amount), churches are encouraged to refund it when asked within 7 days. The church can issue the refund from Flockwise.</li>
<li>When a gift is refunded, its 80G receipt is cancelled and it is removed from the donor’s yearly statement.</li>
<li>Monthly giving (UPI AutoPay or card) can be stopped at any time from the Give page in the app, from your UPI app’s AutoPay settings, or by asking the church. Stopping it prevents future payments; it does not refund past ones.</li>
</ul>

<h2>3. Event tickets</h2>
<p>Paid tickets are sold by the church. Each event shows the church’s refund terms where they differ from these. If an event is cancelled by the church, ticket holders are refunded in full.</p>

<h2>4. How refunds are paid</h2>
<p>Approved refunds go back to the original payment method through Razorpay. They are started within 2 working days of approval and usually reach your account within <strong>5 to 7 working days</strong>, depending on your bank. UPI refunds are often faster.</p>

<h2>5. Contact</h2>
<p>For subscription refunds, write to ${mail}. For donations and tickets, contact your church first; if you cannot reach them, write to us and we will help.</p>
${contactBlock()}
`,
  },
  {
    slug: 'shipping',
    title: 'Shipping and Delivery Policy',
    summary: 'Flockwise is an online service. Nothing physical is shipped.',
    body: `
<p>${who}. Flockwise is software used online. We do not sell or ship physical goods.</p>

<h2>1. Subscriptions</h2>
<p>When a church’s subscription payment succeeds, its Flockwise account is activated straight away and a confirmation and tax invoice are emailed to the account owner. If activation takes more than 24 hours, write to ${mail}.</p>

<h2>2. Donations</h2>
<p>When a gift succeeds, the donor sees a confirmation on screen and receives an email receipt, including the 80G receipt number where the gift is eligible. Gifts appear in the donor’s giving history in the app immediately, and in the yearly statement for the financial year.</p>

<h2>3. Event tickets</h2>
<p>Tickets are delivered in the app as soon as payment succeeds and appear under the event and in the confirmation email. Show your name or check-in QR code at the venue.</p>

<h2>4. Check-in labels and printing</h2>
<p>Labels and printed documents such as service plans are produced on the church’s own printers. Flockwise does not ship hardware or printed material.</p>

<h2>5. Contact</h2>
${contactBlock()}
`,
  },
  {
    slug: 'contact',
    title: 'Contact Us',
    summary: 'How to reach the Flockwise team at Agape Labs.',
    body: `
<p>${who}. We are happy to help churches get started, answer questions about your account, and help members reach their church.</p>
${contactBlock()}
<h2>Members</h2>
<p>For questions about your gifts, receipts, groups or what your church has recorded about you, please contact your church office first. They manage your record. If you cannot reach them, write to us.</p>
<h2>Privacy and grievances</h2>
<p>Email ${mail} with the subject “Privacy”. We acknowledge within 48 hours and resolve within 30 days.</p>
`,
  },
];

export const LEGAL_LINKS = [
  { slug: 'terms', label: 'Terms' },
  { slug: 'privacy', label: 'Privacy' },
  { slug: 'refunds', label: 'Refunds & cancellation' },
  { slug: 'shipping', label: 'Shipping & delivery' },
  { slug: 'contact', label: 'Contact us' },
];
