const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const uploadRoute = require('./routes/upload');
const waveformRoute = require('./routes/waveform');
const detectRoute = require('./routes/detect');
const exportRoute = require('./routes/export');
const exportXmlRoute = require('./routes/exportXml');
const detectAudioTypeRoute = require('./routes/detectAudioType');
const detectBreathsRoute   = require('./routes/detectBreaths');
const detectRepeatsRoute   = require('./routes/detectRepeats');
const transcribeRoute      = require('./routes/transcribe');
const detectRepeatsTranscriptRoute = require('./routes/detectRepeatsFromTranscript');
const libraryRoute   = require('./routes/library');
const keyframesRoute = require('./routes/keyframes');

const app = express();
const server = http.createServer(app);
const corsOrigin = process.env.CORS_ORIGIN || /^http:\/\/localhost(:\d+)?$/;

const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Servir vídeos com suporte a Range (necessário para seek no HTML5)
app.use('/videos', (req, res, next) => {
  res.setHeader('Accept-Ranges', 'bytes');
  next();
});
app.use('/videos', express.static(path.join(__dirname, 'uploads')));
app.use('/thumbnails', express.static(path.join(__dirname, 'thumbnails')));

// Servir o client React buildado (produção)
app.use(express.static(path.join(__dirname, '../client/dist')));

// Injetar io nas rotas
app.use((req, _res, next) => {
  req.io = io;
  next();
});

app.use('/api/upload', uploadRoute);
app.use('/api/waveform', waveformRoute);
app.use('/api/detect', detectRoute);
app.use('/api/export', exportRoute);
app.use('/api/export-xml', exportXmlRoute);
app.use('/api/detect-audio-type', detectAudioTypeRoute);
app.use('/api/detect-breaths',    detectBreathsRoute);
app.use('/api/detect-repeats',    detectRepeatsRoute);
app.use('/api/transcribe',        transcribeRoute);
app.use('/api/detect-repeats-transcript', detectRepeatsTranscriptRoute);
app.use('/api/library',   libraryRoute);
app.use('/api/keyframes', keyframesRoute);

// SPA fallback: rotas que não são /api nem /videos servem o index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Fine Cut server running on http://localhost:${PORT}`));
