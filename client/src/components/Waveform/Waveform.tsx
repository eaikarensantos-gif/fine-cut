import { useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../../store/editorStore';
import './Waveform.css';

const WAVEFORM_COLOR = '#3b82f6';
const SILENCE_COLOR = 'rgba(239, 68, 68, 0.25)';
const PLAYHEAD_COLOR = '#60a5fa';
const IN_COLOR = '#4ade80';
const OUT_COLOR = '#f87171';
const REGION_COLOR = 'rgba(96, 165, 250, 0.2)';

export function Waveform() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { waveformPeaks, currentTime, videoInfo, silences, inPoint, outPoint } = useEditorStore();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !videoInfo || waveformPeaks.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const duration = videoInfo.duration;
    const peaks = waveformPeaks;

    ctx.clearRect(0, 0, W, H);

    // Fundo
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);

    // Regiões de silêncio — fundo + bordas marcando onde cortar
    for (const s of silences) {
      const x1 = (s.start / duration) * W;
      const x2 = ((s.end ?? duration) / duration) * W;

      // Fundo vermelho transparente
      ctx.fillStyle = SILENCE_COLOR;
      ctx.fillRect(x1, 0, x2 - x1, H);

      // Linha de corte no início do silêncio (✂ aqui)
      ctx.strokeStyle = 'rgba(239,68,68,0.85)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, H);
      ctx.stroke();
      ctx.setLineDash([]);

      // Linha de corte no fim do silêncio
      if (s.end !== null) {
        ctx.strokeStyle = 'rgba(239,68,68,0.85)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x2, 0);
        ctx.lineTo(x2, H);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Ícone ✂ no centro da região de silêncio
      const midX = (x1 + x2) / 2;
      if (x2 - x1 > 20) {
        ctx.fillStyle = 'rgba(239,68,68,0.7)';
        ctx.font = `${Math.min(12, x2 - x1 - 4)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('✂', midX, H / 2 + 4);
        ctx.textAlign = 'left';
      }
    }

    // Região in/out selecionada
    if (inPoint !== null && outPoint !== null) {
      ctx.fillStyle = REGION_COLOR;
      const x1 = (inPoint / duration) * W;
      const x2 = (outPoint / duration) * W;
      ctx.fillRect(x1, 0, x2 - x1, H);
    }

    // Waveform
    const mid = H / 2;
    const barW = W / peaks.length;

    ctx.fillStyle = WAVEFORM_COLOR;
    for (let i = 0; i < peaks.length; i++) {
      const amp = peaks[i] * mid * 0.9;
      const x = i * barW;
      ctx.fillRect(x, mid - amp, Math.max(barW - 0.5, 0.5), amp * 2);
    }

    // Linha central
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(W, mid);
    ctx.stroke();

    // In point
    if (inPoint !== null) {
      const x = (inPoint / duration) * W;
      ctx.strokeStyle = IN_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();

      ctx.fillStyle = IN_COLOR;
      ctx.font = '10px monospace';
      ctx.fillText('I', x + 3, 12);
    }

    // Out point
    if (outPoint !== null) {
      const x = (outPoint / duration) * W;
      ctx.strokeStyle = OUT_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();

      ctx.fillStyle = OUT_COLOR;
      ctx.font = '10px monospace';
      ctx.fillText('O', x + 3, 12);
    }

    // Playhead
    const playX = (currentTime / duration) * W;
    ctx.strokeStyle = PLAYHEAD_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, H);
    ctx.stroke();

    // Triângulo no topo do playhead
    ctx.fillStyle = PLAYHEAD_COLOR;
    ctx.beginPath();
    ctx.moveTo(playX - 5, 0);
    ctx.lineTo(playX + 5, 0);
    ctx.lineTo(playX, 8);
    ctx.closePath();
    ctx.fill();
  }, [waveformPeaks, currentTime, videoInfo, silences, inPoint, outPoint]);

  // Redesenhar sempre que os dados mudam
  useEffect(() => {
    draw();
  }, [draw]);

  // Resize observer para adaptar ao container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = el.clientWidth;
      canvas.height = el.clientHeight;
      draw();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  // Click para seek
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { videoInfo, setCurrentTime } = useEditorStore.getState();
    if (!videoInfo || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const t = ratio * videoInfo.duration;
    const video = document.querySelector('video');
    if (video) video.currentTime = t;
    setCurrentTime(t);
  };

  return (
    <div className="waveform-container" ref={containerRef}>
      {waveformPeaks.length > 0 ? (
        <canvas ref={canvasRef} className="waveform-canvas" onClick={handleClick} />
      ) : (
        <div className="waveform-empty">
          {videoInfo ? 'Carregando waveform...' : 'Sem áudio'}
        </div>
      )}
    </div>
  );
}
