const express = require('express');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const { ffmpeg } = require('../utils/ffmpeg');

const router = express.Router();

// ── Extração de segmentos ────────────────────────────────────────────────────

/**
 * DRAFT — seek rápido antes do input, stream copy.
 * Mais veloz. Corte no keyframe mais próximo (pode incluir 0-2s extras no início).
 */
function extractDraft(inputPath, start, duration, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions([`-ss ${start}`])
      .outputOptions([`-t ${duration}`, '-c copy', '-avoid_negative_ts make_zero', '-map 0'])
      .output(outputPath)
      .on('end', resolve).on('error', reject).run();
  });
}

/**
 * NORMAL — dual-seek (seek rápido + seek preciso dentro da janela) + stream copy.
 * Início de segmento frame-preciso sem re-encode. Negligenciável atraso extra vs draft.
 * Técnica: -ss (start-5) antes do input para seek rápido, -ss 5 na saída para
 * trim preciso dentro do GOP decodificado.
 */
function extractNormal(inputPath, start, duration, outputPath) {
  const preseek    = Math.max(0, start - 5);
  const seekOffset = parseFloat((start - preseek).toFixed(6));
  const opts = [`-t ${duration}`, '-c copy', '-avoid_negative_ts make_zero', '-map 0'];
  if (seekOffset > 0.001) opts.unshift(`-ss ${seekOffset}`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions([`-ss ${preseek}`])
      .outputOptions(opts)
      .output(outputPath)
      .on('end', resolve).on('error', reject).run();
  });
}

/**
 * SMART — seek preciso + re-encode com preset ultrafast + CRF 18.
 * Frame-preciso, qualidade próxima ao original, muito mais rápido que High.
 * Use quando precisar de cortes exatos sem aceitar a lentidão do re-encode completo.
 */
function extractSmart(inputPath, start, duration, outputPath) {
  const preseek    = Math.max(0, start - 2);
  const seekOffset = parseFloat((start - preseek).toFixed(6));
  const opts = [
    `-t ${duration}`,
    '-c:v libx264', '-preset ultrafast', '-crf 18',
    '-c:a copy',
    '-avoid_negative_ts make_zero',
  ];
  if (seekOffset > 0.001) opts.unshift(`-ss ${seekOffset}`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions([`-ss ${preseek}`])
      .outputOptions(opts)
      .output(outputPath)
      .on('end', resolve).on('error', reject).run();
  });
}

/**
 * HIGH / LOSSLESS — seek preciso + re-encode full quality.
 * Frame-preciso. High = CRF 18 medium. Lossless = CRF 0 slow (sem perda).
 */
function extractEncode(inputPath, start, duration, outputPath, crf, preset) {
  const preseek    = Math.max(0, start - 2);
  const seekOffset = parseFloat((start - preseek).toFixed(6));
  const opts = [
    `-t ${duration}`,
    '-c:v libx264', `-preset ${preset}`, `-crf ${crf}`,
    '-c:a aac', '-b:a 192k',
    '-avoid_negative_ts make_zero',
  ];
  if (seekOffset > 0.001) opts.unshift(`-ss ${seekOffset}`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions([`-ss ${preseek}`])
      .outputOptions(opts)
      .output(outputPath)
      .on('end', resolve).on('error', reject).run();
  });
}

// Mapa de qualidade → função de extração
const EXTRACT = {
  draft:    (inp, s, d, out) => extractDraft(inp, s, d, out),
  normal:   (inp, s, d, out) => extractNormal(inp, s, d, out),
  smart:    (inp, s, d, out) => extractSmart(inp, s, d, out),
  high:     (inp, s, d, out) => extractEncode(inp, s, d, out, 18, 'medium'),
  lossless: (inp, s, d, out) => extractEncode(inp, s, d, out, 0,  'slow'),
};

// ── Concatenação ─────────────────────────────────────────────────────────────

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
      .on('end',   () => { try { fs.unlinkSync(listPath); } catch {} resolve(); })
      .on('error', (err) => { try { fs.unlinkSync(listPath); } catch {} reject(err); })
      .run();
  });
}

// ── Rota principal ────────────────────────────────────────────────────────────

/**
 * POST /api/export
 * Body: { fileId, segments: [{start, end}], quality?: 'draft'|'normal'|'smart'|'high'|'lossless' }
 *
 * draft    → stream copy, seek rápido (keyframe boundary)   — instantâneo
 * normal   → stream copy, dual-seek (frame-preciso)          — quase instantâneo ✓ padrão
 * smart    → re-encode ultrafast CRF18 (frame-preciso)       — rápido, visualmente lossless
 * high     → re-encode medium CRF18 (melhor qualidade)       — lento
 * lossless → re-encode slow CRF0 (sem nenhuma perda)         — muito lento
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

  const extractFn = EXTRACT[quality] ?? EXTRACT.normal;
  const io        = req.io;
  const jobId     = Date.now();
  const tmpDir    = os.tmpdir();
  const segPaths  = [];
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

      await extractFn(inputPath, seg.start, duration, segPath);

      const pct = Math.round(5 + ((i + 1) / segments.length) * 80);
      if (io) io.emit('export:progress', { percent: pct });
    }

    if (segPaths.length === 0) {
      return res.status(400).json({ error: 'Nenhum segmento válido.' });
    }

    if (io) io.emit('export:progress', { percent: 88 });

    // Passo 2: concatenar
    if (segPaths.length === 1) {
      fs.renameSync(segPaths[0], outputPath);
      segPaths.length = 0;
    } else {
      await concatSegments(segPaths, outputPath);
    }

    if (io) io.emit('export:progress', { percent: 98 });
    if (io) io.emit('export:done');

    // Passo 3: stream para o cliente
    const stat = fs.statSync(outputPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="fine-cut-export.mp4"');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'no-store');

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('end',   () => cleanup());
    stream.on('error', () => cleanup());

  } catch (err) {
    console.error('[export] erro:', err.message);
    cleanup();
    if (io) io.emit('export:error', { message: err.message });
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
