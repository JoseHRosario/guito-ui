import { describe, expect, it, vi } from 'vitest';
import { SpeechCapture, type SpeechRecognitionLike } from './speech-capture';

/** Controllable fake recognition: tests emit results / end / errors directly. */
class FakeRecognition implements SpeechRecognitionLike {
  lang = '';
  continuous = false;
  interimResults = false;
  started = false;
  stopped = false;
  aborted = false;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;

  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
  abort(): void {
    this.aborted = true;
  }
  emit(transcripts: string[]): void {
    this.onresult?.({
      results: transcripts.map((t) => [{ transcript: t }]),
    });
  }
  end(): void {
    this.onend?.();
  }
  fail(error: string): void {
    this.onerror?.({ error });
  }
}

function setup(): { capture: SpeechCapture; recognition: FakeRecognition } {
  const recognition = new FakeRecognition();
  const capture = new SpeechCapture(() => recognition);
  return { capture, recognition };
}

describe('SpeechCapture', () => {
  it('configures pt-PT continuous recognition and starts on start()', async () => {
    const { capture, recognition } = setup();
    const pending = capture.start();
    expect(recognition.started).toBe(true);
    expect(recognition.lang).toBe('pt-PT');
    expect(recognition.continuous).toBe(true);
    recognition.emit(['café dois trinta no Coco Verde']);
    recognition.end();
    await expect(pending).resolves.toBe('café dois trinta no Coco Verde');
  });

  it('concatenates multiple final results with spaces, deduplicated', async () => {
    const { capture, recognition } = setup();
    const pending = capture.start();
    recognition.emit(['café 2,30']);
    recognition.emit(['café 2,30', 'no Coco Verde']);
    recognition.end();
    await expect(pending).resolves.toBe('café 2,30 no Coco Verde');
  });

  it('resolves with what was heard when stop() ends the recording early', async () => {
    const { capture, recognition } = setup();
    const pending = capture.start();
    recognition.emit(['café 2,30']);
    capture.stop();
    expect(recognition.stopped).toBe(true);
    recognition.end();
    await expect(pending).resolves.toBe('café 2,30');
  });

  it('resolves with an empty transcript on the silence auto-stop path (no-speech)', async () => {
    const { capture, recognition } = setup();
    const pending = capture.start();
    recognition.fail('no-speech');
    recognition.end();
    await expect(pending).resolves.toBe('');
  });

  it('resolve-empty-abort on cancel() — the caller closes the dial without an error', async () => {
    const { capture, recognition } = setup();
    const pending = capture.start();
    capture.cancel();
    expect(recognition.aborted).toBe(true);
    recognition.end();
    await expect(pending).resolves.toBe('');
  });

  it('rejects on real recognition errors (network, not-allowed)', async () => {
    const { capture, recognition } = setup();
    const pending = capture.start();
    recognition.fail('network');
    await expect(pending).rejects.toThrow('network');
  });

  it('rejects immediately when the browser exposes no SpeechRecognition', async () => {
    const capture = new SpeechCapture(() => null);
    await expect(capture.start()).rejects.toThrow('speech-unsupported');
  });

  it('does not reuse a recognition instance across starts', async () => {
    const created: FakeRecognition[] = [];
    const capture = new SpeechCapture(() => {
      const r = new FakeRecognition();
      created.push(r);
      return r;
    });
    const first = capture.start();
    created[0].emit(['um']);
    created[0].end();
    await first;
    const second = capture.start();
    created[1].emit(['dois']);
    created[1].end();
    await expect(second).resolves.toBe('dois');
  });
});
