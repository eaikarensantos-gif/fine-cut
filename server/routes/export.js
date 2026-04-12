const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { ffmpeg } = require('../utils/ffmpeg');

const router = express.Router();

/**
 * Extrai segmento com STREAM COPY — sem re-encode, praticamente instantâneo.
 * Usa -ss antes do input para seek rápido por keyframe.
 * Nota: o corte é no keyframe mais próximo (± alguns frames). Para cortes
 * frame-precisos, usar mode 'reencode'.
 */
function extractSegmentCopy(inputPath, start, duration, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions([`-ss ${start}`])
      .outputOptions([
        `-t ${duration}`,
        '-c copy',
        '-avoid_negative_ts make_zero',
        '-map 0',
      ])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

/**
 * Extrai segmento com RE-ENCODE (frame-preciso, lento).
 * Usado apenas para qualidade Alta/Lossless.
 */
function extractSegmentEncode(inputPath, start, duration, outputPath, crf, preset) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions([`-ss ${start}`])
      .outputOptions([
        `-t ${duration}`,
        '-c:v libx264',
        `-preset ${preset}`,
        `-crf ${crf}`,
        '-c:a aac',
        '-b:a 192k',
        '-avoid_negative_ts make_zero',
      ])
      .output(outputPath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

/**
 * Concatena via demuxer — stream copy, sem re-encode.
 */
function concatSegments(segPaths, outputPath) {
  return new Promise((resolve, reject) => {
    const listPath = outputPath + '.txt';
    const listContent = segPaths
      .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "\\'")}'`)
      .join('\n');
    fs.writeFileSync(listPath, listContent);

    ffmpeg()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy', '-movflags +faststart'])
      .output(outputPath)
      .on('end', () => { try { fs.unlinkSync(listPath); } catch {} resolve(); })
      .on('error', (err) => { try { fs.unlinkSync(listPath); } catch {} reject(err); })
      .run();
  });
}

/**
 * POST /api/export
 * Body: { fileId, segments: [{start, end}], quality?: 'draft'|'normal'|'high'|'lossless' }
 *
 * draft / normal  → stream copy (instantâneo, qualidade original)
 * high            → re-encode libx264 crf 18 medium (lento, frame-preciso)
 * lossless        → re-encode libx264 crf 0 slow    (muito lento)
 */
router.post('/', async (req, res) => {
  const { fileId, segments, quality = 'normal' } = req.body;

  if (!fileId || !segments?.length) {
    return res.status(400).json({ error: 'fileId e segments são obrigatórios' });
  }

  const inputPath = path.join(__dirname, '../uploads', fileId);
  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ error: 'Arquivo não encontrado' });
  }

  const useEncode = quality === 'high' || quality === 'lossless';
  const encodeOpts = {
    high:     { crf: 18, preset: 'medium' },
    lossless: { crf: 0,  preset: 'slow'   },
  };

  const io = req.io;
  const jobId = Date.now();
  const tmpDir = os.tmpdir();
  const segPaths = [];
  const outputPath = path.join(tmpDir, `export-${jobId}.mp4`);

  const cleanup = () => {
    for (const p of segPaths) { try { fs.unlinkSync(p); } catch {} }
    try { fs.unlinkSync(outputPath); } catch {}
  };

  try {
    if (io) io.emit('export:progress', { percent: 2 });

    // Passo 1: extrair cada segmento
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const duration = seg.end - seg.start;
      if (duration <= 0.01) continue;

      const segPath = path.join(tmpDir, `seg-${jobId}-${i}.mp4`);
      segPaths.push(segPath);

      if (useEncode) {
        const opts = encodeOpts[quality] ?? encodeOpts.high;
        await extractSegmentEncode(inputPath, seg.start, duration, segPath, opts.crf, opts.preset);
      } else {
        await extractSegmentCopy(inputPath, seg.start, duration, segPath);
      }

      const pct = Math.round(5 + ((i + 1) / segments.length) * 80);
      if (io) io.emit('export:progress', { percent: pct });
    }

    if (segPaths.length === 0) {
      return res.status(400).json({ error: 'Nenhum segmento válido.' });
    }

    if (io) io.emit('export:progress', { percent: 88 });

    // Passo 2: concatenar (sempre stream copy)
    if (segPaths.length === 1) {
      fs.renameSync(segPaths[0], outputPath);
      segPaths.length = 0;
    } else {
      await concatSegments(segPaths, outputPath);
    }

    if (io) io.emit('export:progress', { percent: 98 });
    if (io) io.emit('export:done');

    // Passo 3: enviar com streaming (pipe direto, sem buffer em memória)
    const stat = fs.statSync(outputPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="fine-cut-export.mp4"');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'no-store');

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end', () => cleanup());
    stream.on('error', () => cleanup());

  } catch (err) {
    console.error('[export] erro:', err.message);
    cleanup();
    if (io) io.emit('export:error', { message: err.message });
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
