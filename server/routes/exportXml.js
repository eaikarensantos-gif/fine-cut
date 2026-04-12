/**
 * exportXml.js
 * Gera timelines XML para editores profissionais — inspirado no buttercut gem.
 * Suporta: FCPXML 1.8 (Final Cut Pro X) e xmeml v5 (Premiere / FCP7)
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { probeVideo } = require('../utils/ffmpeg');

const router = express.Router();

// ─── Helpers de tempo racional (estilo buttercut) ──────────────────────────

/**
 * Converte segundos para racional FCPXML "{frames}/{rate_den}s"
 * Ex: 29.97fps → frameDuration = 1001/30000s
 *     Para t = 2.5s → round(2.5 * 30000/1001) = 74 frames → "74574/30000s"
 */
function toFCPXTime(seconds, fps) {
  const { num, den } = fpsRational(fps);
  const frames = Math.round(seconds * num / den);
  if (frames === 0) return '0s';
  return `${frames * den}/${num}s`;
}

/**
 * fps → { num, den } da fração canônica do frame rate
 * 29.97 → 30000/1001, 23.976 → 24000/1001, etc.
 */
function fpsRational(fps) {
  const rounded = Math.round(fps);
  const isDropFrame = Math.abs(fps - rounded + 0.03) < 0.01 || Math.abs(fps * 1001 - rounded * 1000) < 1;
  if (isDropFrame && rounded > 0) {
    return { num: rounded * 1000, den: 1001 };
  }
  return { num: rounded, den: 1 };
}

/** Converte fps para frameDuration FCPXML */
function frameDuration(fps) {
  const { num, den } = fpsRational(fps);
  return `${den}/${num}s`;
}

/** Nome de formato FCPXML baseado nas dimensões e fps */
function fcpxFormatName(width, height, fps) {
  const res = height >= 2160 ? '4K' : height >= 1080 ? '1080' : height >= 720 ? '720' : `${height}`;
  const rate = Math.round(fps);
  const drop = Math.abs(fps - rate) > 0.01 ? 'p' : 'p';
  return `FFVideoFormat${res}${drop}${rate}`;
}

/** Gera UUID simples */
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }).toUpperCase();
}

// ─── Gerador FCPXML 1.8 (Final Cut Pro X) ─────────────────────────────────

function generateFCPXML({ filePath, fileId, info, segments }) {
  const { fps, duration, width, height } = info;
  const assetId = 'r2';
  const formatId = 'r1';
  const assetUID = uuid();
  const eventUID = uuid();
  const totalDur = segments.reduce((a, s) => a + (s.end - s.start), 0);
  const projectName = `Fine Cut — ${new Date().toISOString().slice(0, 10)}`;
  const absPath = path.resolve(filePath);
  const fileURI = `file://${absPath}`;

  let spineClips = '';
  let offset = 0;
  for (const seg of segments) {
    const dur = seg.end - seg.start;
    spineClips += `            <asset-clip name="${path.basename(filePath)}" ref="${assetId}" offset="${toFCPXTime(offset, fps)}" start="${toFCPXTime(seg.start, fps)}" duration="${toFCPXTime(dur, fps)}" audioRole="dialogue.dialogue-1"/>\n`;
    offset += dur;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.8">
  <resources>
    <format id="${formatId}" name="${fcpxFormatName(width, height, fps)}" frameDuration="${frameDuration(fps)}" width="${width}" height="${height}"/>
    <asset id="${assetId}" name="${path.basename(filePath, path.extname(filePath))}" uid="${assetUID}" start="0s" duration="${toFCPXTime(duration, fps)}" hasVideo="1" hasAudio="${info.hasAudio ? 1 : 0}" videoSources="1" audioSources="${info.hasAudio ? 1 : 0}" audioChannels="2">
      <media-rep kind="original-media" sig="${assetUID}" src="${fileURI}"/>
    </asset>
  </resources>
  <library>
    <event name="Fine Cut" uid="${eventUID}">
      <project name="${projectName}">
        <sequence format="${formatId}" duration="${toFCPXTime(totalDur, fps)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
${spineClips}          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;
}

// ─── Gerador xmeml v5 (Premiere Pro / FCP7) ───────────────────────────────

function secondsToFrames(seconds, fps) {
  return Math.round(seconds * fps);
}

function generateXmeml({ filePath, info, segments }) {
  const { fps, duration, width, height } = info;
  const fpsInt = Math.round(fps);
  const isNTSC = Math.abs(fps - fpsInt) > 0.01;
  const totalFrames = segments.reduce((a, s) => a + secondsToFrames(s.end - s.start, fps), 0);
  const absPath = path.resolve(filePath);
  const fileURI = `file://${absPath}`;
  const projectName = `Fine Cut — ${new Date().toISOString().slice(0, 10)}`;

  const rateBlock = `<rate>
          <timebase>${fpsInt}</timebase>
          <ntsc>${isNTSC ? 'TRUE' : 'FALSE'}</ntsc>
        </rate>`;

  let videoItems = '';
  let audioItems = '';
  let trackStart = 0;

  for (const seg of segments) {
    const inF = secondsToFrames(seg.start, fps);
    const outF = secondsToFrames(seg.end, fps);
    const durF = outF - inF;
    const startF = trackStart;
    const endF = trackStart + durF;

    const clipBlock = `
          <clipitem>
            ${rateBlock}
            <name>${path.basename(filePath)}</name>
            <duration>${secondsToFrames(duration, fps)}</duration>
            <in>${inF}</in>
            <out>${outF}</out>
            <start>${startF}</start>
            <end>${endF}</end>
            <file>
              <name>${path.basename(filePath)}</name>
              <pathurl>${fileURI}</pathurl>
              ${rateBlock}
              <duration>${secondsToFrames(duration, fps)}</duration>
              <media>
                <video>
                  <samplecharacteristics>
                    ${rateBlock}
                    <width>${width}</width>
                    <height>${height}</height>
                  </samplecharacteristics>
                </video>
                ${info.hasAudio ? '<audio><channelcount>2</channelcount></audio>' : ''}
              </media>
            </file>
          </clipitem>`;

    videoItems += clipBlock;
    if (info.hasAudio) audioItems += clipBlock;
    trackStart = endF;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<xmeml version="5">
  <sequence>
    <name>${projectName}</name>
    <duration>${totalFrames}</duration>
    ${rateBlock}
    <media>
      <video>
        <format>
          <samplecharacteristics>
            ${rateBlock}
            <width>${width}</width>
            <height>${height}</height>
          </samplecharacteristics>
        </format>
        <track>${videoItems}
        </track>
      </video>
      ${info.hasAudio ? `<audio>
        <track>${audioItems}
        </track>
      </audio>` : ''}
    </media>
  </sequence>
</xmeml>`;
}

// ─── Rota ──────────────────────────────────────────────────────────────────

/**
 * POST /api/export-xml
 * Body: { fileId, segments: [{start, end}], format: 'fcpxml' | 'xmeml' }
 */
router.post('/', async (req, res) => {
  const { fileId, segments, format = 'fcpxml' } = req.body;

  if (!fileId || !segments?.length) {
    return res.status(400).json({ error: 'fileId e segments são obrigatórios' });
  }

  const filePath = path.join(__dirname, '../uploads', fileId);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Arquivo não encontrado' });
  }

  try {
    const info = await probeVideo(filePath);
    let xml, filename, contentType;

    if (format === 'xmeml') {
      xml = generateXmeml({ filePath, fileId, info, segments });
      filename = 'fine-cut-timeline.xml';
      contentType = 'application/xml';
    } else {
      xml = generateFCPXML({ filePath, fileId, info, segments });
      filename = 'fine-cut-timeline.fcpxml';
      contentType = 'application/xml';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
