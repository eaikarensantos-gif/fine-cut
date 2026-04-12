/**
 * POST /api/detect-repeats-transcript
 * Body: { words: [{word, start, end}] }
 *
 * Recebe uma transcrição com timestamps por palavra e detecta frases repetidas.
 * Algoritmo:
 *   1. Normaliza as palavras (lowercase, remove pontuação)
 *   2. Constrói janelas deslizantes de N palavras (N = 3..8)
 *   3. Agrupa janelas com o mesmo texto
 *   4. Filtra grupos com distância temporal mínima entre instâncias
 *   5. Escolhe o melhor take (mais curto = mais fluente; ou pode usar amplitude)
 */

const express = require('express');
const router  = express.Router();

const MIN_WORDS   = 4;   // janela mínima de palavras para ser uma "frase" (3 é muito genérico)
const MAX_WORDS   = 10;  // janela máxima
const MIN_DUR     = 1.0; // s — descarta frases muito curtas
const MIN_GAP     = 2.0; // s — duas instâncias da mesma frase precisam de pelo menos 2s de distância

function normalize(word) {
  return word.toLowerCase().replace(/[^a-záàâãéèêíìîóòôõúùûçñ\s]/gi, '').trim();
}

router.post('/', (req, res) => {
  const { words } = req.body;
  if (!words || words.length < MIN_WORDS) {
    return res.json({ groups: [] });
  }

  // 1. Normaliza e indexa palavras
  const ws = words.map((w) => ({ ...w, norm: normalize(w.word) })).filter((w) => w.norm.length > 0);

  // 2. Constrói mapa: texto_da_janela → lista de ocorrências {start, end, wordCount}
  const phraseMap = new Map();

  for (let size = MIN_WORDS; size <= Math.min(MAX_WORDS, ws.length); size++) {
    for (let i = 0; i + size <= ws.length; i++) {
      const slice = ws.slice(i, i + size);
      const text  = slice.map((w) => w.norm).join(' ');
      const start = slice[0].start;
      const end   = slice[slice.length - 1].end;
      const dur   = end - start;

      if (dur < MIN_DUR) continue;

      if (!phraseMap.has(text)) phraseMap.set(text, []);
      phraseMap.get(text).push({ start, end, dur, text });
    }
  }

  // 3. Filtra frases com ≥ 2 ocorrências temporalmente distintas
  const candidates = [];
  for (const [, occurrences] of phraseMap) {
    if (occurrences.length < 2) continue;

    // Ordena por tempo
    const sorted = occurrences.sort((a, b) => a.start - b.start);

    // Remove ocorrências sobrepostas ou muito próximas (< MIN_GAP)
    const distinct = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prev = distinct[distinct.length - 1];
      if (sorted[i].start - prev.end >= MIN_GAP) {
        distinct.push(sorted[i]);
      }
    }

    if (distinct.length >= 2) {
      candidates.push(distinct);
    }
  }

  // 4. Remove grupos redundantes: se um grupo de 5 palavras já está contido em outro de 8,
  //    mantém o maior (mais informativo).
  //    Simplificação: ordena por wordCount desc, descarta grupos cujos takes se sobrepõem
  //    com takes de grupos maiores já aceitos.
  const accepted   = [];
  const usedRanges = [];

  // Ordena por tamanho de frase (maior = mais específico = prioridade)
  candidates.sort((a, b) => {
    const textA = a[0].text;
    const textB = b[0].text;
    return textB.split(' ').length - textA.split(' ').length;
  });

  for (const group of candidates) {
    // Verifica se algum take do grupo se sobrepõe significativamente com ranges já aceitos
    const overlaps = group.some((take) =>
      usedRanges.some((r) => take.start < r.end - 0.3 && take.end > r.start + 0.3)
    );
    if (overlaps) continue;

    // Pontua: take mais curto = mais fluente
    const takes = group.map((take, i) => ({
      start:       +take.start.toFixed(3),
      end:         +take.end.toFixed(3),
      duration:    +take.dur.toFixed(2),
      text:        take.text,
      score:       +(1 / (1 + take.dur)).toFixed(4),
      recommended: false,
    })).sort((a, b) => b.score - a.score);

    takes[0].recommended = true;

    accepted.push({ takes, source: 'transcript' });

    // Marca os ranges deste grupo como usados
    for (const take of group) usedRanges.push({ start: take.start, end: take.end });
  }

  res.json({ groups: accepted, analyzed: ws.length });
});

module.exports = router;
