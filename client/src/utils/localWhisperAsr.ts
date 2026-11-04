import {
  buildSyncedSubtitlesFromScript,
  LocalWhisperModelId,
  SpeechSegmentPayload,
  SubtitleCue,
} from '@shared/schema';

function base64ToFloat32Array(b64: string): Float32Array {
  const binStr = window.atob(b64);
  const len = binStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer);
}

const WORKER_CODE = `
let cachedModelId = null;
let cachedPipe = null;

self.onmessage = async (event) => {
  const { type, origin, modelId, segments } = event.data;
  if (type !== 'run') return;

  try {
    self.postMessage({ type: 'progress', text: '正在加载本地 WASM 语音推理引擎...', pct: 8 });
    const tf = await import(origin + '/storage/models/wasm-runtime/transformers.min.js');
    tf.env.allowLocalModels = false;
    tf.env.useBrowserCache = false;
    tf.env.remoteHost = origin + '/api/asr/hf-model/';
    tf.env.remotePathTemplate = '{model}/resolve/{revision}/';
    if (tf.env.backends && tf.env.backends.onnx && tf.env.backends.onnx.wasm) {
      tf.env.backends.onnx.wasm.wasmPaths = origin + '/storage/models/wasm-runtime/';
      tf.env.backends.onnx.wasm.numThreads = 1;
    }

    if (!cachedPipe || cachedModelId !== modelId) {
      cachedPipe = await tf.pipeline('automatic-speech-recognition', modelId, {
        quantized: true,
        progress_callback: (info) => {
          if (info && info.status === 'progress' && typeof info.progress === 'number') {
            const fname = String(info.file || '').split('/').pop() || '模型权重';
            const p = Math.min(55, Math.max(10, Math.round(10 + info.progress * 0.45)));
            self.postMessage({
              type: 'progress',
              text: '首次缓存离线模型 (' + fname + ') ' + Math.round(info.progress) + '%',
              pct: p,
            });
          }
        },
      });
      cachedModelId = modelId;
    }

    const texts = [];
    for (let i = 0; i < segments.length; i++) {
      const pct = Math.round(58 + ((i + 0.5) / Math.max(1, segments.length)) * 38);
      self.postMessage({
        type: 'progress',
        text: '正在离线识别第 ' + (i + 1) + ' / ' + segments.length + ' 段开口人声...',
        pct,
      });

      const out = await cachedPipe(segments[i].pcm, {
        language: 'chinese',
        task: 'transcribe',
      });
      texts.push((out && out.text) ? String(out.text) : '');
    }

    self.postMessage({ type: 'done', texts });
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: (err && err.message) ? err.message : String(err),
    });
  }
};
`;

let sharedWorker: Worker | null = null;

function getOrCreateWhisperWorker(): Worker {
  if (sharedWorker) return sharedWorker;
  const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  sharedWorker = new Worker(url, { type: 'module' });
  return sharedWorker;
}

export async function runLocalWhisperInWorker(
  segments: SpeechSegmentPayload[],
  modelId: LocalWhisperModelId,
  onProgress?: (text: string, pct: number) => void
): Promise<SubtitleCue[]> {
  const worker = getOrCreateWhisperWorker();
  const origin = window.location.origin;

  const decodedSegments = segments.map((s) => ({
    index: s.index,
    startSec: s.startSec,
    endSec: s.endSec,
    pcm: base64ToFloat32Array(s.pcmFloat32Base64),
  }));

  const rawTexts = await new Promise<string[]>((resolve, reject) => {
    const handleMessage = (ev: MessageEvent) => {
      const msg = ev.data;
      if (!msg) return;
      if (msg.type === 'progress') {
        onProgress?.(msg.text, msg.pct);
      } else if (msg.type === 'done') {
        cleanup();
        resolve(msg.texts || []);
      } else if (msg.type === 'error') {
        cleanup();
        reject(new Error(msg.message || '本地离线语音模型识别失败'));
      }
    };

    const handleError = (err: ErrorEvent) => {
      cleanup();
      reject(new Error(err.message || '离线语音 Worker 运行异常'));
    };

    const cleanup = () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);

    worker.postMessage({
      type: 'run',
      origin,
      modelId,
      segments: decodedSegments,
    });
  });

  const allCues: SubtitleCue[] = [];
  for (let i = 0; i < segments.length; i++) {
    const cleanTxt = (rawTexts[i] || '')
      .replace(/<\|[^|>]+\|>/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .trim();
    if (!cleanTxt) continue;
    const seg = segments[i];
    const subCues = buildSyncedSubtitlesFromScript(
      cleanTxt,
      Math.max(0.3, seg.endSec - seg.startSec),
      seg.startSec
    );
    allCues.push(...subCues);
  }

  onProgress?.('识别完成！已生成对齐动态字幕', 100);
  return allCues;
}
