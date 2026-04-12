/**
 * Converte segundos para timecode SMPTE: HH:MM:SS:FF
 */
export function toSMPTE(seconds: number, fps: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00:00:00';
  const totalFrames = Math.round(seconds * fps);
  const f = totalFrames % Math.round(fps);
  const totalSecs = Math.floor(totalFrames / Math.round(fps));
  const s = totalSecs % 60;
  const m = Math.floor(totalSecs / 60) % 60;
  const h = Math.floor(totalSecs / 3600);
  return [h, m, s, f].map((v) => String(v).padStart(2, '0')).join(':');
}

/**
 * Converte timecode SMPTE para segundos
 */
export function fromSMPTE(tc: string, fps: number): number {
  const parts = tc.split(':').map(Number);
  if (parts.length !== 4) return 0;
  const [h, m, s, f] = parts;
  return h * 3600 + m * 60 + s + f / fps;
}

/**
 * Formata segundos como MM:SS.mmm (para display simplificado)
 */
export function toDisplayTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00.000';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
