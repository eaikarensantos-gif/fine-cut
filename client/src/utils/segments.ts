/**
 * Utilitários puros para manipulação de segmentos de tempo.
 * Reimplementação independente de algoritmos clássicos de edição
 * (inspirado em LosslessCut / GPL-2.0 — sem cópia de código).
 */

export interface TimeSegment {
  start: number;
  end: number;
}

/** Ordena segmentos por start */
export function sortSegments<T extends TimeSegment>(segs: T[]): T[] {
  return [...segs].sort((a, b) => a.start - b.start);
}

/** Merge segmentos sobrepostos ou adjacentes */
export function combineOverlapping(segs: TimeSegment[]): TimeSegment[] {
  const sorted = sortSegments(segs);
  const result: TimeSegment[] = [];
  for (const seg of sorted) {
    const last = result[result.length - 1];
    if (last && seg.start <= last.end + 0.01) {
      last.end = Math.max(last.end, seg.end);
    } else {
      result.push({ start: seg.start, end: seg.end });
    }
  }
  return result;
}

/**
 * Inverte segmentos: retorna os "buracos" entre eles.
 * Usado para converter "regiões de silêncio" → "regiões de fala".
 * @param pad  Expansão adicional em cada lado (evita cortes abruptos)
 */
export function invertSegments(
  segs: TimeSegment[],
  duration: number,
  pad = 0
): TimeSegment[] {
  if (segs.length === 0) return [{ start: 0, end: duration }];
  const sorted = sortSegments(segs.filter((s) => s.end !== null && s.end > s.start));
  const inverted: TimeSegment[] = [];
  let cursor = 0;
  for (const seg of sorted) {
    const start = Math.max(0, cursor - pad);
    const end   = Math.min(duration, seg.start + pad);
    if (end - start > 0.05) inverted.push({ start, end });
    cursor = (seg as any).end as number;
  }
  if (duration - cursor > 0.05) {
    inverted.push({ start: Math.max(0, cursor - pad), end: duration });
  }
  return inverted;
}

/** Divide um segmento em dois no ponto `time` */
export function splitAt(seg: TimeSegment, time: number): [TimeSegment, TimeSegment] | null {
  if (time <= seg.start || time >= seg.end) return null;
  return [{ start: seg.start, end: time }, { start: time, end: seg.end }];
}

/** Garante que start/end estão dentro de [0, duration] */
export function clamp(seg: TimeSegment, duration: number): TimeSegment {
  return {
    start: Math.max(0, Math.min(seg.start, duration)),
    end:   Math.max(0, Math.min(seg.end,   duration)),
  };
}

/** Duração total de uma lista de segmentos */
export function totalDuration(segs: TimeSegment[]): number {
  return segs.reduce((s, seg) => s + (seg.end - seg.start), 0);
}

/** Verifica se dois segmentos se sobrepõem */
export function overlaps(a: TimeSegment, b: TimeSegment): boolean {
  return a.start < b.end && a.end > b.start;
}

/**
 * Subtrai `toRemove` de cada segmento em `base`.
 * Usado para: "manter só voz" = base-segments minus silence-regions.
 */
export function subtract(base: TimeSegment[], toRemove: TimeSegment[]): TimeSegment[] {
  if (toRemove.length === 0) return base;
  const removes = sortSegments(toRemove);
  const result: TimeSegment[] = [];
  for (const seg of base) {
    let pieces: TimeSegment[] = [{ start: seg.start, end: seg.end }];
    for (const rm of removes) {
      const next: TimeSegment[] = [];
      for (const p of pieces) {
        if (rm.end <= p.start || rm.start >= p.end) {
          next.push(p);
        } else {
          if (rm.start > p.start) next.push({ start: p.start, end: rm.start });
          if (rm.end   < p.end)   next.push({ start: rm.end,  end: p.end   });
        }
      }
      pieces = next;
    }
    result.push(...pieces.filter((p) => p.end - p.start > 0.01));
  }
  return result;
}
