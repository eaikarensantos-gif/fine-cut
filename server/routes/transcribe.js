/**
 * POST /api/transcribe
 * Body: { fileId }
 *
 * Transcreve o vídeo usando Whisper LOCAL (openai-whisper via Python).
 * Retorna: { words: [{word, start, end}], segments: [{text, start, end}], text }
 *
 * Não requer API key — roda 100% local usando o modelo "tiny" (~72 MB RAM).
 * No Apple Silicon, transcreve ~10x real-time (vídeo de 9 min ≈ 1 min).
 */

const express   = require('express');
const path      = require('path');
const fs        = require('fs');
const os        = require('os');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const router = express.Router();

// Caminho do whisper CLI (instalado via pip3 install openai-whisper)
// Suporta variável de ambiente WHISPER_PATH para ambientes customizados
const WHISPER_PATHS = [
  process.env.WHISPER_PATH,
  '/usr/local/bin/whisper',
  '/opt/homebrew/bin/whisper',
  'whisper',
].filter(Boolean);

let _cachedWhisperPath = null;

function findWhisper() {
  // Retorna resultado cacheado se já encontrou antes
  if (_cachedWhisperPath) return _cachedWhisperPath;

  for (const p of WHISPER_PATHS) {
    try {
      const r = require('child_process').spawnSync(p, ['--help'], {
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (r.status === 0) {
        _cachedWhisperPath = p;
        console.log(`[transcribe] Whisper encontrado: ${p}`);
        return p;
      }
    } catch {}
  }
  return null;
}

// ── Extrai áudio WAV 16kHz mono (formato ideal para Whisper) ────────────────

function extractAudio(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-vn', '-ar', '16000', '-ac', '1',
      '-f', 'wav', '-y', outputPath,
    ];
    const proc = spawn(ffmpegPath, args);
    proc.stderr.on('data', () => {});
    proc.on('error', reject);
    proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });
}

// ── Rota principal ────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  const { fileId } = req.body;
  if (!fileId) return res.status(400).json({ error: 'fileId obrigatório' });

  const whisperBin = findWhisper();
  if (!whisperBin) {
    return res.status(500).json({
      error: 'Whisper não encontrado. Instale com: pip3 install --user openai-whisper',
    });
  }

  const inputPath = path.join(__dirname, '../uploads', fileId);
  if (!fs.existsSync(inputPath)) return res.status(404).json({ error: 'Arquivo não encontrado' });

  const tmpDir  = path.join(os.tmpdir(), `fc_whisper_${Date.now()}`);
  const tmpWav  = path.join(tmpDir, 'audio.wav');
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // 1. Extrai áudio WAV 16kHz mono
    console.log('[transcribe] Extraindo áudio...');
    await extractAudio(inputPath, tmpWav);

    // 2. Roda Whisper local (modelo tiny para velocidade máxima)
    console.log('[transcribe] Rodando Whisper (modelo tiny)...');
    const result = await new Promise((resolve, reject) => {
      const args = [
        tmpWav,
        '--model', 'tiny',
        '--language', 'pt',
        '--output_format', 'json',
        '--output_dir', tmpDir,
        '--word_timestamps', 'True',
      ];

      // Garante que ffmpeg (do ffmpeg-static) esteja no PATH do whisper
      const ffmpegDir = path.dirname(ffmpegPath);
      const pythonBinDir = path.dirname(whisperBin);
      const extraPath = [ffmpegDir, pythonBinDir, process.env.PATH].join(':');

      const WHISPER_TIMEOUT = 10 * 60 * 1000; // 10 minutos
      const proc = spawn(whisperBin, args, {
        env: { ...process.env, PATH: extraPath, PYTHONIOENCODING: 'utf-8' },
      });

      const killTimer = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error('Whisper excedeu o tempo limite de 10 minutos'));
      }, WHISPER_TIMEOUT);

      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
        const line = d.toString().trim();
        if (line && !line.startsWith('UserWarning')) {
          process.stderr.write(`[whisper] ${line}\n`);
        }
      });
      proc.stdout.on('data', () => {});
      proc.on('error', (err) => { clearTimeout(killTimer); reject(err); });
      proc.on('close', (code) => {
        clearTimeout(killTimer);
        if (code !== 0) return reject(new Error(`Whisper exited ${code}: ${stderr.slice(-500)}`));

        // Lê o JSON de saída
        const jsonPath = path.join(tmpDir, 'audio.json');
        if (!fs.existsSync(jsonPath)) return reject(new Error('Whisper não gerou arquivo JSON'));

        try {
          const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
          resolve(raw);
        } catch (e) {
          reject(new Error(`Erro ao parsear JSON do Whisper: ${e.message}`));
        }
      });
    });

    // 3. Normaliza a resposta
    const text = result.text || '';
    const segments = (result.segments || []).map((s) => ({
      text:  s.text?.trim() || '',
      start: s.start,
      end:   s.end,
    }));

    // Extrai words do campo segments[].words (whisper JSON v3 format)
    const words = [];
    for (const seg of result.segments || []) {
      for (const w of seg.words || []) {
        words.push({
          word:  (w.word || '').trim(),
          start: w.start,
          end:   w.end,
        });
      }
    }

    console.log(`[transcribe] Concluído: ${words.length} palavras, ${segments.length} segmentos`);
    res.json({ words, segments, text });

  } catch (err) {
    console.error('[transcribe]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  } finally {
    // Limpa arquivos temporários
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

module.exports = router;
