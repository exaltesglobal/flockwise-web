// Story line: Bible stories to listen to, for people who cannot read. Someone in the church records
// each story in the dialect people speak at home (Telugu, Hindi, Tamil…). Every day or week each
// listener gets a WhatsApp or SMS link that opens a page with one big play button, or they call the
// story number and hear it on any phone. They press 1 (or tap) to say "I listened" and 2 to ask
// for prayer, and the office sees who is hearing the stories week by week.
import type { Ctx, Router } from '../engine.js';
import type { RawResult } from '../engine.js';
import { ApiError } from '../errors.js';
import { featureOn } from '../features.js';
import type { Collections, LanguageCode, Story, StoryLineHub, StoryLineSettings, StoryListen, StoryListener, StorySend } from '../types.js';
import { churchId, find, fullName, normPhone, settings } from '../util.js';
import { callFields } from './missed-call.js';
import { gcsStatus } from './connections.js';
import { deliverAll } from './integrations.js';
import { notify, pastorIds } from './notify.js';

const KEY_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const LANGS: LanguageCode[] = ['en', 'hi', 'te', 'ta', 'ml', 'kn', 'mr', 'bn', 'gu', 'pa', 'or'];
const DEFAULT: StoryLineSettings = { key: '', cadence: 'weekly', weekday: 3, channel: 'whatsapp', callNumber: '' };
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isUrl = (v: string) => /^https:\/\/\S+$/i.test(v) || v.startsWith('data:audio/');

/** A starting series: the Bible's big story in 52 tellings, one a week for a year. */
export const STARTER: [string, string, string][] = [
  ['God makes the world', 'Genesis 1–2', 'God speaks and everything is made: light, sky, land, plants, animals, and then man and woman, made like Him. It was very good.'],
  ['The first sin', 'Genesis 3', 'Adam and Eve listen to the snake and eat the fruit. They hide from God. God sends them out of the garden but promises one who will crush the snake.'],
  ['Noah and the flood', 'Genesis 6–9', 'The world is full of evil. God tells Noah to build a boat. The flood comes; Noah’s family and the animals are safe. God puts a rainbow in the sky as a promise.'],
  ['God calls Abraham', 'Genesis 12; 15', 'God tells Abram to leave his home and promises him a land and children as many as the stars. Abram believes God.'],
  ['Abraham and Isaac', 'Genesis 22', 'God tests Abraham. He is ready to give his son Isaac, but God provides a ram instead. God will provide.'],
  ['Jacob’s ladder', 'Genesis 28', 'Running away from home, Jacob sleeps on a stone and dreams of a ladder to heaven. God promises to be with him.'],
  ['Joseph is sold', 'Genesis 37; 39', 'Joseph’s brothers are jealous and sell him as a slave. In Egypt he is put in prison for doing right, but God is with him.'],
  ['Joseph forgives', 'Genesis 41–45', 'Joseph explains Pharaoh’s dreams and becomes a ruler. When his brothers come for food he forgives them: you meant evil, but God meant it for good.'],
  ['Baby Moses', 'Exodus 1–2', 'Pharaoh orders Hebrew baby boys killed. Moses’ mother hides him in a basket on the river; Pharaoh’s daughter finds him and raises him.'],
  ['The burning bush', 'Exodus 3–4', 'God speaks to Moses from a bush that burns but does not burn up, and sends him to bring His people out of Egypt.'],
  ['The Passover', 'Exodus 11–12', 'God sends the last plague. Families who put the lamb’s blood on their doors are passed over. Pharaoh lets the people go.'],
  ['Crossing the sea', 'Exodus 14', 'Pharaoh’s army chases them. God opens the sea and His people walk through on dry ground.'],
  ['Bread from heaven', 'Exodus 16–17', 'In the desert the people are hungry and thirsty. God sends manna every morning and water from a rock.'],
  ['The Ten Commandments', 'Exodus 19–20', 'On the mountain God gives His people ten words to live by: love God above all and love your neighbour.'],
  ['Jericho', 'Joshua 6', 'The people march around Jericho for seven days, shout and blow trumpets, and the walls fall down.'],
  ['Gideon', 'Judges 6–7', 'God chooses fearful Gideon and only 300 men to save Israel, so everyone knows the victory is God’s.'],
  ['Ruth', 'Ruth 1–4', 'Ruth stays with her mother-in-law Naomi: your God will be my God. Boaz is kind to her, and she becomes King David’s great-grandmother.'],
  ['God calls Samuel', 'Samuel 3', 'The boy Samuel hears his name in the night. Eli tells him to say: speak, Lord, your servant is listening.'],
  ['David and Goliath', '1 Samuel 17', 'The young shepherd David faces the giant with a sling and five stones, trusting the Lord, and wins.'],
  ['David and Jonathan', '1 Samuel 18–20', 'King Saul’s son Jonathan loves David like a brother and protects him from his father’s anger.'],
  ['Solomon asks for wisdom', '1 Kings 3', 'God tells King Solomon to ask for anything. He asks for wisdom to lead God’s people well, and God gives him more.'],
  ['Elijah and the widow', '1 Kings 17', 'In a famine a poor widow shares her last flour with Elijah, and her jar never runs out.'],
  ['Elijah on Mount Carmel', '1 Kings 18', 'Elijah prays and fire falls from heaven. The people cry: the Lord, He is God!'],
  ['Naaman is healed', '2 Kings 5', 'A servant girl tells her master Naaman about God’s prophet. He washes seven times in the Jordan and is healed.'],
  ['Jonah', 'Jonah 1–4', 'Jonah runs from God, is swallowed by a great fish, then preaches in Nineveh. God shows mercy to the city.'],
  ['Daniel and the lions', 'Daniel 6', 'Daniel keeps praying to God though the law forbids it. He is thrown to the lions, but God shuts their mouths.'],
  ['Esther', 'Esther 2–8', 'Queen Esther risks her life to go to the king and saves her people: perhaps you were made queen for such a time as this.'],
  ['The promise of a Saviour', 'Isaiah 9; 53', 'Through the prophet, God promises a child who will be called Wonderful Counsellor, and who will carry our sins.'],
  ['The angel visits Mary', 'Luke 1', 'The angel Gabriel tells Mary she will have a son, Jesus, the Son of God. Mary says: let it be as you have said.'],
  ['Jesus is born', 'Luke 2', 'Jesus is born in Bethlehem and laid in a manger. Angels tell shepherds the good news, and they come to see Him.'],
  ['The boy Jesus in the temple', 'Luke 2', 'At twelve, Jesus stays in the temple listening and asking questions: I must be in my Father’s house.'],
  ['Jesus is baptised', 'Matthew 3–4', 'John baptises Jesus; the Spirit comes like a dove and the Father says: this is my Son, whom I love. Jesus is tempted and does not sin.'],
  ['Jesus calls the fishermen', 'Luke 5', 'After a great catch of fish, Jesus calls Peter, James and John: follow me, and I will make you fishers of people.'],
  ['Water into wine', 'John 2', 'At a wedding the wine runs out, and Jesus turns water into the best wine. His first sign.'],
  ['The woman at the well', 'John 4', 'Jesus asks a Samaritan woman for water and offers her living water. She runs to tell her whole town.'],
  ['The paralysed man', 'Mark 2', 'Four friends lower a man through the roof. Jesus forgives his sins and tells him to walk, and he does.'],
  ['Jesus calms the storm', 'Mark 4', 'A storm almost sinks the boat. Jesus speaks: quiet, be still. Even the wind and waves obey Him.'],
  ['Jairus’ daughter', 'Mark 5', 'A sick woman touches Jesus’ cloak and is healed. Then Jesus raises Jairus’ little girl from death.'],
  ['Feeding five thousand', 'John 6', 'A boy gives five loaves and two fish. Jesus thanks God, and the whole crowd eats with baskets left over.'],
  ['The good Samaritan', 'Luke 10', 'A man is beaten and left on the road. Religious men pass by; a Samaritan stops and cares for him. Go and do likewise.'],
  ['The lost son', 'Luke 15', 'A son wastes his father’s money and comes home ashamed. The father runs to hug him and throws a feast.'],
  ['Zacchaeus', 'Luke 19', 'A cheating tax collector climbs a tree to see Jesus. Jesus comes to his house, and Zacchaeus gives back what he took.'],
  ['Lazarus lives', 'John 11', 'Jesus weeps with Mary and Martha, then calls Lazarus out of the tomb: I am the resurrection and the life.'],
  ['Jesus enters Jerusalem', 'Luke 19', 'Jesus rides in on a donkey and the people wave branches and shout: Hosanna!'],
  ['The Last Supper', 'Luke 22; John 13', 'Jesus washes His friends’ feet and shares bread and wine: my body, given for you; my blood, poured out for you.'],
  ['Jesus dies on the cross', 'Luke 23', 'Jesus is arrested, beaten and crucified. He prays: Father, forgive them. He gives His life for our sins.'],
  ['Jesus is alive', 'Luke 24', 'On the third day the tomb is empty. Jesus appears to the women and His disciples: He is risen!'],
  ['Thomas believes', 'John 20', 'Thomas will not believe until he sees. Jesus shows him His hands: stop doubting and believe.'],
  ['Jesus goes up to heaven', 'Acts 1', 'Jesus tells His friends to tell everyone about Him, promises the Holy Spirit, and goes up into heaven.'],
  ['The Holy Spirit comes', 'Acts 2', 'The Spirit comes like wind and fire. Peter preaches, and three thousand people believe and are baptised.'],
  ['Saul meets Jesus', 'Acts 9', 'Saul hunts Christians until a light from heaven blinds him and Jesus speaks to him. He becomes Paul, the apostle.'],
  ['A new heaven and earth', 'Revelation 21–22', 'God will live with His people. He will wipe away every tear; no more death or crying or pain. Come, Lord Jesus.'],
];

/** The message with the listen link, in each language. */
const MESSAGE: Partial<Record<LanguageCode, string>> & { en: string } = {
  en: '📖 Bible story from {church}: {title}. Tap to listen:\n{link}\n{call}After listening, reply 1. Reply 2 if you would like prayer.',
  hi: '📖 {church} की ओर से बाइबल कहानी: {title}। सुनने के लिए दबाएँ:\n{link}\n{call}सुनने के बाद 1 भेजें। प्रार्थना चाहिए तो 2 भेजें।',
  te: '📖 {church} నుండి బైబిల్ కథ: {title}. వినడానికి నొక్కండి:\n{link}\n{call}విన్న తర్వాత 1 పంపండి. ప్రార్థన కావాలంటే 2 పంపండి.',
  ta: '📖 {church} வழங்கும் வேதாகமக் கதை: {title}. கேட்க அழுத்துங்கள்:\n{link}\n{call}கேட்ட பின் 1 அனுப்புங்கள். ஜெபம் வேண்டுமென்றால் 2 அனுப்புங்கள்.',
  ml: '📖 {church} നൽകുന്ന ബൈബിൾ കഥ: {title}. കേൾക്കാൻ അമർത്തുക:\n{link}\n{call}കേട്ടതിനു ശേഷം 1 അയയ്ക്കുക. പ്രാർത്ഥന വേണമെങ്കിൽ 2 അയയ്ക്കുക.',
  kn: '📖 {church} ನಿಂದ ಬೈಬಲ್ ಕಥೆ: {title}. ಕೇಳಲು ಒತ್ತಿ:\n{link}\n{call}ಕೇಳಿದ ನಂತರ 1 ಕಳುಹಿಸಿ. ಪ್ರಾರ್ಥನೆ ಬೇಕಾದರೆ 2 ಕಳುಹಿಸಿ.',
};
const CALL: Partial<Record<LanguageCode, string>> & { en: string } = {
  en: 'Or call {number} to hear it.', hi: 'या सुनने के लिए {number} पर कॉल करें।', te: 'లేదా వినడానికి {number}కు కాల్ చేయండి.', ta: 'அல்லது கேட்க {number} அழையுங்கள்.', ml: 'അല്ലെങ്കിൽ കേൾക്കാൻ {number}ൽ വിളിക്കുക.', kn: 'ಅಥವಾ ಕೇಳಲು {number}ಗೆ ಕರೆ ಮಾಡಿ.',
};
/** What the phone line says after the story, and after a key press. */
const SAY: Partial<Record<LanguageCode, { after: string; thanks: string; prayer: string; none: string; voice: string }>> & { en: { after: string; thanks: string; prayer: string; none: string; voice: string } } = {
  en: { voice: 'en-IN', after: 'Press 1 if you listened. Press 2 if you would like prayer.', thanks: 'Thank you. God bless you.', prayer: 'Thank you. A pastor will call you to pray with you.', none: 'There is no story ready yet. Please call again later.' },
  hi: { voice: 'hi-IN', after: 'अगर आपने सुना तो 1 दबाएँ। प्रार्थना चाहिए तो 2 दबाएँ।', thanks: 'धन्यवाद। परमेश्वर आपको आशीष दे।', prayer: 'धन्यवाद। एक पास्टर आपके साथ प्रार्थना के लिए कॉल करेंगे।', none: 'अभी कोई कहानी तैयार नहीं है। कृपया बाद में कॉल करें।' },
  te: { voice: 'te-IN', after: 'మీరు విన్నట్లయితే 1 నొక్కండి. ప్రార్థన కావాలంటే 2 నొక్కండి.', thanks: 'ధన్యవాదాలు. దేవుడు మిమ్మల్ని ఆశీర్వదించును గాక.', prayer: 'ధన్యవాదాలు. ఒక పాస్టర్ మీతో ప్రార్థించడానికి కాల్ చేస్తారు.', none: 'ఇంకా కథ సిద్ధంగా లేదు. దయచేసి తర్వాత కాల్ చేయండి.' },
  ta: { voice: 'ta-IN', after: 'கேட்டீர்கள் என்றால் 1 அழுத்துங்கள். ஜெபம் வேண்டுமென்றால் 2 அழுத்துங்கள்.', thanks: 'நன்றி. ஆண்டவர் உங்களை ஆசீர்வதிப்பாராக.', prayer: 'நன்றி. ஒரு போதகர் உங்களுடன் ஜெபிக்க அழைப்பார்.', none: 'இன்னும் கதை தயாராக இல்லை. பிறகு அழையுங்கள்.' },
  ml: { voice: 'ml-IN', after: 'കേട്ടെങ്കിൽ 1 അമർത്തുക. പ്രാർത്ഥന വേണമെങ്കിൽ 2 അമർത്തുക.', thanks: 'നന്ദി. ദൈവം നിങ്ങളെ അനുഗ്രഹിക്കട്ടെ.', prayer: 'നന്ദി. ഒരു പാസ്റ്റർ നിങ്ങളോടൊപ്പം പ്രാർത്ഥിക്കാൻ വിളിക്കും.', none: 'കഥ ഇതുവരെ തയ്യാറായിട്ടില്ല. പിന്നീട് വിളിക്കുക.' },
  kn: { voice: 'kn-IN', after: 'ನೀವು ಕೇಳಿದ್ದರೆ 1 ಒತ್ತಿ. ಪ್ರಾರ್ಥನೆ ಬೇಕಾದರೆ 2 ಒತ್ತಿ.', thanks: 'ಧನ್ಯವಾದ. ದೇವರು ನಿಮ್ಮನ್ನು ಆಶೀರ್ವದಿಸಲಿ.', prayer: 'ಧನ್ಯವಾದ. ಒಬ್ಬ ಪಾಸ್ಟರ್ ನಿಮ್ಮೊಂದಿಗೆ ಪ್ರಾರ್ಥಿಸಲು ಕರೆ ಮಾಡುತ್ತಾರೆ.', none: 'ಇನ್ನೂ ಕಥೆ ಸಿದ್ಧವಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು ನಂತರ ಕರೆ ಮಾಡಿ.' },
};

export const storySettings = (ctx: Ctx): StoryLineSettings => ({ ...DEFAULT, ...(settings(ctx).storyLine ?? {}) });
const on = (ctx: Ctx) => featureOn(settings(ctx).features, 'story-line');
function guard(ctx: Ctx) {
  if (!on(ctx)) throw new ApiError(404, 'not_found', 'The story line is switched off for this church.');
}

const byOrder = (a: Story, b: Story) => a.order - b.order;
const recordingFor = (s: Story, lang: LanguageCode) => s.recordings[lang] ?? null;

/** The next story with a recording in this language, from `order` on, going round to the start. */
function nextStory(ctx: Ctx, lang: LanguageCode, order: number) {
  const ready = ctx.db.all('stories').filter((s) => recordingFor(s, lang)).sort(byOrder);
  return ready.find((s) => s.order >= order) ?? ready[0] ?? null;
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sayFor = (lang: LanguageCode) => SAY[lang] ?? SAY.en;

function hub(ctx: Ctx): StoryLineHub {
  const s = storySettings(ctx);
  const sends = ctx.db.all('storySends');
  const stories = ctx.db.all('stories').sort(byOrder).map((st) => {
    const mine = sends.filter((x) => x.storyId === st.id);
    return { ...st, sent: mine.length, listened: mine.filter((x) => x.listenedAt).length, prayer: mine.filter((x) => x.prayerAt).length };
  });
  const listeners = ctx.db.all('storyListeners').map((l) => {
    const p = ctx.db.get('people', l.id);
    const mine = sends.filter((x) => x.personId === l.id);
    const heard = mine.filter((x) => x.listenedAt).sort((a, b) => b.listenedAt!.localeCompare(a.listenedAt!));
    return { ...l, name: p ? fullName(p) : 'Removed person', phone: p?.phone ?? null, lastHeard: heard[0]?.listenedAt ?? null, heard: heard.length, got: mine.length };
  }).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const titles = new Map(stories.map((x) => [x.id, x.title]));
  const recent = sends.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40).map((x) => {
    const p = x.personId ? ctx.db.get('people', x.personId) : undefined;
    return { ...x, name: p ? fullName(p) : null, storyTitle: titles.get(x.storyId) ?? 'Removed story' };
  });
  const base = ctx.env.webhookBase ?? (ctx.env.demo ? 'https://api.flockwise.church/v1/webhooks' : null);
  return { settings: s, stories, listeners, callUrl: s.key && base ? `${base}/story-line/${churchId(ctx)}/${s.key}` : null, recent, storage: gcsStatus(ctx).connected };
}

function ensureKey(ctx: Ctx) {
  const s = storySettings(ctx);
  if (s.key) return s;
  const next = { ...s, key: ctx.env.random(20, KEY_ALPHABET) };
  ctx.db.put('settings', { ...settings(ctx), storyLine: next });
  return next;
}

function messageFor(ctx: Ctx, lang: LanguageCode, title: string, token: string) {
  const s = storySettings(ctx);
  const call = s.callNumber ? (CALL[lang] ?? CALL.en).replace('{number}', s.callNumber) : '';
  return (MESSAGE[lang] ?? MESSAGE.en).replace('{church}', settings(ctx).name).replace('{title}', title).replace('{link}', `${ctx.env.webUrl}/story/${token}`).replace('{call}', call ? `${call}\n` : '');
}

/** Sends each active listener their next story. Returns how many went. */
export async function sendStories(ctx: Ctx, only?: string[]) {
  const s = storySettings(ctx);
  const batches: Record<'whatsapp' | 'sms', { to: string; name: string; subject: string; text: string }[]> = { whatsapp: [], sms: [] };
  let count = 0;
  for (const l of ctx.db.all('storyListeners')) {
    if (!l.active || (only && !only.includes(l.id))) continue;
    const p = ctx.db.get('people', l.id);
    if (!p?.phone || p.status === 'inactive') continue;
    const st = nextStory(ctx, l.language, l.nextOrder);
    if (!st) continue;
    const token = ctx.env.random(10, KEY_ALPHABET);
    ctx.db.put('storySends', { id: token, personId: p.id, phone: normPhone(p.phone), storyId: st.id, language: l.language, via: 'message', at: ctx.now.toISOString(), listenedAt: null, prayerAt: null });
    ctx.db.put('storyListeners', { ...l, nextOrder: st.order + 1 });
    batches[l.channel ?? s.channel].push({ to: p.phone, name: fullName(p), subject: st.title, text: messageFor(ctx, l.language, st.title, token) });
    count++;
  }
  for (const ch of ['whatsapp', 'sms'] as const) if (batches[ch].length) await deliverAll(ctx, ch, batches[ch]).catch(() => undefined);
  return count;
}

/** Daily run: on the church's day (or every day), each listener gets the next story once. */
export async function storyLineDue(ctx: Ctx, today: string) {
  if (!on(ctx)) return;
  const s = storySettings(ctx);
  if (s.cadence === 'weekly' && new Date(`${today}T12:00:00Z`).getUTCDay() !== s.weekday) return;
  if (ctx.db.get('meta', 'storyLine:last')?.value === today) return;
  ctx.db.put('meta', { id: 'storyLine:last', value: today });
  await sendStories(ctx);
}

/** "I listened" or "please pray", from the listen page, the phone keypad or a WhatsApp reply. */
async function mark(ctx: Ctx, send: StorySend, what: 'listened' | 'prayer') {
  const now = ctx.now.toISOString();
  if (what === 'listened') return send.listenedAt ? send : ctx.db.put('storySends', { ...send, listenedAt: now });
  if (send.prayerAt) return send;
  const p = send.personId ? ctx.db.get('people', send.personId) : ctx.db.all('people').find((x) => normPhone(x.phone) === send.phone);
  const story = ctx.db.get('stories', send.storyId);
  const name = p ? fullName(p) : `Caller ${send.phone}`;
  const phone = p?.phone ?? send.phone;
  const pr = ctx.db.put('prayer', { id: ctx.id('pr'), personId: p?.id ?? null, name, text: `Asked for prayer after the Bible story${story ? ` “${story.title}”` : ''}. Please call back on ${phone}.`, visibility: 'pastors', status: 'open', prayedBy: [], createdAt: now, answeredNote: null, source: 'phone', contact: phone } as Collections['prayer']);
  await notify(ctx, 'prayer.new', { personIds: pastorIds(ctx), title: `${name} asked for prayer after a Bible story`, body: `Call back on ${phone}.`, link: '/admin/care?tab=prayer' }).catch(() => undefined);
  ctx.audit('created', 'prayer', pr.id, `Story line: prayer request from ${name}`);
  return ctx.db.put('storySends', { ...send, listenedAt: send.listenedAt ?? now, prayerAt: now });
}

/** A WhatsApp reply of 1 or 2 to the last story sent to this phone (within a week). Returns the reply text, or null when it is not about a story. */
export async function storyReply(ctx: Ctx, phone: string, text: string): Promise<string | null> {
  if (!on(ctx)) return null;
  const t = text.trim();
  if (t !== '1' && t !== '2') return null;
  const n = normPhone(phone);
  const week = new Date(ctx.now.getTime() - 7 * 86_400_000).toISOString();
  const send = ctx.db.all('storySends').filter((x) => x.phone === n && x.at >= week).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (!send) return null;
  await mark(ctx, send, t === '1' ? 'listened' : 'prayer');
  const say = sayFor(send.language);
  return t === '1' ? say.thanks : say.prayer;
}

/** The phone line. Without a key press it plays the caller's next story; with one it records it. */
async function phoneLine(ctx: Ctx, raw: Record<string, unknown>, format: string): Promise<RawResult | Record<string, unknown>> {
  const { from } = callFields(raw);
  const n = normPhone(from);
  const digits = String(raw.Digits ?? raw.digits ?? '').replace(/["'\s]/g, '').slice(0, 1);
  const p = n ? ctx.db.all('people').find((x) => normPhone(x.phone) === n && x.status !== 'inactive') : undefined;
  const listener = p ? ctx.db.get('storyListeners', p.id) : undefined;
  const lang: LanguageCode = listener?.language ?? p?.language ?? 'en';
  const say = sayFor(lang);
  const twiml = (inner: string): RawResult => ({ __raw: true, contentType: 'text/xml; charset=utf-8', body: `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, cache: 'no-store' });
  const speak = (text: string) => `<Say language="${say.voice}">${xml(text)}</Say>`;

  if (digits === '1' || digits === '2') {
    const since = new Date(ctx.now.getTime() - 86_400_000).toISOString();
    const send = ctx.db.all('storySends').filter((x) => x.phone === n && x.via === 'call' && x.at >= since).sort((a, b) => b.at.localeCompare(a.at))[0];
    if (send) await mark(ctx, send, digits === '1' ? 'listened' : 'prayer');
    const text = digits === '1' ? say.thanks : say.prayer;
    return format === 'twiml' ? twiml(`${speak(text)}<Hangup/>`) : { ok: true, said: text };
  }

  // The story a listener is up to; for anyone else, the latest one that was sent out.
  const last = ctx.db.all('storySends').filter((x) => x.via === 'message' && x.language === lang).sort((a, b) => b.at.localeCompare(a.at))[0];
  const mine = p ? ctx.db.all('storySends').filter((x) => x.personId === p.id).sort((a, b) => b.at.localeCompare(a.at))[0] : undefined;
  const st = (mine && ctx.db.get('stories', mine.storyId)) || (last && ctx.db.get('stories', last.storyId)) || nextStory(ctx, lang, 0);
  const rec = st ? recordingFor(st, lang) ?? recordingFor(st, 'en') : null;
  if (!st || !rec) return format === 'twiml' ? twiml(`${speak(say.none)}<Hangup/>`) : format === 'url' ? { __raw: true, contentType: 'text/plain', body: '', cache: 'no-store' } : { ok: true, audioUrl: null };
  if (n) ctx.db.put('storySends', { id: ctx.env.random(10, KEY_ALPHABET), personId: p?.id ?? null, phone: n, storyId: st.id, language: lang, via: 'call', at: ctx.now.toISOString(), listenedAt: null, prayerAt: null });
  if (format === 'url') return { __raw: true, contentType: 'text/plain', body: rec.url, cache: 'no-store' };
  if (format === 'twiml') return twiml(`<Play>${xml(rec.url)}</Play><Gather numDigits="1" timeout="8">${speak(say.after)}</Gather>${speak(say.thanks)}`);
  return { ok: true, audioUrl: rec.url, title: st.title, after: say.after };
}

function storyInput(b: Record<string, unknown>, cur?: Story): Partial<Story> {
  const out: Partial<Story> = {};
  if (b.title !== undefined || !cur) {
    const t = clean(b.title, 100);
    if (!t) throw new ApiError(422, 'invalid', 'Give the story a title.', { title: 'Required' });
    out.title = t;
  }
  if (b.reference !== undefined) out.reference = clean(b.reference, 60);
  if (b.summary !== undefined) out.summary = clean(b.summary, 1000);
  if (b.order !== undefined) out.order = Math.max(1, Math.min(9999, Math.round(Number(b.order)) || 1));
  return out;
}

export function registerStoryLine(r: Router) {
  r.get('/admin/stories', { perm: 'comms' }, (ctx): StoryLineHub => { guard(ctx); ensureKey(ctx); return hub(ctx); });

  r.post('/admin/stories', { perm: 'comms' }, (ctx): StoryLineHub => {
    guard(ctx);
    const now = ctx.now.toISOString();
    const v = storyInput(ctx.body);
    const order = v.order ?? Math.max(0, ...ctx.db.all('stories').map((s) => s.order)) + 1;
    ctx.db.put('stories', { id: ctx.id('sty'), order, title: v.title!, reference: v.reference ?? '', summary: v.summary ?? '', recordings: {}, createdAt: now, updatedAt: now });
    return hub(ctx);
  });

  /** Adds the 52-story starter series (titles and notes for whoever records them; no audio). */
  r.post('/admin/stories/starter', { perm: 'comms' }, (ctx): StoryLineHub => {
    guard(ctx);
    const now = ctx.now.toISOString();
    const have = new Set(ctx.db.all('stories').map((s) => s.title.toLowerCase()));
    let order = Math.max(0, ...ctx.db.all('stories').map((s) => s.order));
    for (const [title, reference, summary] of STARTER) {
      if (have.has(title.toLowerCase())) continue;
      ctx.db.put('stories', { id: ctx.id('sty'), order: ++order, title, reference, summary, recordings: {}, createdAt: now, updatedAt: now });
    }
    ctx.audit('created', 'stories', null, 'Added the starter series of Bible stories');
    return hub(ctx);
  });

  r.patch('/admin/stories/:id', { perm: 'comms' }, (ctx): StoryLineHub => {
    guard(ctx);
    const s = find(ctx, 'stories', ctx.params[0], 'Story');
    ctx.db.put('stories', { ...s, ...storyInput(ctx.body, s), updatedAt: ctx.now.toISOString() });
    return hub(ctx);
  });

  r.del('/admin/stories/:id', { perm: 'comms' }, (ctx): StoryLineHub => {
    guard(ctx);
    ctx.db.del('stories', find(ctx, 'stories', ctx.params[0], 'Story').id);
    return hub(ctx);
  });

  /** Sets (or, with no url and no mediaId, removes) the recording for one language. */
  r.put('/admin/stories/:id/recordings/:lang', { perm: 'comms' }, (ctx): StoryLineHub => {
    guard(ctx);
    const s = find(ctx, 'stories', ctx.params[0], 'Story');
    const lang = ctx.params[1] as LanguageCode;
    if (!LANGS.includes(lang)) throw new ApiError(422, 'invalid', 'Choose a language.');
    const recordings = { ...s.recordings };
    let url = clean(ctx.body.url, 2000);
    let mediaId: string | null = null;
    if (ctx.body.mediaId) {
      const m = find(ctx, 'media', String(ctx.body.mediaId), 'Recording');
      if (m.status !== 'ready') throw new ApiError(409, 'not_ready', 'The upload has not finished.');
      url = m.url;
      mediaId = m.id;
    }
    if (!url) delete recordings[lang];
    else {
      if (!isUrl(url)) throw new ApiError(422, 'invalid', 'Paste a full link to the audio (https://…).', { url: 'Audio link' });
      recordings[lang] = { url, mediaId, by: ctx.staff?.name ?? 'Church office', at: ctx.now.toISOString() };
    }
    ctx.db.put('stories', { ...s, recordings, updatedAt: ctx.now.toISOString() });
    return hub(ctx);
  });

  r.put('/admin/stories/listeners/:personId', { perm: 'comms' }, (ctx): StoryLineHub => {
    guard(ctx);
    const p = find(ctx, 'people', ctx.params[0], 'Person');
    if (!p.phone) throw new ApiError(422, 'invalid', `${p.firstName} has no phone number. Add one first.`);
    const cur = ctx.db.get('storyListeners', p.id);
    const lang = (LANGS.includes(ctx.body.language as LanguageCode) ? ctx.body.language : cur?.language ?? p.language ?? 'en') as LanguageCode;
    const channel = ctx.body.channel === 'sms' ? 'sms' : ctx.body.channel === 'whatsapp' ? 'whatsapp' : cur?.channel ?? storySettings(ctx).channel;
    const next: StoryListener = { id: p.id, language: lang, channel, nextOrder: cur?.nextOrder ?? 1, active: ctx.body.active === undefined ? cur?.active ?? true : ctx.body.active === true, joinedAt: cur?.joinedAt ?? ctx.now.toISOString() };
    ctx.db.put('storyListeners', next);
    ctx.audit(cur ? 'updated' : 'created', 'storyListeners', p.id, `${fullName(p)} ${cur ? 'updated on' : 'added to'} the story line`);
    return hub(ctx);
  });

  r.del('/admin/stories/listeners/:personId', { perm: 'comms' }, (ctx): StoryLineHub => {
    guard(ctx);
    ctx.db.del('storyListeners', ctx.params[0]);
    return hub(ctx);
  });

  /** Sends the next story now, to everyone or to one listener. */
  r.post('/admin/stories/send', { perm: 'comms' }, async (ctx) => {
    guard(ctx);
    const only = ctx.body.personId ? [String(ctx.body.personId)] : undefined;
    const sent = await sendStories(ctx, only);
    if (!sent) throw new ApiError(422, 'invalid', only ? 'No story is recorded in their language yet.' : 'No one got a story: add listeners and record a story in their language first.');
    return { sent, hub: hub(ctx) };
  });

  r.put('/admin/stories/settings', { perm: 'comms' }, (ctx): StoryLineHub => {
    guard(ctx);
    const cur = ensureKey(ctx);
    const b = ctx.body;
    const weekday = b.weekday === undefined ? cur.weekday : Math.round(Number(b.weekday));
    if (!(weekday >= 0 && weekday <= 6)) throw new ApiError(422, 'invalid', 'Choose a day of the week.');
    const next: StoryLineSettings = {
      key: b.newKey ? ctx.env.random(20, KEY_ALPHABET) : cur.key,
      cadence: b.cadence === 'daily' ? 'daily' : b.cadence === 'weekly' ? 'weekly' : cur.cadence,
      weekday,
      channel: b.channel === 'sms' ? 'sms' : b.channel === 'whatsapp' ? 'whatsapp' : cur.channel,
      callNumber: typeof b.callNumber === 'string' ? b.callNumber.replace(/[^\d+\s-]/g, '').trim().slice(0, 20) : cur.callNumber,
    };
    ctx.db.put('settings', { ...settings(ctx), storyLine: next });
    ctx.audit('updated', 'settings', 'church', 'Updated the story line');
    return hub(ctx);
  });

  // ----- the listener's side -----
  const sendOf = (ctx: Ctx) => {
    guard(ctx);
    const send = ctx.db.get('storySends', String(ctx.params[0]));
    if (!send) throw new ApiError(404, 'not_found', 'This story link is not right. Ask the church for a new one.');
    return send;
  };
  r.get('/public/story/:token', { public: true }, (ctx): StoryListen => {
    const send = sendOf(ctx);
    const st = find(ctx, 'stories', send.storyId, 'Story');
    const rec = recordingFor(st, send.language) ?? recordingFor(st, 'en');
    if (!rec) throw new ApiError(404, 'not_found', 'This story has no recording now.');
    return { title: st.title, reference: st.reference, audioUrl: rec.url, language: send.language, church: settings(ctx).name, listened: !!send.listenedAt, prayer: !!send.prayerAt };
  });
  r.post('/public/story/:token/listened', { public: true }, async (ctx) => { await mark(ctx, sendOf(ctx), 'listened'); return { ok: true }; });
  r.post('/public/story/:token/prayer', { public: true }, async (ctx) => { await mark(ctx, sendOf(ctx), 'prayer'); return { ok: true }; });

  // The phone provider, GET or POST, with the secret in the path. ?format=twiml (Twilio, Plivo…),
  // ?format=url (a plain audio link, for Exotel and similar "dynamic greeting" steps), or JSON.
  const line = async (ctx: Ctx) => {
    guard(ctx);
    const s = storySettings(ctx);
    if (!s.key || ctx.params[0] !== s.key) throw new ApiError(404, 'not_found', 'Unknown line.');
    const raw = { ...(ctx.query as Record<string, unknown>), ...((ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Record<string, unknown>) };
    return phoneLine(ctx, raw, String(ctx.query.format ?? 'json'));
  };
  r.post('/public/story-line/:key', { public: true }, line);
  r.get('/public/story-line/:key', { public: true }, line);
}

