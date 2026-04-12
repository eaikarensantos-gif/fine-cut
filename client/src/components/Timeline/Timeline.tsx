import { useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../../store/editorStore';
import './Timeline.css';

export function Timeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ segId: string; edge: 'start' | 'end' } | null>(null);

  const {
    videoInfo,
    segments,
    currentTime,
    selectedSegmentId,
    setSelectedSegmentId,
    updateSegment,
    silences,
    scenes,
  } = useEditorStore();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !videoInfo) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const D = videoInfo.duration;

    const toX = (t: number) => (t / D) * W;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);

    // Régua de tempo
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, W, 18);

    ctx.fillStyle = '#555';
    ctx.font = '9px monospace';
    const tickInterval = getTickInterval(D);
    for (let t = 0; t <= D; t += tickInterval) {
      const x = toX(t);
      ctx.fillStyle = '#444';
      ctx.fillRect(x, 14, 1, 4);
      if (t % (tickInterval * 4) < tickInterval) {
        ctx.fillStyle = '#777';
        ctx.fillText(formatTime(t), x + 2, 12);
      }
    }

    // Silêncios
    for (const s of silences) {
      const x1 = toX(s.start);
      const x2 = toX(s.end ?? D);
      ctx.fillStyle = 'rgba(239,68,68,0.12)';
      ctx.fillRect(x1, 18, x2 - x1, H - 18);
    }

    // Cenas
    for (const sc of scenes) {
      const x = toX(sc.time);
      ctx.strokeStyle = 'rgba(251,191,36,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 18);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Segmentos
    const segH = H - 30;
    const segY = 22;

    for (const seg of segments) {
      const x1 = toX(seg.start);
      const x2 = toX(seg.end);
      const selected = seg.id === selectedSegmentId;

      // Bloco
      ctx.fillStyle = selected ? '#1d4ed8' : '#1e3a5f';
      ctx.fillRect(x1, segY, x2 - x1, segH);

      // Borda
      ctx.strokeStyle = selected ? '#60a5fa' : '#2563eb';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeRect(x1, segY, x2 - x1, segH);

      // Handles de drag (in/out)
      ctx.fillStyle = selected ? '#93c5fd' : '#3b82f6';
      ctx.fillRect(x1, segY, 4, segH);
      ctx.fillRect(x2 - 4, segY, 4, segH);
    }

    // Playhead
    const px = toX(currentTime);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, H);
    ctx.stroke();

    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.moveTo(px - 5, 18);
    ctx.lineTo(px + 5, 18);
    ctx.lineTo(px, 26);
    ctx.closePath();
    ctx.fill();
  }, [videoInfo, segments, currentTime, selectedSegmentId, silences, scenes]);

  useEffect(() => { draw(); }, [draw]);

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

  const timeFromX = (x: number, canvasW: number) => {
    const { videoInfo } = useEditorStore.getState();
    if (!videoInfo) return 0;
    return (x / canvasW) * videoInfo.duration;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !videoInfo) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const D = videoInfo.duration;
    const W = canvas.width;
    const toX = (t: number) => (t / D) * W;

    // Verificar se clicou em handle de um segmento
    for (const seg of segments) {
      const x1 = toX(seg.start);
      const x2 = toX(seg.end);
      if (Math.abs(x - x1) < 6) {
        dragRef.current = { segId: seg.id, edge: 'start' };
        setSelectedSegmentId(seg.id);
        return;
      }
      if (Math.abs(x - x2) < 6) {
        dragRef.current = { segId: seg.id, edge: 'end' };
        setSelectedSegmentId(seg.id);
        return;
      }
      // Clique dentro do bloco → selecionar
      if (x >= x1 && x <= x2) {
        setSelectedSegmentId(seg.id);
        return;
      }
    }

    // Clique fora → seek
    const t = timeFromX(x, W);
    const video = document.querySelector('video');
    if (video) video.currentTime = t;
    useEditorStore.getState().setCurrentTime(t);
    setSelectedSegmentId(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas || !videoInfo) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const t = Math.max(0, Math.min(timeFromX(x, canvas.width), videoInfo.duration));
    const seg = segments.find((s) => s.id === drag.segId);
    if (!seg) return;
    if (drag.edge === 'start' && t < seg.end - 0.1) {
      updateSegment(drag.segId, { start: t });
    } else if (drag.edge === 'end' && t > seg.start + 0.1) {
      updateSegment(drag.segId, { end: t });
    }
  };

  const handleMouseUp = () => { dragRef.current = null; };

  return (
    <div className="timeline-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="timeline-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      {!videoInfo && (
        <div className="timeline-empty">Timeline</div>
      )}
    </div>
  );
}

function getTickInterval(duration: number): number {
  if (duration <= 30) return 1;
  if (duration <= 120) return 5;
  if (duration <= 600) return 10;
  return 30;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
