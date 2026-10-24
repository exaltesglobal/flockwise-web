// Family altar. Each week a ten-minute devotion a family does together at home: a Bible story told
// for the children, a song, one question to talk about and a prayer to say together. Families tick
// "done" and build a streak, and parents see what their children learn in Sunday school this week.
// The office writes or drafts each week (with AI if they like); when nothing is published, a set of
// built-in weeks fills in so the page is never empty.
import type { Ctx, Router } from '../engine.js';
import { ApiError } from '../errors.js';
import { featureOn } from '../features.js';
import type { AltarHub, AltarWeek, AltarWeekView, Collections, MyAltar } from '../types.js';
import { DAY, find, fullName, localDate, settings } from '../util.js';
import { writeFamilyAltar } from './ai.js';
import { notify } from './notify.js';
import { addDays, classes, lastSunday, lessonFor } from './sunday-school.js';

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const songSearch = (title: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} song for children`)}`;

/** The Monday of the week a date falls in. */
export const mondayOf = (date: string) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));

type Starter = Omit<AltarWeek, 'id' | 'status' | 'by' | 'updatedAt' | 'songUrl'>;
const STARTER: Starter[] = [
  {
    title: 'God made everything',
    passage: 'Genesis 1',
    story: 'In the very beginning there was nothing at all, only God. Then God spoke, and light shone out. God spoke again, and there was sky above and water below. He gathered the water into seas and made dry land with mountains, trees, flowers and fruit. He hung the sun in the sky for the day, and the moon and stars for the night. He filled the seas with fish and the sky with birds, and the land with elephants, cows, monkeys and every kind of animal. Last of all, God made people, a man and a woman, to be like Him and to look after His world. God looked at everything He had made, and it was very good. Then He rested. The whole world, and you too, were made by a God who loves what He makes.',
    songTitle: 'He’s Got the Whole World in His Hands',
    question: 'What is your favourite thing that God made, and why?',
    prayer: 'Thank You, God, for making the sun, the rain, the animals and our family. Help us look after Your world and each other. Amen.',
  },
  {
    title: 'Noah trusts God',
    passage: 'Genesis 6–9',
    story: 'People had forgotten God and were doing wrong things, but Noah loved God and listened to Him. God told Noah, “Build a very big boat, an ark, because a great flood is coming.” There was no rain yet, and people laughed, but Noah kept building, day after day. When the ark was ready, animals came two by two, and Noah’s family went inside. God shut the door. Then it rained and rained for forty days, and water covered everything. But the ark floated safely. When the water went down, Noah sent out a dove, and it came back with a fresh olive leaf. At last they stepped out onto dry ground. Noah thanked God, and God put a rainbow in the sky as His promise to care for the earth.',
    songTitle: 'Who Built the Ark?',
    question: 'Noah obeyed God even when people laughed. When is it hard for you to do the right thing?',
    prayer: 'Dear God, thank You for keeping Noah safe. Help us trust You and obey You, even when it is hard. Thank You for Your promises. Amen.',
  },
  {
    title: 'Little David and the giant',
    passage: '1 Samuel 17',
    story: 'The army of Israel was afraid. Every day a giant soldier called Goliath shouted, “Send someone to fight me!” He was taller than a door and wore heavy armour. Nobody dared to go. Then young David came to bring food for his brothers. David was a shepherd boy who had looked after his sheep and fought off a lion and a bear. “God helped me then, and He will help me now,” David said. King Saul offered his armour, but it was too big. So David took only his sling and five smooth stones from the stream. Goliath laughed at the small boy. David said, “You come with a sword, but I come in the name of the Lord.” He swung his sling, and the stone hit Goliath, and the giant fell down. God had won the battle.',
    songTitle: 'My God Is So Big',
    question: 'What feels like a “giant” to you right now? How can God help?',
    prayer: 'Lord, You are bigger than anything that scares us. Make us brave like David, and help us remember You are with us. Amen.',
  },
  {
    title: 'Daniel keeps praying',
    passage: 'Daniel 6',
    story: 'Daniel lived far from home in the land of King Darius. He worked hard and was honest, and the king liked him very much. Some jealous men wanted to get Daniel into trouble. They tricked the king into making a law: “For thirty days, nobody may pray to anyone except the king. Anyone who does will be thrown to the lions.” Daniel heard about the law. He went home, opened his window and knelt down to pray to God three times a day, just as he always did. The men caught him, and sadly the king had to throw Daniel into the lions’ den. All night the king could not sleep. Early in the morning he ran to the den and called out. “My God sent His angel and shut the lions’ mouths!” Daniel answered. He was not hurt at all.',
    songTitle: 'Dare to Be a Daniel',
    question: 'When and where do we pray as a family? Is there a time we could add?',
    prayer: 'Dear God, thank You that we can talk to You any time and anywhere. Help us keep praying every day, like Daniel. Amen.',
  },
  {
    title: 'Jesus calms the storm',
    passage: 'Mark 4:35–41',
    story: 'One evening Jesus said to His friends, “Let’s go across the lake.” They got into a boat, and Jesus was so tired that He lay down at the back and fell asleep on a cushion. Suddenly a great storm came. The wind howled, the waves crashed over the sides, and the boat began to fill with water. The disciples were terrified. They woke Jesus and cried, “Teacher, don’t You care that we are drowning?” Jesus stood up. He spoke to the wind and said to the waves, “Quiet! Be still!” At once the wind stopped and the lake became completely calm. Jesus asked them, “Why are you so afraid? Do you still not trust Me?” His friends were amazed and said, “Who is this? Even the wind and the waves obey Him!”',
    songTitle: 'Be Still and Know',
    question: 'What makes you feel afraid? What can we do when we feel that way?',
    prayer: 'Jesus, You are stronger than every storm. When we are afraid, help us remember You are in the boat with us. Amen.',
  },
  {
    title: 'The boy who shared his lunch',
    passage: 'John 6:1–14',
    story: 'A huge crowd followed Jesus up a hill to hear Him teach and to see Him heal sick people. There were more than five thousand people, and as the day went on, everyone grew hungry. Jesus asked Philip, “Where can we buy bread for all these people?” Philip said, “Even lots of money would not be enough!” Then Andrew found a boy who had five small loaves of bread and two little fish. “But what is that for so many?” he asked. The boy gave his lunch to Jesus. Jesus told everyone to sit down on the grass. He thanked God for the food and began to share it out. Everyone ate as much as they wanted, and afterwards the disciples filled twelve baskets with leftovers. A small lunch, given to Jesus, fed everyone.',
    songTitle: 'Jesus Loves Me',
    question: 'What small thing could you give or share with someone this week?',
    prayer: 'Thank You, Jesus, for giving us food every day. Help us share what we have, even when it seems small. Amen.',
  },
  {
    title: 'The kind Samaritan',
    passage: 'Luke 10:25–37',
    story: 'Someone asked Jesus, “Who is my neighbour?” So Jesus told a story. A man was walking along a lonely road when robbers attacked him. They took his things, hurt him badly and left him lying by the road. A priest came along, saw the man, and walked past on the other side. Then a temple helper came, looked, and walked past too. Then a Samaritan came by. Samaritans and Jews did not get along, but when this man saw the hurt traveller, he felt sorry for him. He bandaged his wounds, lifted him onto his own donkey and took him to an inn. He paid the innkeeper and said, “Look after him, and I will pay whatever more it costs.” Jesus asked, “Which one was a good neighbour?” “The one who was kind,” came the answer. “Go and do the same,” Jesus said.',
    songTitle: 'Jesus Loves the Little Children',
    question: 'Who is someone who needs kindness this week, and what could we do for them?',
    prayer: 'Dear God, open our eyes to see people who need help. Make our family kind neighbours, like the Samaritan. Amen.',
  },
  {
    title: 'The lost sheep',
    passage: 'Luke 15:1–7',
    story: 'Jesus told a story about a shepherd who had one hundred sheep. Every evening he counted them: ninety-seven, ninety-eight, ninety-nine… One was missing! The shepherd did not say, “Never mind, I still have ninety-nine.” He left the others safe and went out into the hills to look for the lost one. He searched over rocks and through bushes until at last he found it. He lifted the little sheep onto his shoulders and carried it all the way home, full of joy. He called his friends and neighbours and said, “Celebrate with me! I have found my lost sheep!” Jesus said that God is like that shepherd. Every single person matters to Him, and there is great joy in heaven when one lost person comes home to God.',
    songTitle: 'Count Your Blessings',
    question: 'How does it feel to know that God would come looking for you?',
    prayer: 'Thank You, Good Shepherd, that You know each of us by name and never stop caring for us. Help us come close to You. Amen.',
  },
];

const on = (ctx: Ctx) => featureOn(settings(ctx).features, 'family-altar');
function guard(ctx: Ctx) {
  if (!on(ctx)) throw new ApiError(404, 'not_found', 'The family altar is switched off for this church.');
}

const thisMonday = (ctx: Ctx) => mondayOf(localDate(ctx, ctx.now));

/** A built-in week for any Monday, turning through the starters in order. */
function builtIn(monday: string): AltarWeek {
  const n = Math.floor(Date.parse(`${monday}T00:00:00Z`) / (7 * DAY));
  const s = STARTER[((n % STARTER.length) + STARTER.length) % STARTER.length];
  return { ...s, id: monday, songUrl: songSearch(s.songTitle), status: 'published', by: 'Flockwise', updatedAt: `${monday}T00:00:00.000Z` };
}

/** What families see for a given Monday: the church's published week, or a built-in one. */
function weekFor(ctx: Ctx, monday: string): { week: AltarWeek; builtIn: boolean } {
  const w = ctx.db.get('altarWeeks', monday);
  return w && w.status === 'published' ? { week: w, builtIn: false } : { week: builtIn(monday), builtIn: true };
}

/** Members of one family share a tick: by household name, or the person alone. */
export function householdKey(p: Collections['people']) {
  return p.householdName ? `h:${p.householdName}` : `p:${p.id}`;
}

/** Weeks in a row done, counting back from this week (or last week when this one is not done yet). */
function streakOf(weeks: Set<string>, monday: string) {
  let at = weeks.has(monday) ? monday : addDays(monday, -7);
  let n = 0;
  while (weeks.has(at)) { n++; at = addDays(at, -7); }
  return n;
}
function bestOf(weeks: Set<string>) {
  let best = 0;
  for (const w of weeks) {
    if (weeks.has(addDays(w, -7))) continue;
    let n = 0;
    let at = w;
    while (weeks.has(at)) { n++; at = addDays(at, 7); }
    best = Math.max(best, n);
  }
  return best;
}

function doneByHousehold(ctx: Ctx) {
  const map = new Map<string, Set<string>>();
  for (const d of ctx.db.all('altarDone')) map.set(d.household, (map.get(d.household) ?? new Set()).add(d.weekId));
  return map;
}

function view(ctx: Ctx, w: AltarWeek, isBuiltIn: boolean): AltarWeekView {
  return { ...w, families: ctx.db.all('altarDone').filter((d) => d.weekId === w.id).length, builtIn: isBuiltIn };
}

function hub(ctx: Ctx): AltarHub {
  const monday = thisMonday(ctx);
  const cur = weekFor(ctx, monday);
  const saved = ctx.db.all('altarWeeks').sort((a, b) => b.id.localeCompare(a.id)).slice(0, 26);
  const byHouse = doneByHousehold(ctx);
  const since = addDays(monday, -28);
  const label = (key: string) => {
    if (key.startsWith('h:')) return key.slice(2);
    const p = ctx.db.get('people', key.slice(2));
    return p ? fullName(p) : 'A family';
  };
  return {
    current: view(ctx, cur.week, cur.builtIn),
    weeks: saved.map((w) => view(ctx, w, false)),
    activeFamilies: [...byHouse.values()].filter((s) => [...s].some((w) => w >= since)).length,
    streaks: [...byHouse.entries()].map(([k, s]) => ({ household: label(k), weeks: streakOf(s, monday) })).filter((s) => s.weeks >= 2).sort((a, b) => b.weeks - a.weeks || a.household.localeCompare(b.household)).slice(0, 20),
  };
}

function household(ctx: Ctx, me: Collections['people']) {
  return me.householdName ? ctx.db.all('people').filter((p) => p.householdName === me.householdName && p.status !== 'inactive') : [me];
}

function mine(ctx: Ctx): MyAltar {
  const me = find(ctx, 'people', ctx.me(), 'Profile');
  const monday = thisMonday(ctx);
  const key = householdKey(me);
  const weeks = doneByHousehold(ctx).get(key) ?? new Set<string>();
  const cls = classes(ctx);
  const sunday = lastSunday(ctx);
  const kids = household(ctx, me)
    .map((p) => ({ p, c: cls.find((c) => c.studentIds.includes(p.id)) }))
    .filter((x) => !!x.c)
    .map(({ p, c }) => {
      const l = lessonFor(ctx, c!.id, addDays(sunday, 7)) ?? lessonFor(ctx, c!.id, sunday);
      return { name: p.firstName, className: c!.name, lesson: l ? { title: l.title, scripture: l.scripture, memoryVerse: l.memoryVerse, date: l.date } : null };
    });
  return { week: weekFor(ctx, monday).week, done: weeks.has(monday), streak: streakOf(weeks, monday), best: bestOf(weeks), kids };
}

function weekInput(ctx: Ctx, id: string, b: Record<string, unknown>, prev: AltarWeek | null): AltarWeek {
  const w: AltarWeek = {
    id,
    title: clean(b.title ?? prev?.title, 120),
    passage: clean(b.passage ?? prev?.passage, 80),
    story: clean(b.story ?? prev?.story, 3000),
    songTitle: clean(b.songTitle ?? prev?.songTitle, 120),
    songUrl: clean(b.songUrl ?? prev?.songUrl, 500),
    question: clean(b.question ?? prev?.question, 400),
    prayer: clean(b.prayer ?? prev?.prayer, 600),
    status: (b.status ?? prev?.status) === 'published' ? 'published' : 'draft',
    by: ctx.staff?.name ?? 'Church office',
    updatedAt: ctx.now.toISOString(),
  };
  if (w.songUrl && !/^https:\/\//.test(w.songUrl)) throw new ApiError(422, 'invalid', 'The song link must start with https://', { songUrl: 'Not a link' });
  if (w.status === 'published') {
    const missing: Record<string, string> = {};
    if (!w.title) missing.title = 'Required';
    if (!w.story) missing.story = 'Required';
    if (!w.question) missing.question = 'Required';
    if (!w.prayer) missing.prayer = 'Required';
    if (Object.keys(missing).length) throw new ApiError(422, 'invalid', 'Fill in the title, story, question and prayer before publishing.', missing);
  }
  if (!w.songUrl && w.songTitle) w.songUrl = songSearch(w.songTitle);
  return w;
}

/** Monday: families who did the altar lately, and parents of Sunday school children, hear the new week is ready. */
export async function altarDue(ctx: Ctx, today: string) {
  if (!on(ctx) || new Date(`${today}T00:00:00Z`).getUTCDay() !== 1) return;
  const monday = mondayOf(today);
  const key = `altar:${monday}`;
  if (ctx.db.get('meta', key)) return;
  ctx.db.put('meta', { id: key, value: today });
  const since = addDays(monday, -28);
  const recent = new Set(ctx.db.all('altarDone').filter((d) => d.weekId >= since).map((d) => d.household));
  const kidIds = new Set(classes(ctx).flatMap((c) => c.studentIds));
  const kidHouses = new Set(ctx.db.all('people').filter((p) => kidIds.has(p.id) && p.householdName).map((p) => `h:${p.householdName}`));
  const ids = ctx.db
    .all('people')
    .filter((p) => p.status !== 'inactive' && !kidIds.has(p.id) && (recent.has(householdKey(p)) || kidHouses.has(householdKey(p))))
    .map((p) => p.id);
  if (!ids.length) return;
  const w = weekFor(ctx, monday).week;
  await notify(ctx, 'altar.week', { personIds: ids, title: `Family altar: ${w.title}`, body: `This week’s ten minutes together: ${w.passage ? `${w.passage}, ` : ''}a story, a song, a question and a prayer.`, link: '/app/altar' });
}

export function registerFamilyAltar(r: Router) {
  r.get('/admin/altar', { perm: 'comms' }, (ctx): AltarHub => { guard(ctx); return hub(ctx); });

  r.put('/admin/altar/:week', { perm: 'comms' }, (ctx): AltarHub => {
    guard(ctx);
    const id = ctx.params[0];
    if (!isDate(id) || mondayOf(id) !== id) throw new ApiError(422, 'invalid', 'Pick the Monday the week starts.', { id: 'Must be a Monday' });
    const prev = ctx.db.get('altarWeeks', id) ?? null;
    const w = weekInput(ctx, id, ctx.body, prev);
    ctx.db.put('altarWeeks', w);
    ctx.audit(prev ? 'updated' : 'created', 'altarWeeks', id, `${w.status === 'published' ? 'Published' : 'Saved'} the family altar for the week of ${id}`);
    return hub(ctx);
  });

  r.del('/admin/altar/:week', { perm: 'comms' }, (ctx): AltarHub => {
    guard(ctx);
    const w = find(ctx, 'altarWeeks', ctx.params[0], 'Week');
    ctx.db.del('altarWeeks', w.id);
    ctx.audit('deleted', 'altarWeeks', w.id, `Removed the family altar for the week of ${w.id}`);
    return hub(ctx);
  });

  r.post('/admin/altar/draft', { perm: 'comms' }, async (ctx) => {
    guard(ctx);
    const passage = clean(ctx.body.passage, 80);
    if (!passage) throw new ApiError(422, 'invalid', 'Give a Bible passage to write from.', { passage: 'Required' });
    const out = await writeFamilyAltar(ctx, passage, clean(ctx.body.language, 5) || 'en');
    return { ...out, passage, songUrl: out.songTitle ? songSearch(out.songTitle) : '' };
  });

  r.get('/me/altar', {}, (ctx): MyAltar => { guard(ctx); return mine(ctx); });

  r.post('/me/altar/done', {}, (ctx): MyAltar => {
    guard(ctx);
    const me = find(ctx, 'people', ctx.me(), 'Profile');
    const weekId = thisMonday(ctx);
    const household = householdKey(me);
    const id = `${weekId}:${household}`;
    if (!ctx.db.get('altarDone', id)) ctx.db.put('altarDone', { id, weekId, household, personId: me.id, at: ctx.now.toISOString() });
    return mine(ctx);
  });

  r.del('/me/altar/done', {}, (ctx): MyAltar => {
    guard(ctx);
    const me = find(ctx, 'people', ctx.me(), 'Profile');
    const id = `${thisMonday(ctx)}:${householdKey(me)}`;
    if (ctx.db.get('altarDone', id)) ctx.db.del('altarDone', id);
    return mine(ctx);
  });
}
