const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');

// Aponta para os binários empacotados — funciona sem instalar ffmpeg no sistema
ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

/**
 * Retorna metadata do vídeo: duration, fps, width, height
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
        duration: metadata.format.duration,
        fps: parseFloat(fps.toFixed(4)),
        width: videoStream.width,
        height: videoStream.height,
        hasAudio: !!audioStream,
        filename: metadata.format.filename,
      });
    });
  });
}

module.exports = { probeVideo, ffmpeg };
