// Team panel › Song database: add public-domain hymns the built-in set lacks (Hindi, Telugu, Tamil
// and other Indian-language hymns from a checked hymnbook) and correct built-in ones. Every church
// sees the changes at once. Only public-domain words, always with their source.
import { BookOpen, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { TeamApi, type TeamSongInput, type TeamSongRow } from '@/api/endpoints';
import { Empty, ErrorState, Field, FormError, Loading, Modal, useToast } from '@/components/ui';
import { SONG_LANGUAGES, type SongLanguage } from '@/core/types';
import { useAction, useApi } from '@/lib/use-api';

const langLabel = (id: string) => SONG_LANGUAGES.find((l) => l.id === id)?.label ?? id;
const splitList = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);

export function TeamSongs() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [lang, setLang] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  const list = useApi(() => TeamApi.songs({ q: debounced || undefined, lang: lang || undefined }), [debounced, lang]);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const toast = useToast();
  async function remove(s: TeamSongRow) {
    if (!confirm(`Remove the team's version of ${s.title}? A built-in hymn goes back to its original.`)) return;
    await TeamApi.removeSong(s.id);
    toast('Removed');
    list.reload();
  }
  return (
    <>
      <div className="page-head">
        <div><h1>Song database</h1><p className="muted">Public-domain songs every church can add to its library. Add Indian-language hymns from a checked hymnbook here.</p></div>
        <button className="btn primary" onClick={() => setEditing('new')}><Plus size={16} /> Add song</button>
      </div>
      <div className="card">
        <div className="toolbar">
          <div className="search"><Search size={16} /><input className="input" placeholder="Search title or writer" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="select" style={{ width: 160 }} value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
            <option value="">All languages</option>
            {SONG_LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : list.data.songs.length === 0 ? <Empty icon={<BookOpen size={28} />} title="No songs" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Title</th><th>Language</th><th>Words</th><th>Source</th><th /></tr></thead>
              <tbody>
                {list.data.songs.map((s) => (
                  <tr key={s.id}>
                    <td><b>{s.title}</b><div className="small muted">{s.writers}{s.year ? ` · ${s.year}` : ''}</div></td>
                    <td className="small">{langLabel(s.language)}</td>
                    <td className="small">{s.hasLyrics ? 'Yes' : <span className="badge warn">Missing</span>}</td>
                    <td className="small muted">{s.edited ? <span className="badge">Team</span> : null} {s.source ?? ''}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button className="btn ghost icon sm" onClick={() => setEditing(s.id)} aria-label="Edit"><Pencil size={15} /></button>
                      {s.edited && <button className="btn ghost icon sm danger" onClick={() => void remove(s)} aria-label="Remove"><Trash2 size={15} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted">{list.data.songs.length} of {list.data.total} songs</p>
          </div>
        )}
      </div>
      {editing && <TeamSongForm id={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); toast('Saved. Every church sees it now.'); }} />}
    </>
  );
}

type Form = { title: string; aka: string; language: SongLanguage; writers: string; music: string; year: string; defaultKey: string; tune: string; themes: string; lyrics: string; arrangement: string; source: string };
const EMPTY: Form = { title: '', aka: '', language: 'hi', writers: '', music: '', year: '', defaultKey: '', tune: '', themes: 'Hymn', lyrics: '', arrangement: '', source: '' };

function TeamSongForm({ id, onClose, onSaved }: { id: string | null; onClose: () => void; onSaved: () => void }) {
  const existing = useApi(() => (id ? TeamApi.song(id) : Promise.resolve(null)), [id]);
  const [f, setF] = useState<Form | null>(id ? null : EMPTY);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const s = existing.data;
    if (s && !f) setF({ title: s.title, aka: (s.aka ?? []).join(', '), language: s.language, writers: s.writers, music: s.music ?? '', year: s.year ? String(s.year) : '', defaultKey: s.defaultKey, tune: s.tune ?? '', themes: s.themes.join(', '), lyrics: s.lyrics ?? '', arrangement: (s.arrangement ?? []).join(', '), source: s.source ?? '' });
  }, [existing.data, f]);
  const save = useAction((input: TeamSongInput) => (id ? TeamApi.saveSong(id, input) : TeamApi.addSong(input)));
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setF({ ...f!, [k]: e.target.value });
  async function onSave() {
    if (!f) return;
    const input: TeamSongInput = {
      title: f.title, aka: splitList(f.aka), language: f.language, writers: f.writers, music: f.music || undefined, year: f.year ? Number(f.year) : undefined,
      rights: 'public-domain', defaultKey: f.defaultKey, bpm: null, tune: f.tune || undefined, themes: splitList(f.themes), lyrics: f.lyrics || undefined, arrangement: splitList(f.arrangement), source: f.source || undefined,
    };
    if (await save.run(input)) onSaved();
  }
  return (
    <Modal wide title={id ? 'Edit song' : 'Add a public-domain song'} onClose={onClose} footer={<button className="btn primary" disabled={!f || !confirmed || save.busy} onClick={() => void onSave()}>{save.busy ? 'Saving…' : 'Save for every church'}</button>}>
      {existing.error ? <ErrorState error={existing.error} onRetry={existing.reload} /> : !f ? <Loading /> : (
        <div className="stack">
          <div className="grid cols-2">
            <Field label="Title"><input className="input" value={f.title} onChange={set('title')} /></Field>
            <Field label="Language">
              <select className="select" value={f.language} onChange={set('language')}>{SONG_LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
            </Field>
          </div>
          <Field label="Other titles" hint="Comma separated: a transliteration, an English title or the first line, so people can find it."><input className="input" value={f.aka} onChange={set('aka')} /></Field>
          <div className="grid cols-2">
            <Field label="Words by" hint="With dates, e.g. Narayan Vaman Tilak (1861-1919). Traditional if unknown."><input className="input" value={f.writers} onChange={set('writers')} /></Field>
            <Field label="Music by"><input className="input" value={f.music} onChange={set('music')} /></Field>
          </div>
          <div className="grid cols-3">
            <Field label="Year"><input className="input" inputMode="numeric" value={f.year} onChange={set('year')} /></Field>
            <Field label="Key"><input className="input mono" value={f.defaultKey} onChange={set('defaultKey')} /></Field>
            <Field label="Tune or raga"><input className="input" value={f.tune} onChange={set('tune')} /></Field>
          </div>
          <Field label="Themes" hint="Comma separated, e.g. Hymn, Christmas, Communion."><input className="input" value={f.themes} onChange={set('themes')} /></Field>
          <Field label="Words" hint="A heading on its own line (Verse 1, Chorus), then the lines, with a blank line between sections.">
            <textarea className="input" rows={14} value={f.lyrics} onChange={set('lyrics')} style={{ fontFamily: 'inherit' }} />
          </Field>
          <Field label="Order" hint="Comma separated, e.g. Verse 1, Chorus, Verse 2, Chorus."><input className="input" value={f.arrangement} onChange={set('arrangement')} /></Field>
          <Field label="Source of the words" hint="Hymnbook and edition (with year), or the website you copied from."><input className="input" value={f.source} onChange={set('source')} /></Field>
          <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ marginTop: 3 }} />
            <span className="small">These words and their translation are in the public domain: the writer and translator died more than 60 years ago, or the words were published before 1930.</span>
          </label>
          <FormError error={save.error} />
        </div>
      )}
    </Modal>
  );
}
