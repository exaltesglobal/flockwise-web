// The member's own name and picture: the name form (also shown once after sign-up when the
// surname is missing) and the picture button on the Me page.
import { Camera } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { memberSession } from '@/api/client';
import { MemberApi } from '@/api/endpoints';
import { PhotoEditor, type PhotoEditorLabels } from '@/components/photo-editor';
import { Avatar, Field, FormError, Modal } from '@/components/ui';
import { useT } from '@/i18n';
import { useSession } from '@/lib/session';
import { useAction } from '@/lib/use-api';

export function NameModal({ onClose, required = false }: { onClose: () => void; required?: boolean }) {
  const { t } = useT();
  const session = useSession(memberSession)!;
  const [first, setFirst] = useState(session.member.firstName ?? '');
  const [last, setLast] = useState(session.member.lastName ?? '');
  const save = useAction(async (e: FormEvent) => {
    e.preventDefault();
    if (!first.trim() || !last.trim()) throw new Error(t('nameRequired'));
    const member = await MemberApi.me.update({ firstName: first.trim(), lastName: last.trim() });
    memberSession.set({ ...session, member: { ...session.member, ...member } });
    onClose();
  });
  return (
    <Modal title={t('nameTitle')} onClose={required ? () => undefined : onClose}
      footer={<>{!required && <button className="btn" type="button" onClick={onClose}>{t('cancel')}</button>}<button className="btn primary" form="name-form" disabled={save.busy}>{t('save')}</button></>}>
      <form id="name-form" className="stack" onSubmit={save.run}>
        {required && <p className="muted small" style={{ margin: 0 }}>{t('nameBody')}</p>}
        <FormError error={save.error} />
        <div className="grid cols-2">
          <Field label={t('familyFirstName')}><input className="input" value={first} onChange={(e) => setFirst(e.target.value)} required maxLength={60} autoFocus autoComplete="given-name" /></Field>
          <Field label={t('familyLastName')}><input className="input" value={last} onChange={(e) => setLast(e.target.value)} required maxLength={60} autoComplete="family-name" /></Field>
        </div>
      </form>
    </Modal>
  );
}

/** Asks once per visit for a surname when sign-up left it blank. */
export function NamePrompt() {
  const session = useSession(memberSession);
  const [done, setDone] = useState(false);
  if (!session || done || (session.member.firstName?.trim() && session.member.lastName?.trim())) return null;
  return <NameModal required onClose={() => setDone(true)} />;
}

export function usePhotoLabels(): PhotoEditorLabels {
  const { t } = useT();
  return { title: t('peTitle'), photo: t('pePhoto'), avatars: t('peAvatars'), choose: t('peChoose'), dragHint: t('peDrag'), zoom: t('peZoom'), save: t('save'), cancel: t('cancel'), remove: t('peRemove'), auto: t('peAuto'), autoHint: t('peAutoHint') };
}

/** The member's picture with a camera badge; opens the editor. */
export function MyPhotoButton() {
  const { t } = useT();
  const labels = usePhotoLabels();
  const session = useSession(memberSession)!;
  const m = session.member;
  const [open, setOpen] = useState(false);
  const apply = (r: { photoUrl: string | null; avatar: number | null }) => memberSession.set({ ...session, member: { ...session.member, photoUrl: r.photoUrl, avatar: r.avatar } });
  return (
    <>
      <button className="avatar-edit" onClick={() => setOpen(true)} aria-label={t('peChange')} title={t('peChange')}>
        <Avatar name={`${m.firstName} ${m.lastName}`.trim()} person={m} size="lg" />
        <span className="badge-cam"><Camera size={12} /></span>
      </button>
      {open && (
        <PhotoEditor who={{ id: m.id, name: `${m.firstName} ${m.lastName}`.trim(), photoUrl: m.photoUrl, avatar: m.avatar }} labels={labels} onClose={() => setOpen(false)}
          onSavePhoto={async (img) => apply(await MemberApi.me.setPhoto(img))}
          onRemovePhoto={async () => apply(await MemberApi.me.removePhoto())}
          onPickAvatar={async (n) => apply(await MemberApi.me.setAvatar(n))} />
      )}
    </>
  );
}
