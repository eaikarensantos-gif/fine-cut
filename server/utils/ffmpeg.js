const ffmpeg          = require('fluent-ffmpeg');
const ffmpegStatic    = require('ffmpeg-static');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const { spawn }       = require('child_process');

// Aponta para os binários empacotados — funciona sem instalar ffmpeg no sistema
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

/**
 * Retorna metadata do vídeo: duration, fps, width, height, hasAudio
 */
function probeVideo(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

      if (!videoStream) return reject(new Error('No video stream found'));

      // r_frame_rate é uma fração, ex: "30000/1001" para 29.97
      const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
      const fps = den ? num / den : num;

      resolve({
        duration:  metadata.format.duration,
        fps:       parseFloat(fps.toFixed(4)),
        width:     videoStream.width,
        height:    videoStream.height,
        hasAudio:  !!audioStream,
        filename:  metadata.format.filename,
      });
    });
  });
}

/**
 * Retorna a lista completa de timestamps de keyframes (I-frames) do vídeo.
 * Útil para display na waveform e para orientar cortes lossless.
 * Nota: em vídeos longos pode retornar milhares de entradas.
 */
function getKeyframes(inputPath) {
  return new Promise((resolve) => {
    const args = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'packet=pts_time,flags',
      '-of', 'csv',
      inputPath,
    ];
    const proc = spawn(ffprobeInstaller.path, args);
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', () => {});
    proc.on('close', () => {
      const kfs = [];
      for (const line of out.split('\n')) {
        const parts = line.trim().split(',');
        if (parts[0] !== 'packet' || parts.length < 3) continue;
        const t     = parseFloat(parts[1]);
        const flags = parts[2] || '';
        if (!isNaN(t) && flags.includes('K')) {
          kfs.push(parseFloat(t.toFixed(4)));
        }
      }
      resolve(kfs.sort((a, b) => a - b));
    });
    proc.on('error', () => resolve([]));
  });
}

/**
 * Encontra o keyframe mais próximo de `time` (até `radius` segundos de raio).
 * Retorna { before: número|null, after: número|null }.
 * `before` = último keyframe ≤ time
 * `after`  = primeiro keyframe ≥ time
 */
function findKeyframeNear(inputPath, time, radius = 12) {
  return new Promise((resolve) => {
    const scanStart = Math.max(0, time - radius);
    const scanEnd   = time + 2;
    const args = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'packet=pts_time,flags',
      '-read_intervals', `${scanStart}%${scanEnd}`,
      '-of', 'csv',
      inputPath,
    ];
    const proc = spawn(ffprobeInstaller.path, args);
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.stderr.on('data', () => {});
    proc.on('close', () => {
      let before = null;
      let after  = null;
      for (const line of out.split('\n')) {
        const parts = line.trim().split(',');
        if (parts[0] !== 'packet' || parts.length < 3) continue;
        const t     = parseFloat(parts[1]);
        const flags = parts[2] || '';
        if (isNaN(t) || !flags.includes('K')) continue;
        if (t <= time + 0.001) before = parseFloat(t.toFixed(4));
        if (t >= time - 0.001 && after === null) after = parseFloat(t.toFixed(4));
      }
      resolve({ before, after });
    });
    proc.on('error', () => resolve({ before: null, after: null }));
  });
}

module.exports = { probeVideo, ffmpeg, getKeyframes, findKeyframeNear };
