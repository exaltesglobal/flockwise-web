// Reads files out of a .zip archive in memory (stored or deflated entries), using the platform's
// DecompressionStream so it works on the server and in the browser alike.

export type ZipEntry = { name: string; method: number; size: number; offset: number; compressed: number };

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/** The entries listed in the archive's central directory. */
export function zipEntries(zip: Uint8Array): ZipEntry[] {
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) if (u32(zip, i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('not a zip file');
  const count = u16(zip, end + 10);
  let p = u32(zip, end + 16);
  const out: ZipEntry[] = [];
  const names = new TextDecoder();
  for (let n = 0; n < count && u32(zip, p) === 0x02014b50; n++) {
    const nameLen = u16(zip, p + 28), extraLen = u16(zip, p + 30), commentLen = u16(zip, p + 32);
    out.push({ name: names.decode(zip.subarray(p + 46, p + 46 + nameLen)), method: u16(zip, p + 10), compressed: u32(zip, p + 20), size: u32(zip, p + 24), offset: u32(zip, p + 42) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** One entry's bytes, inflated. */
export async function zipRead(zip: Uint8Array, e: ZipEntry): Promise<Uint8Array> {
  const h = e.offset;
  if (u32(zip, h) !== 0x04034b50) throw new Error(`bad zip entry ${e.name}`);
  const start = h + 30 + u16(zip, h + 26) + u16(zip, h + 28);
  const data = zip.subarray(start, start + e.compressed);
  if (e.method === 0) return data;
  if (e.method !== 8) throw new Error(`zip method ${e.method} is not supported`);
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The first entry whose name matches, as UTF-8 text. */
export async function zipText(zip: Uint8Array, match: (name: string) => boolean): Promise<{ name: string; text: string } | null> {
  const e = zipEntries(zip).find((x) => match(x.name));
  if (!e) return null;
  return { name: e.name, text: new TextDecoder().decode(await zipRead(zip, e)) };
}
