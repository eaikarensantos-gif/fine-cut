import { useEffect, useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { LibraryEntry } from '../../store/editorStore';
import { toDisplayTime } from '../../hooks/useTimecode';
import './Library.css';

const API = '/api';

interface Props {
  onClose: () => void;
}

export function Library({ onClose }: Props) {
  const { library, setLibrary, addToLibrary, removeFromLibrary, setVideoInfo, resetEditor } = useEditorStore();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchLibrary();
  }, []);

  const fetchLibrary = async () => {
    try {
      const r = await fetch(`${API}/library`);
      const data = await r.json();
      setLibrary(data);
    } catch {}
  };

  const handleRemove = async (id: string) => {
    await fetch(`${API}/library/${id}`, { method: 'DELETE' });
    removeFromLibrary(id);
  };

  const handleRename = async (id: string) => {
    if (!newName.trim()) return;
    await fetch(`${API}/library/${id}/rename`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    setLibrary(library.map((e) => (e.id === id ? { ...e, name: newName } : e)));
    setRenaming(null);
    setNewName('');
  };

  const handleLoad = (entry: LibraryEntry) => {
    // Limpa dados do vídeo anterior antes de carregar o novo
    resetEditor();
    setVideoInfo({
      fileId: entry.fileId,
      videoUrl: entry.videoUrl,
      duration: entry.duration,
      fps: entry.fps,
      width: entry.width,
      height: entry.height,
      hasAudio: entry.hasAudio,
    });
    onClose();
  };

  const handleAddCurrent = async () => {
    const { videoInfo } = useEditorStore.getState();
    if (!videoInfo?.fileId) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/library/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: videoInfo.fileId, name: videoInfo.fileId }),
      });
      const entry = await r.json();
      addToLibrary(entry);
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const currentFileId = useEditorStore.getState().videoInfo?.fileId;
  const isCurrentSaved = library.some((e) => e.fileId === currentFileId);

  return (
    <div className="library-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="library-panel">
        <div className="lib-header">
          <span className="lib-title">📁 Biblioteca</span>
          <div className="lib-header-actions">
            {currentFileId && !isCurrentSaved && (
              <button className="lib-btn lib-btn-save" onClick={handleAddCurrent} disabled={loading}>
                {loading ? '...' : '+ Salvar vídeo atual'}
              </button>
            )}
            {currentFileId && isCurrentSaved && (
              <span className="lib-saved-badge">✓ Salvo na biblioteca</span>
            )}
            <button className="lib-btn lib-btn-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {library.length === 0 ? (
          <div className="lib-empty">
            <div className="lib-empty-icon">📂</div>
            <p>Biblioteca vazia</p>
            <small>Carregue um vídeo e clique em "+ Salvar vídeo atual"</small>
          </div>
        ) : (
          <div className="lib-grid">
            {library.map((entry) => (
              <div
                key={entry.id}
                className={`lib-card ${entry.fileId === currentFileId ? 'active' : ''}`}
                onClick={() => handleLoad(entry)}
                title="Clique para carregar"
              >
                <div className="lib-thumb">
                  {entry.thumbUrl ? (
                    <img src={entry.thumbUrl} alt={entry.name} loading="lazy" />
                  ) : (
                    <div className="lib-thumb-placeholder">🎬</div>
                  )}
                  <span className="lib-dur">{toDisplayTime(entry.duration)}</span>
                </div>

                {renaming === entry.id ? (
                  <div className="lib-rename" onClick={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(entry.id);
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                    />
                    <button onClick={() => handleRename(entry.id)}>✓</button>
                  </div>
                ) : (
                  <div className="lib-name">{entry.name}</div>
                )}

                <div className="lib-meta">
                  {entry.width}×{entry.height} · {entry.fps.toFixed(0)}fps
                </div>

                <div className="lib-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => { setRenaming(entry.id); setNewName(entry.name); }}
                    title="Renomear"
                  >✏</button>
                  <button onClick={() => handleRemove(entry.id)} title="Remover da biblioteca" className="lib-remove">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
