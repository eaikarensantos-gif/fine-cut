/**
 * Sistema de atalhos de teclado — baseado no padrão modifier-Set do LosslessCut
 * (reimplementação independente; GPL-2.0 inspiração)
 *
 * Cada atalho é declarado como { code, mods?, action, description }.
 * Os modificadores são comparados via Set para suporte confiável a combos.
 */

import { useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { toast } from '../store/toastStore';

type Mod = 'ctrl' | 'shift' | 'alt';

interface Shortcut {
  code: string;
  mods?: Mod[];
  action: () => void;
}

interface KeyboardHandlers {
  togglePlay: () => void;
  stepFrames: (n: number) => void;
  pressJ: () => void;
  pressK: () => void;
  pressL: () => void;
  seekTo: (t: number) => void;
}

function getMods(e: KeyboardEvent): Set<Mod> {
  const mods = new Set<Mod>();
  if (e.ctrlKey || e.metaKey) mods.add('ctrl');
  if (e.shiftKey)              mods.add('shift');
  if (e.altKey)                mods.add('alt');
  return mods;
}

function modsMatch(pressed: Set<Mod>, required: Mod[] = []): boolean {
  const req = new Set(required);
  if (req.size !== pressed.size) return false;
  for (const m of req) if (!pressed.has(m)) return false;
  return true;
}

export function useKeyboard(handlers: KeyboardHandlers) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Não interferir quando foco está em campo de texto
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const {
        currentTime, videoInfo,
        inPoint, outPoint,
        setInPoint, setOutPoint,
        addSegment,
        selectedSegmentId, removeSegment,
        undoSegments, redoSegments,
        segments,
      } = useEditorStore.getState();

      const mods = getMods(e);

      // ── Definição de atalhos ────────────────────────────────────────────────
      const shortcuts: Shortcut[] = [

        // Playback
        { code: 'Space', action: handlers.togglePlay },
        { code: 'KeyK',  action: handlers.pressK },
        { code: 'KeyJ',  action: handlers.pressJ },
        { code: 'KeyL',  action: handlers.pressL },

        // Frame stepping — setas (sem modifier = 1 frame, Shift = 10 frames)
        { code: 'ArrowLeft',  action: () => handlers.stepFrames(-1)  },
        { code: 'ArrowRight', action: () => handlers.stepFrames(1)   },
        { code: 'ArrowLeft',  mods: ['shift'], action: () => handlers.stepFrames(-10) },
        { code: 'ArrowRight', mods: ['shift'], action: () => handlers.stepFrames(10)  },

        // Frame stepping — vírgula/ponto (estilo Premiere)
        { code: 'Comma',  action: () => handlers.stepFrames(-1) },
        { code: 'Period', action: () => handlers.stepFrames(1)  },

        // Marcação de in/out
        { code: 'KeyI', action: () => { setInPoint(currentTime);  } },
        { code: 'KeyO', action: () => { setOutPoint(currentTime); } },

        // Navegar para in/out
        { code: 'BracketLeft',  action: () => { if (inPoint  !== null) handlers.seekTo(inPoint);  } },
        { code: 'BracketRight', action: () => { if (outPoint !== null) handlers.seekTo(outPoint); } },

        // Confirmar corte (Enter)
        {
          code: 'Enter',
          action: () => {
            if (inPoint !== null && outPoint !== null && inPoint < outPoint) {
              addSegment({ start: inPoint, end: outPoint });
              setInPoint(null);
              setOutPoint(null);
            } else if (inPoint !== null && videoInfo) {
              addSegment({ start: inPoint, end: videoInfo.duration });
              setInPoint(null);
            }
          },
        },

        // Deletar segmento selecionado
        { code: 'Delete',    action: () => { if (selectedSegmentId) removeSegment(selectedSegmentId); } },
        { code: 'Backspace', action: () => { if (selectedSegmentId) removeSegment(selectedSegmentId); } },

        // Ir ao início / fim
        { code: 'Home', action: () => handlers.seekTo(0) },
        { code: 'End',  action: () => { if (videoInfo) handlers.seekTo(videoInfo.duration); } },

        // Undo / Redo
        {
          code: 'KeyZ', mods: ['ctrl'],
          action: () => {
            undoSegments();
            toast.info('↩ Undo', 'Segmentos restaurados');
          },
        },
        {
          code: 'KeyZ', mods: ['ctrl', 'shift'],
          action: () => {
            redoSegments();
            toast.info('↪ Redo', 'Segmentos refeitos');
          },
        },
        {
          code: 'KeyY', mods: ['ctrl'],
          action: () => {
            redoSegments();
            toast.info('↪ Redo', 'Segmentos refeitos');
          },
        },

        // Selecionar tudo / desselecionar (para uso futuro)
        // { code: 'KeyA', mods: ['ctrl'], action: () => { /* select all */ } },

        // Duplicar segmento selecionado
        {
          code: 'KeyD', mods: ['ctrl'],
          action: () => {
            if (!selectedSegmentId) return;
            const seg = segments.find((s) => s.id === selectedSegmentId);
            if (seg) addSegment({ start: seg.start, end: seg.end });
          },
        },

        // Ir para o marcador de in/out usando Shift+I e Shift+O (estilo FCP)
        { code: 'KeyI', mods: ['shift'], action: () => { if (inPoint  !== null) handlers.seekTo(inPoint);  } },
        { code: 'KeyO', mods: ['shift'], action: () => { if (outPoint !== null) handlers.seekTo(outPoint); } },
      ];

      // ── Matching ───────────────────────────────────────────────────────────
      for (const sc of shortcuts) {
        if (e.code === sc.code && modsMatch(mods, sc.mods)) {
          e.preventDefault();
          sc.action();
          return;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers]);
}

// ── Tabela de atalhos para exibição na UI ─────────────────────────────────────

export const SHORTCUT_TABLE = [
  { keys: 'Space',      label: 'Play / Pause' },
  { keys: 'K',         label: 'Pause' },
  { keys: 'J',         label: 'Play reverso (acumula velocidade)' },
  { keys: 'L',         label: 'Play (acumula velocidade)' },
  { keys: '← / →',     label: '±1 frame' },
  { keys: 'Shift+← / →', label: '±10 frames' },
  { keys: ', / .',      label: '±1 frame (Premiere-style)' },
  { keys: 'I',          label: 'Marcar In point' },
  { keys: 'O',          label: 'Marcar Out point' },
  { keys: 'Shift+I',    label: 'Ir ao In point' },
  { keys: 'Shift+O',    label: 'Ir ao Out point' },
  { keys: '[ / ]',      label: 'Ir ao In / Out point' },
  { keys: 'Enter',      label: 'Confirmar corte' },
  { keys: 'Delete',     label: 'Remover segmento selecionado' },
  { keys: 'Home / End', label: 'Ir ao início / fim' },
  { keys: 'Ctrl+Z',     label: 'Desfazer (segmentos)' },
  { keys: 'Ctrl+Shift+Z / Ctrl+Y', label: 'Refazer (segmentos)' },
  { keys: 'Ctrl+D',     label: 'Duplicar segmento' },
];
