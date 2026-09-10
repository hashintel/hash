import { describe, expect, test } from "vitest";

import { padWavWithSilence, readWavHeader } from "./synthesize-utterance.ts";

const pcmWav = (samples: number, sampleRate = 48_000): Uint8Array => {
  const wav = new Uint8Array(44 + samples * 2);
  const view = new DataView(wav.buffer);
  const tag = (offset: number, text: string) =>
    wav.set(new TextEncoder().encode(text), offset);
  tag(0, "RIFF");
  view.setUint32(4, wav.length - 8, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, samples * 2, true);
  wav.fill(0x67, 44);
  return wav;
};

describe("padWavWithSilence", () => {
  test("preserves nonzero audio and appends exactly three seconds of zero samples", () => {
    const input = pcmWav(480);
    const original = input.slice();
    const padded = padWavWithSilence(input, 3);
    const header = readWavHeader(padded);
    expect(header).toMatchObject({
      sampleRate: 48_000,
      channels: 1,
      bitsPerSample: 16,
      dataBytes: 288_960,
      dataOffset: 44,
    });
    expect(padded.byteLength).toBe(289_004);
    expect(new DataView(padded.buffer).getUint32(4, true)).toBe(288_996);
    expect(padded.subarray(44, 1004)).toEqual(input.subarray(44));
    expect(padded.subarray(1004).every((byte) => byte === 0)).toBe(true);
    expect(input).toEqual(original);
  });

  test("uses the sample rate and respects a typed array's byte offset", () => {
    const input = pcmWav(3, 8_000);
    const backing = new Uint8Array(input.length + 7);
    backing.set(input, 7);
    const padded = padWavWithSilence(backing.subarray(7), 0.5);
    expect(readWavHeader(padded).dataBytes).toBe(8_006);
    expect(padded.subarray(44, 50)).toEqual(input.subarray(44));
  });

  test("walks odd-sized chunks and preserves metadata after the audio", () => {
    const input = pcmWav(3);
    const wav = new Uint8Array(input.length + 20);
    wav.set(input.subarray(0, 36));
    const chunk = new Uint8Array([74, 85, 78, 75, 1, 0, 0, 0, 91, 0]);
    wav.set(chunk, 36);
    wav.set(input.subarray(36), 46);
    wav.set(chunk, input.length + 10);
    new DataView(wav.buffer).setUint32(4, wav.length - 8, true);
    const padded = padWavWithSilence(wav, 1);
    expect(readWavHeader(padded).dataOffset).toBe(54);
    expect(readWavHeader(padded).dataBytes).toBe(96_006);
    expect(padded.subarray(-10)).toEqual(chunk);
    expect(padded.subarray(60, -10).every((byte) => byte === 0)).toBe(true);
  });

  test("rejects non-16-bit input and non-PCM encoding", () => {
    const wav = pcmWav(10);
    const view = new DataView(wav.buffer);
    view.setUint16(34, 8, true);
    expect(() => padWavWithSilence(wav, 1)).toThrow(/16-bit/);
    view.setUint16(34, 16, true);
    view.setUint16(20, 3, true);
    expect(() => padWavWithSilence(wav, 1)).toThrow(/PCM/);
  });

  test("rejects truncated headers, chunk bodies, and misaligned samples", () => {
    expect(() => readWavHeader(new Uint8Array(8))).toThrow(/RIFF/);
    const wav = pcmWav(10);
    expect(() => readWavHeader(wav.subarray(0, -1))).toThrow(/size/);
    new DataView(wav.buffer).setUint32(40, 200, true);
    expect(() => readWavHeader(wav)).toThrow(/chunk/);
    new DataView(wav.buffer).setUint32(40, 19, true);
    expect(() => padWavWithSilence(wav, 1)).toThrow(/align/);
  });

  test.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1 / 7])(
    "rejects a duration that cannot represent whole sample frames: %s",
    (seconds) => {
      expect(() => padWavWithSilence(pcmWav(1), seconds)).toThrow(/seconds/);
    },
  );

  test("zero seconds returns the original bytes without aliasing", () => {
    const wav = pcmWav(2);
    const padded = padWavWithSilence(wav, 0);
    expect(padded).toEqual(wav);
    expect(padded).not.toBe(wav);
  });
});
