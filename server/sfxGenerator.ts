import fs from 'fs';
import path from 'path';
import { SFX_PRESETS, SfxPresetId } from '../shared/schema.js';
import { SFX_DIR } from './paths.js';

const SR = 44100;

function writeStereoWav16(filePath: string, left: Float32Array, right: Float32Array): void {
  const n = Math.min(left.length, right.length);
  const dataBytes = n * 4; // 2 channels * 2 bytes
  const buf = Buffer.allocUnsafe(44 + dataBytes);

  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(2, 22); // Stereo
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < n; i++) {
    const cl = Math.max(-1, Math.min(1, left[i]));
    const cr = Math.max(-1, Math.min(1, right[i]));
    buf.writeInt16LE(cl < 0 ? Math.round(cl * 32768) : Math.round(cl * 32767), 44 + i * 4);
    buf.writeInt16LE(cr < 0 ? Math.round(cr * 32768) : Math.round(cr * 32767), 44 + i * 4 + 2);
  }
  fs.writeFileSync(filePath, buf);
}

// Deterministic PRNG so synthesized WAVs are 100% consistent
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function synthesizePresetSamples(
  id: Exclude<SfxPresetId, 'none'>
): { left: Float32Array; right: Float32Array } {
  const dur = SFX_PRESETS[id].durationSec;
  const n = Math.floor(SR * dur);
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const rand = mulberry32(id.length * 9973);

  if (id === 'whoosh_hook') {
    // Swept bandpass aerodynamic whoosh + subtle stereo pan left -> right + warm body sweep
    let lpL = 0;
    let lpR = 0;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const u = i / n;
      // Bell-shaped fast-peaking aerodynamic envelope peaking at u=0.38
      const env = Math.sin(Math.PI * Math.pow(u, 0.72)) * Math.exp(-1.4 * Math.max(0, u - 0.4));
      const fc = 260 + 2600 * Math.sin(Math.PI * Math.pow(u, 0.8));
      const alpha = Math.min(0.85, (2 * Math.PI * fc) / SR);
      const wnL = rand() * 2 - 1;
      const wnR = rand() * 2 - 1;
      lpL += alpha * (wnL - lpL);
      lpR += alpha * (wnR - lpR);

      const subFreq = 95 + 165 * Math.sin(Math.PI * u);
      phase += (2 * Math.PI * subFreq) / SR;
      const subBody = Math.sin(phase) * 0.34;

      const panR = 0.25 + 0.55 * u;
      const panL = 1 - panR * 0.55;
      left[i] = (lpL * 0.75 + subBody) * env * panL * 0.92;
      right[i] = (lpR * 0.75 + subBody) * env * (0.45 + panR * 0.55) * 0.92;
    }
  } else if (id === 'impact_boom') {
    // Cinema sub-bass pitch drop (115Hz -> 34Hz) + crisp transient punch click
    let phase = 0;
    let phase2 = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const freq = 34 + 92 * Math.exp(-t * 14);
      phase += (2 * Math.PI * freq) / SR;
      phase2 += (2 * Math.PI * freq * 2.02) / SR;

      const subEnv = Math.min(1, t / 0.006) * Math.exp(-t * 4.6);
      const clickEnv = Math.exp(-t * 85);
      const noiseClick = (rand() * 2 - 1) * clickEnv * 0.42;

      const body = Math.tanh((Math.sin(phase) * 1.35 + Math.sin(phase2) * 0.32) * subEnv);
      left[i] = (body * 0.85 + noiseClick) * 0.92;
      right[i] = (body * 0.85 + noiseClick * 0.9) * 0.92;
    }
  } else if (id === 'pop_bubble') {
    // Classic crisp variety-show upward pitch pop (340Hz -> 1080Hz)
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const u = i / n;
      const freq = 340 + 760 * Math.pow(u, 1.35);
      phase += (2 * Math.PI * freq) / SR;
      const env = Math.sin(Math.PI * Math.min(1, u * 1.05)) * Math.exp(-t * 9.5);
      const sig = (Math.sin(phase) + 0.24 * Math.sin(phase * 2)) * env * 0.88;
      left[i] = sig;
      right[i] = sig;
    }
  } else if (id === 'ding_shine') {
    // Shimmering triad bell (G6 1568Hz + D7 2349Hz + G7 3136Hz + subtle stereo chorus)
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const attack = Math.min(1, t / 0.004);
      const e1 = attack * Math.exp(-t * 4.8);
      const e2 = attack * Math.exp(-t * 6.8);
      const e3 = attack * Math.exp(-t * 9.5);

      const sL =
        Math.sin(2 * Math.PI * 1567.98 * t) * 0.52 * e1 +
        Math.sin(2 * Math.PI * 2349.32 * t) * 0.3 * e2 +
        Math.sin(2 * Math.PI * 3135.96 * t) * 0.22 * e3;
      const sR =
        Math.sin(2 * Math.PI * 1570.2 * t) * 0.52 * e1 +
        Math.sin(2 * Math.PI * 2352.0 * t) * 0.3 * e2 +
        Math.sin(2 * Math.PI * 3139.0 * t) * 0.22 * e3;
      left[i] = sL * 0.88;
      right[i] = sR * 0.88;
    }
  } else if (id === 'cash_register') {
    // Classic two-hit coin chime: B5 (987.77Hz) at t=0 -> E6 (1318.51Hz) + E7 (2637Hz) at t=0.075s!
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let valL = 0;
      let valR = 0;
      // First coin strike (t >= 0)
      const eA = Math.min(1, t / 0.003) * Math.exp(-t * 14);
      valL += (Math.sin(2 * Math.PI * 987.77 * t) * 0.55 + Math.sin(2 * Math.PI * 1975.5 * t) * 0.25) * eA;
      valR += (Math.sin(2 * Math.PI * 989.0 * t) * 0.55 + Math.sin(2 * Math.PI * 1977.0 * t) * 0.25) * eA;

      // Second bright coin ring (t >= 0.075s)
      if (t >= 0.075) {
        const t2 = t - 0.075;
        const eB = Math.min(1, t2 / 0.003) * Math.exp(-t2 * 5.6);
        valL +=
          (Math.sin(2 * Math.PI * 1318.51 * t2) * 0.58 +
            Math.sin(2 * Math.PI * 2637.02 * t2) * 0.32 +
            Math.sin(2 * Math.PI * 3951.07 * t2) * 0.14) *
          eB;
        valR +=
          (Math.sin(2 * Math.PI * 1320.2 * t2) * 0.58 +
            Math.sin(2 * Math.PI * 2639.5 * t2) * 0.32 +
            Math.sin(2 * Math.PI * 3954.0 * t2) * 0.14) *
          eB;
      }
      left[i] = Math.max(-0.95, Math.min(0.95, valL * 0.85));
      right[i] = Math.max(-0.95, Math.min(0.95, valR * 0.85));
    }
  } else {
    // camera_shutter: Mechanical mirror slap (t=0) + crisp second curtain click (t=0.068s)
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const slap1 =
        t < 0.065
          ? (rand() * 2 - 1) * Math.exp(-t * 65) * 0.75 +
            Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 95) * 0.45
          : 0;
      const slap2 =
        t >= 0.068
          ? (rand() * 2 - 1) * Math.exp(-(t - 0.068) * 78) * 0.82 +
            Math.sin(2 * Math.PI * 240 * (t - 0.068)) * Math.exp(-(t - 0.068) * 110) * 0.4
          : 0;
      const s = Math.max(-0.95, Math.min(0.95, slap1 + slap2));
      left[i] = s;
      right[i] = s;
    }
  }

  return { left, right };
}

export function getSfxFilePath(id: Exclude<SfxPresetId, 'none'>): string {
  return path.join(SFX_DIR, `${id}.wav`);
}

export function ensureBuiltinSfxReady(): void {
  if (!fs.existsSync(SFX_DIR)) {
    fs.mkdirSync(SFX_DIR, { recursive: true });
  }
  const ids = Object.keys(SFX_PRESETS) as Array<Exclude<SfxPresetId, 'none'>>;
  for (const id of ids) {
    const fp = getSfxFilePath(id);
    if (!fs.existsSync(fp) || fs.statSync(fp).size < 200) {
      const { left, right } = synthesizePresetSamples(id);
      writeStereoWav16(fp, left, right);
    }
  }
}
