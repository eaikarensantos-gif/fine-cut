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

export type ExportQuality = 'draft' | 'normal' | 'high' | 'lossless';

interface EditorState {
  // Vídeo carregado
  videoInfo: VideoInfo | null;
  setVideoInfo: (info: VideoInfo) => void;

  // Waveform
  waveformPeaks: number[];
  setWaveformPeaks: (peaks: number[]) => void;

  // Silêncios e cenas detectados
  silences: SilenceRegion[];
  setSilences: (s: SilenceRegion[]) => void;
  scenes: SceneMarker[];
  setScenes: (s: SceneMarker[]) => void;

  // Playback
  currentTime: number;
  setCurrentTime: (t: number) => void;
  isPlaying: boolean;
  setIsPlaying: (v: boolean) => void;
  playbackRate: number;
  setPlaybackRate: (r: number) => void;

  // Pontos de corte
  inPoint: number | null;
  outPoint: number | null;
  setInPoint: (t: number | null) => void;
  setOutPoint: (t: number | null) => void;

  // Lista de segmentos confirmados
  segments: CutSegment[];
  addSegment: (seg: Omit<CutSegment, 'id'>) => void;
  removeSegment: (id: string) => void;
  updateSegment: (id: string, patch: Partial<Omit<CutSegment, 'id'>>) => void;
  reorderSegments: (segments: CutSegment[]) => void;

  // Segmento selecionado na lista
  selectedSegmentId: string | null;
  setSelectedSegmentId: (id: string | null) => void;

  // Modo skip silences
  skipSilences: boolean;
  setSkipSilences: (v: boolean) => void;

  // Preview com cortes: só reproduz dentro dos segmentos definidos
  previewSegments: boolean;
  setPreviewSegments: (v: boolean) => void;

  // Detecção de tipo de áudio (música vs voz)
  audioRegions: AudioRegion[];
  setAudioRegions: (r: AudioRegion[]) => void;

  // Respiros detectados
  breaths: BreathRegion[];
  setBreaths: (b: BreathRegion[]) => void;

  // Transcrição (Whisper)
  transcriptWords: TranscriptWord[];
  setTranscriptWords: (w: TranscriptWord[]) => void;
  transcriptSegments: TranscriptSegment[];
  setTranscriptSegments: (s: TranscriptSegment[]) => void;

  // Grupos de repetições (retakes)
  repeatGroups: RepeatGroup[];
  setRepeatGroups: (g: RepeatGroup[]) => void;

  // Qualidade de exportação
  exportQuality: ExportQuality;
  setExportQuality: (q: ExportQuality) => void;

  // Biblioteca de arquivos
  library: LibraryEntry[];
  setLibrary: (entries: LibraryEntry[]) => void;
  addToLibrary: (entry: LibraryEntry) => void;
  removeFromLibrary: (id: string) => void;

  // Estado de exportação
  exportProgress: number;
  setExportProgress: (p: number) => void;

  // Reset completo ao trocar de vídeo
  resetEditor: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  videoInfo: null,
  setVideoInfo: (info) => set({ videoInfo: info }),

  waveformPeaks: [],
  setWaveformPeaks: (peaks) => set({ waveformPeaks: peaks }),

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
      segments: [
        ...s.segments,
        { ...seg, id: `seg-${Date.now()}-${Math.random().toString(36).slice(2)}` },
      ],
    })),
  removeSegment: (id) => set((s) => ({ segments: s.segments.filter((x) => x.id !== id) })),
  updateSegment: (id, patch) =>
    set((s) => ({
      segments: s.segments.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    })),
  reorderSegments: (segments) => set({ segments }),

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

  resetEditor: () => set({
    videoInfo: null,
    waveformPeaks: [],
    silences: [],
    scenes: [],
    currentTime: 0,
    isPlaying: false,
    playbackRate: 1,
    inPoint: null,
    outPoint: null,
    segments: [],
    selectedSegmentId: null,
    skipSilences: false,
    previewSegments: false,
    audioRegions: [],
    breaths: [],
    transcriptWords: [],
    transcriptSegments: [],
    repeatGroups: [],
    exportQuality: 'normal',
    exportProgress: 0,
  }),
}));
