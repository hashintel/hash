import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface WavHeader {
  readonly bitsPerSample: number;
  readonly channels: number;
  readonly dataBytes: number;
  readonly dataOffset: number;
  readonly sampleRate: number;
}

export const readWavHeader = (wav: Uint8Array): WavHeader => {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (offset: number) =>
    String.fromCharCode(...wav.subarray(offset, offset + 4));
  if (wav.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") {
    throw new Error("Not a RIFF/WAVE file");
  }
  if (view.getUint32(4, true) !== wav.length - 8) {
    throw new Error("RIFF size does not match the file size");
  }
  let format: Omit<WavHeader, "dataBytes" | "dataOffset"> | undefined;
  let header: WavHeader | undefined;
  let offset = 12;
  while (offset < wav.length) {
    if (offset + 8 > wav.length) {
      throw new Error("Truncated chunk header");
    }
    const chunkSize = view.getUint32(offset + 4, true);
    const nextOffset = offset + 8 + chunkSize + (chunkSize % 2);
    if (nextOffset > wav.length) {
      throw new Error("Truncated chunk body");
    }
    if (tag(offset) === "fmt ") {
      if (format || chunkSize < 16) {
        throw new Error("Invalid fmt chunk");
      }
      if (view.getUint16(offset + 8, true) !== 1) {
        throw new Error("Expected PCM encoding");
      }
      const channels = view.getUint16(offset + 10, true);
      const sampleRate = view.getUint32(offset + 12, true);
      const bitsPerSample = view.getUint16(offset + 22, true);
      if (bitsPerSample !== 16) {
        throw new Error(`Expected 16-bit PCM, got ${bitsPerSample}-bit`);
      }
      if (
        channels === 0 ||
        sampleRate === 0 ||
        view.getUint16(offset + 20, true) !== channels * 2 ||
        view.getUint32(offset + 16, true) !== sampleRate * channels * 2
      ) {
        throw new Error("Invalid PCM sample rate or block alignment");
      }
      format = { bitsPerSample, channels, sampleRate };
    } else if (tag(offset) === "data") {
      if (!format || header) {
        throw new Error("Expected one data chunk after fmt chunk");
      }
      if (chunkSize % (format.channels * 2) !== 0) {
        throw new Error("PCM data does not align to sample frames");
      }
      header = { ...format, dataBytes: chunkSize, dataOffset: offset + 8 };
    }
    offset = nextOffset;
  }
  if (!header) {
    throw new Error("No data chunk");
  }
  return header;
};

export const padWavWithSilence = (
  wav: Uint8Array,
  seconds: number,
): Uint8Array => {
  const header = readWavHeader(wav);
  const frames = seconds * header.sampleRate;
  if (!Number.isSafeInteger(frames) || frames < 0) {
    throw new Error(
      "Silence seconds must represent nonnegative whole sample frames",
    );
  }
  const silenceBytes = frames * header.channels * 2;
  if (wav.length + silenceBytes - 8 > 0xffff_ffff) {
    throw new Error("Silence seconds exceed the RIFF size limit");
  }
  const audioEnd = header.dataOffset + header.dataBytes;
  const padded = new Uint8Array(wav.length + silenceBytes);
  padded.set(wav.subarray(0, audioEnd));
  padded.set(wav.subarray(audioEnd), audioEnd + silenceBytes);
  const view = new DataView(padded.buffer);
  view.setUint32(4, padded.byteLength - 8, true);
  view.setUint32(header.dataOffset - 4, header.dataBytes + silenceBytes, true);
  return padded;
};

export const synthesizeUtterance = async (
  text: string,
  outPath: string,
): Promise<void> => {
  const directory = await mkdtemp(join(tmpdir(), "voice-e2e-"));
  try {
    const rawPath = join(directory, "raw.wav");
    await execFileAsync("say", [
      "-o",
      rawPath,
      "--file-format=WAVE",
      "--data-format=LEI16@48000",
      "--channels=1",
      text,
    ]);
    const wav = new Uint8Array(await readFile(rawPath));
    const header = readWavHeader(wav);
    if (header.sampleRate !== 48_000 || header.channels !== 1) {
      throw new Error("Expected say to produce 48 kHz mono PCM");
    }
    await writeFile(outPath, padWavWithSilence(wav, 3));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
