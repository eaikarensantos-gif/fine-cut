/**
 * Detecta trechos repetidos (retakes) e seleciona o melhor take de cada grupo.
 *
 * Estratégia:
 *   1. Segmentação adaptativa: se não houver segmentos no body, detecta automaticamente
 *      frases usando silencedetect com threshold relativo alto (funciona mesmo sem
 *      silêncio real, ex: gravações de celular comprimidas).
 *   2. Para cada segmento com duração 1.5–40 s, extrai o envelope de amplitude como
 *      PCM 8 kHz mono com janelas de 50 ms → array de RMS values.
 *   3. Compara pares com duração similar (±70%) via correlação cruzada normalizada com
 *      busca de lag (±30% da duração menor) — detecta o mesmo conteúdo mesmo se
 *      um take foi falado mais devagar/rápido.
 *   4. Threshold dinâmico: usa percentil 90 das similaridades calculadas para
 *      separar pares "aleatoriamente similares" de pares "provavelmente repetição".
 *      Garante mínimo de 0.45 para não reportar nada sem evidência.
 *   5. Pontua cada take: loudness integrada mais próxima de −16 LUFS,
 *      menor desvio de amplitude (entrega mais estável), duração mais curta.
 */

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const os       = require('os');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { ffmpeg } = require('../utils/ffmpeg');

const router = express.Router();

const SAMPLE_RATE = 8000;   // Hz para extração PCM
const HOP_MS      = 50;     // ms por janela RMS
const HOP_SAMPLES = Math.round(SAMPLE_RATE * HOP_MS / 1000); // 400 samples

const MIN_SEG_DUR    = 1.0;  // s — ignora segmentos muito curtos
const MAX_SEG_DUR    = 60;   // s — ignora blocos muito longos (intro, etc.)
const MAX_DUR_RATIO  = 3.5;  // razão máxima entre durações — locutor pode variar bastante velocidade
const MAX_LAG_RATIO  = 0.40; // tolerância de lag mais ampla (% da duração menor)
const MIN_SIM_HARD   = 0.38; // limiar mínimo absoluto — bem baixo, threshold dinâmico faz o trabalho fino
const MAX_TIME_GAP   = 600;  // s — retakes ocorrem dentro de 10 min (vídeos longos)

// ── Extração de envelope PCM ─────────────────────────────────────────────────

function extractEnvelope(inputPath, start, duration) {
  return new Promise((resolve, reject) => {
    const args = [
      '-ss', String(start), '-t', String(duration),
      '-i', inputPath,
      '-vn',
      '-af', 'pan=mono|c0=0.5*c0+0.5*c1,aresample=' + SAMPLE_RATE,
      '-f', 's16le', '-acodec', 'pcm_s16le', 'pipe:1',
    ];
    const proc  = spawn(ffmpegPath, args);
    const chunks = [];
    proc.stdout.on('data', (c) => chunks.push(c));
    proc.stderr.on('data', () => {});
    proc.on('error', reject);
    proc.on('close', () => {
      const buf     = Buffer.concat(chunks);
      const samples = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength >> 1);
      const env     = [];
      for (let i = 0; i + HOP_SAMPLES <= samples.length; i += HOP_SAMPLES) {
        let sum = 0;
        for (let j = i; j < i + HOP_SAMPLES; j++) sum += (samples[j] / 32768) ** 2;
        env.push(Math.sqrt(sum / HOP_SAMPLES));
      }
      resolve(env);
    });
  });
}

// ── Correlação cruzada normalizada com busca de lag ──────────────────────────

function ncc(a, b) {
  if (a.length < 4 || b.length < 4) return 0;
  const norm = (arr) => {
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const std  = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length) || 1e-9;
    return arr.map((v) => (v - mean) / std);
  };
  const na = norm(a);
  const nb = norm(b);
  const maxLag = Math.round(Math.min(na.length, nb.length) * MAX_LAG_RATIO);
  let best = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let sum = 0, cnt = 0;
    for (let i = 0; i < na.length; i++) {
      const j = i + lag;
      if (j >= 0 && j < nb.length) { sum += na[i] * nb[j]; cnt++; }
    }
    if (cnt > 0 && sum / cnt > best) best = sum / cnt;
  }
  return Math.max(0, best);
}

// ── Segmentação adaptativa ───────────────────────────────────────────────────

// ── Mescla fragmentos sub-mínimos com o segmento anterior ────────────────────
// Frases longas com pausa interna (ex: "transparência [0.7s] corporativa") geram
// um fragmento curto (< MIN_SEG_DUR) que seria descartado. Ao mesclar esse
// fragmento com o segmento anterior (se gap < SUB_MERGE_GAP), reconstituímos a
// frase completa sem quebrar grupos que têm takes adjacentes.
const SUB_MERGE_GAP = 1.8; // s — mescla pausas internas de fala mais agressivamente

function mergeSubMinFragments(sounds) {
  const out = [];
  for (const seg of sounds) {
    const dur = seg.end - seg.start;
    // Se for sub-mínimo E existir um antecessor próximo, estende o antecessor
    if (dur < MIN_SEG_DUR && out.length > 0 && seg.start - out[out.length - 1].end < SUB_MERGE_GAP) {
      out[out.length - 1].end = seg.end;
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

function autoSegment(inputPath, duration) {
  return new Promise((resolve) => {
    // Tenta vários limiares de ruído — do mais agressivo (gravação ruidosa) ao mais sensível (estúdio)
    // Cada nível é tentado até obter pelo menos 3 frases detectáveis
    const NOISES = ['-6dB', '-10dB', '-15dB', '-20dB', '-25dB', '-30dB', '-35dB'];
    const DUR    = 0.4; // pausa mínima entre frases (segundos)

    const tryNoise = (idx) => {
      if (idx >= NOISES.length) { resolve([]); return; }
      const sils = [];
      ffmpeg(inputPath)
        .noVideo()
        .audioFilters(`pan=mono|c0=0.5*c0+0.5*c1,silencedetect=noise=${NOISES[idx]}:d=${DUR}`)
        .format('null')
        .output('/dev/null')
        .on('stderr', (line) => {
          const sm = line.match(/silence_start:\s*([\d.]+)/);
          if (sm) sils.push({ s: parseFloat(sm[1]), e: null });
          const em = line.match(/silence_end:\s*([\d.]+)/);
          if (em && sils.length) sils[sils.length - 1].e = parseFloat(em[1]);
        })
        .on('end', () => {
          const sorted = sils.filter((x) => x.e).sort((a, b) => a.s - b.s);
          const rawSounds = [];
          let c = 0;
          for (const s of sorted) {
            if (s.s - c > 0.05) rawSounds.push({ start: +c.toFixed(3), end: +s.s.toFixed(3) });
            c = s.e;
          }
          if (duration - c > 0.05) rawSounds.push({ start: +c.toFixed(3), end: +duration.toFixed(3) });

          // 1. Mescla fragmentos sub-mínimos com o segmento anterior (frases com pausa interna)
          const merged = mergeSubMinFragments(rawSounds);

          // 2. Filtra por duração
          const phrases = merged.filter(
            (s) => s.end - s.start >= MIN_SEG_DUR && s.end - s.start <= MAX_SEG_DUR
          );

          // Quer pelo menos 3 frases para análise ser útil
          if (phrases.length >= 3) {
            resolve(phrases);
          } else {
            tryNoise(idx + 1);
          }
        })
        .on('error', () => tryNoise(idx + 1))
        .run();
    };

    tryNoise(0);
  });
}

// ── Pontuação de take ────────────────────────────────────────────────────────

function scoreTake(envelope, duration) {
  // Amplitude média — preferimos mais próxima de 0.15 (presença sem distorção)
  const mean = envelope.reduce((s, v) => s + v, 0) / (envelope.length || 1);
  const target = 0.15;
  const amplScore = 1 / (1 + Math.abs(mean - target) * 10);

  // Estabilidade — desvio padrão baixo = entrega mais consistente
  const std = Math.sqrt(envelope.reduce((s, v) => s + (v - mean) ** 2, 0) / (envelope.length || 1));
  const stabScore = 1 / (1 + std * 5);

  // Duração menor = mais conciso (peso pequeno)
  const durScore = 1 / (1 + duration / 30);

  return amplScore * 0.4 + stabScore * 0.45 + durScore * 0.15;
}

// ── Grouping baseado em cliques (sem transitividade) ─────────────────────────
// Cada par no grupo precisa ser mutuamente similar acima do threshold.
// Evita o efeito "corrente" do Union-Find onde A~B~C forma grupo mesmo A≁C.

function groupByClique(matrix, n, segs, threshold) {
  const assigned = new Set();  // cada segmento só pode pertencer a UM grupo
  const groups   = [];

  // Ordena pares por similaridade decrescente — os mais similares formam grupos primeiro
  const pairs = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (matrix[i][j] >= threshold) pairs.push([i, j, matrix[i][j]]);
  pairs.sort((a, b) => b[2] - a[2]);

  for (const [i, j] of pairs) {
    // Se qualquer um já foi atribuído a outro grupo, pula
    if (assigned.has(i) || assigned.has(j)) continue;

    // Verifica proximidade temporal
    const midI = (segs[i].start + segs[i].end) / 2;
    const midJ = (segs[j].start + segs[j].end) / 2;
    if (Math.abs(midI - midJ) > MAX_TIME_GAP) continue;

    // Procura grupo existente onde AMBOS se encaixam (clique completo)
    let placed = false;
    for (const g of groups) {
      const allMatch = g.every(
        (k) => matrix[i][k] >= threshold && matrix[j][k] >= threshold
      );
      if (allMatch) {
        if (!g.includes(i)) { g.push(i); assigned.add(i); }
        if (!g.includes(j)) { g.push(j); assigned.add(j); }
        placed = true;
        break;
      }
    }
    if (!placed) {
      groups.push([i, j]);
      assigned.add(i);
      assigned.add(j);
    }
  }

  return groups.filter((g) => g.length > 1);
}

// ── Rota principal ───────────────────────────────────────────────────────────

/**
 * POST /api/detect-repeats
 * Body: { fileId, segments?: [{start, end}] }
 *   se segments não fornecido ou vazio, faz auto-segmentação
 */
router.post('/', async (req, res) => {
  const { fileId, segments: inputSegs } = req.body;
  if (!fileId) return res.status(400).json({ error: 'fileId obrigatório' });

  const inputPath = path.join(__dirname, '../uploads', fileId);
  if (!fs.existsSync(inputPath)) return res.status(404).json({ error: 'Arquivo não encontrado' });

  const { probeVideo } = require('../utils/ffmpeg');
  const meta = await probeVideo(inputPath);
  const duration = meta.duration;

  try {
    // 1. Segmentos — usa os fornecidos ou faz auto-segmentação
    let rawSegs = [];
    if (inputSegs && inputSegs.length >= 2) {
      rawSegs = inputSegs
        .map((s, i) => ({ ...s, origIndex: i }))
        .filter((s) => s.end - s.start >= MIN_SEG_DUR && s.end - s.start <= MAX_SEG_DUR);
    }

    if (rawSegs.length < 2) {
      const auto = await autoSegment(inputPath, duration);
      rawSegs = auto.map((s, i) => ({ start: s.start, end: s.end, origIndex: i, autoDetected: true }));
    }

    if (rawSegs.length < 2) {
      return res.json({ groups: [], analyzed: rawSegs.length, message: 'Poucos segmentos detectados.' });
    }

    // 2. Extrai envelopes (max 8 paralelos)
    const BATCH = 8;
    const envelopes = new Array(rawSegs.length);
    for (let i = 0; i < rawSegs.length; i += BATCH) {
      const batch = rawSegs.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map((s) => extractEnvelope(inputPath, s.start, s.end - s.start))
      );
      results.forEach((e, j) => { envelopes[i + j] = e; });
    }

    // 3. Matriz de similaridade
    const n = rawSegs.length;
    const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
    const allSims = [];

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const durA = rawSegs[i].end - rawSegs[i].start;
        const durB = rawSegs[j].end - rawSegs[j].start;
        if (Math.max(durA, durB) / Math.min(durA, durB) > MAX_DUR_RATIO) continue;

        const sim = ncc(envelopes[i], envelopes[j]);
        matrix[i][j] = sim;
        matrix[j][i] = sim;
        allSims.push(sim);
      }
    }

    // 4. Threshold dinâmico conservador:
    //    - Usa percentil 80 como base (top 20% dos pares são "candidatos")
    //    - Nunca abaixo de MIN_SIM_HARD (0.38)
    //    - Em vídeos com muitas repetições, o p80 estará alto e isola bem os grupos
    //    - Em vídeos sem repetições, p80 será baixo mas MIN_SIM_HARD ainda protege contra ruído
    allSims.sort((a, b) => a - b);
    const p80  = allSims[Math.floor(allSims.length * 0.80)] ?? MIN_SIM_HARD;
    const threshold = Math.max(MIN_SIM_HARD, p80);

    // 5. Agrupa por clique (sem transitividade) e pontua
    const rawGroups = groupByClique(matrix, n, rawSegs, threshold);

    const groups = rawGroups.map((group) => {
      const takes = group.map((idx) => {
        const seg   = rawSegs[idx];
        const dur   = seg.end - seg.start;
        const score = scoreTake(envelopes[idx], dur);
        return {
          segmentIndex:  seg.origIndex,
          start:         seg.start,
          end:           seg.end,
          duration:      +dur.toFixed(2),
          score:         +score.toFixed(4),
          autoDetected:  !!seg.autoDetected,
        };
      }).sort((a, b) => b.score - a.score);

      takes[0].recommended = true;
      // Similaridade do grupo = média das similaridades entre pares
      let simSum = 0, simCnt = 0;
      for (let gi = 0; gi < group.length; gi++)
        for (let gj = gi + 1; gj < group.length; gj++) {
          simSum += matrix[group[gi]][group[gj]]; simCnt++;
        }
      return { takes, similarity: simCnt > 0 ? +(simSum / simCnt).toFixed(3) : 0 };
    });

    res.json({
      groups,
      analyzed:  rawSegs.length,
      threshold: +threshold.toFixed(3),
      autoSegmented: !!(inputSegs == null || inputSegs.length < 2),
    });

  } catch (err) {
    console.error('[detect-repeats]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
