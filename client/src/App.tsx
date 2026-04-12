import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Toolbar } from './components/Toolbar/Toolbar';
import { VideoPlayer } from './components/VideoPlayer/VideoPlayer';
import { Waveform } from './components/Waveform/Waveform';
import { Timeline } from './components/Timeline/Timeline';
import { CutList } from './components/CutList/CutList';
import { DetectionPanel } from './components/DetectionPanel/DetectionPanel';
import { Library } from './components/Library/Library';
import { Toaster } from './components/Toast/Toaster';
import { useEditorStore } from './store/editorStore';
import './App.css';

const socket = io('/', { path: '/socket.io' });

export default function App() {
  const { setExportProgress } = useEditorStore();
  const [showLibrary, setShowLibrary] = useState(false);

  useEffect(() => {
    socket.on('export:progress', ({ percent }: { percent: number }) => {
      setExportProgress(percent);
    });
    socket.on('export:done', () => setExportProgress(100));
    return () => {
      socket.off('export:progress');
      socket.off('export:done');
    };
  }, [setExportProgress]);

  return (
    <div className="app">
      <Toolbar onOpenLibrary={() => setShowLibrary(true)} />
      <DetectionPanel />
      {showLibrary && <Library onClose={() => setShowLibrary(false)} />}
      <Toaster />
      <div className="main-layout">
        <div className="center-col">
          <VideoPlayer />
          <div className="bottom-panels">
            <Waveform />
            <Timeline />
          </div>
        </div>
        <div className="side-col">
          <CutList />
        </div>
      </div>
    </div>
  );
}
