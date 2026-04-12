import {} from 'react';
import { useEditorStore } from '../../store/editorStore';
import { useVideoPlayer } from '../../hooks/useVideoPlayer';
import { useKeyboard } from '../../hooks/useKeyboard';
import { toSMPTE } from '../../hooks/useTimecode';
import './VideoPlayer.css';

export function VideoPlayer() {
  const { videoInfo, currentTime, isPlaying, inPoint, outPoint } = useEditorStore();
  const player = useVideoPlayer();
  const { videoRef, togglePlay, stepFrames, pressJ, pressK, pressL, seekTo } = player;

  useKeyboard({ togglePlay, stepFrames, pressJ, pressK, pressL, seekTo });

  const fps = videoInfo?.fps ?? 30;
  const duration = videoInfo?.duration ?? 0;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    seekTo(ratio * duration);
  };

  return (
    <div className="video-player">
      {videoInfo ? (
        <>
          <div className="video-wrap">
            <video
              ref={videoRef}
              src={videoInfo.videoUrl}
              onEnded={() => useEditorStore.getState().setIsPlaying(false)}
              preload="auto"
            />
            {/* Overlay de in/out */}
            {inPoint !== null && (
              <div className="marker marker-in" title={`In: ${toSMPTE(inPoint, fps)}`}>
                I
              </div>
            )}
            {outPoint !== null && (
              <div className="marker marker-out" title={`Out: ${toSMPTE(outPoint, fps)}`}>
                O
              </div>
            )}
          </div>

          {/* Scrubber */}
          <div className="scrubber" onClick={handleScrub}>
            <div className="scrubber-fill" style={{ width: `${progress}%` }} />
            {/* Marcador de in point */}
            {inPoint !== null && (
              <div
                className="scrubber-in"
                style={{ left: `${(inPoint / duration) * 100}%` }}
              />
            )}
            {/* Marcador de out point */}
            {outPoint !== null && (
              <div
                className="scrubber-out"
                style={{ left: `${(outPoint / duration) * 100}%` }}
              />
            )}
            {/* Região selecionada entre in e out */}
            {inPoint !== null && outPoint !== null && (
              <div
                className="scrubber-region"
                style={{
                  left: `${(inPoint / duration) * 100}%`,
                  width: `${((outPoint - inPoint) / duration) * 100}%`,
                }}
              />
            )}
            {/* Playhead */}
            <div className="scrubber-head" style={{ left: `${progress}%` }} />
          </div>

          {/* Controles */}
          <div className="controls">
            <div className="controls-left">
              <button onClick={() => stepFrames(-10)} title="−10 frames (Shift+←)">⏮</button>
              <button onClick={() => stepFrames(-1)} title="−1 frame (←)">◀</button>
              <button onClick={togglePlay} className="btn-play" title="Play/Pause (Space)">
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button onClick={() => stepFrames(1)} title="+1 frame (→)">▶</button>
              <button onClick={() => stepFrames(10)} title="+10 frames (Shift+→)">⏭</button>
            </div>

            <div className="timecode">
              {toSMPTE(currentTime, fps)}
            </div>

            <div className="controls-right">
              <span className="fps-badge">{fps.toFixed(2)} fps</span>
              <button
                className={inPoint !== null ? 'active' : ''}
                onClick={() => useEditorStore.getState().setInPoint(currentTime)}
                title="Marcar In (I)"
              >
                I
              </button>
              <button
                className={outPoint !== null ? 'active' : ''}
                onClick={() => useEditorStore.getState().setOutPoint(currentTime)}
                title="Marcar Out (O)"
              >
                O
              </button>
              <button
                onClick={() => {
                  const { inPoint, outPoint, addSegment, setInPoint, setOutPoint } =
                    useEditorStore.getState();
                  if (inPoint !== null && outPoint !== null && inPoint < outPoint) {
                    addSegment({ start: inPoint, end: outPoint });
                    setInPoint(null);
                    setOutPoint(null);
                  }
                }}
                title="Confirmar corte (Enter)"
                className="btn-cut"
              >
                ✂ Cortar
              </button>
            </div>
          </div>

          {/* Timecodes de in/out */}
          {(inPoint !== null || outPoint !== null) && (
            <div className="inout-display">
              <span>
                IN: {inPoint !== null ? toSMPTE(inPoint, fps) : '--:--:--:--'}
              </span>
              <span>
                {inPoint !== null && outPoint !== null && outPoint > inPoint
                  ? `Duração: ${toSMPTE(outPoint - inPoint, fps)}`
                  : ''}
              </span>
              <span>
                OUT: {outPoint !== null ? toSMPTE(outPoint, fps) : '--:--:--:--'}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="video-empty">
          Carregue um vídeo para começar
        </div>
      )}
    </div>
  );
}
