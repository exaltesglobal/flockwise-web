// Faces for the office screens: who has a photo or a chosen avatar, loaded once and shared, so an
// Avatar given only a person id can still show the right picture.
import { useSyncExternalStore } from 'react';

import { AdminApi } from '@/api/endpoints';

type Face = { p: string | null; a: number | null };
let faces: Record<string, Face> = {};
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export async function loadFaces() {
  try { faces = await AdminApi.faces(); emit(); } catch { /* faces are a nicety; names still show */ }
}
export function setFace(id: string, face: Face) { faces = { ...faces, [id]: face }; emit(); }
export function useFace(id: string | undefined): Face | undefined {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => (id ? faces[id] : undefined));
}
