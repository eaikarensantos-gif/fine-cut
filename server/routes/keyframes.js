/**
 * GET /api/keyframes/:fileId
 * Retorna os timestamps dos keyframes (I-frames) do vídeo.
 * Usado pelo cliente para:
 *  - Exibir marcadores na waveform (onde é possível corte lossless)
 *  - Orientar a UI para sugerir pontos de corte limpos
 */
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { getKeyframes } = require('../utils/ffmpeg');

const router = express.Router();

router.get('/:fileId', async (req, res) => {
  const inputPath = path.join(__dirname, '../uploads', req.params.fileId);
  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ error: 'Arquivo não encontrado' });
  }
  try {
    const keyframes = await getKeyframes(inputPath);
    res.json({ keyframes, count: keyframes.length });
  } catch (err) {
    console.error('[keyframes]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
