const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const { ffmpeg } = require('../utils/ffmpeg');

const router = express.Router();

// Detecta silêncios no áudio
router.get('/silence/:fileId', (req, res) => {
  const filePath = path.join(__dirname, '../uploads', req.params.fileId);
  const noise = req.query.noise || '-30dB';
  const duration = parseFloat(req.query.duration || '0.3');

  const results = [];
  let stderr = '';

  ffmpeg(filePath)
    .noVideo()
    .audioFilters(`silencedetect=noise=${noise}:d=${duration}`)
    .format('null')
    .output('/dev/null')
    .on('stderr', (line) => {
      stderr += line + '\n';

      // silence_start: 1.234
      const startMatch = line.match(/silence_start:\s*([\d.]+)/);
      if (startMatch) {
        results.push({ start: parseFloat(startMatch[1]), end: null });
      }

      // silence_end: 2.567 | silence_duration: 1.333
      const endMatch = line.match(/silence_end:\s*([\d.]+)/);
      if (endMatch && results.length > 0) {
        results[results.length - 1].end = parseFloat(endMatch[1]);
      }
    })
    .on('end', () => {
      // Filtrar entradas sem end (silêncio até o fim do vídeo)
      const silences = results.map((r) => ({
        type: 'silence',
        start: r.start,
        end: r.end ?? null,
      }));
      res.json({ silences });
    })
    .on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    })
    .run();
});

// Detecta cortes de cena
router.get('/scenes/:fileId', (req, res) => {
  const filePath = path.join(__dirname, '../uploads', req.params.fileId);
  const threshold = parseFloat(req.query.threshold || '10');

  const scenes = [];

  ffmpeg(filePath)
    .noAudio()
    .videoFilters(`scdet=threshold=${threshold}`)
    .format('null')
    .output('/dev/null')
    .on('stderr', (line) => {
      // lavfi.scd.time=1.234
      const match = line.match(/lavfi\.scd\.time=([\d.]+)/);
      if (match) {
        scenes.push({ type: 'scene', time: parseFloat(match[1]) });
      }
    })
    .on('end', () => res.json({ scenes }))
    .on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    })
    .run();
});

module.exports = router;
