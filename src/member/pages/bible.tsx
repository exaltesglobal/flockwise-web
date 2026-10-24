// The Bible in the member app: any of 1,100 free Bibles (every Indian Revised Version, English and
// about 890 more languages), book and chapter pickers, headings and poetry as printed, footnotes, a
// second translation side by side, and a tap on a verse to copy it or send it on WhatsApp.
// Opens at ?tr=hin2017&ref=John 3:16 from reading plans and shared links; otherwise where they left off.
import { ArrowLeft, ArrowRight, Bookmark, BookOpen, Check, ChevronDown, Columns2, Copy, Highlighter, ImageIcon, Languages, Link2, MapPinned, Sigma, Minus, NotebookPen, Pause, Plus, ScrollText, Search, Share2, StickyNote, Volume2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';

import { memberSession } from '@/api/client';
import { MemberApi, PublicApi } from '@/api/endpoints';
import { BOOKS } from '@/core/bible';
import { BOOK_CODES, FEATURED_BIBLES, parseReference } from '@/core/bible-texts';
import type { BrandKit, BibleBookInfo, BibleChapter, BibleCrossRef, BibleHit, BibleMark, BibleMarkColor, BibleTranslationInfo, BibleVerse } from '@/core/types';
import { ErrorState, Loading, Modal, Segmented, useToast } from '@/components/ui';
import { useT } from '@/i18n';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/use-api';
import { shareCard } from '@/lib/invitation';
import { renderVerseCard, type VerseCardStyle } from '@/lib/verse-card';

import { BibleAtlas } from '../bible-atlas';
import { LiveVerseCard } from '../live-verse';

/** `more`: up to three other Bibles shown beside the main one. */
type Place = { tr: string; more: string[]; book: string; chapter: number };

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
    const saved = load<Place & { tr2?: string | null }>('fw.bible.place', { tr: startTr, more: [], book: 'JHN', chapter: 1 });
    saved.more = (saved.more ?? (saved.tr2 ? [saved.tr2] : [])).slice(0, 3);
    delete saved.tr2;
    const ref = params.get('ref');
    const p = ref ? parseReference(ref) : null;
    return { ...saved, tr: params.get('tr') || saved.tr, ...(p ? { book: BOOK_CODES[p.book], chapter: p.chapter } : {}) };
  });
  const [mark, setMark] = useState<number | null>(() => { const p = parseReference(params.get('ref') ?? ''); return p?.from ?? null; });
  const [size, setSize] = useState(() => load('fw.bible.size', 18));
  const [picker, setPicker] = useState<null | 'tr' | 'add' | 'book' | 'marks' | 'search'>(null);
  const [seeAlso, setSeeAlso] = useState<number | null>(null);
  const [study, setStudy] = useState<number | null>(null);
  const [notes, setNotes] = useState<number | null>(null);
  const [atlas, setAtlas] = useState(false);
  const toast = useToast();
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
  const ch = useApi(() => PublicApi.bibleChapter(place.tr, place.book, place.chapter), [place.tr, place.book, place.chapter]);
  const others = useApi(() => Promise.all(place.more.map((id) => PublicApi.bibleChapter(id, place.book, place.chapter).catch(() => null))), [place.more.join(','), place.book, place.chapter]);
  const books = useApi(() => PublicApi.bibleBooks(place.tr), [place.tr]);
  const marks = useApi(() => MemberApi.bibleMarks(place.book, place.chapter), [place.book, place.chapter]);
  const markMap = useMemo(() => new Map((marks.data ?? []).map((m) => [m.verse, m])), [marks.data]);
  const saveMark = async (verse: number, patch: MarkPatch) => {
    const { mark: m } = await MemberApi.bibleMark(place.book, place.chapter, verse, patch);
    marks.setData([...(marks.data ?? []).filter((x) => x.verse !== verse), ...(m ? [m] : [])]);
  };
  const sc = session?.church;
  const church = useMemo(() => (sc ? { name: sc.name, logoUrl: sc.logoUrl ?? null, brand: sc.brand ?? null } : null), [sc]);
  const aloud = useReadAloud(ch.data ?? null, () => toast(t('bibleNoVoice')));
  const title = ch.data ? `${ch.data.bookName} ${ch.data.chapter}` : `${books.data?.find((b) => b.code === place.book)?.name ?? place.book} ${place.chapter}`;

  return (
    <>
      <div className="bib-bar">
        <button className="btn sm" onClick={() => setPicker('book')}><BookOpen size={15} /> <b>{title}</b> <ChevronDown size={14} /></button>
        <button className="btn sm" onClick={() => setPicker('tr')} title={t('bibleTranslation')}><Languages size={15} /> {tr ? `${tr.native} · ${shortName(tr)}` : place.tr}</button>
        {!place.more.length ? <button className="btn sm" onClick={() => setPicker('add')} title={t('bibleCompare')}><Columns2 size={15} /> <span className="bib-hide-sm">{t('bibleCompare')}</span></button> : (
          <>
            {place.more.map((id) => { const x = info(id); return <button key={id} className="btn sm primary" onClick={() => go({ more: place.more.filter((m) => m !== id) })} title={t('bibleCompareRemove')}><Columns2 size={15} /> {x ? shortName(x) : id} <X size={13} /></button>; })}
            {place.more.length < 3 && <button className="btn sm ghost icon" onClick={() => setPicker('add')} aria-label={t('bibleCompareAdd')} title={t('bibleCompareAdd')}><Plus size={15} /></button>}
          </>
        )}
        <button className="btn sm ghost" onClick={() => setPicker('search')} title={t('bibleSearchTitle')}><Search size={15} /> <span className="bib-hide-sm">{t('bibleSearchTitle')}</span></button>
        {aloud.supported && <button className={`btn sm ${aloud.on ? 'primary' : 'ghost'}`} onClick={aloud.toggle} title={aloud.on ? t('bibleStop') : t('bibleListen')}>{aloud.on ? <Pause size={15} /> : <Volume2 size={15} />} <span className="bib-hide-sm">{aloud.on ? t('bibleStop') : t('bibleListen')}</span></button>}
        <button className="btn sm ghost" onClick={() => setNotes(0)} title={t('bibleCommentary')}><ScrollText size={15} /> <span className="bib-hide-sm">{t('bibleCommentary')}</span></button>
        <button className="btn sm ghost" onClick={() => setAtlas(true)} title={t('bibleAtlas')}><MapPinned size={15} /> <span className="bib-hide-sm">{t('bibleAtlas')}</span></button>
        <button className="btn sm ghost" onClick={() => setPicker('marks')} title={t('bibleMarks')}><NotebookPen size={15} /> <span className="bib-hide-sm">{t('bibleMarks')}</span></button>
        <span className="grow" />
        <div className="row" style={{ gap: 2 }} aria-label={t('bibleTextSize')}>
          <button className="btn sm ghost icon" onClick={() => setSize((s) => Math.max(14, s - 2))} aria-label={`${t('bibleTextSize')} −`}><Minus size={14} /></button>
          <button className="btn sm ghost icon" onClick={() => setSize((s) => Math.min(30, s + 2))} aria-label={`${t('bibleTextSize')} +`}><Plus size={14} /></button>
        </div>
      </div>

      <LiveVerseCard />
      {ch.error ? <ErrorState error={ch.error} onRetry={ch.reload} /> : !ch.data ? <Loading /> : (
        <Reader ch={ch.data} others={(others.data ?? []).filter((x): x is BibleChapter => !!x)} size={size} mark={mark} setMark={setMark} marks={markMap} onMark={saveMark} onSeeAlso={setSeeAlso} onStudy={setStudy} onCommentary={setNotes} reading={aloud.verse} church={church} />
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
      {study !== null && <WordStudy book={place.book} chapter={place.chapter} verse={study} names={books.data} onClose={() => setStudy(null)} onOpen={(book, chapter, verse) => { setStudy(null); go({ book, chapter }); setMark(verse); }} />}
      {notes !== null && <Commentary book={place.book} chapter={place.chapter} verse={notes || null} title={title} onClose={() => setNotes(null)} />}
      {atlas && <BibleAtlas book={place.book} chapter={place.chapter} title={title} onClose={() => setAtlas(false)} onOpen={(book, chapter, verse) => { setAtlas(false); go({ book, chapter }); setMark(verse); }} />}
      {picker === 'marks' && <MarksList onClose={() => setPicker(null)} onOpen={(m) => { go({ book: m.book, chapter: m.chapter }); setMark(m.verse); setPicker(null); }} />}
      {(picker === 'tr' || picker === 'add') && (
        <TranslationPicker all={all} featured={list.data?.featured ?? FEATURED_BIBLES.map((b) => b.id)} current={picker === 'tr' ? place.tr : null} myLang={session?.member.language ?? lang}
          onClose={() => setPicker(null)} onPick={(id) => { go(picker === 'tr' ? { tr: id } : { more: [...place.more.filter((m) => m !== id), id].slice(0, 3) }); setPicker(null); }} />
      )}
    </>
  );
}

function Reader({ ch, others, reading, church, size, mark, setMark, marks, onMark, onSeeAlso, onStudy, onCommentary }: { ch: BibleChapter; others: BibleChapter[]; reading: number | null; church: { name: string; logoUrl: string | null; brand?: BrandKit | null } | null; size: number; mark: number | null; setMark: (n: number | null) => void; marks: Map<number, BibleMark>; onMark: (verse: number, patch: MarkPatch) => Promise<void>; onSeeAlso: (verse: number) => void; onStudy: (verse: number) => void; onCommentary: (verse: number) => void }) {
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
  const [image, setImage] = useState(false);
  const markClass = (n: number) => { const m = marks.get(n); return `${m?.color ? ` hl-${m.color}` : ''}${reading === n ? ' bib-reading' : ''}`; };
  const markIcons = (n: number) => { const m = marks.get(n); return m && (m.bookmark || m.note) ? <span className="bib-icons">{m.bookmark && <Bookmark size={12} />}{m.note && <StickyNote size={12} />}</span> : null; };
  const byVerse = useMemo(() => others.map((o) => new Map(o.verses.map((v) => [v.n, v]))), [others]);
  const cols = others.length > 0;

  return (
    <article className={`bib-read ${cols ? 'bib-two' : ''} ${others.length > 1 ? 'bib-many' : ''}`} style={{ fontSize: size, ['--cols' as string]: 1 + others.length }}>
      <h1 className="bib-title" dir={ch.translation.rtl ? 'rtl' : undefined}>{ch.bookName} {ch.chapter}</h1>
      {cols && <div className="bib-cols bib-colhead small muted"><span>{shortName(ch.translation)}</span>{others.map((o) => <span key={o.translation.id}>{shortName(o.translation)}</span>)}</div>}
      {ch.intro && <p className="bib-intro">{ch.intro}</p>}
      {cols ? (
        ch.verses.map((v) => (
          <div key={v.n} className={`bib-cols ${mark === v.n ? 'on' : ''}${markClass(v.n)}`} id={`v${v.n}`} onClick={() => setMark(mark === v.n ? null : v.n)}>
            <VerseText v={v} rtl={ch.translation.rtl} icons={markIcons(v.n)} />
            {others.map((o, i) => { const w = byVerse[i].get(v.n); return <div key={o.translation.id} className="bib-alt" data-tr={shortName(o.translation)}>{w && <VerseText v={w} rtl={o.translation.rtl} />}</div>; })}
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
      <p className="small muted bib-source">{ch.source}{others.map((o) => <span key={o.translation.id}><br />{o.source}</span>)}</p>

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
            <button className="btn sm" onClick={() => onStudy(verse.n)}><Sigma size={14} /> {t('bibleWordStudy')}</button>
            <button className="btn sm" onClick={() => onCommentary(verse.n)}><ScrollText size={14} /> {t('bibleCommentary')}</button>
            <button className="btn sm" onClick={() => setImage(true)}><ImageIcon size={14} /> {t('bibleImage')}</button>
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
      {image && verse && church && <VerseImage church={church} text={verse.text} reference={`${ch.bookName} ${ch.chapter}:${verse.label ?? verse.n}`} translation={shortName(ch.translation)} onClose={() => setImage(false)} />}
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
  // The first search in a Bible downloads it on the server; poll until it is ready instead of one long wait.
  const [ready, setReady] = useState<boolean | string>(false);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => PublicApi.bibleReady(tr).then((r) => { if (stop) return; if (r.ready) setReady(true); else if (r.failed) setReady(r.failed); else timer = setTimeout(check, 3000); }, (e: Error) => !stop && setReady(e.message));
    setReady(false);
    void check();
    return () => { stop = true; clearTimeout(timer); };
  }, [tr]);
  const res = useApi(() => (asked && ready === true ? PublicApi.bibleSearch(tr, asked.q, asked.scope || undefined) : Promise.resolve(null)), [tr, asked?.q, asked?.scope, ready]);
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
        {typeof ready === 'string' ? <p className="small" style={{ color: 'var(--danger)' }}>{ready}</p> : !ready && <p className="small muted row" style={{ gap: 8 }}><span className="spinner" aria-hidden style={{ width: 14, height: 14, flex: "none" }} /> {t('bibleSearchFirst')}</p>}
        {!asked || ready !== true ? null : res.error ? <ErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Loading /> : (
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

/** A classic commentary on the chapter, opened at the note that covers the chosen verse. The choice is remembered. */
function Commentary({ book, chapter, verse, title, onClose }: { book: string; chapter: number; verse: number | null; title: string; onClose: () => void }) {
  const { t } = useT();
  const nt = (BOOK_CODES as readonly string[]).indexOf(book) > 38;
  const list = useApi(() => PublicApi.commentaries(), []);
  const usable = (list.data ?? []).filter((c) => (nt ? c.nt : c.ot));
  const [pick, setPick] = useState(() => load('fw.bible.commentary', 'matthew-henry'));
  const id = usable.some((c) => c.id === pick) || !usable.length ? pick : usable[0].id;
  const res = useApi(() => PublicApi.commentary(id, book, chapter), [id, book, chapter]);
  const [intro, setIntro] = useState(false);
  const here = useRef<HTMLDivElement>(null);
  // A note starts at its verse and runs to the next note, so the one for verse 16 may begin at 1.
  const at = verse && res.data ? [...res.data.notes].reverse().find((n) => n.verse <= verse)?.verse ?? null : null;
  useEffect(() => { here.current?.scrollIntoView({ block: 'start' }); }, [res.data, at]);
  const choose = (v: string) => { setPick(v); save('fw.bible.commentary', v); };
  return (
    <Modal title={`${t('bibleCommentary')} · ${title}${verse ? `:${verse}` : ''}`} onClose={onClose} wide>
      <div className="stack" style={{ gap: 10 }}>
        <div className="bib-cm-pick">
          <select className="input" value={id} onChange={(e) => choose(e.target.value)} aria-label={t('bibleCommentary')}>
            {usable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {res.error ? <ErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Loading /> : (
          <>
            {res.data.intro && (
              <div className="bib-cm-intro">
                <button className="btn sm ghost" onClick={() => setIntro((o) => !o)}><ChevronDown size={14} style={{ transform: intro ? 'rotate(180deg)' : undefined }} /> {t('bibleCommentaryIntro')}</button>
                {intro && <div className="bib-cm-text">{res.data.intro}</div>}
              </div>
            )}
            {!res.data.notes.length ? <p className="muted">{t('bibleCommentaryNone')}</p> : res.data.notes.map((n, i) => {
              const end = res.data!.notes[i + 1]?.verse;
              return (
                <div key={n.verse} ref={n.verse === at ? here : undefined} className={`bib-cm-note ${n.verse === at ? 'on' : ''}`}>
                  <b className="small">{t('bibleCommentaryVerse', { n: end && end - 1 > n.verse ? `${n.verse}–${end - 1}` : String(n.verse) })}</b>
                  <div className="bib-cm-text">{n.text}</div>
                </div>
              );
            })}
            <p className="small muted">{t('bibleCommentaryEnglish')} {res.data.source}</p>
          </>
        )}
      </div>
    </Modal>
  );
}

/** The Greek or Hebrew behind a verse; tap a word for its dictionary entry and every verse that uses it. */
function WordStudy({ book, chapter, verse, names, onClose, onOpen }: { book: string; chapter: number; verse: number; names: BibleBookInfo[] | null; onClose: () => void; onOpen: (book: string, chapter: number, verse: number) => void }) {
  const { t } = useT();
  const res = useApi(() => PublicApi.bibleWords(book, chapter, verse), [book, chapter, verse]);
  const [strong, setStrong] = useState<string | null>(null);
  const hebrew = res.data?.language === 'hebrew';
  return (
    <Modal title={`${t('bibleWordStudy')} · ${bookName(names, book)} ${chapter}:${verse}`} onClose={onClose} wide>
      {strong ? <StrongsView id={strong} names={names} onBack={() => setStrong(null)} onOpen={onOpen} /> : res.error ? <ErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Loading /> : !res.data.words.length ? <p className="muted">{t('bibleWordNone')}</p> : (
        <div className="stack" style={{ gap: 8 }}>
          <div className="bib-words" dir={hebrew ? 'rtl' : undefined}>
            {res.data.words.map((w, i) => (
              <button key={i} className="bib-word" onClick={() => w.strong && setStrong(w.strong)} disabled={!w.strong}>
                <span className={`bib-orig ${hebrew ? 'he' : 'gr'}`} lang={hebrew ? 'he' : 'grc'}>{w.word}</span>
                <span className="small muted" dir="ltr">{w.translit}</span>
                <b className="small" dir="ltr">{w.gloss}</b>
              </button>
            ))}
          </div>
          <p className="small muted">{res.data.source}</p>
        </div>
      )}
    </Modal>
  );
}

function StrongsView({ id, names, onBack, onOpen }: { id: string; names: BibleBookInfo[] | null; onBack: () => void; onOpen: (book: string, chapter: number, verse: number) => void }) {
  const { t } = useT();
  const res = useApi(() => PublicApi.strongs(id), [id]);
  const [onlyBook, setOnlyBook] = useState<string | null>(null);
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const { entry } = res.data;
  const shown = res.data.uses.filter((u) => !onlyBook || u.book === onlyBook);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={onBack}><ArrowLeft size={14} /> {t('bibleWordBack')}</button>
      <div className="row wrap" style={{ gap: 10, alignItems: 'baseline' }}>
        <span className={`bib-orig big ${entry.language === 'hebrew' ? 'he' : 'gr'}`}>{entry.lemma}</span>
        <span className="muted">{entry.translit}</span>
        <b>{entry.gloss}</b>
        <span className="small muted">{entry.strong}</span>
      </div>
      {entry.definition && <p className="small bib-def">{entry.definition}</p>}
      <b className="small">{t('bibleWordUses', { count: String(res.data.total) })}</b>
      {res.data.books.length > 1 && (
        <div className="row wrap" style={{ gap: 4 }}>
          {res.data.books.map((b) => <button key={b.book} className={`bib-chip ${onlyBook === b.book ? 'on' : ''}`} onClick={() => setOnlyBook(onlyBook === b.book ? null : b.book)}>{bookName(names, b.book)} {b.count}</button>)}
        </div>
      )}
      <div className="row wrap" style={{ gap: 6 }}>
        {shown.map((u) => <button key={`${u.book}${u.chapter}:${u.verse}`} className="bib-chip" onClick={() => onOpen(u.book, u.chapter, u.verse)} title={u.gloss}>{bookName(names, u.book)} {u.chapter}:{u.verse}</button>)}
      </div>
      <p className="small muted">{res.data.source}</p>
    </div>
  );
}

/** BCP 47 tags for the phone's voices, from eBible's language codes. */
const VOICE_LANG: Record<string, string> = { eng: 'en-IN', hin: 'hi-IN', tel: 'te-IN', tam: 'ta-IN', mal: 'ml-IN', kan: 'kn-IN', ben: 'bn-IN', mar: 'mr-IN', guj: 'gu-IN', pan: 'pa-IN', ory: 'or-IN', asm: 'as-IN', urd: 'ur-IN', npi: 'ne-NP', mya: 'my-MM', sin: 'si-LK', spa: 'es-ES', fra: 'fr-FR', por: 'pt-BR', deu: 'de-DE', ind: 'id-ID', swh: 'sw-KE', arb: 'ar-SA', zho: 'zh-CN', cmn: 'zh-CN', kor: 'ko-KR', jpn: 'ja-JP', rus: 'ru-RU', tha: 'th-TH', vie: 'vi-VN', tgl: 'fil-PH' };

/** Reads the chapter aloud with the phone's own voice, verse by verse, marking the verse being read. */
function useReadAloud(ch: BibleChapter | null, onNoVoice: () => void) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [on, setOn] = useState(false);
  const [verse, setVerse] = useState<number | null>(null);
  const stop = () => { if (supported) window.speechSynthesis.cancel(); setOn(false); setVerse(null); };
  useEffect(() => stop, [ch?.translation.id, ch?.book, ch?.chapter]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = () => {
    if (!ch || !supported) return;
    const tag = VOICE_LANG[ch.translation.lang] ?? ch.translation.lang.slice(0, 2);
    const base = tag.split('-')[0];
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((v) => v.lang.replace('_', '-') === tag) ?? voices.find((v) => v.lang.toLowerCase().startsWith(base));
    if (voices.length && !voice) { onNoVoice(); return; }
    window.speechSynthesis.cancel();
    setOn(true);
    ch.verses.forEach((v, i) => {
      const u = new SpeechSynthesisUtterance(v.text.replace(/\n/g, ' '));
      u.lang = voice?.lang ?? tag;
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.onstart = () => { setVerse(v.n); document.getElementById(`v${v.n}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
      if (i === ch.verses.length - 1) u.onend = () => { setOn(false); setVerse(null); };
      window.speechSynthesis.speak(u);
    });
  };
  return { supported, on, verse, toggle: () => (on ? stop() : start()) };
}

/** The verse as a picture in the church's colours, to share on WhatsApp or Instagram. */
function VerseImage({ church, text, reference, translation, onClose }: { church: { name: string; logoUrl: string | null; brand?: BrandKit | null }; text: string; reference: string; translation: string; onClose: () => void }) {
  const { t } = useT();
  const [shape, setShape] = useState<'square' | 'story'>('square');
  const [style, setStyle] = useState<VerseCardStyle>('brand');
  const [url, setUrl] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let live = true;
    void renderVerseCard({ church, text, reference, translation, shape, style }).then((c) => { if (live) { canvas.current = c; setUrl(c.toDataURL('image/png')); } });
    return () => { live = false; };
  }, [church, text, reference, translation, shape, style]);
  return (
    <Modal title={t('bibleImage')} onClose={onClose}>
      <div className="stack" style={{ gap: 10 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <Segmented value={shape} options={[{ value: 'square', label: t('bibleImageSquare') }, { value: 'story', label: t('bibleImageStory') }]} onChange={setShape} />
          <span className="row" style={{ gap: 6 }} aria-label={t('bibleImageStyle')}>
            {(['brand', 'light', 'dark'] as VerseCardStyle[]).map((s) => <button key={s} className={`bib-swatch sw-${s} ${style === s ? 'on' : ''}`} onClick={() => setStyle(s)} aria-label={s} aria-pressed={style === s} />)}
          </span>
        </div>
        <div className="bib-card-preview">{url ? <img src={url} alt={`${reference}: ${text}`} /> : <Loading />}</div>
        <button className="btn primary" disabled={!url} onClick={() => canvas.current && void shareCard(canvas.current, `${reference.replace(/[^\w]+/g, '-')}.png`, `${text}\n${reference}`)}><Share2 size={15} /> {t('bibleImageShare')}</button>
      </div>
    </Modal>
  );
}
