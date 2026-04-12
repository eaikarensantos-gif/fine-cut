import { create } from 'zustand';

export interface VideoInfo {
  fileId: string;
  videoUrl: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

export interface CutSegment {
  id: string;
  start: number;
  end: number;
}

export interface SilenceRegion {
  start: number;
  end: number | null;
}

export interface SceneMarker {
  time: number;
}

export interface AudioRegion {
  start: number;
  end: number;
  type: 'speech' | 'music' | 'silence';
}

export interface BreathRegion {
  start: number;
  end: number;
  type: 'breath';
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}

export interface RepeatTake {
  segmentIndex: number;
  start: number;
  end: number;
  duration: number;
  score: number;
  integratedLoudness?: number | null;
  lra?: number | null;
  text?: string;
  recommended?: boolean;
}

export interface RepeatGroup {
  takes: RepeatTake[];
  similarity?: number;
  source?: 'audio' | 'transcript';
}

export interface LibraryEntry {
  id: string;
  fileId: string;
  name: string;
  videoUrl: string;
  thumbUrl: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  hasAudio: boolean;
  addedAt: string;
}

export type ExportQuality = 'draft' | 'normal' | 'smart' | 'high' | 'lossless';

// ── Helpers internos ─────────────────────────────────────────────────────────

const MAX_HISTORY = 30;

function pushHistory(history: CutSegment[][], current: CutSegment[]): CutSegment[][] {
  return [...history.slice(-(MAX_HISTORY - 1)), current];
}

function genId(): string {
  return `seg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── Interface ─────────────────────────────────────────────────────────────────

interface EditorState {
  videoInfo: VideoInfo | null;
  setVideoInfo: (info: VideoInfo) => void;

  waveformPeaks: number[];
  setWaveformPeaks: (peaks: number[]) => void;

  // Keyframes do vídeo (para display na waveform + orientar cortes)
  keyframes: number[];
  setKeyframes: (kfs: number[]) => void;

  silences: SilenceRegion[];
  setSilences: (s: SilenceRegion[]) => void;
  scenes: SceneMarker[];
  setScenes: (s: SceneMarker[]) => void;

  currentTime: number;
  setCurrentTime: (t: number) => void;
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  playbackRate: number;
  setPlaybackRate: (r: number) => void;

  inPoint: number | null;
  outPoint: number | null;
  setInPoint: (t: number | null) => void;
  setOutPoint: (t: number | null) => void;

  // Segmentos confirmados
  segments: CutSegment[];
  addSegment: (seg: Omit<CutSegment, 'id'>) => void;
  removeSegment: (id: string) => void;
  updateSegment: (id: string, patch: Partial<Omit<CutSegment, 'id'>>) => void;
  reorderSegments: (segments: CutSegment[]) => void;
  /** Substitui todos os segmentos de uma vez — 1 entrada no histórico */
  setSegmentsBatch: (segs: Omit<CutSegment, 'id'>[]) => void;

  // Undo / redo de segmentos
  segmentHistory: CutSegment[][];
  segmentFuture:  CutSegment[][];
  undoSegments: () => void;
  redoSegments: () => void;

  selectedSegmentId: string | null;
  setSelectedSegmentId: (id: string | null) => void;

  skipSilences: boolean;
  setSkipSilences: (v: boolean) => void;

  previewSegments: boolean;
  setPreviewSegments: (v: boolean) => void;

  audioRegions: AudioRegion[];
  setAudioRegions: (r: AudioRegion[]) => void;

  breaths: BreathRegion[];
  setBreaths: (b: BreathRegion[]) => void;

  transcriptWords: TranscriptWord[];
  setTranscriptWords: (w: TranscriptWord[]) => void;
  transcriptSegments: TranscriptSegment[];
  setTranscriptSegments: (s: TranscriptSegment[]) => void;

  repeatGroups: RepeatGroup[];
  setRepeatGroups: (g: RepeatGroup[]) => void;

  exportQuality: ExportQuality;
  setExportQuality: (q: ExportQuality) => void;

  library: LibraryEntry[];
  setLibrary: (entries: LibraryEntry[]) => void;
  addToLibrary: (entry: LibraryEntry) => void;
  removeFromLibrary: (id: string) => void;

  exportProgress: number;
  setExportProgress: (p: number) => void;

  activeDetectionTab: string | null;
  setActiveDetectionTab: (tab: string | null) => void;

  resetEditor: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useEditorStore = create<EditorState>((set) => ({
  videoInfo: null,
  setVideoInfo: (info) => set({ videoInfo: info }),

  waveformPeaks: [],
  setWaveformPeaks: (peaks) => set({ waveformPeaks: peaks }),

  keyframes: [],
  setKeyframes: (keyframes) => set({ keyframes }),

  silences: [],
  setSilences: (silences) => set({ silences }),
  scenes: [],
  setScenes: (scenes) => set({ scenes }),

  currentTime: 0,
  setCurrentTime: (currentTime) => set({ currentTime }),
  isPlaying: false,
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  playbackRate: 1,
  setPlaybackRate: (playbackRate) => set({ playbackRate }),

  inPoint: null,
  outPoint: null,
  setInPoint: (inPoint) => set({ inPoint }),
  setOutPoint: (outPoint) => set({ outPoint }),

  segments: [],
  addSegment: (seg) =>
    set((s) => ({
      segmentHistory: pushHistory(s.segmentHistory, s.segments),
      segmentFuture:  [],
      segments: [...s.segments, { ...seg, id: genId() }],
    })),
  removeSegment: (id) =>
    set((s) => ({
      segmentHistory: pushHistory(s.segmentHistory, s.segments),
      segmentFuture:  [],
      segments: s.segments.filter((x) => x.id !== id),
    })),
  updateSegment: (id, patch) =>
    set((s) => ({
      segmentHistory: pushHistory(s.segmentHistory, s.segments),
      segmentFuture:  [],
      segments: s.segments.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    })),
  reorderSegments: (segments) =>
    set((s) => ({
      segmentHistory: pushHistory(s.segmentHistory, s.segments),
      segmentFuture:  [],
      segments,
    })),
  setSegmentsBatch: (segs) =>
    set((s) => ({
      segmentHistory: pushHistory(s.segmentHistory, s.segments),
      segmentFuture:  [],
      segments: segs.map((seg) => ({ ...seg, id: genId() })),
    })),

  segmentHistory: [],
  segmentFuture:  [],
  undoSegments: () =>
    set((s) => {
      if (s.segmentHistory.length === 0) return {};
      const prev = s.segmentHistory[s.segmentHistory.length - 1];
      return {
        segments:        prev,
        segmentHistory:  s.segmentHistory.slice(0, -1),
        segmentFuture:   [s.segments, ...s.segmentFuture.slice(0, MAX_HISTORY - 1)],
      };
    }),
  redoSegments: () =>
    set((s) => {
      if (s.segmentFuture.length === 0) return {};
      const next = s.segmentFuture[0];
      return {
        segments:       next,
        segmentFuture:  s.segmentFuture.slice(1),
        segmentHistory: pushHistory(s.segmentHistory, s.segments),
      };
    }),

  selectedSegmentId: null,
  setSelectedSegmentId: (selectedSegmentId) => set({ selectedSegmentId }),

  skipSilences: false,
  setSkipSilences: (skipSilences) => set({ skipSilences }),

  previewSegments: false,
  setPreviewSegments: (previewSegments) => set({ previewSegments }),

  audioRegions: [],
  setAudioRegions: (audioRegions) => set({ audioRegions }),

  breaths: [],
  setBreaths: (breaths) => set({ breaths }),

  transcriptWords: [],
  setTranscriptWords: (transcriptWords) => set({ transcriptWords }),
  transcriptSegments: [],
  setTranscriptSegments: (transcriptSegments) => set({ transcriptSegments }),

  repeatGroups: [],
  setRepeatGroups: (repeatGroups) => set({ repeatGroups }),

  exportQuality: 'normal',
  setExportQuality: (exportQuality) => set({ exportQuality }),

  library: [],
  setLibrary: (library) => set({ library }),
  addToLibrary: (entry) => set((s) => ({ library: [...s.library.filter((e) => e.id !== entry.id), entry] })),
  removeFromLibrary: (id) => set((s) => ({ library: s.library.filter((e) => e.id !== id) })),

  exportProgress: 0,
  setExportProgress: (exportProgress) => set({ exportProgress }),

  activeDetectionTab: null,
  setActiveDetectionTab: (activeDetectionTab) => set({ activeDetectionTab }),

  resetEditor: () => set({
    videoInfo:       null,
    waveformPeaks:   [],
    keyframes:       [],
    silences:        [],
    scenes:          [],
    currentTime:     0,
    isPlaying:       false,
    playbackRate:    1,
    inPoint:         null,
    outPoint:        null,
    segments:        [],
    segmentHistory:  [],
    segmentFuture:   [],
    selectedSegmentId: null,
    skipSilences:    false,
    previewSegments: false,
    audioRegions:    [],
    breaths:         [],
    transcriptWords: [],
    transcriptSegments: [],
    repeatGroups:    [],
    exportProgress:  0,
    activeDetectionTab: null,
  }),
}));
