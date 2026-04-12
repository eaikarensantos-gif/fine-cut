import { useState } from 'react';
import { useEditorStore } from '../../store/editorStore';
import type { RepeatGroup } from '../../store/editorStore';
import { toSMPTE, toDisplayTime } from '../../hooks/useTimecode';
import { toast } from '../../store/toastStore';
import './DetectionPanel.css';

type Tab = 'silences' | 'scenes' | 'audio' | 'breaths' | 'repeats' | 'transcript';

export function DetectionPanel() {
  const { silences, scenes, audioRegions, breaths, repeatGroups, videoInfo,
    transcriptWords, transcriptSegments,
    setCurrentTime, addSegment, segments,
    skipSilences, setSkipSilences, previewSegments, setPreviewSegments } =
    useEditorStore();
  const [tab, setTab] = useState<Tab>('silences');

  const fps = videoInfo?.fps ?? 30;
  const duration = videoInfo?.duration ?? 0;

  const hasData = silences.length > 0 || scenes.length > 0 || audioRegions.length > 0
    || breaths.length > 0 || repeatGroups.length > 0 || transcriptSegments.length > 0;
  if (!hasData) return null;

  const seekTo = (t: number) => {
    const video = document.querySelector('video');
    if (video) video.currentTime = t;
    setCurrentTime(t);
  };

  const buildSpeechRegions = () => {
    if (!videoInfo || silences.length === 0) return [];
    const sorted = [...silences].filter((s) => s.end !== null).sort((a, b) => a.start - b.start);
    const regions: { start: number; end: number }[] = [];
    let cursor = 0;
    const PAD = 0.05;
    for (const sil of sorted) {
      if (sil.start - cursor > 0.1) {
        regions.push({ start: Math.max(0, cursor - PAD), end: Math.min(duration, sil.start + PAD) });
      }
      cursor = sil.end!;
    }
    if (duration - cursor > 0.1) {
      regions.push({ start: Math.max(0, cursor - PAD), end: duration });
    }
    return regions;
  };

  const removeSilences = () => {
    const regions = buildSpeechRegions();
    if (regions.length === 0) {
      toast.error('Nenhuma fala detectada', 'Ajuste os parâmetros de detecção e tente novamente.');
      return;
    }
    useEditorStore.getState().reorderSegments([]);
    regions.forEach((r) => addSegment({ start: r.start, end: r.end }));
    setSkipSilences(false);
    setPreviewSegments(true);
    toast.success(
      `${regions.length} segmento${regions.length > 1 ? 's' : ''} criado${regions.length > 1 ? 's' : ''}`,
      `${toDisplayTime(regions.reduce((a, r) => a + (r.end - r.start), 0))} de fala · silêncios removidos`
    );
  };

  const addSceneSegments = () => {
    if (!videoInfo || scenes.length === 0) return;
    const sorted = [...scenes].sort((a, b) => a.time - b.time);
    const regions: { start: number; end: number }[] = [];
    let cursor = 0;
    for (const sc of sorted) {
      if (sc.time - cursor > 0.1) regions.push({ start: cursor, end: sc.time });
      cursor = sc.time;
    }
    if (duration - cursor > 0.1) regions.push({ start: cursor, end: duration });
    useEditorStore.getState().reorderSegments([]);
    regions.forEach((r) => addSegment({ start: r.start, end: r.end }));
    setPreviewSegments(true);
    toast.success(
      `${regions.length} cena${regions.length > 1 ? 's' : ''} adicionada${regions.length > 1 ? 's' : ''}`,
      'Segmentos criados por corte de imagem'
    );
  };

  const speechRegions = buildSpeechRegions();
  const totalSpeechDuration = speechRegions.reduce((a, r) => a + (r.end - r.start), 0);
  const totalSilenceDuration = silences
    .filter((s) => s.end !== null)
    .reduce((a, s) => a + (s.end! - s.start), 0);

  return (
    <div className="detection-panel">
      <div className="dp-tabs">
        <button className={`dp-tab ${tab === 'silences' ? 'active' : ''}`} onClick={() => setTab('silences')}>
          🔇 Silêncios
          {silences.length > 0 && <span className="dp-badge">{silences.length}</span>}
        </button>
        <button className={`dp-tab ${tab === 'scenes' ? 'active' : ''}`} onClick={() => setTab('scenes')}>
          🎬 Cenas
          {scenes.length > 0 && <span className="dp-badge">{scenes.length}</span>}
        </button>
        <button className={`dp-tab ${tab === 'audio' ? 'active' : ''}`} onClick={() => setTab('audio')}>
          🎵 Voz/Música
          {audioRegions.length > 0 && <span className="dp-badge dp-badge-audio">{audioRegions.length}</span>}
        </button>
        <button className={`dp-tab ${tab === 'breaths' ? 'active' : ''}`} onClick={() => setTab('breaths')}>
          💨 Respiros
          {breaths.length > 0 && <span className="dp-badge dp-badge-breath">{breaths.length}</span>}
        </button>
        <button className={`dp-tab ${tab === 'repeats' ? 'active' : ''}`} onClick={() => setTab('repeats')}>
          🔁 Repetições
          {repeatGroups.length > 0 && <span className="dp-badge dp-badge-repeat">{repeatGroups.length}</span>}
        </button>
        <button className={`dp-tab ${tab === 'transcript' ? 'active' : ''}`} onClick={() => setTab('transcript')}>
          📝 Transcrição
          {transcriptSegments.length > 0 && <span className="dp-badge dp-badge-transcript">{transcriptSegments.length}</span>}
        </button>

        <div className="dp-actions">
          {/* Toggle preview com cortes — aparece assim que há segmentos */}
          {segments.length > 0 && (
            <button
              className={`dp-btn-toggle ${previewSegments ? 'active dp-btn-toggle-preview' : ''}`}
              onClick={() => {
                const next = !previewSegments;
                setPreviewSegments(next);
                toast.info(
                  next ? '▶ Preview com cortes ativo' : '▶ Preview normal',
                  next ? 'O player vai pular música e silêncios automaticamente' : 'Reprodução completa do vídeo original'
                );
              }}
              title="Reproduz só os segmentos definidos — pula música, silêncio e qualquer região excluída"
            >
              {previewSegments ? '✂ Preview com cortes' : '✂ Preview com cortes'}
            </button>
          )}

          {tab === 'silences' && silences.length > 0 && (
            <>
              {/* Toggle skip durante preview */}
              <button
                className={`dp-btn-toggle ${skipSilences ? 'active' : ''}`}
                onClick={() => {
                  const next = !skipSilences;
                  setSkipSilences(next);
                  toast.info(
                    next ? '⏩ Pulando silêncios no preview' : '⏸ Preview normal (com silêncios)',
                    next ? 'O vídeo vai saltar automaticamente os trechos silenciosos' : 'Reprodução completa reativada'
                  );
                }}
                title="Pular silêncios durante preview"
              >
                {skipSilences ? '⏩ Pulando silêncios' : '⏩ Preview sem silêncios'}
              </button>
              <button
                className="dp-btn-action"
                onClick={removeSilences}
                title="Gera os cortes removendo os silêncios — pronto para exportar"
              >
                ✂ Aplicar cortes
              </button>
            </>
          )}
          {tab === 'scenes' && scenes.length > 0 && (
            <button className="dp-btn-action" onClick={addSceneSegments}>
              + Segmentar por cena
            </button>
          )}
          {tab === 'breaths' && breaths.length > 0 && (
            <button
              className="dp-btn-action"
              onClick={() => {
                // Adiciona cada respiro como uma "região a remover" ao invert:
                // Re-cria segmentos excluindo os respiros dos segmentos existentes
                const store = useEditorStore.getState();
                const segs  = [...store.segments].sort((a, b) => a.start - b.start);
                if (segs.length === 0) { toast.error('Nenhum segmento', 'Aplique cortes antes de remover respiros.'); return; }

                const breathSet = breaths; // [{start, end}]
                const newSegs: {start: number; end: number}[] = [];

                for (const seg of segs) {
                  // Breaths que tocam este segmento
                  const overlapping = breathSet.filter(b => b.start < seg.end && b.end > seg.start);
                  if (overlapping.length === 0) { newSegs.push({ start: seg.start, end: seg.end }); continue; }

                  // Corta o segmento em torno dos respiros
                  let cursor = seg.start;
                  for (const b of overlapping.sort((a, b) => a.start - b.start)) {
                    if (b.start - cursor > 0.05) newSegs.push({ start: cursor, end: b.start });
                    cursor = Math.max(cursor, b.end);
                  }
                  if (seg.end - cursor > 0.05) newSegs.push({ start: cursor, end: seg.end });
                }

                store.reorderSegments([]);
                newSegs.forEach(s => addSegment(s));
                setPreviewSegments(true);
                toast.success(`${breaths.length} respiro${breaths.length > 1 ? 's' : ''} removido${breaths.length > 1 ? 's' : ''}`, `${newSegs.length} segmentos resultantes`);
              }}
              title="Remove os respiros dos segmentos atuais"
            >
              ✂ Remover respiros
            </button>
          )}

          {tab === 'repeats' && repeatGroups.length > 0 && (
            <button
              className="dp-btn-action dp-btn-action-repeats"
              onClick={() => {
                const store = useEditorStore.getState();
                const segs  = store.segments;
                const dur   = videoInfo?.duration ?? 0;

                // Faixas de tempo dos takes NÃO recomendados (por tempo, não por índice)
                const badRanges = repeatGroups
                  .flatMap(g => g.takes.filter(t => !t.recommended).map(t => ({ start: t.start, end: t.end })))
                  .sort((a, b) => a.start - b.start);

                if (badRanges.length === 0) {
                  toast.info('Nenhum take a remover', 'Todos os takes já são os recomendados.');
                  return;
                }

                let newSegs: { start: number; end: number }[];

                if (segs.length === 0) {
                  // Sem segmentos ainda: constrói a timeline inteira excluindo os takes ruins
                  if (dur === 0) { toast.error('Vídeo não carregado', ''); return; }
                  newSegs = [];
                  let cursor = 0;
                  for (const bad of badRanges) {
                    if (bad.start - cursor > 0.05) newSegs.push({ start: cursor, end: bad.start });
                    cursor = Math.max(cursor, bad.end);
                  }
                  if (dur - cursor > 0.05) newSegs.push({ start: cursor, end: dur });
                } else {
                  // Com segmentos: remove os que se sobrepõem com takes ruins
                  newSegs = segs.filter(s => !badRanges.some(b => s.start < b.end && s.end > b.start));
                }

                const removed = segs.length === 0 ? badRanges.length : segs.length - newSegs.length;
                store.reorderSegments([]);
                newSegs.forEach(s => addSegment({ start: s.start, end: s.end }));
                setPreviewSegments(true);
                toast.success(
                  `${removed} take${removed !== 1 ? 's' : ''} removido${removed !== 1 ? 's' : ''}`,
                  `${newSegs.length} segmento${newSegs.length !== 1 ? 's' : ''} restante${newSegs.length !== 1 ? 's' : ''}`
                );
              }}
              title="Mantém automaticamente o melhor take de cada grupo"
            >
              ✓ Usar melhores takes
            </button>
          )}

          {tab === 'audio' && audioRegions.length > 0 && (
            <button
              className="dp-btn-action"
              onClick={() => {
                const speechOnly = audioRegions.filter((r) => r.type === 'speech');
                if (speechOnly.length === 0) { toast.error('Nenhuma voz detectada', 'Tente rodar a análise Voz/Música novamente.'); return; }
                useEditorStore.getState().reorderSegments([]);
                speechOnly.forEach((r) => addSegment({ start: r.start, end: r.end }));
                setPreviewSegments(true);
                const dur = speechOnly.reduce((a, r) => a + (r.end - r.start), 0);
                toast.success(
                  `${speechOnly.length} trecho${speechOnly.length > 1 ? 's' : ''} de voz adicionado${speechOnly.length > 1 ? 's' : ''}`,
                  `${toDisplayTime(dur)} de fala · música e silêncio removidos`
                );
              }}
              title="Cria segmentos apenas com voz, removendo música e silêncio"
            >
              ✂ Manter só voz
            </button>
          )}
        </div>
      </div>

      <div className="dp-content">
        {tab === 'silences' && (
          <>
            {/* Resumo */}
            {silences.length > 0 && (
              <div className="dp-summary">
                <div className="dp-summary-item dp-summary-remove">
                  <span className="dp-summary-icon">✂</span>
                  <span>Removendo <strong>{toDisplayTime(totalSilenceDuration)}</strong> de silêncio</span>
                </div>
                <div className="dp-summary-item dp-summary-keep">
                  <span className="dp-summary-icon">▶</span>
                  <span>Restam <strong>{toDisplayTime(totalSpeechDuration)}</strong> de fala</span>
                </div>
              </div>
            )}

            <div className="dp-list">
              {silences.map((s, i) => (
                <div key={i} className="dp-item dp-silence">
                  <div className="dp-item-icon">✂</div>
                  <div className="dp-item-info">
                    <span className="dp-item-label">Silêncio #{i + 1} — será removido</span>
                    <span className="dp-item-times">
                      <span className="dp-time-in">{toSMPTE(s.start, fps)}</span>
                      <span className="dp-arrow">→</span>
                      <span className="dp-time-out">{s.end !== null ? toSMPTE(s.end, fps) : 'fim'}</span>
                      {s.end !== null && (
                        <span className="dp-dur">{toDisplayTime(s.end - s.start)}</span>
                      )}
                    </span>
                  </div>
                  <button className="dp-seek-btn" onClick={() => seekTo(s.start)} title="Ir para este ponto">▶</button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'audio' && (
          <>
            {audioRegions.length === 0 ? (
              <div className="dp-empty">Nenhuma região detectada</div>
            ) : (
              <>
                <div className="dp-audio-legend">
                  <span className="dp-audio-legend-item dp-audio-speech">■ Voz</span>
                  <span className="dp-audio-legend-item dp-audio-music">■ Música</span>
                  <span className="dp-audio-legend-item dp-audio-silence">■ Silêncio</span>
                </div>
                <div className="dp-list">
                  {audioRegions.map((r, i) => (
                    <div key={i} className={`dp-item dp-audio-${r.type}`}>
                      <div className="dp-item-icon">
                        {r.type === 'speech' ? '🗣' : r.type === 'music' ? '🎵' : '🔇'}
                      </div>
                      <div className="dp-item-info">
                        <span className="dp-item-label">
                          {r.type === 'speech' ? 'Voz' : r.type === 'music' ? 'Música' : 'Silêncio'} #{i + 1}
                        </span>
                        <span className="dp-item-times">
                          <span className={`dp-time-audio-${r.type}`}>{toSMPTE(r.start, fps)}</span>
                          <span className="dp-arrow">→</span>
                          <span className={`dp-time-audio-${r.type}`}>{toSMPTE(r.end, fps)}</span>
                          <span className="dp-dur">{toDisplayTime(r.end - r.start)}</span>
                        </span>
                      </div>
                      <button className="dp-seek-btn" onClick={() => seekTo(r.start)} title="Ir para este ponto">▶</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === 'breaths' && (
          <>
            {breaths.length === 0 ? (
              <div className="dp-empty">Nenhum respiro detectado</div>
            ) : (
              <>
                <div className="dp-summary">
                  <div className="dp-summary-item" style={{ color: '#a78bfa' }}>
                    <span>💨</span>
                    <span><strong>{breaths.length}</strong> respiros · {toDisplayTime(breaths.reduce((a, b) => a + (b.end - b.start), 0))} no total</span>
                  </div>
                </div>
                <div className="dp-list">
                  {breaths.map((b, i) => (
                    <div key={i} className="dp-item dp-breath">
                      <div className="dp-item-icon">💨</div>
                      <div className="dp-item-info">
                        <span className="dp-item-label">Respiro #{i + 1}</span>
                        <span className="dp-item-times">
                          <span className="dp-time-breath">{toSMPTE(b.start, fps)}</span>
                          <span className="dp-arrow">→</span>
                          <span className="dp-time-breath">{toSMPTE(b.end, fps)}</span>
                          <span className="dp-dur">{toDisplayTime(b.end - b.start)}</span>
                        </span>
                      </div>
                      <button className="dp-seek-btn" onClick={() => seekTo(b.start)} title="Ir para este ponto">▶</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === 'repeats' && (
          <>
            {repeatGroups.length === 0 ? (
              <div className="dp-empty">Nenhuma repetição detectada</div>
            ) : (
              <div className="dp-list">
                {repeatGroups.map((group: RepeatGroup, gi) => {
                  const isTranscript = group.source === 'transcript';
                  const headerText = isTranscript && group.takes[0]?.text
                    ? `"${group.takes[0].text}"`
                    : group.similarity != null
                      ? `sim. ${(group.similarity * 100).toFixed(0)}%`
                      : '';
                  return (
                    <div key={gi} className="dp-repeat-group">
                      <div className="dp-repeat-group-header">
                        {isTranscript ? '📝' : '🔁'} Grupo {gi + 1}
                        {headerText && <span className={`dp-dur ${isTranscript ? 'dp-transcript-phrase' : ''}`}>{headerText}</span>}
                      </div>
                      {group.takes.map((take, ti) => (
                        <div key={ti} className={`dp-item dp-repeat-take ${take.recommended ? 'dp-repeat-recommended' : ''}`}>
                          <div className="dp-item-icon">{take.recommended ? '✓' : '✕'}</div>
                          <div className="dp-item-info">
                            <span className="dp-item-label">
                              {take.recommended ? '★ Recomendado' : `Take ${ti + 1}`}
                              {take.integratedLoudness != null && (
                                <span className="dp-dur" style={{ marginLeft: 6 }}>{take.integratedLoudness.toFixed(1)} LUFS</span>
                              )}
                            </span>
                            <span className="dp-item-times">
                              <span className={take.recommended ? 'dp-time-repeat-good' : 'dp-time-repeat-bad'}>{toSMPTE(take.start, fps)}</span>
                              <span className="dp-arrow">→</span>
                              <span className={take.recommended ? 'dp-time-repeat-good' : 'dp-time-repeat-bad'}>{toSMPTE(take.end, fps)}</span>
                              <span className="dp-dur">{toDisplayTime(take.duration)}</span>
                            </span>
                          </div>
                          <button className="dp-seek-btn" onClick={() => seekTo(take.start)} title="Ir para este take">▶</button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'scenes' && (
          <>
            <div className="dp-scene-help">
              Detecta cortes bruscos de imagem — útil para dividir clipes ou encontrar transições.
            </div>
            {scenes.length === 0 ? (
              <div className="dp-empty">Nenhuma cena detectada</div>
            ) : (
              <div className="dp-list">
                {scenes.map((sc, i) => (
                  <div key={i} className="dp-item dp-scene">
                    <div className="dp-item-icon">🎬</div>
                    <div className="dp-item-info">
                      <span className="dp-item-label">Corte de cena #{i + 1}</span>
                      <span className="dp-item-times">
                        <span className="dp-time-scene">{toSMPTE(sc.time, fps)}</span>
                        <span className="dp-dur">{toDisplayTime(sc.time)}</span>
                      </span>
                    </div>
                    <button className="dp-seek-btn" onClick={() => seekTo(sc.time)} title="Ir para este ponto">▶</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'transcript' && (
          <>
            {transcriptSegments.length === 0 ? (
              <div className="dp-empty">Nenhuma transcrição disponível — clique em 📝 Transcrever na toolbar</div>
            ) : (
              <>
                <div className="dp-summary">
                  <div className="dp-summary-item" style={{ color: '#a5b4fc' }}>
                    <span>📝</span>
                    <span><strong>{transcriptWords.length}</strong> palavras · <strong>{transcriptSegments.length}</strong> segmentos</span>
                  </div>
                </div>
                <div className="dp-list">
                  {transcriptSegments.map((seg, i) => (
                    <div key={i} className="dp-item dp-transcript-seg" onClick={() => seekTo(seg.start)} style={{ cursor: 'pointer' }}>
                      <div className="dp-item-icon dp-transcript-icon">{toDisplayTime(seg.start)}</div>
                      <div className="dp-item-info">
                        <span className="dp-transcript-text">{seg.text}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
