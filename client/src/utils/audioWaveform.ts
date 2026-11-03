import { BREATH_PRESETS, BreathRemovalOptions } from '@shared/schema';

export interface WaveformData {
  peaks: number[]; // [0..1] normalized peak bars
  rmsDbs: number[]; // dBFS per bar for visualizing breath/silence threshold!
  duration: number;
}

let sharedAudioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!sharedAudioCtx) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    sharedAudioCtx = new Ctx();
  }
  return sharedAudioCtx!;
}

export async function decodeWaveformFromUrl(
  url: string,
  barCount = 180
): Promise<WaveformData> {
  const res = await fetch(url);
  const arrBuf = await res.arrayBuffer();
  const ctx = getAudioCtx();
  const audioBuf = await ctx.decodeAudioData(arrBuf.slice(0));
  const chan = audioBuf.getChannelData(0);
  const total = chan.length;
  const block = Math.max(1, Math.floor(total / barCount));

  const peaks: number[] = [];
  const rmsDbs: number[] = [];
  let maxPeak = 0.01;

  for (let b = 0; b < barCount; b++) {
    const s0 = b * block;
    const s1 = Math.min(total, s0 + block);
    let pk = 0;
    let sumSq = 0;
    for (let i = s0; i < s1; i++) {
      const v = Math.abs(chan[i]);
      if (v > pk) pk = v;
      sumSq += chan[i] * chan[i];
    }
    if (pk > maxPeak) maxPeak = pk;
    peaks.push(pk);
    const rms = Math.sqrt(sumSq / Math.max(1, s1 - s0));
    rmsDbs.push(20 * Math.log10(Math.max(rms, 1e-7)));
  }

  const normalizedPeaks = peaks.map((p) => Math.max(0.04, p / maxPeak));
  return {
    peaks: normalizedPeaks,
    rmsDbs,
    duration: audioBuf.duration,
  };
}

function encodeMonoFloat32ToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Pure Web Audio API fallback for standalone `.html` mode:
 * Trims, applies fade-in/out, and removes breaths/pauses right inside the browser!
 */
export async function processAudioInBrowser(
  url: string,
  opts: {
    trimStart?: number;
    trimEnd?: number;
    fadeInSec?: number;
    fadeOutSec?: number;
    removeBreath?: boolean;
    breathOptions?: Partial<BreathRemovalOptions>;
  }
): Promise<{
  blobUrl: string;
  sizeBytes: number;
  originalDuration: number;
  newDuration: number;
  savedSec: number;
  cutCount: number;
}> {
  const res = await fetch(url);
  const arrBuf = await res.arrayBuffer();
  const ctx = getAudioCtx();
  const audioBuf = await ctx.decodeAudioData(arrBuf.slice(0));
  const sr = audioBuf.sampleRate;
  const rawChan = audioBuf.getChannelData(0);

  const t0 = Math.max(0, opts.trimStart ?? 0);
  const t1 = Math.min(audioBuf.duration, opts.trimEnd ?? audioBuf.duration);
  const idx0 = Math.floor(t0 * sr);
  const idx1 = Math.max(idx0 + 1, Math.floor(t1 * sr));
  let samples: Float32Array = new Float32Array(rawChan.slice(idx0, idx1));
  const originalDuration = Math.round((samples.length / sr) * 100) / 100;

  let cutCount = 0;

  if (opts.removeBreath) {
    const thresholdDb = opts.breathOptions?.thresholdDb ?? BREATH_PRESETS.standard.thresholdDb;
    const minPauseSec = opts.breathOptions?.minPauseSec ?? BREATH_PRESETS.standard.minPauseSec;
    const keepGapSec = opts.breathOptions?.keepGapSec ?? BREATH_PRESETS.standard.keepGapSec;

    const frameSize = Math.max(1, Math.round(sr * 0.01));
    const numFrames = Math.ceil(samples.length / frameSize);
    const active = new Uint8Array(numFrames);

    for (let f = 0; f < numFrames; f++) {
      const s0 = f * frameSize;
      const s1 = Math.min(samples.length, s0 + frameSize);
      let sumSq = 0;
      for (let i = s0; i < s1; i++) sumSq += samples[i] * samples[i];
      const rms = Math.sqrt(sumSq / Math.max(1, s1 - s0));
      const db = 20 * Math.log10(Math.max(rms, 1e-7));
      active[f] = db >= thresholdDb ? 1 : 0;
    }

    const minPauseFrames = Math.max(5, Math.round(minPauseSec * 100));
    let f = 0;
    while (f < numFrames) {
      if (active[f] === 0) {
        let endZero = f;
        while (endZero < numFrames && active[endZero] === 0) endZero++;
        if (f > 0 && endZero < numFrames && endZero - f < minPauseFrames) {
          for (let k = f; k < endZero; k++) active[k] = 1;
        }
        f = endZero;
      } else {
        f++;
      }
    }

    const rawIslands: Array<[number, number]> = [];
    f = 0;
    while (f < numFrames) {
      if (active[f] === 1) {
        let endOne = f;
        while (endOne < numFrames && active[endOne] === 1) endOne++;
        if (endOne - f >= 3) rawIslands.push([f, endOne]);
        f = endOne;
      } else {
        f++;
      }
    }

    if (rawIslands.length > 0) {
      const merged: Array<[number, number]> = [];
      for (const [s, e] of rawIslands) {
        const ps = Math.max(0, s - 4);
        const pe = Math.min(numFrames, e + 6);
        if (merged.length > 0 && ps <= merged[merged.length - 1][1]) {
          merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], pe);
        } else {
          merged.push([ps, pe]);
        }
      }

      const gapSamples = Math.round(keepGapSec * sr);
      const fadeSamples = Math.round(0.01 * sr);
      let totalOut = 0;
      merged.forEach(([sf, ef], idx) => {
        totalOut += Math.max(0, Math.min(samples.length, ef * frameSize) - sf * frameSize);
        if (idx < merged.length - 1) totalOut += gapSamples;
      });

      const out = new Float32Array(totalOut);
      let wp = 0;
      merged.forEach(([sf, ef], idx) => {
        const s0 = sf * frameSize;
        const s1 = Math.min(samples.length, ef * frameSize);
        const len = Math.max(0, s1 - s0);
        for (let i = 0; i < len; i++) {
          let g = 1;
          if (i < fadeSamples) g = 0.5 * (1 - Math.cos((Math.PI * i) / fadeSamples));
          else if (i >= len - fadeSamples) {
            g = 0.5 * (1 - Math.cos((Math.PI * Math.max(0, len - 1 - i)) / fadeSamples));
          }
          out[wp + i] = samples[s0 + i] * g;
        }
        wp += len;
        if (idx < merged.length - 1) wp += gapSamples;
      });

      cutCount = Math.max(0, merged.length - 1);
      if (merged[0][0] > minPauseFrames) cutCount++;
      samples = out;
    }
  }

  // Apply fadeIn / fadeOut
  const fadeInS = Math.round(Math.max(0, opts.fadeInSec || 0) * sr);
  const fadeOutS = Math.round(Math.max(0, opts.fadeOutSec || 0) * sr);
  for (let i = 0; i < Math.min(samples.length, fadeInS); i++) {
    samples[i] *= i / fadeInS;
  }
  for (let i = 0; i < Math.min(samples.length, fadeOutS); i++) {
    samples[samples.length - 1 - i] *= i / fadeOutS;
  }

  const wavBlob = encodeMonoFloat32ToWavBlob(samples, sr);
  const newDuration = Math.round((samples.length / sr) * 100) / 100;
  return {
    blobUrl: URL.createObjectURL(wavBlob),
    sizeBytes: wavBlob.size,
    originalDuration,
    newDuration,
    savedSec: Math.max(0, Math.round((originalDuration - newDuration) * 100) / 100),
    cutCount,
  };
}

/**
 * Generates realistic rhythmic speech-envelope cadence audio in standalone `.html` preview mode
 * when no local Node backend is attached.
 */
export function createSimulatedSpeechWavInBrowser(text: string, ratePct = 0): {
  blobUrl: string;
  duration: number;
  sizeBytes: number;
} {
  const sr = 24000;
  const speed = Math.max(0.65, 1 + ratePct / 100);
  const clauses = text
    .split(/[，。！？；,.!?\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: number[] = [];
  clauses.forEach((clause, cIdx) => {
    const charCount = Math.max(2, clause.length);
    const clauseSec = (charCount * 0.21) / speed;
    const clauseSamples = Math.round(clauseSec * sr);
    for (let i = 0; i < clauseSamples; i++) {
      const t = i / sr;
      // Syllable envelope (~4.5 syllables/sec)
      const sylEnv = 0.45 + 0.55 * Math.abs(Math.sin(Math.PI * 4.6 * speed * t));
      const f0 = 185 + 28 * Math.sin(2 * Math.PI * 1.4 * t);
      const val =
        (0.5 * Math.sin(2 * Math.PI * f0 * t) +
          0.25 * Math.sin(2 * Math.PI * f0 * 2 * t) +
          0.12 * Math.sin(2 * Math.PI * f0 * 3 * t)) *
        sylEnv *
        0.35;
      chunks.push(val);
    }
    // Natural breath pause between clauses (0.38s) so breath-removal demo works in standalone HTML too!
    if (cIdx < clauses.length - 1) {
      const pauseSamples = Math.round(0.38 * sr);
      for (let p = 0; p < pauseSamples; p++) chunks.push(0);
    }
  });

  const floatArr = new Float32Array(chunks);
  const blob = encodeMonoFloat32ToWavBlob(floatArr, sr);
  return {
    blobUrl: URL.createObjectURL(blob),
    duration: Math.round((floatArr.length / sr) * 100) / 100,
    sizeBytes: blob.size,
  };
}
