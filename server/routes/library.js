/**
 * Biblioteca de arquivos persistente.
 * Armazena metadata em server/library.json e thumbnails em server/thumbnails/
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { probeVideo, ffmpeg } = require('../utils/ffmpeg');

const router = express.Router();

const LIBRARY_FILE = path.join(__dirname, '../library.json');
const THUMBS_DIR = path.join(__dirname, '../thumbnails');
const UPLOADS_DIR = path.join(__dirname, '../uploads');

// Garantir que o diretório de thumbnails existe
if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });

function loadLibrary() {
  if (!fs.existsSync(LIBRARY_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8')); } catch { return []; }
}

function saveLibrary(entries) {
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(entries, null, 2));
}

function generateThumb(inputPath, outputPath, atSecond = 3) {
  return new Promise((resolve) => {
    ffmpeg(inputPath)
      .seekInput(atSecond)
      .frames(1)
      .size('320x?')
      .output(outputPath)
      .on('end', () => resolve(true))
      .on('error', () => resolve(false))
      .run();
  });
}

// GET /api/library — lista todos os arquivos
router.get('/', (_req, res) => {
  const entries = loadLibrary().filter((e) => {
    // Verificar se o arquivo ainda existe
    return fs.existsSync(e.filePath);
  });
  res.json(entries);
});

// POST /api/library/add — adiciona arquivo já upado ou por caminho absoluto
router.post('/add', async (req, res) => {
  const { fileId, name } = req.body;
  if (!fileId) return res.status(400).json({ error: 'fileId obrigatório' });

  const filePath = path.join(UPLOADS_DIR, fileId);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' });

  const library = loadLibrary();
  if (library.find((e) => e.fileId === fileId)) {
    return res.json(library.find((e) => e.fileId === fileId)); // já existe
  }

  try {
    const info = await probeVideo(filePath);
    const thumbFile = `${fileId}.jpg`;
    const thumbPath = path.join(THUMBS_DIR, thumbFile);
    await generateThumb(filePath, thumbPath, Math.min(3, info.duration * 0.1));

    const entry = {
      id: fileId,
      fileId,
      name: name || path.basename(filePath),
      filePath,
      videoUrl: `/videos/${fileId}`,
      thumbUrl: `/thumbnails/${thumbFile}`,
      duration: info.duration,
      fps: info.fps,
      width: info.width,
      height: info.height,
      hasAudio: info.hasAudio,
      addedAt: new Date().toISOString(),
    };

    library.push(entry);
    saveLibrary(library);
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/library/:id — remove da biblioteca (NÃO deleta o arquivo)
router.delete('/:id', (req, res) => {
  const library = loadLibrary().filter((e) => e.id !== req.params.id);
  saveLibrary(library);
  res.json({ ok: true });
});

// PUT /api/library/:id/rename
router.put('/:id/rename', (req, res) => {
  const { name } = req.body;
  const library = loadLibrary().map((e) =>
    e.id === req.params.id ? { ...e, name } : e
  );
  saveLibrary(library);
  res.json({ ok: true });
});

module.exports = router;
