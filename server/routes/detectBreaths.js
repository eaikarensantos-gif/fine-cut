/**
 * Detecta respiros (inspirações audíveis entre falas).
 *
 * Estratégia:
 *   Sons curtos (< 0.5 s) que aparecem entre silêncios a -30 dB são respiros.
 *   Threshold -30 dB capta o respiro mas não silêncios profundos; min silence 0.08 s
 *   divide as falas em unidades individuais.
 */
const express = require('express');
const path = require('path');
const { ffmpeg } = require('../utils/ffmpeg');

const router = express.Router();

const BREATH_MAX_DUR = 0.5;  // segundos — mais curto que isso = respiro
const BREATH_MIN_DUR = 0.04; // muito curto = ruído, ignorar

function runSilenceDetect(filePath, noise, minSilence) {
  return new Promise((resolve, reject) => {
    const silences = [];
    ffmpeg(filePath)
      .noVideo()
      .audioFilters(`pan=mono|c0=0.5*c0+0.5*c1,silencedetect=noise=${noise}:d=${minSilence}`)
      .format('null')
      .output('/dev/null')
      .on('stderr', (line) => {
        const sm = line.match(/silence_start:\s*([\d.]+)/);
        if (sm) silences.push({ start: parseFloat(sm[1]), end: null });
        const em = line.match(/silence_end:\s*([\d.]+)/);
        if (em && silences.length > 0) silences[silences.length - 1].end = parseFloat(em[1]);
      })
      .on('end', () => resolve(silences.filter((s) => s.end !== null)))
      .on('error', reject)
      .run();
  });
}

router.get('/:fileId', async (req, res) => {
  const filePath = path.join(__dirname, '../uploads', req.params.fileId);
  const duration = parseFloat(req.query.duration || '0');

  try {
    // Sons entre silêncios de -30 dB (inclui respiros)
    const silences = await runSilenceDetect(filePath, '-30dB', '0.08');
    const sorted = silences.sort((a, b) => a.start - b.start);

    // Inverte para obter todos os sons
    const sounds = [];
    let cursor = 0;
    for (const s of sorted) {
      const soundDur = s.start - cursor;
      if (soundDur > BREATH_MIN_DUR) {
        sounds.push({ start: cursor, end: s.start, duration: soundDur });
      }
      cursor = s.end;
    }
    if (duration - cursor > BREATH_MIN_DUR) {
      sounds.push({ start: cursor, end: duration, duration: duration - cursor });
    }

    // Sons muito curtos → respiros
    const breaths = sounds
      .filter((s) => s.duration <= BREATH_MAX_DUR)
      .map((s) => ({ start: +s.start.toFixed(4), end: +s.end.toFixed(4), type: 'breath' }));

    res.json({ breaths, count: breaths.length });
  } catch (err) {
    console.error('[detect-breaths]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
