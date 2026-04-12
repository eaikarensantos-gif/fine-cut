import { useRef, useCallback, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';

export function useVideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number>(0);
  const jklRateRef = useRef<number>(1);

  const { videoInfo, setCurrentTime, setIsPlaying, setPlaybackRate } = useEditorStore();
  const fps = videoInfo?.fps ?? 30;

  // rAF tracking — com skip de silêncios e skip por segmentos
  const startTracking = useCallback(() => {
    const tick = () => {
      const v = videoRef.current;
      if (!v) { rafRef.current = requestAnimationFrame(tick); return; }

      const { skipSilences, silences, previewSegments, segments } = useEditorStore.getState();
      const t = v.currentTime;

      if (!v.paused) {
        // --- Modo 1: preview com cortes (pula regiões fora dos segmentos) ---
        if (previewSegments && segments.length > 0) {
          const sorted = [...segments].sort((a, b) => a.start - b.start);
          const cur = v.currentTime;
          const inSeg = sorted.find((s) => cur >= s.start && cur < s.end);

          if (!inSeg) {
            const next = sorted.find((s) => s.start > cur);
            if (next) {
              v.currentTime = next.start;
            } else {
              v.pause();
              v.currentTime = sorted[sorted.length - 1].end;
            }
          }
        }

        // --- Modo 2: pular silêncios (só se preview com cortes NÃO está ativo) ---
        if (skipSilences && silences.length > 0 && !previewSegments) {
          const cur = v.currentTime; // re-lê após possível jump
          for (const s of silences) {
            const end = s.end ?? v.duration;
            if (cur >= s.start && cur < end) {
              v.currentTime = Math.min(end + 0.05, v.duration);
              break;
            }
          }
        }
      }

      setCurrentTime(v.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [setCurrentTime]);

  const stopTracking = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
  }, []);

  const play = useCallback(() => {
    videoRef.current?.play();
    setIsPlaying(true);
    startTracking();
  }, [setIsPlaying, startTracking]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
    setIsPlaying(false);
    stopTracking();
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
    jklRateRef.current = 1;
  }, [setIsPlaying, stopTracking, setCurrentTime]);

  const togglePlay = useCallback(() => {
    if (videoRef.current?.paused) play();
    else pause();
  }, [play, pause]);

  const seekTo = useCallback(
    (time: number) => {
      const v = videoRef.current;
      if (!v) return;
      const clamped = Math.max(0, Math.min(time, v.duration || 0));
      v.currentTime = clamped;
      setCurrentTime(clamped);
    },
    [setCurrentTime]
  );

  const stepFrames = useCallback(
    (frames: number) => {
      const v = videoRef.current;
      if (!v) return;
      pause();
      seekTo(v.currentTime + frames / fps);
    },
    [fps, pause, seekTo]
  );

  // --- J-K-L ---
  const reverseRafRef = useRef<number>(0);
  const isReversingRef = useRef(false);

  const startReversePlayback = useCallback(() => {
    isReversingRef.current = true;
    const speed = Math.abs(jklRateRef.current);
    const step = (speed / fps) * 2;

    const tick = () => {
      const v = videoRef.current;
      if (!v || !isReversingRef.current) return;
      const next = v.currentTime - step;
      if (next <= 0) {
        v.currentTime = 0;
        setCurrentTime(0);
        stopReversePlayback();
        return;
      }
      v.currentTime = next;
      setCurrentTime(next);
      reverseRafRef.current = requestAnimationFrame(tick);
    };
    reverseRafRef.current = requestAnimationFrame(tick);
    setIsPlaying(true);
  }, [fps, setCurrentTime, setIsPlaying]);

  const stopReversePlayback = useCallback(() => {
    isReversingRef.current = false;
    cancelAnimationFrame(reverseRafRef.current);
    setIsPlaying(false);
  }, [setIsPlaying]);

  const applyJKLRate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const rate = jklRateRef.current;
    if (rate < 0) {
      v.pause();
      stopTracking();
      startReversePlayback();
    } else {
      stopReversePlayback();
      v.playbackRate = rate;
      setPlaybackRate(rate);
      if (v.paused) {
        v.play();
        startTracking();
        setIsPlaying(true);
      }
    }
  }, [startReversePlayback, stopReversePlayback, startTracking, stopTracking, setPlaybackRate, setIsPlaying]);

  const pressJ = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      jklRateRef.current = -1;
      pause();
      startReversePlayback();
    } else {
      jklRateRef.current = Math.max(-4, jklRateRef.current - 1);
      applyJKLRate();
    }
  }, [pause, startReversePlayback, applyJKLRate]);

  const pressL = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      jklRateRef.current = 1;
      v.playbackRate = 1;
      play();
    } else {
      jklRateRef.current = Math.min(4, jklRateRef.current + 1);
      applyJKLRate();
    }
  }, [play, applyJKLRate]);

  const pressK = useCallback(() => {
    pause();
    stopReversePlayback();
  }, [pause, stopReversePlayback]);

  useEffect(() => {
    return () => {
      stopTracking();
      stopReversePlayback();
    };
  }, [stopTracking, stopReversePlayback]);

  return { videoRef, play, pause, togglePlay, seekTo, stepFrames, pressJ, pressK, pressL };
}
