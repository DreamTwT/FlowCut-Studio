import { MotionPresetId, SfxPresetId } from '@shared/schema';
import { isStandaloneBrowserMode } from '../api';

const audioCache = new Map<string, HTMLAudioElement>();
let webAudioCtx: AudioContext | null = null;

/**
 * Computes CSS transform matching `buildClipMotionFilterSuffix` in `server/renderEngine.ts`
 * with pixel-accurate scale & pan/tilt bounds.
 */
export function computeClipMotionCssTransform(
  motion: MotionPresetId | undefined,
  progress01: number,
  elapsedSec: number
): string {
  if (!motion || motion === 'none') return 'none';
  const p = Math.min(1, Math.max(0, Number.isFinite(progress01) ? progress01 : 0));
  const t = Math.max(0, Number.isFinite(elapsedSec) ? elapsedSec : 0);

  switch (motion) {
    case 'zoom_in':
      return `scale(${(1 + 0.16 * p).toFixed(4)})`;
    case 'zoom_out':
      return `scale(${(1.16 - 0.16 * p).toFixed(4)})`;
    case 'hook_punch': {
      const duration = p > 0 ? t / p : 0.35;
      const tailProgress = Math.min(1, Math.max(0, (t - 0.35) / Math.max(0.2, duration - 0.35)));
      const s = t < 0.35 ? 1.24 - 0.2 * (t / 0.35) : 1.04 + 0.06 * tailProgress;
      return `scale(${s.toFixed(4)})`;
    }
    case 'pan_right':
      return `scale(1.16) translate3d(${((0.5 - p) * 13.79).toFixed(3)}%, 0, 0)`;
    case 'pan_left':
      return `scale(1.16) translate3d(${((p - 0.5) * 13.79).toFixed(3)}%, 0, 0)`;
    case 'tilt_up':
      return `scale(1.16) translate3d(0, ${((p - 0.5) * 13.79).toFixed(3)}%, 0)`;
    default:
      return 'none';
  }
}

function playFallbackWebAudioSfx(sfxId: Exclude<SfxPresetId, 'none'>, volume: number) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!webAudioCtx) webAudioCtx = new Ctx();
    if (webAudioCtx.state === 'suspended') {
      void webAudioCtx.resume();
    }
    const now = webAudioCtx.currentTime;
    const osc = webAudioCtx.createOscillator();
    const gain = webAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(webAudioCtx.destination);

    const vol = Math.min(1, Math.max(0, volume)) * 0.35;
    if (sfxId === 'ding_shine' || sfxId === 'cash_register') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(sfxId === 'cash_register' ? 1318 : 1568, now);
      osc.frequency.exponentialRampToValueAtTime(2637, now + 0.12);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.46);
    } else if (sfxId === 'pop_bubble') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(960, now + 0.11);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (sfxId === 'impact_boom') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(125, now);
      osc.frequency.exponentialRampToValueAtTime(34, now + 0.45);
      gain.gain.setValueAtTime(vol * 1.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.52);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.18);
      gain.gain.setValueAtTime(vol * 0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch {
    // ignore audio autoplay restriction
  }
}

/**
 * Plays a built-in viral ad SFX cue immediately (used by both Inspector `试听` button
 * and real-time `PlayerMonitor` timeline playback).
 */
export function playBuiltinSfxPreview(sfxId: SfxPresetId | undefined, volume = 0.7, playbackRate = 1) {
  if (!sfxId || sfxId === 'none' || !Number.isFinite(volume) || volume <= 0) return;
  const clampedVol = Math.min(1, volume);

  if (isStandaloneBrowserMode) {
    playFallbackWebAudioSfx(sfxId, clampedVol);
    return;
  }

  const url = `/storage/sfx/${sfxId}.wav`;
  try {
    let base = audioCache.get(sfxId);
    if (!base) {
      base = new Audio(url);
      base.preload = 'auto';
      audioCache.set(sfxId, base);
    }
    const node = base.cloneNode(true) as HTMLAudioElement;
    node.volume = clampedVol;
    node.playbackRate = Number.isFinite(playbackRate) ? Math.max(0.5, Math.min(2, playbackRate)) : 1;
    node.play().catch(() => {
      playFallbackWebAudioSfx(sfxId, clampedVol);
    });
  } catch {
    playFallbackWebAudioSfx(sfxId, clampedVol);
  }
}
