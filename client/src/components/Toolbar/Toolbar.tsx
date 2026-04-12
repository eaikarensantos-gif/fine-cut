import { useRef, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { ExportQuality } from '../../store/editorStore';
import { toast, useToastStore } from '../../store/toastStore';
import './Toolbar.css';

const API = '/api';

type ExportFormat = 'mp4' | 'fcpxml' | 'xmeml';

const EXPORT_LABELS: Record<ExportFormat, string> = {
  mp4: 'MP4',
  fcpxml: 'Final Cut Pro (.fcpxml)',
  xmeml: 'Premiere / FCP7 (.xml)',
};

const QUALITY_LABELS: Record<ExportQuality, { label: string; hint: string }> = {
  draft:    { label: 'Rascunho', hint: '⚡ Stream copy — mais rápido, corte no keyframe' },
  normal:   { label: 'Normal',   hint: '⚡ Stream copy — instantâneo, qualidade original' },
  high:     { label: 'Alta',     hint: '🐢 Re-encode — corte frame-preciso, mais lento' },
  lossless: { label: 'Lossless', hint: '🐢 Re-encode sem perdas — muito lento' },
};

function getLocalVideoMeta(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight }); URL.revokeObjectURL(url); };
    v.onerror = () => { resolve({ duration: 0, width: 0, height: 0 }); URL.revokeObjectURL(url); };
    v.src = url;
  });
}

interface Props {
  onOpenLibrary: () => void;
}

export function Toolbar({ onOpenLibrary }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('mp4');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  const {
    videoInfo, setVideoInfo, setWaveformPeaks, setSilences, setScenes,
    setAudioRegions, setBreaths, setRepeatGroups,
    setTranscriptWords, setTranscriptSegments,
    segments, exportQuality, setExportQuality, exportProgress, setExportProgress,
    resetEditor,
  } = useEditorStore();

  const handleUpload = async (file: File) => {
    // Limpa todos os dados do vídeo anterior
    resetEditor();

    const blobUrl = URL.createObjectURL(file);
    const localMeta = await getLocalVideoMeta(file);
    setVideoInfo({ fileId: '', videoUrl: blobUrl, duration: localMeta.duration, fps: 30, width: localMeta.width, height: localMeta.height, hasAudio: true });

    const tid = toast.loading('Enviando vídeo...', file.name);
    setUploadProgress(0);
    const form = new FormData();
    form.append('video', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(pct);
        useToastStore.getState().update(tid, { message: `Enviando ${pct}%`, detail: file.name });
      }
    };
    xhr.onload = () => {
      setUploadProgress(null);
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        setVideoInfo({ ...data, videoUrl: data.videoUrl });
        if (data.hasAudio) loadWaveform(data.fileId);
        toast.done(tid, 'Vídeo carregado ✓', `${data.width}×${data.height} · ${data.fps?.toFixed(2)}fps`);
      } else {
        toast.fail(tid, 'Erro no upload', `Status ${xhr.status}`);
      }
    };
    xhr.onerror = () => { setUploadProgress(null); toast.fail(tid, 'Erro de rede no upload'); };
    xhr.send(form);
  };

  const loadWaveform = async (fileId: string) => {
    try {
      const r = await fetch(`${API}/waveform/${fileId}?sps=200`);
      const data = await r.json();
      setWaveformPeaks(data.peaks);
    } catch {}
  };

  const transcribeAndDetect = async () => {
    if (!videoInfo?.fileId) return;
    setLoading('transcribe');
    const tid = toast.loading('Transcrevendo áudio...', 'Whisper local — pode levar 1-2 min');

    // Timer de progresso para dar feedback visual enquanto whisper roda
    const t0 = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.round((Date.now() - t0) / 1000);
      useToastStore.getState().update(tid, {
        detail: `Whisper local rodando… ${elapsed}s`,
      });
    }, 1000);

    try {
      // 1. Transcrever (local, sem API key)
      const r1 = await fetch(`${API}/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: videoInfo.fileId }),
      });
      clearInterval(timer);
      if (!r1.ok) { const e = await r1.json(); throw new Error(e.error || `HTTP ${r1.status}`); }
      const t = await r1.json();
      setTranscriptWords(t.words || []);
      setTranscriptSegments(t.segments || []);
      const elapsed = Math.round((Date.now() - t0) / 1000);
      useToastStore.getState().update(tid, {
        message: 'Detectando repetições...',
        detail: `${t.words?.length ?? 0} palavras em ${elapsed}s`,
      });

      // 2. Detectar repetições via texto
      const r2 = await fetch(`${API}/detect-repeats-transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words: t.words }),
      });
      const d = await r2.json();
      setRepeatGroups(d.groups);
      const totalElapsed = Math.round((Date.now() - t0) / 1000);
      toast.done(tid,
        d.groups.length > 0
          ? `${d.groups.length} grupo${d.groups.length > 1 ? 's' : ''} de repetição encontrado${d.groups.length > 1 ? 's' : ''}`
          : 'Nenhuma repetição detectada',
        `Texto · ${t.words?.length ?? 0} palavras · ${d.groups.length} grupos · ${totalElapsed}s`
      );
    } catch (err: any) {
      clearInterval(timer);
      toast.fail(tid, 'Erro na transcrição', err.message);
    } finally {
      setLoading(null);
    }
  };

  const detectSilence = async () => {
    if (!videoInfo?.fileId) return;
    setLoading('silence');
    const tid = toast.loading('Detectando silêncios...', 'Analisando áudio');
    try {
      const r = await fetch(`${API}/detect/silence/${videoInfo.fileId}?noise=-30dB&duration=0.3`);
      const data = await r.json();
      setSilences(data.silences);
      toast.done(tid,
        data.silences.length === 0 ? 'Nenhum silêncio encontrado' : `${data.silences.length} silêncio${data.silences.length > 1 ? 's' : ''} encontrado${data.silences.length > 1 ? 's' : ''}`,
        'Veja o painel abaixo');
    } catch (err: any) { toast.fail(tid, 'Erro ao detectar silêncios', err.message); }
    finally { setLoading(null); }
  };

  const detectScenes = async () => {
    if (!videoInfo?.fileId) return;
    setLoading('scenes');
    const tid = toast.loading('Detectando cenas...', 'Analisando cortes de imagem');
    try {
      const r = await fetch(`${API}/detect/scenes/${videoInfo.fileId}?threshold=10`);
      const data = await r.json();
      setScenes(data.scenes);
      toast.done(tid,
        data.scenes.length === 0 ? 'Nenhuma cena detectada' : `${data.scenes.length} cena${data.scenes.length > 1 ? 's' : ''} detectada${data.scenes.length > 1 ? 's' : ''}`,
        'Veja o painel abaixo');
    } catch (err: any) { toast.fail(tid, 'Erro ao detectar cenas', err.message); }
    finally { setLoading(null); }
  };

  const detectBreaths = async () => {
    if (!videoInfo?.fileId) return;
    setLoading('breaths');
    const tid = toast.loading('Detectando respiros...', 'Analisando sons curtos entre falas');
    try {
      const r = await fetch(`${API}/detect-breaths/${videoInfo.fileId}?duration=${videoInfo.duration}`);
      const data = await r.json();
      setBreaths(data.breaths);
      toast.done(tid,
        data.count === 0 ? 'Nenhum respiro encontrado' : `${data.count} respiro${data.count > 1 ? 's' : ''} encontrado${data.count > 1 ? 's' : ''}`,
        'Veja a aba Respiros');
    } catch (err: any) { toast.fail(tid, 'Erro ao detectar respiros', err.message); }
    finally { setLoading(null); }
  };

  const detectRepeats = async () => {
    if (!videoInfo?.fileId) return;
    setLoading('repeats');
    const hasSegs = segments.length >= 2;
    const tid = toast.loading(
      'Analisando repetições...',
      hasSegs ? `Comparando ${segments.length} segmentos` : 'Detectando frases automaticamente…'
    );
    try {
      const body = hasSegs
        ? { fileId: videoInfo.fileId, segments: segments.map((s) => ({ start: s.start, end: s.end })) }
        : { fileId: videoInfo.fileId };
      const r = await fetch(`${API}/detect-repeats`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      setRepeatGroups(data.groups);
      toast.done(tid,
        data.groups.length > 0
          ? `${data.groups.length} grupo${data.groups.length > 1 ? 's' : ''} de repetição encontrado${data.groups.length > 1 ? 's' : ''}`
          : 'Nenhuma repetição detectada',
        data.groups.length > 0
          ? 'Veja a aba Repetições'
          : `${data.analyzed} ${data.autoSegmented ? 'frases' : 'segmentos'} analisados · limiar ${data.threshold}`
      );
    } catch (err: any) { toast.fail(tid, 'Erro ao analisar repetições', err.message); }
    finally { setLoading(null); }
  };

  const detectAudioType = async () => {
    if (!videoInfo?.fileId) return;
    setLoading('audio-type');
    const tid = toast.loading('Analisando Voz / Música...', 'Isso pode levar alguns segundos');
    try {
      const r = await fetch(`${API}/detect-audio-type/${videoInfo.fileId}?duration=${videoInfo.duration}`);
      const data = await r.json();
      const all = [...data.speech, ...data.music, ...data.silence];
      setAudioRegions(all);
      toast.done(tid,
        `${data.speech.length} trechos de voz · ${data.music.length} de música`,
        'Aba Voz/Música no painel abaixo'
      );
    } catch (err: any) { toast.fail(tid, 'Erro na análise de áudio', err.message); }
    finally { setLoading(null); }
  };

  const handleExportMP4 = async () => {
    if (!videoInfo?.fileId) return;
    setLoading('export'); setExportProgress(0);
    const totalDur = segments.reduce((a, s) => a + (s.end - s.start), 0);
    const tid = toast.loading(`Exportando MP4 (${QUALITY_LABELS[exportQuality].label})…`, `${segments.length} segmento${segments.length > 1 ? 's' : ''} · ~${Math.round(totalDur)}s`);
    try {
      const r = await fetch(`${API}/export`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: videoInfo.fileId, segments: segments.map((s) => ({ start: s.start, end: s.end })), quality: exportQuality }),
      });
      if (!r.ok) throw new Error(`Servidor retornou ${r.status}`);
      downloadBlob(await r.blob(), 'fine-cut-export.mp4');
      toast.done(tid, 'Export concluído ✓', 'Download iniciado');
    } catch (err: any) { toast.fail(tid, 'Erro no export', err.message); }
    finally { setLoading(null); setExportProgress(0); }
  };

  const handleExportXml = async (format: 'fcpxml' | 'xmeml') => {
    if (!videoInfo?.fileId) return;
    setLoading('export');
    const label = format === 'fcpxml' ? 'Final Cut Pro (.fcpxml)' : 'Premiere (.xml)';
    const tid = toast.loading(`Gerando ${label}…`, `${segments.length} segmento${segments.length > 1 ? 's' : ''}`);
    try {
      const r = await fetch(`${API}/export-xml`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: videoInfo.fileId, segments: segments.map((s) => ({ start: s.start, end: s.end })), format }),
      });
      if (!r.ok) throw new Error(`Servidor retornou ${r.status}`);
      downloadBlob(await r.blob(), format === 'fcpxml' ? 'fine-cut-timeline.fcpxml' : 'fine-cut-timeline.xml');
      toast.done(tid, `${label} exportado ✓`, 'Download iniciado');
    } catch (err: any) { toast.fail(tid, 'Erro ao gerar XML', err.message); }
    finally { setLoading(null); }
  };

  const handleExport = () => {
    if (!videoInfo || segments.length === 0) { toast.error('Nenhum segmento', 'Adicione ao menos um segmento antes de exportar.'); return; }
    if (!videoInfo.fileId) { toast.error('Upload incompleto', 'Aguarde o upload terminar antes de exportar.'); return; }
    if (exportFormat === 'mp4') handleExportMP4();
    else handleExportXml(exportFormat);
  };

  const downloadBlob = (data: Blob, filename: string) => {
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) handleUpload(file); e.target.value = '';
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) handleUpload(file);
  };

  const exportLabel = loading === 'export'
    ? `Exportando${exportProgress > 0 ? ` ${Math.round(exportProgress)}%` : '...'}`
    : `⬇ ${exportFormat === 'mp4' ? 'MP4' : exportFormat === 'fcpxml' ? 'FCPXML' : 'XMEML'}`;

  const isUploading = uploadProgress !== null;
  const uploadReady = !isUploading && !!videoInfo?.fileId;

  return (
    <div className="toolbar" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className="toolbar-brand">
        <span className="brand-icon">✂</span>
        <span className="brand-name">fine-cut</span>
      </div>

      <div className="toolbar-actions">
        <input ref={fileRef} type="file" accept="video/*" hidden onChange={onFileChange} />

        {/* Upload + Biblioteca */}
        <button className="btn btn-primary" onClick={() => fileRef.current?.click()} disabled={isUploading}>+ Vídeo</button>
        <button className="btn btn-library" onClick={onOpenLibrary} title="Abrir biblioteca de arquivos">📁</button>

        <div className="toolbar-sep" />

        <button className="btn" onClick={detectSilence} disabled={!uploadReady || !!loading} title="Detecta silêncios no áudio">
          {loading === 'silence' ? '⏳ Analisando...' : '🔇 Silêncios'}
        </button>
        <button className="btn" onClick={detectScenes} disabled={!uploadReady || !!loading} title="Detecta cortes de cena no vídeo">
          {loading === 'scenes' ? '⏳ Analisando...' : '🎬 Cenas'}
        </button>
        <button className="btn btn-audio-type" onClick={detectAudioType} disabled={!uploadReady || !!loading} title="Detecta regiões de voz vs música">
          {loading === 'audio-type' ? '⏳ Analisando...' : '🎵 Voz/Música'}
        </button>
        <button className="btn btn-breaths" onClick={detectBreaths} disabled={!uploadReady || !!loading} title="Detecta respiros entre falas">
          {loading === 'breaths' ? '⏳ Analisando...' : '💨 Respiros'}
        </button>
        <button className="btn btn-repeats" onClick={detectRepeats} disabled={!uploadReady || !!loading} title="Detecta trechos repetidos e escolhe o melhor take (funciona sem cortes prévios)">
          {loading === 'repeats' ? '⏳ Analisando...' : '🔁 Repetições'}
        </button>
        <button className="btn btn-transcribe" onClick={transcribeAndDetect} disabled={!uploadReady || !!loading} title="Transcreve com Whisper local e detecta repetições exatas por texto — mais preciso, sem API key">
          {loading === 'transcribe' ? '⏳ Transcrevendo...' : '📝 Transcrever'}
        </button>

        <div className="toolbar-sep" />

        {/* Qualidade */}
        <div className="quality-group" onMouseLeave={() => setShowQualityMenu(false)}>
          <button className="btn btn-quality" onClick={() => setShowQualityMenu((v) => !v)} title="Qualidade de exportação">
            ◈ {QUALITY_LABELS[exportQuality].label}
          </button>
          {showQualityMenu && (
            <div className="quality-menu">
              {(Object.entries(QUALITY_LABELS) as [ExportQuality, { label: string; hint: string }][]).map(([q, { label, hint }]) => (
                <button
                  key={q}
                  className={`quality-menu-item ${exportQuality === q ? 'selected' : ''}`}
                  onClick={() => { setExportQuality(q); setShowQualityMenu(false); }}
                >
                  <span>{label}</span>
                  <span className="quality-hint">{hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Export */}
        <div className="export-group" onMouseLeave={() => setShowExportMenu(false)}>
          <button className="btn btn-export" onClick={handleExport} disabled={!uploadReady || segments.length === 0 || loading === 'export'}>
            {exportLabel}
          </button>
          <button className="btn btn-export btn-export-caret" onClick={() => setShowExportMenu((v) => !v)} disabled={!uploadReady || segments.length === 0} title="Escolher formato">▾</button>
          {showExportMenu && (
            <div className="export-menu">
              {(Object.entries(EXPORT_LABELS) as [ExportFormat, string][]).map(([fmt, label]) => (
                <button key={fmt} className={`export-menu-item ${exportFormat === fmt ? 'selected' : ''}`} onClick={() => { setExportFormat(fmt); setShowExportMenu(false); }}>
                  {label}
                  {fmt !== 'mp4' && <span className="export-badge">buttercut</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isUploading && (
        <div className="upload-progress-wrap">
          <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }} />
          <span className="upload-progress-label">{uploadProgress! < 100 ? `Enviando ${uploadProgress}%` : 'Processando...'}</span>
        </div>
      )}

      {videoInfo && !isUploading && (
        <div className="toolbar-info">{videoInfo.width}×{videoInfo.height} · {videoInfo.fps.toFixed(2)}fps</div>
      )}

      <div className="toolbar-shortcuts">
        <span>J</span>rev <span>K</span>pause <span>L</span>play <span>I</span>in <span>O</span>out <span>↵</span>cortar
      </div>

    </div>
  );
}
