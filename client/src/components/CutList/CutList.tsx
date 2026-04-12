import { useEditorStore } from '../../store/editorStore';
import { toSMPTE, toDisplayTime } from '../../hooks/useTimecode';
import './CutList.css';

export function CutList() {
  const {
    segments,
    selectedSegmentId,
    setSelectedSegmentId,
    removeSegment,
    videoInfo,
  } = useEditorStore();

  const fps = videoInfo?.fps ?? 30;

  const totalDuration = segments.reduce((acc, s) => acc + (s.end - s.start), 0);

  const seekTo = (t: number) => {
    const video = document.querySelector('video');
    if (video) video.currentTime = t;
    useEditorStore.getState().setCurrentTime(t);
  };

  return (
    <div className="cut-list">
      <div className="cut-list-header">
        <span>Cortes ({segments.length})</span>
        {segments.length > 0 && (
          <span className="cut-list-total">{toDisplayTime(totalDuration)}</span>
        )}
      </div>

      {segments.length === 0 ? (
        <div className="cut-list-empty">
          <p>Nenhum corte</p>
          <small>Use I/O para marcar e Enter para confirmar</small>
        </div>
      ) : (
        <ul className="cut-list-items">
          {segments.map((seg, i) => (
            <li
              key={seg.id}
              className={`cut-item ${seg.id === selectedSegmentId ? 'selected' : ''}`}
              onClick={() => {
                setSelectedSegmentId(seg.id);
                seekTo(seg.start);
              }}
            >
              <div className="cut-index">#{i + 1}</div>
              <div className="cut-times">
                <span className="cut-in">{toSMPTE(seg.start, fps)}</span>
                <span className="cut-arrow">→</span>
                <span className="cut-out">{toSMPTE(seg.end, fps)}</span>
                <span className="cut-dur">{toDisplayTime(seg.end - seg.start)}</span>
              </div>
              <button
                className="cut-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  removeSegment(seg.id);
                }}
                title="Remover (Delete)"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {segments.length > 0 && (
        <div className="cut-list-footer">
          <button
            className="btn-clear"
            onClick={() => {
              if (confirm('Remover todos os cortes?')) {
                useEditorStore.getState().reorderSegments([]);
              }
            }}
          >
            Limpar tudo
          </button>
        </div>
      )}
    </div>
  );
}
