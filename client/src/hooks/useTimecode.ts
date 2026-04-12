/**
 * Utilitários de timecode — redesenhados com inspiração em LosslessCut
 * (GPL-2.0; algoritmos reimplementados de forma independente)
 */

export interface FormatOptions {
  fps?: number;             // se definido: HH:MM:SS:FF; senão: HH:MM:SS.mmm
  shorten?: boolean;        // omite horas quando zero → M:SS.mmm
  fileNameFriendly?: boolean; // ':' → '_', '.' → '-'
}

/**
 * Formata segundos como timecode legível.
 *
 * Exemplos:
 *   formatDuration(125.5, { fps: 30 })                 → "00:02:05:15"
 *   formatDuration(125.5, { shorten: true })            → "2:05.500"
 *   formatDuration(125.5, { fileNameFriendly: true })   → "00_02_05-500"
 *   formatDuration(3.0,   { fps: 30, shorten: true })   → "0:03:00"
 */
export function formatDuration(seconds: number, opts: FormatOptions = {}): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const { fps, shorten = false, fileNameFriendly = false } = opts;
  const useFps = fps != null && fps > 0;

  const totalFrames = useFps ? Math.round(seconds * fps!) : 0;
  const fpsRound    = useFps ? Math.round(fps!)           : 1;
  const totalSecs   = useFps ? Math.floor(totalFrames / fpsRound) : Math.floor(seconds);
  const subunit     = useFps
    ? totalFrames % fpsRound
    : Math.round((seconds % 1) * 1000);
  const subPad = useFps ? 2 : 3;

  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;

  const p = (v: number, n = 2) => String(v).padStart(n, '0');
  const colSep  = fileNameFriendly ? '_' : ':';
  const fracSep = fileNameFriendly ? '-' : (useFps ? ':' : '.');

  if (shorten && h === 0) {
    return `${m}${colSep}${p(s)}${fracSep}${p(subunit, subPad)}`;
  }
  return `${p(h)}${colSep}${p(m)}${colSep}${p(s)}${fracSep}${p(subunit, subPad)}`;
}

/**
 * Converte timecode para segundos. Aceita formatos:
 *   "00:02:05:15"  (SMPTE com fps)
 *   "2:05.500"     (M:SS.mmm)
 *   "125.5"        (segundos decimais)
 */
export function parseDuration(tc: string, fps?: number): number {
  if (!tc) return 0;
  const clean = tc.replace(',', '.').trim();
  if (/^\d+(\.\d+)?$/.test(clean)) return parseFloat(clean);

  const parts = clean.split(/[:.]/).map(Number);
  if (parts.length === 4 && fps) {
    // HH:MM:SS:FF
    const [h, m, sec, f] = parts;
    return h * 3600 + m * 60 + sec + f / fps;
  }
  if (parts.length === 3) {
    const [a, b, c] = parts;
    // MM:SS.mmm
    return a * 60 + b + c / 1000;
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

// ── Aliases retro-compatíveis ─────────────────────────────────────────────────

/** SMPTE HH:MM:SS:FF */
export function toSMPTE(seconds: number, fps: number): string {
  return formatDuration(seconds, { fps });
}

/** Display curto M:SS.mmm (sem horas se zero) */
export function toDisplayTime(seconds: number): string {
  return formatDuration(seconds, { shorten: true });
}

/** Nome de arquivo amigável HH_MM_SS-mmm */
export function toFilenameFriendly(seconds: number, fps?: number): string {
  return formatDuration(seconds, { fps, fileNameFriendly: true });
}
