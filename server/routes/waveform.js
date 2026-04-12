const express = require('express');
const path = require('path');
const { ffmpeg } = require('../utils/ffmpeg');

const router = express.Router();

// Extrai peaks de áudio do vídeo e retorna como array normalizado [-1, 1]
router.get('/:fileId', (req, res) => {
  const filePath = path.join(__dirname, '../uploads', req.params.fileId);
  const samplesPerSecond = parseInt(req.query.sps || '100', 10); // samples por segundo

  const chunks = [];

  ffmpeg(filePath)
    .noVideo()
    .audioChannels(1)
    .audioFrequency(samplesPerSecond * 64) // taxa ajustada para downsampling
    .format('s16le') // 16-bit signed little-endian PCM
    .on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
    })
    .pipe()
    .on('data', (chunk) => chunks.push(chunk))
    .on('end', () => {
      const buffer = Buffer.concat(chunks);
      const samples = buffer.length / 2; // 16-bit = 2 bytes por sample
      const peaks = [];
      const blockSize = Math.floor(samples / (samplesPerSecond * 64 / samplesPerSecond));

      // Reduzir para samplesPerSecond peaks por segundo usando RMS
      const totalDesired = Math.ceil(samplesPerSecond * 64 / samplesPerSecond);
      const step = Math.floor(samples / totalDesired) || 1;

      for (let i = 0; i < samples; i += step) {
        let sum = 0;
        const end = Math.min(i + step, samples);
        for (let j = i; j < end; j++) {
          const val = buffer.readInt16LE(j * 2);
          sum += val * val;
        }
        const rms = Math.sqrt(sum / (end - i));
        peaks.push(parseFloat((rms / 32768).toFixed(4)));
      }

      res.json({ peaks, samplesPerSecond });
    });
});

module.exports = router;
