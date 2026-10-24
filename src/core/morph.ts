// Grammar codes from STEPBible's Greek (Robinson) and Hebrew (ETCBC/OpenScriptures) tags, in plain
// English for the word study: "V-AAI-3S" → "Verb · aorist active indicative · 3rd person singular".

const G_POS: Record<string, string> = { N: 'Noun', V: 'Verb', A: 'Adjective', T: 'Article', P: 'Pronoun', R: 'Relative pronoun', C: 'Reciprocal pronoun', D: 'Demonstrative pronoun', K: 'Correlative pronoun', I: 'Interrogative pronoun', X: 'Indefinite pronoun', Q: 'Correlative pronoun', F: 'Reflexive pronoun', S: 'Possessive pronoun', ADV: 'Adverb', CONJ: 'Conjunction', PREP: 'Preposition', PRT: 'Particle', INJ: 'Interjection', COND: 'Conditional', ARAM: 'Aramaic word', HEB: 'Hebrew word' };
const TENSE: Record<string, string> = { P: 'present', I: 'imperfect', F: 'future', A: 'aorist', R: 'perfect', L: 'pluperfect', X: 'no tense' };
const VOICE: Record<string, string> = { A: 'active', M: 'middle', P: 'passive', E: 'middle or passive', D: 'middle', O: 'passive', N: 'middle or passive' };
const MOOD: Record<string, string> = { I: 'indicative', S: 'subjunctive', O: 'optative', M: 'imperative', N: 'infinitive', P: 'participle', R: 'imperative participle' };
const CASE: Record<string, string> = { N: 'nominative', G: 'genitive', D: 'dative', A: 'accusative', V: 'vocative' };
const NUM: Record<string, string> = { S: 'singular', P: 'plural', D: 'dual' };
const GEN: Record<string, string> = { M: 'masculine', F: 'feminine', N: 'neuter' };
const PERSON: Record<string, string> = { '1': '1st person', '2': '2nd person', '3': '3rd person' };

function greek(code: string): string {
  const [pos, a = '', b = ''] = code.split('-');
  const out = [G_POS[pos] ?? pos];
  if (pos === 'V') {
    const m = /^(2?)([PIFARLX])([AMPEDON])([ISOMNPR])$/.exec(a);
    if (m) out.push(`${m[1] ? 'second ' : ''}${TENSE[m[2]]} ${VOICE[m[3]]} ${MOOD[m[4]]}`);
    const p = /^([123])([SP])$/.exec(b);
    if (p) out.push(`${PERSON[p[1]]} ${NUM[p[2]]}`);
    const c = /^([NGDAV])([SP])([MFN])$/.exec(b);
    if (c) out.push(`${CASE[c[1]]} ${NUM[c[2]]} ${GEN[c[3]]}`);
  } else {
    const c = /^([123]?)([NGDAV])([SP])([MFN]?)/.exec(a);
    if (c) out.push([c[1] ? PERSON[c[1]] : '', CASE[c[2]], NUM[c[3]], c[4] ? GEN[c[4]] : ''].filter(Boolean).join(' '));
  }
  return out.join(' · ');
}

const STEM: Record<string, string> = { q: 'Qal', N: 'Niphal', p: 'Piel', P: 'Pual', h: 'Hiphil', H: 'Hophal', t: 'Hithpael', o: 'Polel', O: 'Polal', r: 'Hithpolel', m: 'Poel', M: 'Poal', k: 'Palel', K: 'Pulal', Q: 'Qal passive', l: 'Pilpel', L: 'Polpal', f: 'Hithpalpel', D: 'Nithpael', j: 'Pealal', i: 'Pilel', u: 'Hothpaal', c: 'Tiphil', v: 'Hishtaphel', w: 'Nithpalel', y: 'Nithpoel', z: 'Hithpoel' };
const CONJ: Record<string, string> = { p: 'perfect', q: 'sequential perfect', i: 'imperfect', w: 'sequential imperfect', h: 'cohortative', j: 'jussive', v: 'imperative', r: 'participle', s: 'passive participle', a: 'infinitive absolute', c: 'infinitive construct' };
const H_POS: Record<string, string> = { A: 'Adjective', C: 'Conjunction', D: 'Adverb', N: 'Noun', P: 'Pronoun', R: 'Preposition', S: 'Suffix', T: 'Particle', V: 'Verb' };
const H_GEN: Record<string, string> = { m: 'masculine', f: 'feminine', b: 'common', c: 'common' };
const H_NUM: Record<string, string> = { s: 'singular', p: 'plural', d: 'dual' };
const STATE: Record<string, string> = { a: 'absolute', c: 'construct', d: 'determined' };

function hebrewPart(c: string): string {
  const pos = H_POS[c[0]] ?? c[0];
  if (c[0] === 'V') {
    const stem = STEM[c[1]] ?? '';
    const conj = CONJ[c[2]] ?? '';
    const rest = c.slice(3);
    const pgn = /^([123])([mfbc])([spd])/.exec(rest);
    const gn = /^([mfbc])([spd])([acd]?)/.exec(rest);
    return [pos, [stem, conj].filter(Boolean).join(' '), pgn ? `${PERSON[pgn[1]]} ${H_GEN[pgn[2]]} ${H_NUM[pgn[3]]}` : gn ? `${H_GEN[gn[1]]} ${H_NUM[gn[2]]}${gn[3] ? ` ${STATE[gn[3]]}` : ''}` : ''].filter(Boolean).join(' · ');
  }
  if (c[0] === 'N') {
    const m = /^N([cpg]?)([mfbc]?)([spd]?)([acd]?)/.exec(c);
    return [m?.[1] === 'p' ? 'Proper noun' : pos, m ? [H_GEN[m[2]] ?? '', H_NUM[m[3]] ?? '', STATE[m[4]] ?? ''].filter(Boolean).join(' ') : ''].filter(Boolean).join(' · ');
  }
  return pos;
}

/** A plain-English parsing for a STEPBible grammar code; unknown codes come back as they are. */
export function parsing(code: string): string {
  if (!code) return '';
  if (/^H[A-Z]/.test(code) || (/^A[A-Z]/.test(code) && !/^(ADV|ARAM)/.test(code))) {
    // Hebrew (H…) or Aramaic (A…): "HVqrmsc/Sp1bs" → main word, then the attached pieces.
    const parts = code.slice(1).split('/');
    return parts.map((p) => hebrewPart(p)).filter(Boolean).join(' + ');
  }
  return greek(code);
}
