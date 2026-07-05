import { useRef, useState, useCallback, useEffect } from 'react';

export function useThemeMusic(src: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = 0.25;
    audio.preload = 'auto';
    audioRef.current = audio;

    const handleCanPlay = () => setReady(true);
    const handleEnd = () => setPlaying(false);
    audio.addEventListener('canplaythrough', handleCanPlay);
    audio.addEventListener('ended', handleEnd);
    audio.load();

    return () => {
      audio.pause();
      audio.src = '';
      audio.removeEventListener('canplaythrough', handleCanPlay);
      audio.removeEventListener('ended', handleEnd);
      audioRef.current = null;
      setReady(false);
    };
  }, [src]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !ready) return;
    if (audio.paused) {
      audio.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, [ready]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setPlaying(false);
  }, []);

  const setVolume = useCallback((v: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = Math.max(0, Math.min(1, v));
  }, []);

  return { playing, ready, toggle, stop, setVolume };
}
