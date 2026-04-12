import { useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';

interface KeyboardHandlers {
  togglePlay: () => void;
  stepFrames: (n: number) => void;
  pressJ: () => void;
  pressK: () => void;
  pressL: () => void;
  seekTo: (t: number) => void;
}

export function useKeyboard(handlers: KeyboardHandlers) {
  const {
    currentTime,
    videoInfo,
    inPoint,
    outPoint,
    setInPoint,
    setOutPoint,
    addSegment,
    selectedSegmentId,
    removeSegment,
  } = useEditorStore();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignorar quando foco está em input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          handlers.togglePlay();
          break;

        case 'KeyK':
          e.preventDefault();
          handlers.pressK();
          break;

        case 'KeyJ':
          e.preventDefault();
          handlers.pressJ();
          break;

        case 'KeyL':
          e.preventDefault();
          handlers.pressL();
          break;

        case 'ArrowLeft':
          e.preventDefault();
          handlers.stepFrames(e.shiftKey ? -10 : -1);
          break;

        case 'ArrowRight':
          e.preventDefault();
          handlers.stepFrames(e.shiftKey ? 10 : 1);
          break;

        case 'KeyI':
          e.preventDefault();
          setInPoint(currentTime);
          break;

        case 'KeyO':
          e.preventDefault();
          setOutPoint(currentTime);
          break;

        case 'BracketLeft': // [
          e.preventDefault();
          if (inPoint !== null) handlers.seekTo(inPoint);
          break;

        case 'BracketRight': // ]
          e.preventDefault();
          if (outPoint !== null) handlers.seekTo(outPoint);
          break;

        case 'Enter':
          e.preventDefault();
          if (inPoint !== null && outPoint !== null && inPoint < outPoint) {
            addSegment({ start: inPoint, end: outPoint });
            setInPoint(null);
            setOutPoint(null);
          } else if (inPoint !== null && videoInfo) {
            // Se só tem in point, corta até o fim
            addSegment({ start: inPoint, end: videoInfo.duration });
            setInPoint(null);
          }
          break;

        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          if (selectedSegmentId) removeSegment(selectedSegmentId);
          break;

        case 'Home':
          e.preventDefault();
          handlers.seekTo(0);
          break;

        case 'End':
          e.preventDefault();
          if (videoInfo) handlers.seekTo(videoInfo.duration);
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handlers,
    currentTime,
    videoInfo,
    inPoint,
    outPoint,
    setInPoint,
    setOutPoint,
    addSegment,
    selectedSegmentId,
    removeSegment,
  ]);
}
