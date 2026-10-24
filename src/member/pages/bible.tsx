// The Bible in the member app: any of 1,100 free Bibles (every Indian Revised Version, English and
// about 890 more languages), book and chapter pickers, headings and poetry as printed, footnotes, a
// second translation side by side, and a tap on a verse to copy it or send it on WhatsApp.
// Opens at ?tr=hin2017&ref=John 3:16 from reading plans and shared links; otherwise where they left off.
import { ArrowLeft, ArrowRight, Bookmark, BookOpen, Check, ChevronDown, Columns2, Copy, Highlighter, Languages, Link2, Minus, NotebookPen, Plus, Search, Share2, StickyNote, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';

import { memberSession } from '@/api/client';
import { MemberApi, PublicApi } from '@/api/endpoints';
import { BOOKS } from '@/core/bible';
import { BOOK_CODES, FEATURED_BIBLES, parseReference } from '@/core/bible-texts';
import type { BibleBookInfo, BibleChapter, BibleCrossRef, BibleHit, BibleMark, BibleMarkColor, BibleTranslationInfo, BibleVerse } from '@/core/types';
import { ErrorState, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';

type Place = { tr: string; tr2: string | null; book: string; chapter: number };

const load = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const save = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private window */
  }
};
const shortName = (t: BibleTranslationInfo) => t.name.replace('Indian Revised Version (IRV)', 'IRV');
const COLORS: BibleMarkColor[] = ['yellow', 'green', 'blue', 'pink', 'orange'];
type MarkPatch = { color?: BibleMarkColor | null; bookmark?: boolean; note?: string };

export function MemberBiblePage() {
  const { t, lang } = useT();
  const session = useSession(memberSession);
  const [params, setParams] = useSearchParams();
  const startTr = FEATURED_BIBLES.find((b) => b.app === (session?.member.language ?? lang))?.id ?? 'engbsb';
  const [place, setPlace] = useState<Place>(() => {
    const saved = load<Place>('fw.bible.place', { tr: startTr, tr2: null, book: 'JHN', chapter: 1 });
    const ref = params.get('ref');
    const p = ref ? parseReference(ref) : null;
    return { ...saved, tr: params.get('tr') || saved.tr, ...(p ? { book: BOOK_CODES[p.book], chapter: p.chapter } : {}) };
  });
  const [mark, setMark] = useState<number | null>(() => { const p = parseReference(params.get('ref') ?? ''); return p?.from ?? null; });
  const [size, setSize] = useState(() => load('fw.bible.size', 18));
  const [picker, setPicker] = useState<null | 'tr' | 'tr2' | 'book' | 'marks' | 'search'>(null);
  const [seeAlso, setSeeAlso] = useState<number | null>(null);
  const list = useApi(PublicApi.bibleTranslations);
  const go = (p: Partial<Place>) => {
    const next = { ...place, ...p };
    setPlace(next);
    save('fw.bible.place', next);
    if (p.book || p.chapter) setMark(null);
    if (params.has('ref') || params.has('tr')) setParams({}, { replace: true });
    window.scrollTo({ top: 0 });
  };
  useEffect(() => save('fw.bible.size', size), [size]);

  const all = list.data?.translations ?? FEATURED_BIBLES;
  const info = (id: string | null) => (id ? all.find((x) => x.id === id) ?? FEATURED_BIBLES.find((x) => x.id === id) ?? null : null);
  const tr = info(place.tr);
  const tr2 = info(place.tr2);
  const ch = useApi(() => PublicApi.bibleChapter(place.tr, place.book, place.chapter), [place.tr, place.book, place.chapter]);
  const ch2 = useApi(() => (place.tr2 ? PublicApi.bibleChapter(place.tr2, place.book, place.chapter) : Promise.resolve(null)), [place.tr2, place.book, place.chapter]);
  const books = useApi(() => PublicApi.bibleBooks(place.tr), [place.tr]);
  const marks = useApi(() => MemberApi.bibleMarks(place.book, place.chapter), [place.book, place.chapter]);
  const markMap = useMemo(() => new Map((marks.data ?? []).map((m) => [m.verse, m])), [marks.data]);
  const saveMark = async (verse: number, patch: MarkPatch) => {
    const { mark: m } = await MemberApi.bibleMark(place.book, place.chapter, verse, patch);
    marks.setData([...(marks.data ?? []).filter((x) => x.verse !== verse), ...(m ? [m] : [])]);
  };
  const title = ch.data ? `${ch.data.bookName} ${ch.data.chapter}` : `${books.data?.find((b) => b.code === place.book)?.name ?? place.book} ${place.chapter}`;

  return (
    <>
      <div className="bib-bar">
        <button className="btn sm" onClick={() => setPicker('book')}><BookOpen size={15} /> <b>{title}</b> <ChevronDown size={14} /></button>
        <button className="btn sm" onClick={() => setPicker('tr')} title={t('bibleTranslation')}><Languages size={15} /> {tr ? `${tr.native} · ${shortName(tr)}` : place.tr}</button>
        <button className={`btn sm ${place.tr2 ? 'primary' : ''}`} onClick={() => (place.tr2 ? go({ tr2: null }) : setPicker('tr2'))} title={t('bibleCompare')}><Columns2 size={15} /> <span className="bib-hide-sm">{place.tr2 && tr2 ? shortName(tr2) : t('bibleCompare')}</span>{place.tr2 && <X size={13} />}</button>
        <button className="btn sm ghost" onClick={() => setPicker('search')} title={t('bibleSearchTitle')}><Search size={15} /> <span className="bib-hide-sm">{t('bibleSearchTitle')}</span></button>
        <button className="btn sm ghost" onClick={() => setPicker('marks')} title={t('bibleMarks')}><NotebookPen size={15} /> <span className="bib-hide-sm">{t('bibleMarks')}</span></button>
        <span className="grow" />
        <div className="row" style={{ gap: 2 }} aria-label={t('bibleTextSize')}>
          <button className="btn sm ghost icon" onClick={() => setSize((s) => Math.max(14, s - 2))} aria-label={`${t('bibleTextSize')} −`}><Minus size={14} /></button>
          <button className="btn sm ghost icon" onClick={() => setSize((s) => Math.min(30, s + 2))} aria-label={`${t('bibleTextSize')} +`}><Plus size={14} /></button>
        </div>
      </div>

      {ch.error ? <ErrorState error={ch.error} onRetry={ch.reload} /> : !ch.data ? <Loading /> : (
        <Reader ch={ch.data} ch2={place.tr2 ? ch2.data : null} size={size} mark={mark} setMark={setMark} marks={markMap} onMark={saveMark} onSeeAlso={setSeeAlso} />
      )}

      {ch.data && (
        <div className="row between" style={{ gap: 8, marginTop: 16 }}>
          <button className="btn" disabled={!ch.data.prev} onClick={() => ch.data?.prev && go(ch.data.prev)}><ArrowLeft size={15} /> {t('biblePrev')}</button>
          <button className="btn" disabled={!ch.data.next} onClick={() => ch.data?.next && go(ch.data.next)}>{t('bibleNext')} <ArrowRight size={15} /></button>
        </div>
      )}

      {picker === 'book' && <BookPicker books={books.data} current={place} onClose={() => setPicker(null)} onPick={(book, chapter) => { go({ book, chapter }); setPicker(null); }} onRef={(book, chapter, verse) => { go({ book, chapter }); setMark(verse); setPicker(null); }} />}
      {picker === 'search' && <SearchPanel tr={place.tr} book={place.book} names={books.data} onClose={() => setPicker(null)} onOpen={(book, chapter, verse) => { go({ book, chapter }); setMark(verse); setPicker(null); }} />}
      {seeAlso !== null && <SeeAlso tr={place.tr} book={place.book} chapter={place.chapter} verse={seeAlso} names={books.data} onClose={() => setSeeAlso(null)} onOpen={(book, chapter, verse) => { setSeeAlso(null); go({ book, chapter }); setMark(verse); }} />}
      {picker === 'marks' && <MarksList onClose={() => setPicker(null)} onOpen={(m) => { go({ book: m.book, chapter: m.chapter }); setMark(m.verse); setPicker(null); }} />}
      {(picker === 'tr' || picker === 'tr2') && (
        <TranslationPicker all={all} featured={list.data?.featured ?? FEATURED_BIBLES.map((b) => b.id)} current={picker === 'tr' ? place.tr : place.tr2} myLang={session?.member.language ?? lang}
          onClose={() => setPicker(null)} onPick={(id) => { go(picker === 'tr' ? { tr: id } : { tr2: id }); setPicker(null); }} />
      )}
    </>
  );
}

function Reader({ ch, ch2, size, mark, setMark, marks, onMark, onSeeAlso }: { ch: BibleChapter; ch2: BibleChapter | null; size: number; mark: number | null; setMark: (n: number | null) => void; marks: Map<number, BibleMark>; onMark: (verse: number, patch: MarkPatch) => Promise<void>; onSeeAlso: (verse: number) => void }) {
  const { t } = useT();
  const toast = useToast();
  const [showNotes, setShowNotes] = useState(false);
  useEffect(() => { if (mark) document.getElementById(`v${mark}`)?.scrollIntoView({ block: 'center' }); }, [ch, mark]);
  const verse = mark ? ch.verses.find((v) => v.n === mark) : null;
  const share = verse ? `${verse.text}\n${ch.bookName} ${ch.chapter}:${verse.label ?? verse.n} (${shortName(ch.translation)})` : '';
  const copy = () => navigator.clipboard?.writeText(share).then(() => toast(t('bibleCopied')), () => undefined);
  const mine = mark ? marks.get(mark) : undefined;
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => { setNoteOpen(false); setNote(mine?.note ?? ''); }, [mark]); // eslint-disable-line react-hooks/exhaustive-deps
  const markClass = (n: number) => { const m = marks.get(n); return m?.color ? ` hl-${m.color}` : ''; };
  const markIcons = (n: number) => { const m = marks.get(n); return m && (m.bookmark || m.note) ? <span className="bib-icons">{m.bookmark && <Bookmark size={12} />}{m.note && <StickyNote size={12} />}</span> : null; };
  const byVerse = useMemo(() => new Map((ch2?.verses ?? []).map((v) => [v.n, v])), [ch2]);

  return (
    <article className={`bib-read ${ch2 ? 'bib-two' : ''}`} style={{ fontSize: size }}>
      <h1 className="bib-title" dir={ch.translation.rtl ? 'rtl' : undefined}>{ch.bookName} {ch.chapter}</h1>
      {ch2 && <div className="bib-cols bib-colhead small muted"><span>{shortName(ch.translation)}</span><span>{shortName(ch2.translation)}</span></div>}
      {ch.intro && <p className="bib-intro">{ch.intro}</p>}
      {ch2 ? (
        ch.verses.map((v) => (
          <div key={v.n} className={`bib-cols ${mark === v.n ? 'on' : ''}${markClass(v.n)}`} id={`v${v.n}`} onClick={() => setMark(mark === v.n ? null : v.n)}>
            <VerseText v={v} rtl={ch.translation.rtl} icons={markIcons(v.n)} />
            {byVerse.get(v.n) ? <VerseText v={byVerse.get(v.n)!} rtl={ch2.translation.rtl} /> : <span />}
          </div>
        ))
      ) : (
        <div dir={ch.translation.rtl ? 'rtl' : undefined}>
          {paragraphs(ch.verses).map((para, i) => (
            <div key={i}>
              {para[0].heading && <h3 className="bib-head">{para[0].heading}</h3>}
              <p className={`bib-p ${para[0].poetry ? 'bib-poetry' : ''}`}>
                {para.map((v) => (
                  <span key={v.n} id={`v${v.n}`} className={`bib-v ${mark === v.n ? 'on' : ''}${markClass(v.n)}`} onClick={() => setMark(mark === v.n ? null : v.n)}>
                    <sup>{v.label ?? v.n}</sup>{markIcons(v.n)}{v.text}{' '}
                  </span>
                ))}
              </p>
            </div>
          ))}
        </div>
      )}

      {ch.notes.length > 0 && (
        <div className="small" style={{ marginTop: 16 }}>
          <button className="btn sm ghost" onClick={() => setShowNotes((s) => !s)}>{t('bibleNotes')} ({ch.notes.length}) <ChevronDown size={13} /></button>
          {showNotes && <ol className="bib-notes">{ch.notes.map((n, i) => <li key={i}><b>{ch.chapter}:{n.verse}</b> {n.text}</li>)}</ol>}
        </div>
      )}
      <p className="small muted bib-source">{ch.source}{ch2 && <><br />{ch2.source}</>}</p>

      {verse && (
        <div className="bib-actions card stack" role="toolbar" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 6, width: '100%' }}>
            <span className="small ellipsis grow">{ch.bookName} {ch.chapter}:{verse.label ?? verse.n}</span>
            <button className="btn sm ghost icon" aria-label="Close" onClick={() => setMark(null)}><X size={14} /></button>
          </div>
          <div className="row wrap" style={{ gap: 6, width: '100%' }}>
            <span className="row" style={{ gap: 4 }} aria-label="Highlight">
              <Highlighter size={14} className="muted" />
              {COLORS.map((c) => <button key={c} className={`bib-dot hl-${c} ${mine?.color === c ? 'on' : ''}`} aria-label={c} aria-pressed={mine?.color === c} onClick={() => void onMark(verse.n, { color: mine?.color === c ? null : c })} />)}
            </span>
            <button className={`btn sm ${mine?.bookmark ? 'primary' : ''}`} onClick={() => void onMark(verse.n, { bookmark: !mine?.bookmark })} aria-pressed={!!mine?.bookmark}><Bookmark size={14} /> {t('bibleBookmark')}</button>
            <button className={`btn sm ${mine?.note ? 'primary' : ''}`} onClick={() => setNoteOpen((o) => !o)}><StickyNote size={14} /> {t('bibleNote')}</button>
            <button className="btn sm" onClick={() => onSeeAlso(verse.n)}><Link2 size={14} /> {t('bibleSeeAlso')}</button>
            <span className="grow" />
            <button className="btn sm" onClick={() => void copy()}><Copy size={14} /> {t('bibleCopy')}</button>
            <a className="btn sm primary" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer"><Share2 size={14} /> {t('bibleShare')}</a>
          </div>
          {noteOpen && (
            <form className="stack" style={{ gap: 6, width: '100%' }} onSubmit={(e) => { e.preventDefault(); void onMark(verse.n, { note }).then(() => { setNoteOpen(false); toast(t('bibleSaved')); }); }}>
              <textarea className="input" rows={3} maxLength={4000} autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('bibleNoteHint')} />
              <button className="btn sm primary" style={{ alignSelf: 'flex-end' }}>{t('bibleSave')}</button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}

function VerseText({ v, rtl, icons }: { v: BibleVerse; rtl?: boolean; icons?: ReactNode }) {
  return (
    <div dir={rtl ? 'rtl' : undefined}>
      {v.heading && <h3 className="bib-head">{v.heading}</h3>}
      <span className={`bib-v ${v.poetry ? 'bib-poetry' : ''}`}><sup>{v.label ?? v.n}</sup>{icons}{v.text}</span>
    </div>
  );
}

/** Verses grouped into the paragraphs the translation prints. */
function paragraphs(verses: BibleVerse[]): BibleVerse[][] {
  const out: BibleVerse[][] = [];
  for (const v of verses) {
    const last = out[out.length - 1];
    if (!last || v.para || v.heading || !!v.poetry !== !!last[0].poetry) out.push([v]);
    else last.push(v);
  }
  return out;
}

function BookPicker({ books, current, onClose, onPick, onRef }: { books: BibleBookInfo[] | null; current: Place; onClose: () => void; onPick: (book: string, chapter: number) => void; onRef: (book: string, chapter: number, verse: number | null) => void }) {
  const { t } = useT();
  const [book, setBook] = useState<BibleBookInfo | null>(null);
  const [ref, setRef] = useState('');
  const [bad, setBad] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = parseReference(ref);
    if (!p) { setBad(true); return; }
    onRef(BOOK_CODES[p.book], p.chapter, p.from);
  };
  if (!books) return <Modal title={t('bibleTitle')} onClose={onClose}><Loading /></Modal>;
  return (
    <Modal title={book ? book.name : t('bibleTitle')} onClose={onClose} wide>
      {book ? (
        <div className="stack">
          <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setBook(null)}><ArrowLeft size={14} /> {t('bibleTitle')}</button>
          <div className="bib-grid chapters">
            {Array.from({ length: book.chapters }, (_, i) => i + 1).map((c) => (
              <button key={c} className={`btn sm ${book.code === current.book && c === current.chapter ? 'primary' : ''}`} onClick={() => onPick(book.code, c)}>{c}</button>
            ))}
          </div>
        </div>
      ) : (
        <div className="stack">
          <form className="row" style={{ gap: 6 }} onSubmit={submit}>
            <input className="input grow" value={ref} onChange={(e) => { setRef(e.target.value); setBad(false); }} placeholder={t('bibleRefHint')} aria-invalid={bad} />
            <button className="btn primary" disabled={!ref.trim()}><Search size={15} /></button>
          </form>
          {(['ot', 'nt'] as const).map((tm) => {
            const part = books.filter((b) => b.testament === tm);
            return part.length ? (
              <section key={tm} className="stack" style={{ gap: 6 }}>
                <b className="small muted">{tm === 'ot' ? t('bibleOT') : t('bibleNT')}</b>
                <div className="bib-grid">
                  {part.map((b) => (
                    <button key={b.code} className={`btn sm bib-book ${b.code === current.book ? 'primary' : ''}`} onClick={() => (b.chapters === 1 ? onPick(b.code, 1) : setBook(b))} title={b.en}>{b.name}</button>
                  ))}
                </div>
              </section>
            ) : null;
          })}
        </div>
      )}
    </Modal>
  );
}

function TranslationPicker({ all, featured, current, myLang, onClose, onPick }: { all: BibleTranslationInfo[]; featured: string[]; current: string | null; myLang: string; onClose: () => void; onPick: (id: string) => void }) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!query) {
      const top = featured.map((id) => all.find((x) => x.id === id)).filter((x): x is BibleTranslationInfo => !!x);
      // The member's own language first.
      return [...top.filter((x) => x.app === myLang), ...top.filter((x) => x.app !== myLang)];
    }
    return all.filter((x) => `${x.language} ${x.native} ${x.name} ${x.id}`.toLowerCase().includes(query)).slice(0, 120);
  }, [all, featured, query, myLang]);
  return (
    <Modal title={t('bibleChoose')} onClose={onClose} wide>
      <div className="stack">
        <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t('bibleSearch')} (${all.length})`} />
        {!query && <b className="small muted">{t('bibleFeatured')}</b>}
        <div className="bib-trs">
          {shown.map((x) => (
            <button key={x.id} className={`bib-tr ${x.id === current ? 'on' : ''}`} onClick={() => onPick(x.id)}>
              <span className="row" style={{ gap: 6 }}><b>{x.native}</b>{x.native !== x.language && <span className="muted small">{x.language}</span>}{x.id === current && <Check size={14} />}</span>
              <span className="small">{x.name}</span>
              {(!x.ot || x.partial) && <span className="small muted">{x.nt && !x.ot ? t('bibleNtOnly') : '…'}</span>}
            </button>
          ))}
        </div>
        {!query && <p className="small muted" style={{ margin: 0 }}>{t('bibleAll')}: {all.length} · {t('bibleSearch')}</p>}
      </div>
    </Modal>
  );
}

/** Every highlight, bookmark and note the member has made, newest first; tap one to go there. */
function MarksList({ onClose, onOpen }: { onClose: () => void; onOpen: (m: BibleMark) => void }) {
  const { t } = useT();
  const q = useApi(() => MemberApi.bibleMarks());
  const [filter, setFilter] = useState<'all' | 'bookmark' | 'note'>('all');
  const name = (code: string) => BOOKS[BOOK_CODES.indexOf(code as (typeof BOOK_CODES)[number])]?.en ?? code;
  const shown = (q.data ?? []).filter((m) => filter === 'all' || (filter === 'bookmark' ? m.bookmark : !!m.note));
  return (
    <Modal title={t('bibleMarks')} onClose={onClose} wide>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data ? <Loading /> : (
        <div className="stack">
          <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: t('bibleAllMarks') }, { value: 'bookmark', label: t('bibleBookmark') }, { value: 'note', label: t('bibleNote') }]} />
          {!shown.length ? <p className="muted">{t('bibleMarksNone')}</p> : (
            <div className="stack" style={{ gap: 6 }}>
              {shown.map((m) => (
                <button key={m.id} className={`bib-tr${m.color ? ` hl-${m.color}` : ''}`} onClick={() => onOpen(m)}>
                  <span className="row" style={{ gap: 6 }}><b>{name(m.book)} {m.chapter}:{m.verse}</b>{m.bookmark && <Bookmark size={13} />}</span>
                  {m.note && <span className="small" style={{ whiteSpace: 'pre-line' }}>{m.note}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

const bookName = (names: BibleBookInfo[] | null, code: string) => names?.find((b) => b.code === code)?.name ?? BOOKS[BOOK_CODES.indexOf(code as (typeof BOOK_CODES)[number])]?.en ?? code;

/** The verse with each searched word marked. */
function Marked({ text, terms }: { text: string; terms: string[] }) {
  const words = terms.filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join('|')})`, 'giu'));
  return <>{parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>;
}

/** Search the whole of the current Bible; tap a verse to read it in place. */
function SearchPanel({ tr, book, names, onClose, onOpen }: { tr: string; book: string; names: BibleBookInfo[] | null; onClose: () => void; onOpen: (book: string, chapter: number, verse: number | null) => void }) {
  const { t } = useT();
  const [q, setQ] = useState(() => load('fw.bible.search', ''));
  const [scope, setScope] = useState<'all' | 'ot' | 'nt' | 'book'>('all');
  const [asked, setAsked] = useState<{ q: string; scope: string } | null>(null);
  const [onlyBook, setOnlyBook] = useState<string | null>(null);
  const res = useApi(() => (asked ? PublicApi.bibleSearch(tr, asked.q, asked.scope || undefined) : Promise.resolve(null)), [tr, asked?.q, asked?.scope]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim().length < 2) return;
    save('fw.bible.search', q.trim());
    setOnlyBook(null);
    setAsked({ q: q.trim(), scope: scope === 'all' ? '' : scope === 'book' ? book : scope });
  };
  const terms = useMemo(() => {
    const out: string[] = [];
    const rest = (asked?.q ?? '').replace(/"([^"]+)"/g, (_, p: string) => { out.push(p.trim()); return ' '; });
    return out.concat(rest.split(/[\s,;.!?]+/).filter(Boolean));
  }, [asked?.q]);
  const shown = (res.data?.results ?? []).filter((h) => !onlyBook || h.book === onlyBook);
  return (
    <Modal title={t('bibleSearchTitle')} onClose={onClose} wide>
      <div className="stack">
        <form className="row" style={{ gap: 6 }} onSubmit={submit}>
          <input className="input grow" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('bibleSearchHint')} aria-label={t('bibleSearchTitle')} />
          <button className="btn primary"><Search size={15} /></button>
        </form>
        <Segmented value={scope} onChange={setScope} options={[{ value: 'all', label: t('bibleWhole') }, { value: 'ot', label: t('bibleOT') }, { value: 'nt', label: t('bibleNT') }, { value: 'book', label: `${t('bibleThisBook')} · ${bookName(names, book)}` }]} />
        {!asked ? <p className="small muted">{t('bibleSearchFirst')}</p> : res.error ? <ErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Loading /> : (
          <div className="stack" style={{ gap: 8 }}>
            {res.data.reference && (
              <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => onOpen(res.data!.reference!.book, res.data!.reference!.chapter, res.data!.reference!.verse)}>
                <ArrowRight size={14} /> {t('bibleGoTo', { ref: `${bookName(names, res.data.reference.book)} ${res.data.reference.chapter}${res.data.reference.verse ? `:${res.data.reference.verse}` : ''}` })}
              </button>
            )}
            {!res.data.total ? <p className="muted">{t('bibleNoResults')}</p> : (
              <>
                <p className="small muted">{t('bibleResults', { count: String(res.data.total) })}{res.data.total > res.data.results.length ? ` ${t('bibleResultsMore')}` : ''}</p>
                {res.data.books.length > 1 && (
                  <div className="row wrap" style={{ gap: 4 }}>
                    {res.data.books.map((b) => (
                      <button key={b.book} className={`bib-chip ${onlyBook === b.book ? 'on' : ''}`} onClick={() => setOnlyBook(onlyBook === b.book ? null : b.book)}>{bookName(names, b.book)} {b.count}</button>
                    ))}
                  </div>
                )}
                <div className="stack" style={{ gap: 6 }}>
                  {shown.map((h: BibleHit) => (
                    <button key={`${h.book}${h.chapter}:${h.verse}`} className="bib-tr bib-hit" onClick={() => onOpen(h.book, h.chapter, h.verse)}>
                      <b>{bookName(names, h.book)} {h.chapter}:{h.verse}</b>
                      <span><Marked text={h.text} terms={terms} /></span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** "See also" verses for one verse (Treasury of Scripture Knowledge), with their words in this Bible. */
function SeeAlso({ tr, book, chapter, verse, names, onClose, onOpen }: { tr: string; book: string; chapter: number; verse: number; names: BibleBookInfo[] | null; onClose: () => void; onOpen: (book: string, chapter: number, verse: number) => void }) {
  const { t } = useT();
  const res = useApi(() => PublicApi.bibleRefs(tr, book, chapter, verse), [tr, book, chapter, verse]);
  const label = (r: BibleCrossRef) => `${bookName(names, r.book)} ${r.chapter}:${r.verse}${r.endChapter !== r.chapter ? `–${r.endChapter}:${r.endVerse}` : r.endVerse !== r.verse ? `–${r.endVerse}` : ''}`;
  return (
    <Modal title={`${t('bibleSeeAlso')} · ${bookName(names, book)} ${chapter}:${verse}`} onClose={onClose} wide>
      {res.error ? <ErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Loading /> : !res.data.refs.length ? <p className="muted">{t('bibleSeeAlsoNone')}</p> : (
        <div className="stack" style={{ gap: 6 }}>
          {res.data.refs.map((r) => (
            <button key={`${r.book}${r.chapter}:${r.verse}`} className="bib-tr bib-hit" onClick={() => onOpen(r.book, r.chapter, r.verse)}>
              <b>{label(r)}</b>
              {r.text && <span>{r.text}</span>}
            </button>
          ))}
          <p className="small muted">{res.data.source}</p>
        </div>
      )}
    </Modal>
  );
}
