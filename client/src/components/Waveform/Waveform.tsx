import { useRef, useEffect, useCallback, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import './Waveform.css';

const WAVEFORM_COLOR    = '#3b82f6';
const SILENCE_COLOR     = 'rgba(239, 68, 68, 0.25)';
const PLAYHEAD_COLOR    = '#60a5fa';
const IN_COLOR          = '#4ade80';
const OUT_COLOR         = '#f87171';
const REGION_COLOR      = 'rgba(96, 165, 250, 0.18)';
const KEYFRAME_COLOR    = 'rgba(250, 204, 21, 0.55)'; // amarelo translúcido
const SEGMENT_COLOR     = 'rgba(30, 58, 95, 0.55)';

const MIN_ZOOM = 1;
const MAX_ZOOM = 32;

export function Waveform() {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [zoom,      setZoom]      = useState(1);
  const [viewStart, setViewStart] = useState(0); // normalizado 0–1 (início da janela visível)

  const {
    waveformPeaks, currentTime, videoInfo, silences, inPoint, outPoint,
    keyframes, segments,
  } = useEditorStore();

  // Auto-follow playhead: quando sai da janela visível, recentra a view
  useEffect(() => {
    if (!videoInfo || zoom === 1) return;
    const frac = currentTime / videoInfo.duration;
    const winSize = 1 / zoom;
    if (frac < viewStart || frac > viewStart + winSize) {
      setViewStart(Math.max(0, Math.min(1 - winSize, frac - winSize / 2)));
    }
  }, [currentTime, videoInfo, zoom, viewStart]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !videoInfo || waveformPeaks.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const D = videoInfo.duration;
    const peaks = waveformPeaks;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);

    // Janela visível: [tStart, tEnd] em segundos
    const winSize = 1 / zoom;
    const tStart  = viewStart * D;
    const tEnd    = Math.min(D, (viewStart + winSize) * D);

    // Helper: tempo → X
    const tx = (t: number) => ((t - tStart) / (tEnd - tStart)) * W;

    // ── Silêncios ────────────────────────────────────────────────────────────
    for (const s of silences) {
      const end = s.end ?? D;
      if (end < tStart || s.start > tEnd) continue;
      const x1 = tx(Math.max(s.start, tStart));
      const x2 = tx(Math.min(end, tEnd));
      ctx.fillStyle = SILENCE_COLOR;
      ctx.fillRect(x1, 0, x2 - x1, H);
      // Linhas de corte
      ['rgba(239,68,68,0.85)', 'rgba(239,68,68,0.85)'].forEach((_, i) => {
        const x = i === 0 ? tx(s.start) : tx(end);
        if (x >= -1 && x <= W + 1) {
          ctx.strokeStyle = 'rgba(239,68,68,0.85)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
          ctx.setLineDash([]);
        }
      });
      const midX = (tx(Math.max(s.start, tStart)) + tx(Math.min(end, tEnd))) / 2;
      const w = tx(Math.min(end, tEnd)) - tx(Math.max(s.start, tStart));
      if (w > 20) {
        ctx.fillStyle = 'rgba(239,68,68,0.7)';
        ctx.font = `${Math.min(12, w - 4)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('✂', midX, H / 2 + 4);
        ctx.textAlign = 'left';
      }
    }

    // ── Segmentos confirmados ────────────────────────────────────────────────
    for (const seg of segments) {
      if (seg.end < tStart || seg.start > tEnd) continue;
      const x1 = tx(Math.max(seg.start, tStart));
      const x2 = tx(Math.min(seg.end, tEnd));
      ctx.fillStyle = SEGMENT_COLOR;
      ctx.fillRect(x1, 0, x2 - x1, H);
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2, 0); ctx.lineTo(x2, H); ctx.stroke();
    }

    // ── Região in/out ────────────────────────────────────────────────────────
    if (inPoint !== null && outPoint !== null) {
      ctx.fillStyle = REGION_COLOR;
      const x1 = tx(Math.max(inPoint, tStart));
      const x2 = tx(Math.min(outPoint, tEnd));
      if (x2 > x1) ctx.fillRect(x1, 0, x2 - x1, H);
    }

    // ── Waveform ─────────────────────────────────────────────────────────────
    const mid  = H / 2;
    // Pega apenas os peaks na janela visível
    const iStart = Math.floor((tStart / D) * peaks.length);
    const iEnd   = Math.ceil((tEnd / D) * peaks.length);
    const visiblePeaks = peaks.slice(iStart, iEnd);
    const barW = W / Math.max(visiblePeaks.length, 1);

    ctx.fillStyle = WAVEFORM_COLOR;
    for (let i = 0; i < visiblePeaks.length; i++) {
      const amp = visiblePeaks[i] * mid * 0.9;
      const x   = i * barW;
      ctx.fillRect(x, mid - amp, Math.max(barW - 0.3, 0.3), amp * 2);
    }

    // Linha central
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(W, mid); ctx.stroke();

    // ── Keyframes — marcadores amarelos no topo ──────────────────────────────
    if (keyframes.length > 0) {
      ctx.fillStyle = KEYFRAME_COLOR;
      for (const kf of keyframes) {
        if (kf < tStart || kf > tEnd) continue;
        const x = tx(kf);
        ctx.fillRect(x - 0.5, 0, 1, 6);
      }
    }

    // ── In point ─────────────────────────────────────────────────────────────
    if (inPoint !== null && inPoint >= tStart && inPoint <= tEnd) {
      const x = tx(inPoint);
      ctx.strokeStyle = IN_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.fillStyle = IN_COLOR;
      ctx.font = '10px monospace';
      ctx.fillText('I', x + 3, 12);
    }

    // ── Out point ────────────────────────────────────────────────────────────
    if (outPoint !== null && outPoint >= tStart && outPoint <= tEnd) {
      const x = tx(outPoint);
      ctx.strokeStyle = OUT_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.fillStyle = OUT_COLOR;
      ctx.font = '10px monospace';
      ctx.fillText('O', x + 3, 12);
    }

    // ── Playhead ─────────────────────────────────────────────────────────────
    if (currentTime >= tStart && currentTime <= tEnd) {
      const playX = tx(currentTime);
      ctx.strokeStyle = PLAYHEAD_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(playX, 0); ctx.lineTo(playX, H); ctx.stroke();
      ctx.fillStyle = PLAYHEAD_COLOR;
      ctx.beginPath();
      ctx.moveTo(playX - 5, 0);
      ctx.lineTo(playX + 5, 0);
      ctx.lineTo(playX, 8);
      ctx.closePath();
      ctx.fill();
    }

    // ── Indicador de zoom ────────────────────────────────────────────────────
    if (zoom > 1) {
      ctx.fillStyle = 'rgba(96, 165, 250, 0.15)';
      ctx.fillRect(0, H - 4, W, 4);
      const barX = viewStart * W;
      const barW2 = W / zoom;
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(barX, H - 4, barW2, 4);
      // Label de zoom
      ctx.fillStyle = 'rgba(96,165,250,0.7)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${zoom.toFixed(1)}×`, W - 4, H - 6);
      ctx.textAlign = 'left';
    }
  }, [waveformPeaks, currentTime, videoInfo, silences, inPoint, outPoint, keyframes, segments, zoom, viewStart]);

  useEffect(() => { draw(); }, [draw]);

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width  = el.clientWidth;
      canvas.height = el.clientHeight;
      draw();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  // ── Interação ─────────────────────────────────────────────────────────────

  // Scroll wheel = zoom, centrado no cursor
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!videoInfo) return;
    e.preventDefault();
    const factor   = e.deltaY < 0 ? 1.25 : 0.8;
    const newZoom  = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
    if (newZoom === zoom) return;

    // Mantém a posição do cursor no mesmo ponto da waveform
    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseNorm = (e.clientX - rect.left) / rect.width; // 0–1 dentro do canvas
    const winSize   = 1 / zoom;
    const timeFrac  = viewStart + mouseNorm * winSize; // fração do vídeo sob o cursor
    const newWinSize = 1 / newZoom;
    const newViewStart = Math.max(0, Math.min(1 - newWinSize, timeFrac - mouseNorm * newWinSize));

    setZoom(newZoom);
    setViewStart(newViewStart);
  };

  // Duplo clique = reset zoom
  const handleDblClick = () => {
    setZoom(1);
    setViewStart(0);
  };

  // Clique simples = seek
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { videoInfo: vi, setCurrentTime } = useEditorStore.getState();
    if (!vi || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseNorm = (e.clientX - rect.left) / rect.width;
    const winSize = 1 / zoom;
    const t = (viewStart + mouseNorm * winSize) * vi.duration;
    const clamped = Math.max(0, Math.min(t, vi.duration));
    const video = document.querySelector('video');
    if (video) video.currentTime = clamped;
    setCurrentTime(clamped);
  };

  return (
    <div className="waveform-container" ref={containerRef}>
      {waveformPeaks.length > 0 ? (
        <canvas
          ref={canvasRef}
          className="waveform-canvas"
          onClick={handleClick}
          onWheel={handleWheel}
          onDoubleClick={handleDblClick}
          title="Scroll: zoom · Clique: seek · Duplo clique: reset zoom"
        />
      ) : (
        <div className="waveform-empty">
          {videoInfo ? 'Carregando waveform...' : 'Sem áudio'}
        </div>
      )}
    </div>
  );
}
