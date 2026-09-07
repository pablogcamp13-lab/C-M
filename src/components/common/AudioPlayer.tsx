import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  Volume2, 
  VolumeX, 
  Clock, 
  Upload, 
  FileAudio, 
  Trash2, 
  Tag,
  CheckCircle2
} from 'lucide-react';

interface AudioPlayerProps {
  audioUrl?: string;
  audioFileName?: string;
  audioDurationSeconds?: number;
  readOnly?: boolean;
  sticky?: boolean;
  onTimeUpdate?: (currentTimeSeconds: number, formattedTimestamp: string) => void;
  onInsertTimestamp?: (timestamp: string, seconds: number) => void;
  onAudioUpload?: (file: File, objectUrl: string, durationSeconds: number) => void;
  onRemoveAudio?: () => void;
  seekToSeconds?: number | null;
}

export const formatSecondsToTime = (totalSeconds: number): string => {
  if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  audioFileName,
  audioDurationSeconds = 380, // Default demo duration ~6:20
  readOnly = false,
  sticky = false,
  onTimeUpdate,
  onInsertTimestamp,
  onAudioUpload,
  onRemoveAudio,
  seekToSeconds
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(audioDurationSeconds);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState<boolean>(false);
  const [playableUrl, setPlayableUrl] = useState<string | undefined>(audioUrl);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Drive preview URLs are HTML pages, not audio streams. Resolve uploaded Drive files
  // through the authenticated API and play a local blob, so credentials stay in headers.
  useEffect(() => {
    const driveId = audioUrl?.match(/\/d\/([^/?]+)/)?.[1] || audioUrl?.match(/[?&]id=([^&]+)/)?.[1];
    const source = audioUrl?.startsWith('/api/files/') ? audioUrl : driveId ? `/api/files/${driveId}/content` : audioUrl;
    if (!source?.startsWith('/api/files/') && !source?.startsWith('/api/quality-alerts/')) {
      setPlayableUrl(source);
      setPlaybackError(null);
      return;
    }
    let objectUrl: string | undefined;
    const token = sessionStorage.getItem('CONTACT_CENTER_AUTH_TOKEN');
    setPlayableUrl(undefined);
    setPlaybackError(null);
    fetch(source, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(response => {
        if (!response.ok) throw new Error('No fue posible obtener el audio.');
        return response.blob();
      })
      .then(blob => {
        objectUrl = URL.createObjectURL(blob);
        setPlayableUrl(objectUrl);
      })
      .catch(() => setPlaybackError('No fue posible cargar el audio. Intenta cargarlo nuevamente.'));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [audioUrl]);

  // Initialize audio element or handle demo playback
  useEffect(() => {
    if (seekToSeconds !== undefined && seekToSeconds !== null) {
      if (audioRef.current) {
        audioRef.current.currentTime = seekToSeconds;
      }
      setCurrentTime(seekToSeconds);
      if (!isPlaying) {
        setIsPlaying(true);
        if (audioRef.current) {
          audioRef.current.play().catch(() => {});
        }
      }
    }
  }, [seekToSeconds]);

  // Demo playback timer if no real audio source or silent demo stream
  useEffect(() => {
    let interval: any;
    if (isPlaying && !audioUrl) {
      interval = setInterval(() => {
        setCurrentTime(prev => {
          const next = prev + 0.25 * playbackRate;
          if (next >= duration) {
            setIsPlaying(false);
            return duration;
          }
          if (onTimeUpdate) {
            onTimeUpdate(next, formatSecondsToTime(next));
          }
          return next;
        });
      }, 250);
    }
    return () => clearInterval(interval);
  }, [isPlaying, audioUrl, duration, playbackRate, onTimeUpdate]);

  const togglePlay = () => {
    if (audioRef.current && playableUrl) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(() => { setIsPlaying(false); setPlaybackError('El navegador no pudo reproducir este audio.'); });
      }
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetSeconds = parseFloat(e.target.value);
    setCurrentTime(targetSeconds);
    if (audioRef.current && playableUrl) {
      audioRef.current.currentTime = targetSeconds;
    }
    if (onTimeUpdate) {
      onTimeUpdate(targetSeconds, formatSecondsToTime(targetSeconds));
    }
  };

  const skipTime = (delta: number) => {
    const next = Math.max(0, Math.min(duration, currentTime + delta));
    setCurrentTime(next);
    if (audioRef.current && playableUrl) {
      audioRef.current.currentTime = next;
    }
    if (onTimeUpdate) {
      onTimeUpdate(next, formatSecondsToTime(next));
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackRate(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
    }
    setIsMuted(!isMuted);
  };

  const handleFileUpload = (file: File) => {
    if (!file) return;

    // Supported formats prioritizing MP3 and MPEG (.mp3, .mpeg, .mpg)
    const allowedMimeTypes = [
      'audio/mp3',
      'audio/mpeg',
      'audio/mpg',
      'audio/x-mpeg',
      'audio/x-mpeg-3',
      'video/mpeg',
      'audio/wav',
      'audio/x-wav',
      'audio/m4a',
      'audio/x-m4a',
      'audio/mp4',
      'audio/ogg',
      'audio/webm',
      'audio/aac'
    ];

    const validExtensions = /\.(mp3|mpeg|mpg|wav|m4a|ogg|webm|aac|mp4)$/i;
    const isMimeValid = file.type ? allowedMimeTypes.includes(file.type.toLowerCase()) : false;
    const isExtValid = validExtensions.test(file.name);

    if (!isMimeValid && !isExtValid) {
      alert('Formato no soportado. Por favor selecciona un archivo de audio en formato MP3 o MPEG (.mp3, .mpeg).');
      return;
    }

    const maxBytes = 35 * 1024 * 1024; // 35 MB
    if (file.size > maxBytes) {
      alert('El archivo supera el límite de 35MB');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    
    // Attempt to calculate real duration
    const tempAudio = new Audio();
    tempAudio.src = objectUrl;
    tempAudio.onloadedmetadata = () => {
      const realDuration = Math.round(tempAudio.duration) || 360;
      setDuration(realDuration);
      setCurrentTime(0);
      if (onAudioUpload) {
        onAudioUpload(file, objectUrl, realDuration);
      }
    };

    tempAudio.onerror = () => {
      // Fallback if metadata fails to load immediately
      setDuration(360);
      setCurrentTime(0);
      if (onAudioUpload) {
        onAudioUpload(file, objectUrl, 360);
      }
    };
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (readOnly) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const currentFormatted = formatSecondsToTime(currentTime);
  const totalFormatted = formatSecondsToTime(duration);
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div 
      className={`cm-card cm-audio-player transition-all ${
        sticky ? 'sticky top-0 z-30 shadow-md backdrop-blur-sm' : ''
      }`}
    >
      {/* Hidden real audio element for native decoding */}
      {playableUrl && (
        <audio
          ref={audioRef}
          src={playableUrl}
          onTimeUpdate={() => {
            if (audioRef.current) {
              setCurrentTime(audioRef.current.currentTime);
              if (onTimeUpdate) {
                onTimeUpdate(audioRef.current.currentTime, formatSecondsToTime(audioRef.current.currentTime));
              }
            }
          }}
          onLoadedMetadata={() => {
            if (audioRef.current && audioRef.current.duration) {
              setDuration(Math.round(audioRef.current.duration));
            }
          }}
          onEnded={() => setIsPlaying(false)}
          onError={() => { setIsPlaying(false); setPlaybackError(audioUrl?.startsWith('blob:') ? 'Esta grabación temporal venció al recargar. Cárgala nuevamente para guardarla en Drive.' : 'El navegador no pudo reproducir este audio.'); }}
        />
      )}

      {/* Main Container */}
        <div className="p-3.5 sm:p-4 space-y-3">
        {playbackError && <p role="alert" className="rounded-md border border-[var(--cm-danger)]/40 bg-[var(--cm-danger)]/10 px-3 py-2 text-xs text-[var(--cm-danger)]">{playbackError}</p>}
        
        {/* Top bar: File status & Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#031E3C]/5 border border-[#031E3C]/10 flex items-center justify-center shrink-0">
              <FileAudio className="w-4 h-4 text-[#031E3C]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-[#031E3C] truncate font-heading">
                  {audioFileName || 'Grabación de Llamada Comercial'}
                </h4>
                <span className="text-[10px] bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                  Audio Activo
                </span>
              </div>
              <p className="text-[11px] text-[#667085] truncate">
                Evidencia acústica verificable · Metodología 3C
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Insert timestamp button */}
            {onInsertTimestamp && (
              <button
                type="button"
                onClick={() => onInsertTimestamp(currentFormatted, Math.floor(currentTime))}
                className="cm-button-secondary flex items-center gap-1 border-[var(--cm-primary)] px-2.5 py-1.5 text-[11px] text-[var(--cm-primary)] active:scale-95"
                title="Inserta la marca de tiempo actual en el criterio de evaluación"
              >
                <Tag className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Marcar Timestamp ({currentFormatted})</span>
                <span className="sm:hidden">{currentFormatted}</span>
              </button>
            )}

            {/* Upload new audio file button */}
            {!readOnly && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="audio/mpeg,audio/mp3,.mp3,.mpeg,.mpg,audio/wav,.wav,audio/m4a,.m4a,audio/ogg,.ogg,audio/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileUpload(e.target.files[0]);
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="cm-button-secondary flex items-center gap-1 px-2.5 py-1.5 text-[11px]"
                  title="Cargar archivo de audio MP3 o MPEG"
                >
                  <Upload className="h-3.5 w-3.5 text-[var(--cm-text-secondary)]" />
                  <span className="hidden md:inline">Cargar / Reemplazar</span>
                </button>
                {onRemoveAudio && audioFileName && (
                  <button
                    type="button"
                    onClick={onRemoveAudio}
                    className="rounded-lg p-1.5 text-[var(--cm-text-muted)] hover:bg-[rgba(255,77,79,.1)] hover:text-[var(--cm-danger)]"
                    title="Quitar audio"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Scrubber Progress Bar & Waveform visualizer */}
        <div className="space-y-1.5">
          <div className="relative group">
            {/* Simulated waveform bars in background */}
            <div className="h-4 flex items-center gap-[2px] px-1 opacity-25 group-hover:opacity-40 transition-opacity">
              {Array.from({ length: 48 }).map((_, i) => {
                const heightPct = Math.max(15, Math.sin(i * 0.4) * 45 + Math.cos(i * 0.8) * 35 + 35);
                const isPassed = (i / 48) * 100 <= progressPercent;
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-full transition-colors ${
                      isPassed ? 'bg-[var(--cm-primary)]' : 'bg-[var(--cm-text-muted)]'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                );
              })}
            </div>

            {/* Range Slider */}
            <input
              type="range"
              min={0}
              max={duration}
              step={0.5}
              value={currentTime}
              onChange={handleSeek}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[var(--cm-border)] accent-[var(--cm-primary)]"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-[#667085]">
            <span className="font-semibold text-[#031E3C]">{currentFormatted}</span>
            <span>{totalFormatted}</span>
          </div>
        </div>

        {/* Control Buttons Bar */}
        <div className="flex items-center justify-between border-t border-[var(--cm-border)] pt-1">
          
          {/* Playback Controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => skipTime(-5)}
              className="rounded-md p-1.5 text-[var(--cm-text-secondary)] hover:bg-[rgba(31,214,255,.09)] hover:text-[var(--cm-text)]"
              title="Retroceder 5 segundos"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--cm-primary-active)] text-[#031326] shadow-xs transition-transform active:scale-95"
              title={isPlaying ? 'Pausar' : 'Reproducir'}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4 fill-[#031326] text-[#031326]" />
              ) : (
                <Play className="ml-0.5 h-4 w-4 fill-[#031326] text-[#031326]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => skipTime(5)}
              className="rounded-md p-1.5 text-[var(--cm-text-secondary)] hover:bg-[rgba(31,214,255,.09)] hover:text-[var(--cm-text)]"
              title="Adelantar 5 segundos"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>

          {/* Speed & Volume */}
          <div className="flex items-center gap-3">
            
            {/* Speed Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="cm-button-secondary px-2 py-1 text-[11px] font-mono"
                title="Velocidad de reproducción"
              >
                {playbackRate}x
              </button>

              {showSpeedMenu && (
                <div className="cm-card absolute bottom-full right-0 z-40 mb-1 flex min-w-[70px] flex-col gap-0.5 rounded-lg p-1">
                  {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => handleSpeedChange(rate)}
                      className={`text-[11px] font-mono py-1 px-2 text-left rounded hover:bg-slate-100 transition-colors cursor-pointer ${
                        playbackRate === rate ? 'bg-[rgba(31,214,255,.12)] font-bold text-[var(--cm-primary)]' : 'text-[var(--cm-text-secondary)]'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Volume Toggle */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMute}
                className="text-[var(--cm-text-muted)] transition-colors hover:text-[var(--cm-text)]"
                title={isMuted ? 'Activar sonido' : 'Silenciar'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-500" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setVolume(val);
                  setIsMuted(val === 0);
                  if (audioRef.current) {
                    audioRef.current.volume = val;
                  }
                }}
                className="h-1 w-16 cursor-pointer appearance-none rounded-lg bg-[var(--cm-border)] accent-[var(--cm-primary)]"
              />
            </div>

          </div>

        </div>

      </div>

      {/* Drag and Drop Zone if empty in non-readonly mode */}
      {!readOnly && !audioFileName && !audioUrl && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`m-3 p-4 border-2 border-dashed rounded-lg text-center cursor-pointer transition-all ${
            isDraggingOver
              ? 'border-[var(--cm-primary)] bg-[rgba(31,214,255,.08)]'
              : 'border-[var(--cm-border)] bg-[rgba(31,214,255,.03)] hover:border-[var(--cm-border-strong)]'
          }`}
        >
          <Upload className="mx-auto mb-1.5 h-5 w-5 text-[var(--cm-text-muted)]" />
          <p className="text-xs font-semibold text-[var(--cm-text)]">
            Arrastra el archivo de llamada aquí o haz clic para seleccionarlo
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--cm-text-secondary)]">
            Formatos compatibles: <strong className="text-[var(--cm-text)]">MP3</strong> (.mp3) o <strong className="text-[var(--cm-text)]">MPEG</strong> (.mpeg, .mpg) · Máx 35MB
          </p>
        </div>
      )}

    </div>
  );
};
