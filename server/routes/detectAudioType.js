/**
 * Detecta regiões de voz vs música.
 *
 * Estratégia baseada em análise empírica do áudio real:
 *   - Música: energia CONTÍNUA na faixa 1k–3 kHz (≈ 0 pausas/seg)
 *   - Voz:    energia INTERMITENTE na faixa 1k–3 kHz (≥ 0.5 pausas/seg — fronteiras de palavras)
 *
 * Passos:
 *   1. silencedetect no áudio completo → regiões de som vs silêncio total
 *   2. silencedetect na faixa 1k–3 kHz, threshold −20 dB, d=0.05 s → micro-pausas de fala
 *   3. Para cada região de som: conta micro-pausas dentro dela
 *      - pausas/segundo > VOICE_RATE_THRESHOLD  → voz
 *      - pausas/segundo ≤ VOICE_RATE_THRESHOLD  → música
 */
const express = require('express');
const path = require('path');
const { ffmpeg } = require('../utils/ffmpeg');

const router = express.Router();

// Quantas micro-pausas por segundo indicam fala (calibrado empiricamente)
const VOICE_RATE_THRESHOLD = 0.5;

function runSilenceDetect(filePath, filter) {
  return new Promise((resolve, reject) => {
    const silences = [];
    ffmpeg(filePath)
      .noVideo()
      .audioFilters(filter)
      .format('null')
      .output('/dev/null')
      .on('stderr', (line) => {
        const sm = line.match(/silence_start:\s*([\d.]+)/);
        if (sm) silences.push({ start: parseFloat(sm[1]), end: null });
        const em = line.match(/silence_end:\s*([\d.]+)/);
        if (em && silences.length > 0) silences[silences.length - 1].end = parseFloat(em[1]);
      })
      .on('end', () => resolve(silences))
      .on('error', reject)
      .run();
  });
}

/** Inverte lista de silêncios → regiões de som */
function invertSilences(silences, duration) {
  const sorted = silences.filter((s) => s.end !== null).sort((a, b) => a.start - b.start);
  const sound = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.start - cursor > 0.05) sound.push({ start: cursor, end: s.start });
    cursor = s.end;
  }
  if (duration - cursor > 0.05) sound.push({ start: cursor, end: duration });
  return sound;
}

/** Conta quantas micro-pausas (start points) caem dentro de [a, b] */
function countPausesInRegion(pauseStarts, a, b) {
  return pauseStarts.filter((t) => t >= a && t <= b).length;
}

router.get('/:fileId', async (req, res) => {
  const filePath = path.join(__dirname, '../uploads', req.params.fileId);
  const { duration } = req.query;
  const totalDur = parseFloat(duration || '0');

  try {
    const [allSilences, voiceBandSilences] = await Promise.all([
      // 1. Som geral
      runSilenceDetect(filePath, 'pan=mono|c0=0.5*c0+0.5*c1,silencedetect=noise=-40dB:d=0.3'),
      // 2. Micro-pausas na faixa de voz (1k–3 kHz, threshold −20 dB, janela 0.05 s)
      runSilenceDetect(filePath, 'pan=mono|c0=0.5*c0+0.5*c1,highpass=f=1000,lowpass=f=3000,silencedetect=noise=-20dB:d=0.05'),
    ]);

    const soundRegions = invertSilences(allSilences, totalDur);

    // Timestamps de início das micro-pausas (onde as palavras terminam)
    const pauseStarts = voiceBandSilences
      .filter((s) => s.end !== null)
      .map((s) => s.start);

    const speech = [];
    const music  = [];

    for (const region of soundRegions) {
      const dur = region.end - region.start;
      if (dur < 0.05) continue;

      const pauses    = countPausesInRegion(pauseStarts, region.start, region.end);
      const pauseRate = pauses / dur; // pausas por segundo

      if (pauseRate > VOICE_RATE_THRESHOLD) {
        speech.push({ ...region, type: 'speech' });
      } else {
        music.push({ ...region, type: 'music' });
      }
    }

    // Silêncios puros
    const silence = allSilences
      .filter((s) => s.end !== null)
      .map((s) => ({ start: s.start, end: s.end, type: 'silence' }));

    res.json({ speech, music, silence });
  } catch (err) {
    console.error('[detect-audio-type]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
