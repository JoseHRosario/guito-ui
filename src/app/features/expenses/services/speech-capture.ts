/**
 * Web Speech API capture (issue #44): mic → pt-PT transcript, transcript-only
 * (the API consumes text, never audio). Recording stops automatically on
 * silence (the browser fires `onend`); `stop()` ends it early. Cancellation
 * resolves with '' — the caller closes the dial without surfacing an error.
 * Supported: Chrome/Edge desktop and Chrome Android (PWA). Firefox/Safari lack
 * SpeechRecognition — `speechSupported()` gates the Voice pill (visible but
 * disabled, per the approved frame).
 */

/** Minimal structural slice of the DOM SpeechRecognition the flow needs. */
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

export interface SpeechResultEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

export type SpeechRecognitionFactory = () => SpeechRecognitionLike | null;

function defaultFactory(): SpeechRecognitionLike | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

/** True when the current browser exposes the Web Speech API. */
export function speechSupported(): boolean {
  return typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
}

export class SpeechCapture {
  private readonly createRecognition: SpeechRecognitionFactory;
  private active: SpeechRecognitionLike | null = null;
  /** '' = keep listening; final results accumulate with exact-text dedupe. */
  private transcript = '';
  private readonly seen = new Set<string>();
  private cancelled = false;

  constructor(createRecognition: SpeechRecognitionFactory = defaultFactory) {
    this.createRecognition = createRecognition;
  }

  /**
   * Starts listening and resolves with the full final transcript when the
   * recording ends (silence auto-stop or `stop()`). Rejects on a recognition
   * error other than silence/no-speech (which resolve to '').
   */
  start(lang = 'pt-PT'): Promise<string> {
    const recognition = this.createRecognition();
    if (!recognition) return Promise.reject(new Error('speech-unsupported'));
    this.active = recognition;
    this.transcript = '';
    this.seen.clear();
    this.cancelled = false;
    return new Promise<string>((resolve, reject) => {
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        for (let i = 0; i < event.results.length; i++) {
          const alternative = event.results[i][0];
          const text = alternative?.transcript?.trim();
          // Dedupe by exact text: the engine re-delivers every final result on
          // each event, but a NEW utterance repeating a word ("café" again)
          // must not be dropped — only exact re-delivery is.
          if (text && !this.seen.has(text)) {
            this.seen.add(text);
            this.transcript += (this.transcript ? ' ' : '') + text;
          }
        }
      };
      recognition.onerror = (event) => {
        // Silence (and its friends) is the normal auto-stop path, not a failure.
        if (['no-speech', 'aborted'].includes(event.error ?? '')) return;
        reject(new Error(event.error ?? 'speech-error'));
      };
      recognition.onend = () => {
        this.active = null;
        if (this.cancelled) resolve('');
        else resolve(this.transcript);
      };
      try {
        recognition.start();
      } catch {
        reject(new Error('speech-start-failed'));
      }
    });
  }

  /** Ends the recording early — the pending `start()` resolves with what was heard. */
  stop(): void {
    this.active?.stop();
  }

  /** Cancels: discards the transcript, the pending `start()` resolves with ''. */
  cancel(): void {
    this.cancelled = true;
    this.active?.abort();
  }
}
