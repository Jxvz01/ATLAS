/**
 * ATLAS Field Voice-to-Text Service
 * Uses @capacitor-community/speech-recognition on native Android
 * and falls back to Web Speech API (SpeechRecognition / webkitSpeechRecognition) in browsers.
 * Honestly discloses offline speech recognition availability rather than faking guarantees.
 */
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition as CapSpeechRecognition } from '@capacitor-community/speech-recognition';

export interface VoiceCapabilities {
  supported: boolean;
  engine: 'capacitor-android' | 'web-speech-api' | 'unavailable';
  offlineGuaranteed: boolean;
  disclosure: string;
}

export async function getVoiceCapabilities(): Promise<VoiceCapabilities> {
  if (Capacitor.isNativePlatform()) {
    try {
      const avail = await CapSpeechRecognition.available();
      return {
        supported: Boolean(avail?.available),
        engine: avail?.available ? 'capacitor-android' : 'unavailable',
        offlineGuaranteed: false,
        disclosure: avail?.available
          ? 'Uses Android device SpeechRecognizer (works offline only if English offline pack is installed on device; otherwise uses network).'
          : 'Android SpeechRecognition service unavailable on this device. Use manual text entry.',
      };
    } catch {
      return {
        supported: false,
        engine: 'unavailable',
        offlineGuaranteed: false,
        disclosure: 'Android SpeechRecognition plugin unavailable. Use manual text entry.',
      };
    }
  }

  const w = window as any;
  const webSupported = Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  return {
    supported: webSupported,
    engine: webSupported ? 'web-speech-api' : 'unavailable',
    offlineGuaranteed: false,
    disclosure: webSupported
      ? 'Browser Web Speech API active (typically requires internet connectivity; edit transcription before sending).'
      : 'Speech recognition is not supported in this browser. Use manual text entry.',
  };
}

let activeWebRecognition: any = null;

export async function startVoiceCapture(callbacks: {
  onResult: (transcript: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const perm = await CapSpeechRecognition.checkPermissions();
      if (perm.speechRecognition !== 'granted') {
        const req = await CapSpeechRecognition.requestPermissions();
        if (req.speechRecognition !== 'granted') {
          callbacks.onError('Microphone / speech recognition permission denied.');
          callbacks.onEnd();
          return;
        }
      }

      const result = await CapSpeechRecognition.start({
        language: 'en-IN',
        maxResults: 1,
        prompt: 'Speak field message...',
        partialResults: false,
        popup: true,
      });

      if (result?.matches && result.matches.length > 0) {
        callbacks.onResult(result.matches[0]);
      } else {
        callbacks.onError('No speech detected. Try again or type manually.');
      }
      callbacks.onEnd();
      return;
    } catch (err: any) {
      callbacks.onError(err?.message || 'Android speech recognition failed.');
      callbacks.onEnd();
      return;
    }
  }

  const w = window as any;
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!SR) {
    callbacks.onError('Speech recognition is unavailable in this environment.');
    callbacks.onEnd();
    return;
  }

  try {
    const recognition = new SR();
    activeWebRecognition = recognition;
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event?.results?.[0]?.[0]?.transcript || '';
      if (transcript) callbacks.onResult(transcript);
    };
    recognition.onerror = (event: any) => {
      callbacks.onError(`Speech recognition error: ${event?.error || 'unknown'}`);
    };
    recognition.onend = () => {
      activeWebRecognition = null;
      callbacks.onEnd();
    };
    recognition.start();
  } catch (err: any) {
    callbacks.onError(err?.message || 'Failed to start microphone capture.');
    callbacks.onEnd();
  }
}

export async function stopVoiceCapture(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await CapSpeechRecognition.stop();
    } catch {}
  } else if (activeWebRecognition) {
    try {
      activeWebRecognition.stop();
    } catch {}
    activeWebRecognition = null;
  }
}
