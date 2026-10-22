// Services › Song database: public-domain hymns shared by every church on Flockwise. Search by
// title, tune, writer, theme or a line of the words, read them, and add one to the song library.
import { BadgeCheck, BookOpen, Check, ExternalLink, Library, Plus, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { CatalogSongRow, SongLicenceStatus } from '@/api/admin-types';
import { AdminApi } from '@/api/endpoints';
import { ChordChart } from '@/lib/chords';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { useCan } from '@/lib/perms';
import { useAction, useApi } from '@/lib/use-api';

const THEMES = ['Christmas', 'Advent', 'Lent', 'Easter', 'Pentecost', 'Trinity', 'Communion', 'Evening'];
const PAGE = 50;

export function SongDatabase({ onAdded }: { onAdded?: () => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [lang, setLang] = useState('');
  const [theme, setTheme] = useState('');
  const [shown, setShown] = useState(PAGE);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => setShown(PAGE), [debounced, lang, theme]);
  const list = useApi(() => AdminApi.songCatalog.list({ q: debounced || undefined, lang: lang || undefined, theme: theme || undefined, limit: String(shown) }), [debounced, lang, theme, shown]);
  const [viewing, setViewing] = useState<string | null>(null);
  const [licences, setLicences] = useState(false);
  const can = useCan();
  const toast = useToast();
  const add = useAction(AdminApi.songCatalog.add);

  async function addSong(s: CatalogSongRow) {
    const r = await add.run(s.id);
    if (!r) return;
    toast(r.created ? `${s.title} added to your song library` : `${s.title} is already in your song library`);
    list.reload();
    onAdded?.();
  }

  const langs = list.data?.languages.filter((l) => l.songs > 0) ?? [];
  return (
    <div className="card">
      <div className="toolbar wrap">
        <div className="search"><Search size={16} /><input className="input" placeholder="Search title, tune, writer or a line of the words" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {langs.length > 1 && (
          <select className="select" style={{ width: 150 }} value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
            <option value="">All languages</option>
            {langs.map((l) => <option key={l.id} value={l.id}>{l.label} ({l.songs})</option>)}
          </select>
        )}
        <select className="select" style={{ width: 150 }} value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Season or theme">
          <option value="">Any season</option>
          {THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="grow" />
        {can('services', 'settings') && <button className="btn" onClick={() => setLicences(true)}><ShieldCheck size={16} /> Licences</button>}
      </div>
      <p className="small muted" style={{ margin: '0 0 12px' }}>
        Public-domain hymns shared by every church on Flockwise, free to project, print and stream. Add one and it becomes your own copy to change the key, add chords or a second language.
      </p>
      <FormError error={add.error} />
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : list.data.songs.length === 0 ? (
        <Empty icon={<BookOpen size={28} />} title="No songs found" body="Try part of the title, the tune name or a line you remember." />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Title</th><th>Key</th><th>Tune</th><th>Themes</th><th /></tr></thead>
              <tbody>
                {list.data.songs.map((s) => (
                  <tr key={s.id} className="clickable" onClick={() => setViewing(s.id)}>
                    <td>
                      <b>{s.title}</b>
                      <div className="small muted">{s.writers}{s.year ? ` · ${s.year}` : ''}{s.language !== 'en' ? ` · ${langs.find((l) => l.id === s.language)?.label ?? s.language}` : ''}</div>
                    </td>
                    <td className="mono">{s.defaultKey}{s.hasChords && <div className="small muted" style={{ fontFamily: 'inherit' }}>Chords</div>}</td>
                    <td className="small">{s.tune ?? '—'}</td>
                    <td className="small">{s.themes.filter((t) => t !== 'Hymn').map((t) => <span key={t} className="badge gray" style={{ marginRight: 4 }}>{t}</span>)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      {s.inLibrary ? <span className="badge ok"><Check size={12} /> In library</span>
                        : can('services') && (s.hasLyrics || s.licensedAvailable) && <button className="btn sm" disabled={add.busy} onClick={() => void addSong(s)}><Plus size={14} /> Add</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            <span className="small muted">{list.data.songs.length} of {list.data.total} songs</span>
            {list.data.total > list.data.songs.length && <button className="btn sm" onClick={() => setShown(shown + PAGE)}>Show more</button>}
          </div>
        </>
      )}
      {viewing && <CatalogSongModal id={viewing} onClose={() => setViewing(null)} onAdded={() => { list.reload(); onAdded?.(); }} />}
      {licences && <LicencesModal onClose={() => setLicences(false)} />}
    </div>
  );
}

function CatalogSongModal({ id, onClose, onAdded }: { id: string; onClose: () => void; onAdded: () => void }) {
  const song = useApi(() => AdminApi.songCatalog.get(id), [id]);
  const add = useAction(AdminApi.songCatalog.add);
  const toast = useToast();
  const can = useCan();
  const s = song.data;
  const [view, setView] = useState<'words' | 'chords'>('chords');
  async function onAdd() {
    const r = await add.run(id);
    if (!r) return;
    toast(r.created ? 'Added to your song library' : 'Already in your song library');
    song.reload();
    onAdded();
  }
  return (
    <Modal wide title={s?.title ?? 'Song'} onClose={onClose} footer={s && <>
      {(s.links ?? []).map((l) => <a key={l.url} className="btn" href={l.url} target="_blank" rel="noreferrer"><ExternalLink size={15} /> {l.name}</a>)}
      {s.inLibrary ? <span className="badge ok"><Library size={13} /> In your song library</span>
        : can('services') && (s.lyrics || s.licensedAvailable) && <button className="btn primary" disabled={add.busy} onClick={() => void onAdd()}><Plus size={15} /> {add.busy ? 'Adding…' : 'Add to song library'}</button>}
    </>}>
      {song.error ? <ErrorState error={song.error} onRetry={song.reload} /> : !s ? <Loading /> : (
        <div className="stack">
          <div className="small muted">
            Words: {s.writers}{s.music ? ` · Music: ${s.music}` : ''}{s.year ? ` · ${s.year}` : ''}{s.tune ? ` · Tune: ${s.tune}` : ''}{s.defaultKey ? ` · Key ${s.defaultKey}` : ''}
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="badge ok"><BadgeCheck size={12} /> {s.copyright}</span>
            {s.source && <span className="badge gray">Source: {s.source}</span>}
          </div>
          <FormError error={add.error} />
          {(s.arrangement?.length ?? 0) > 0 && <div className="small"><span className="muted">Order:</span> {s.arrangement!.join(' → ')}</div>}
          {s.chordChart && s.lyrics && (
            <div className="row" style={{ gap: 6 }}>
              <button className={`btn sm ${view === 'chords' ? 'primary' : ''}`} onClick={() => setView('chords')}>Chords</button>
              <button className={`btn sm ${view === 'words' ? 'primary' : ''}`} onClick={() => setView('words')}>Words only</button>
              <span className="small muted">Chords follow the hymnal's four-part harmony.</span>
            </div>
          )}
          {s.chordChart && view === 'chords' ? <ChordChart text={s.chordChart} songKey={s.defaultKey} />
            : s.lyrics ? <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 15, margin: 0 }}>{s.lyrics}</pre>
            : <p className="muted">{s.licensedAvailable ? 'Adding it fetches the words from your licensed lyrics service.' : 'The words for this song are not in the database yet.'}</p>}
        </div>
      )}
    </Modal>
  );
}

function LicencesModal({ onClose }: { onClose: () => void }) {
  const st = useApi(AdminApi.songCatalog.licence);
  const [form, setForm] = useState<{ ccliLicence: string; streamingLicence: string; otherLicences: string } | null>(null);
  const save = useAction(AdminApi.songCatalog.saveLicence);
  const toast = useToast();
  const can = useCan();
  useEffect(() => {
    if (st.data && !form) setForm({ ccliLicence: st.data.licence?.ccliLicence ?? '', streamingLicence: st.data.licence?.streamingLicence ?? '', otherLicences: st.data.licence?.otherLicences ?? '' });
  }, [st.data, form]);
  const editable = can('settings');
  async function onSave() {
    if (!form) return;
    const r: SongLicenceStatus | undefined = await save.run(form);
    if (r) { toast('Licences saved'); onClose(); }
  }
  return (
    <Modal title="Song licences" onClose={onClose} footer={editable && <button className="btn primary" disabled={!form || save.busy} onClick={() => void onSave()}>{save.busy ? 'Saving…' : 'Save'}</button>}>
      {st.error ? <ErrorState error={st.error} onRetry={st.reload} /> : !form ? <Loading /> : (
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>Hymns in the song database are public domain and need no licence. For copyrighted songs you type into your library, keep your CCLI numbers here so reports and projected credits use them.</p>
          <Field label="CCLI Church Copyright Licence number"><input className="input mono" inputMode="numeric" disabled={!editable} value={form.ccliLicence} onChange={(e) => setForm({ ...form, ccliLicence: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="CCLI Streaming Licence number" hint="For lyrics shown in online services."><input className="input mono" inputMode="numeric" disabled={!editable} value={form.streamingLicence} onChange={(e) => setForm({ ...form, streamingLicence: e.target.value.replace(/\D/g, '') })} /></Field>
          <Field label="Other licences" hint="For example a publisher or OneLicense."><input className="input" disabled={!editable} value={form.otherLicences} onChange={(e) => setForm({ ...form, otherLicences: e.target.value })} /></Field>
          {(st.data?.feeds.length ?? 0) > 0 && <p className="small muted" style={{ margin: 0 }}>Licensed lyrics: {st.data!.feeds.map((f) => f.name).join(', ')}.</p>}
          <FormError error={save.error} />
        </div>
      )}
    </Modal>
  );
}
