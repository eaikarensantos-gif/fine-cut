const express = require('express');
const multer = require('multer');
const path = require('path');
const { probeVideo } = require('../utils/ffmpeg');

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads'),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4GB
  fileFilter: (_req, file, cb) => {
    const allowed = /mp4|mov|avi|mkv|webm|m4v/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Formato não suportado. Use MP4, MOV, AVI, MKV ou WebM.'));
    }
  },
});

router.post('/', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const info = await probeVideo(req.file.path);

    res.json({
      fileId: req.file.filename,
      videoUrl: `/videos/${req.file.filename}`,
      ...info,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
