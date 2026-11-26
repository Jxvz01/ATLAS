import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import {
  getVoiceCapabilities,
  startVoiceCapture,
  stopVoiceCapture,
  VoiceCapabilities
} from '../services/voiceService';

interface VoiceMicButtonProps {
  onTranscript: (text: string) => void;
  compact?: boolean;
}

export const VoiceMicButton: React.FC<VoiceMicButtonProps> = ({ onTranscript, compact = false }) => {
  const [caps, setCaps] = useState<VoiceCapabilities | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  useEffect(() => {
    getVoiceCapabilities().then(setCaps);
  }, []);

  const handleToggle = async () => {
    setVoiceError(null);
    if (listening) {
      await stopVoiceCapture();
      setListening(false);
      return;
    }

    setListening(true);
    await startVoiceCapture({
      onResult: (text) => {
        onTranscript(text);
      },
      onError: (msg) => {
        setVoiceError(msg);
      },
      onEnd: () => {
        setListening(false);
      }
    });
  };

  if (caps && !caps.supported) {
    return (
      <span
        title={caps.disclosure}
        className="px-2 py-1.5 rounded-lg bg-[#F3F5F8] border border-[#DCE2E8] text-[10px] text-[#5B6777] font-mono inline-flex items-center gap-1"
      >
        <MicOff className="w-3.5 h-3.5 text-[#94A3B8]" />
        {!compact && <span>Voice N/A</span>}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleToggle}
        title={caps?.disclosure || 'Voice-to-text transcription'}
        className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
          listening
            ? 'bg-[#DC2626] border-[#DC2626] text-white animate-pulse'
            : 'bg-[#0F172A] hover:bg-slate-800 border-[#0F172A] text-white'
        }`}
      >
        {listening ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{compact ? 'Stop' : 'Listening...'}</span>
          </>
        ) : (
          <>
            <Mic className="w-4 h-4 text-[#E85D2A]" />
            {!compact && <span>Speak</span>}
          </>
        )}
      </button>
      {voiceError && (
        <span className="text-[10px] text-[#DC2626] font-medium">{voiceError}</span>
      )}
    </div>
  );
};
