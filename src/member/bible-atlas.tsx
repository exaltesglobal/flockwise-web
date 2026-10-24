// People & places beside the Bible reader: who, where and what happens in the open chapter, a page
// for each person (family, places, events, verses) and place (with a map), Easton's dictionary and
// a timeline of the whole story. Every link opens the verse in the reader.
import { ArrowLeft, CalendarRange, ExternalLink, MapPin, Search, User } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { PublicApi } from '@/api/endpoints';
import type { AtlasName, AtlasRef } from '@/core/types';
import { ErrorState, Loading, Modal, Segmented } from '@/components/ui';
import { useT } from '@/i18n';
import { useApi } from '@/lib/use-api';

type View = { kind: 'person' | 'place' | 'term'; id: string };
type Tab = 'chapter' | 'dictionary' | 'timeline';
type Open = (book: string, chapter: number, verse: number) => void;

const openRef = (key: string, onOpen: Open) => { const [b, c, v] = key.split('.'); onOpen(b, Number(c), Number(v)); };
const paras = (s: string) => s.split(/\n{2,}/).filter(Boolean);

function useYear() {
  const { t } = useT();
  return (y: number | null) => (y === null ? '' : y < 0 ? t('bibleAtlasBC', { n: String(-y) }) : t('bibleAtlasAD', { n: String(y || 1) }));
}

export function BibleAtlas({ book, chapter, title, onClose, onOpen }: { book: string; chapter: number; title: string; onClose: () => void; onOpen: Open }) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('chapter');
  const [stack, setStack] = useState<View[]>([]);
  const view = stack[stack.length - 1];
  const push = (v: View) => setStack((s) => [...s, v]);
  const back = () => setStack((s) => s.slice(0, -1));
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { body.current?.scrollIntoView({ block: 'start' }); }, [view]);

  return (
    <Modal title={`${t('bibleAtlas')} · ${title}`} onClose={onClose} wide>
      <div className="stack at-body" style={{ gap: 12 }} ref={body}>
        {view ? (
          <>
            <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} onClick={back}><ArrowLeft size={14} /> {t('bibleAtlasBack')}</button>
            {view.kind === 'person' ? <PersonView slug={view.id} push={push} onOpen={onOpen} /> : view.kind === 'place' ? <PlaceView slug={view.id} onOpen={onOpen} /> : <TermView term={view.id} push={push} />}
          </>
        ) : (
          <>
            <Segmented value={tab} onChange={setTab} options={[{ value: 'chapter', label: t('bibleAtlasChapter') }, { value: 'dictionary', label: t('bibleAtlasDictionary') }, { value: 'timeline', label: t('bibleAtlasTimeline') }]} />
            {tab === 'chapter' ? <ChapterView book={book} chapter={chapter} push={push} onOpen={onOpen} /> : tab === 'dictionary' ? <DictionaryView push={push} /> : <TimelineView book={book} chapter={chapter} push={push} onOpen={onOpen} />}
          </>
        )}
      </div>
    </Modal>
  );
}

function Source({ text, english }: { text: string; english?: boolean }) {
  const { t } = useT();
  return <p className="small muted">{english && `${t('bibleAtlasEnglish')} `}{text}</p>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="stack" style={{ gap: 6 }}><h3 className="at-h">{title}</h3>{children}</section>;
}

function Names({ list, kind, push }: { list: AtlasName[]; kind: 'person' | 'place'; push: (v: View) => void }) {
  return <div className="row wrap" style={{ gap: 6 }}>{list.map((n) => <button key={n.slug} className="bib-chip" onClick={() => push({ kind, id: n.slug })}>{n.name}</button>)}</div>;
}

function Refs({ refs, onOpen }: { refs: AtlasRef[]; onOpen: Open }) {
  return <div className="row wrap" style={{ gap: 6 }}>{refs.map((r) => <button key={r.key} className="bib-chip" onClick={() => openRef(r.key, onOpen)}>{r.label}</button>)}</div>;
}

function ChapterView({ book, chapter, push, onOpen }: { book: string; chapter: number; push: (v: View) => void; onOpen: Open }) {
  const { t } = useT();
  const year = useYear();
  const res = useApi(() => PublicApi.chapterAtlas(book, chapter), [book, chapter]);
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const d = res.data;
  const verse = (n: number) => onOpen(book, chapter, n);
  const verses = (list: number[]) => (
    <span className="row wrap at-vs" style={{ gap: 4 }}>
      {list.slice(0, 8).map((n) => <button key={n} className="at-v" onClick={() => verse(n)} aria-label={t('bibleAtlasVerses', { n: String(n) })}>{n}</button>)}
      {list.length > 8 && <span className="small muted">+{list.length - 8}</span>}
    </span>
  );
  if (!d.people.length && !d.places.length && !d.events.length) return <><p className="muted">{t('bibleAtlasNone')}</p><Source text={d.source} /></>;
  return (
    <>
      {d.events.length > 0 && (
        <Section title={t('bibleAtlasEvents')}>
          {d.events.map((e) => <div key={e.id} className="at-row"><CalendarRange size={15} className="muted" /><span className="grow"><b>{e.title}</b></span>{e.year !== null && <span className="small muted">{year(e.year)}</span>}</div>)}
        </Section>
      )}
      {d.people.length > 0 && (
        <Section title={`${t('bibleAtlasPeople')} (${d.people.length})`}>
          {d.people.map((p) => (
            <div key={p.slug} className="at-row">
              <User size={15} className="muted" />
              <button className="at-link grow" onClick={() => push({ kind: 'person', id: p.slug })}><b>{p.name}</b>{p.summary && <span className="small muted at-sum">{p.summary}</span>}</button>
              {verses(p.verses)}
            </div>
          ))}
        </Section>
      )}
      {d.places.length > 0 && (
        <Section title={`${t('bibleAtlasPlaces')} (${d.places.length})`}>
          {d.places.map((p) => (
            <div key={p.slug} className="at-row">
              <MapPin size={15} className="muted" />
              <button className="at-link grow" onClick={() => push({ kind: 'place', id: p.slug })}><b>{p.name}</b>{p.type && <span className="small muted at-sum">{p.type}</span>}</button>
              {verses(p.verses)}
            </div>
          ))}
        </Section>
      )}
      <p className="small muted">{t('bibleAtlasDates')}</p>
      <Source text={d.source} />
    </>
  );
}

function PersonView({ slug, push, onOpen }: { slug: string; push: (v: View) => void; onOpen: Open }) {
  const { t } = useT();
  const year = useYear();
  const res = useApi(() => PublicApi.biblePerson(slug), [slug]);
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const p = res.data;
  const family: [string, AtlasName[]][] = [[t('bibleAtlasFather'), p.father], [t('bibleAtlasMother'), p.mother], [t('bibleAtlasSpouse'), p.partners], [t('bibleAtlasSiblings'), p.siblings], [t('bibleAtlasChildren'), p.children]];
  const life = [p.born !== null && `${t('bibleAtlasBorn')} ${year(p.born)}`, p.died !== null && `${t('bibleAtlasDied')} ${year(p.died)}`].filter(Boolean).join(' · ');
  return (
    <>
      <div>
        <h2 className="at-title">{p.name}</h2>
        <div className="small muted">{[life, (p.verseCount === 1 ? t('bibleAtlasMentionedOne') : t('bibleAtlasMentioned', { n: String(p.verseCount) }))].filter(Boolean).join(' · ')}</div>
      </div>
      {family.some(([, l]) => l.length) && (
        <dl className="at-family">
          {family.filter(([, l]) => l.length).map(([label, l]) => <div key={label}><dt className="small muted">{label}</dt><dd><Names list={l} kind="person" push={push} /></dd></div>)}
          {p.birthPlace && <div><dt className="small muted">{t('bibleAtlasBorn')}</dt><dd><Names list={[p.birthPlace]} kind="place" push={push} /></dd></div>}
          {p.deathPlace && <div><dt className="small muted">{t('bibleAtlasDied')}</dt><dd><Names list={[p.deathPlace]} kind="place" push={push} /></dd></div>}
        </dl>
      )}
      {p.text && <div className="at-text">{paras(p.text).map((x, i) => <p key={i}>{x}</p>)}</div>}
      {p.refs.length > 0 && <Section title={t('bibleAtlasRead')}><Refs refs={p.refs} onOpen={onOpen} /></Section>}
      {p.events.length > 0 && <Section title={t('bibleAtlasEvents')}>{p.events.map((e) => <div key={e.id} className="at-row small"><span className="at-year">{year(e.year)}</span><span className="grow">{e.title}</span></div>)}</Section>}
      <Source text={p.source} english />
    </>
  );
}

function PlaceView({ slug, onOpen }: { slug: string; onOpen: Open }) {
  const { t } = useT();
  const year = useYear();
  const res = useApi(() => PublicApi.biblePlace(slug), [slug]);
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const p = res.data;
  const at = p.lat !== null && p.lon !== null ? { lat: p.lat, lon: p.lon } : null;
  const box = at && [at.lon - 0.6, at.lat - 0.4, at.lon + 0.6, at.lat + 0.4].map((n) => n.toFixed(4)).join(',');
  return (
    <>
      <div>
        <h2 className="at-title">{p.name}</h2>
        <div className="small muted">{[p.type, p.subtype && p.subtype !== p.type ? p.subtype : null, (p.verseCount === 1 ? t('bibleAtlasMentionedOne') : t('bibleAtlasMentioned', { n: String(p.verseCount) }))].filter(Boolean).join(' · ')}</div>
      </div>
      {at ? (
        <div className="stack" style={{ gap: 6 }}>
          <iframe className="at-map" title={p.name} loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${box}&layer=mapnik&marker=${at.lat},${at.lon}`} />
          <a className="small row" style={{ gap: 4 }} href={`https://www.google.com/maps/search/?api=1&query=${at.lat},${at.lon}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> {t('bibleAtlasMap')}</a>
        </div>
      ) : <p className="small muted">{t('bibleAtlasNoMap')}</p>}
      {p.comment && <p className="small">{p.comment}</p>}
      {p.otherNames.length > 0 && <p className="small"><span className="muted">{t('bibleAtlasAlso')}:</span> {p.otherNames.join(', ')}</p>}
      {p.text && <div className="at-text">{paras(p.text).map((x, i) => <p key={i}>{x}</p>)}</div>}
      {p.refs.length > 0 && <Section title={t('bibleAtlasRead')}><Refs refs={p.refs} onOpen={onOpen} /></Section>}
      {p.events.length > 0 && <Section title={t('bibleAtlasEvents')}>{p.events.map((e) => <div key={e.id} className="at-row small"><span className="at-year">{year(e.year)}</span><span className="grow">{e.title}</span></div>)}</Section>}
      <Source text={p.source} english />
    </>
  );
}

function DictionaryView({ push }: { push: (v: View) => void }) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const [asked, setAsked] = useState('');
  useEffect(() => { const h = setTimeout(() => setAsked(q.trim()), 300); return () => clearTimeout(h); }, [q]);
  const res = useApi(() => (asked.length >= 2 ? PublicApi.dictionarySearch(asked) : Promise.resolve([])), [asked]);
  return (
    <>
      <label className="at-search">
        <Search size={15} className="muted" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('bibleAtlasSearch')} aria-label={t('bibleAtlasSearch')} />
      </label>
      {asked.length >= 2 && (res.error ? <ErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Loading /> : !res.data.length ? <p className="muted">{t('bibleAtlasNoHits')}</p> : (
        <div className="stack" style={{ gap: 6 }}>
          {res.data.map((h) => (
            <button key={h.term} className="bib-tr" onClick={() => push({ kind: 'term', id: h.term })}>
              <b>{h.term}{h.senses > 1 && <span className="small muted"> · {t('bibleAtlasSenses', { n: String(h.senses) })}</span>}</b>
              <span className="small muted">{h.snippet}</span>
            </button>
          ))}
        </div>
      ))}
      <p className="small muted">Easton's Bible Dictionary (1897). {t('bibleAtlasEnglish')}</p>
    </>
  );
}

function TermView({ term, push }: { term: string; push: (v: View) => void }) {
  const { t } = useT();
  const res = useApi(() => PublicApi.dictionaryEntry(term), [term]);
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  const d = res.data;
  return (
    <>
      <h2 className="at-title">{d.term}</h2>
      <div className="row wrap" style={{ gap: 6 }}>
        {d.person && <button className="btn sm" onClick={() => push({ kind: 'person', id: d.person!.slug })}><User size={14} /> {t('bibleAtlasAboutPerson')}</button>}
        {d.place && <button className="btn sm" onClick={() => push({ kind: 'place', id: d.place!.slug })}><MapPin size={14} /> {t('bibleAtlasAboutPlace')}</button>}
      </div>
      {d.senses.map((s, i) => <div key={i} className="at-text">{d.senses.length > 1 && <b className="small">{i + 1}.</b>}{paras(s).map((x, j) => <p key={j}>{x}</p>)}</div>)}
      <Source text={d.source} english />
    </>
  );
}

function TimelineView({ book, chapter, push, onOpen }: { book: string; chapter: number; push: (v: View) => void; onOpen: Open }) {
  const { t } = useT();
  const year = useYear();
  const res = useApi(() => PublicApi.bibleTimeline(), []);
  const [q, setQ] = useState('');
  const here = useRef<HTMLDivElement>(null);
  const prefix = `${book}.${chapter}.`;
  const shown = useMemo(() => {
    const f = q.trim().toLowerCase();
    return (res.data ?? []).filter((e) => !f || e.title.toLowerCase().includes(f) || e.people.some((p) => p.name.toLowerCase().includes(f)) || e.places.some((p) => p.name.toLowerCase().includes(f)));
  }, [res.data, q]);
  // Open at the reader's chapter, or failing that the first event in its book.
  const near = shown.find((e) => e.refs.some((r) => r.key.startsWith(prefix)))?.id ?? shown.find((e) => e.refs.some((r) => r.key.startsWith(`${book}.`)))?.id;
  useEffect(() => { if (!q) here.current?.scrollIntoView({ block: 'center' }); }, [res.data, near, q]);
  if (res.error) return <ErrorState error={res.error} onRetry={res.reload} />;
  if (!res.data) return <Loading />;
  return (
    <>
      <label className="at-search">
        <Search size={15} className="muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('bibleAtlasFilter')} aria-label={t('bibleAtlasFilter')} />
      </label>
      <p className="small muted">{t('bibleAtlasDates')}</p>
      <div className="at-line">
        {shown.map((e) => (
          <div key={e.id} ref={e.id === near ? here : undefined} className={`at-ev ${e.refs.some((r) => r.key.startsWith(prefix)) ? 'on' : ''}`}>
            <span className="at-year">{year(e.year)}</span>
            <div className="stack" style={{ gap: 4, minWidth: 0 }}>
              <b>{e.title}</b>
              <div className="row wrap" style={{ gap: 4 }}>
                {e.refs.map((r) => <button key={r.key} className="bib-chip" onClick={() => openRef(r.key, onOpen)}>{r.label}</button>)}
                {e.people.map((p) => <button key={p.slug} className="bib-chip at-ghost" onClick={() => push({ kind: 'person', id: p.slug })}>{p.name}</button>)}
                {e.places.map((p) => <button key={p.slug} className="bib-chip at-ghost" onClick={() => push({ kind: 'place', id: p.slug })}><MapPin size={11} /> {p.name}</button>)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
