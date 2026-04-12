/**
 * Sistema de atalhos de teclado com modifier-Set.
 *
 * IMPORTANTE: usa useRef para os handlers — o effect só é registrado UMA vez
 * e sempre acessa os callbacks mais recentes via ref. Isso evita o bug de
 * re-registrar o event listener a cada render (que acontecia quando o
 * VideoPlayer subscrevia currentTime e re-renderizava a 60fps).
 */

import { useEffect, useRef } from 'react';
import { useEditorStore } from '../store/editorStore';
import { toast } from '../store/toastStore';

type Mod = 'ctrl' | 'shift' | 'alt';

interface Shortcut {
  code: string;
  mods?: Mod[];
  action: () => void;
}

export interface KeyboardHandlers {
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
  // Ref sempre atualizado — o effect não precisa re-executar quando handlers muda
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Não interferir quando foco está em campo de texto
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return;

      const h = handlersRef.current;
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

      const shortcuts: Shortcut[] = [
        // Playback
        { code: 'Space', action: h.togglePlay },
        { code: 'KeyK',  action: h.pressK },
        { code: 'KeyJ',  action: h.pressJ },
        { code: 'KeyL',  action: h.pressL },

        // Frame stepping
        { code: 'ArrowLeft',  action: () => h.stepFrames(-1)  },
        { code: 'ArrowRight', action: () => h.stepFrames(1)   },
        { code: 'ArrowLeft',  mods: ['shift'], action: () => h.stepFrames(-10) },
        { code: 'ArrowRight', mods: ['shift'], action: () => h.stepFrames(10)  },

        // Premiere-style frame stepping
        { code: 'Comma',  action: () => h.stepFrames(-1) },
        { code: 'Period', action: () => h.stepFrames(1)  },

        // In / Out
        { code: 'KeyI', action: () => setInPoint(currentTime)  },
        { code: 'KeyO', action: () => setOutPoint(currentTime) },

        // Navegar para in/out
        { code: 'BracketLeft',  action: () => { if (inPoint  !== null) h.seekTo(inPoint);  } },
        { code: 'BracketRight', action: () => { if (outPoint !== null) h.seekTo(outPoint); } },
        { code: 'KeyI', mods: ['shift'], action: () => { if (inPoint  !== null) h.seekTo(inPoint);  } },
        { code: 'KeyO', mods: ['shift'], action: () => { if (outPoint !== null) h.seekTo(outPoint); } },

        // Confirmar corte
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

        // Deletar segmento
        { code: 'Delete',    action: () => { if (selectedSegmentId) removeSegment(selectedSegmentId); } },
        { code: 'Backspace', action: () => { if (selectedSegmentId) removeSegment(selectedSegmentId); } },

        // Navegação
        { code: 'Home', action: () => h.seekTo(0) },
        { code: 'End',  action: () => { if (videoInfo) h.seekTo(videoInfo.duration); } },

        // Undo / Redo
        { code: 'KeyZ', mods: ['ctrl'],         action: () => { undoSegments(); toast.info('↩ Undo', 'Segmentos restaurados'); } },
        { code: 'KeyZ', mods: ['ctrl', 'shift'], action: () => { redoSegments(); toast.info('↪ Redo', 'Segmentos refeitos');    } },
        { code: 'KeyY', mods: ['ctrl'],          action: () => { redoSegments(); toast.info('↪ Redo', 'Segmentos refeitos');    } },

        // Duplicar segmento
        {
          code: 'KeyD', mods: ['ctrl'],
          action: () => {
            if (!selectedSegmentId) return;
            const seg = segments.find((s) => s.id === selectedSegmentId);
            if (seg) addSegment({ start: seg.start, end: seg.end });
          },
        },
      ];

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
  }, []); // ← deps vazio: registra UMA vez, acessa handlers via ref
}

// Tabela de atalhos para exibição
export const SHORTCUT_TABLE = [
  { keys: 'Space',             label: 'Play / Pause' },
  { keys: 'K',                 label: 'Pause' },
  { keys: 'J',                 label: 'Play reverso' },
  { keys: 'L',                 label: 'Play (acumula velocidade)' },
  { keys: '← / →',             label: '±1 frame' },
  { keys: 'Shift+← / →',       label: '±10 frames' },
  { keys: ', / .',              label: '±1 frame (Premiere-style)' },
  { keys: 'I / O',             label: 'Marcar In / Out point' },
  { keys: 'Shift+I / O',       label: 'Ir ao In / Out point' },
  { keys: '[ / ]',             label: 'Ir ao In / Out point' },
  { keys: 'Enter',             label: 'Confirmar corte' },
  { keys: 'Delete',            label: 'Remover segmento selecionado' },
  { keys: 'Home / End',        label: 'Início / Fim' },
  { keys: 'Ctrl+Z',            label: 'Desfazer' },
  { keys: 'Ctrl+Shift+Z / Y',  label: 'Refazer' },
  { keys: 'Ctrl+D',            label: 'Duplicar segmento' },
];
