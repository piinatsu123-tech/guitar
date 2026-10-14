// Web Audio による再生。スケジュール（schedule.ts）の各イベントを音に変える。
// 同じ VoiceRenderer をリアルタイム再生とオフライン描画（検証用）の両方で使う。
import type { SoundingNote } from "../music/chord";
import type { StringNumber } from "../music/pitch";
import type { AudioEvent, Schedule } from "./schedule";
import { pluckWaveform } from "./synth";

const STRUM_GAP_DOWN = 0.012; // ダウンストロークで隣の弦を鳴らすまでの間隔（秒）
const STRUM_GAP_UP = 0.009;
const RELEASE = 0.015; // 弦を止めるときの減衰の時定数（秒）
const NOTE_SECONDS = 3;

type Voice = { src: AudioBufferSourceNode; gain: GainNode };

/** イベントを AudioNode に変換する。弦ごとに1音だけ鳴る（同じ弦を弾き直すと前の音は止まる）。 */
export class VoiceRenderer {
  private voices = new Map<StringNumber, Voice>();
  private buffers = new Map<number, AudioBuffer>();
  private noise: AudioBuffer | null = null;

  constructor(
    private ctx: BaseAudioContext,
    private dest: AudioNode,
  ) {}

  private buffer(midi: number): AudioBuffer {
    let b = this.buffers.get(midi);
    if (!b) {
      const data = pluckWaveform(midi, this.ctx.sampleRate, NOTE_SECONDS);
      b = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
      b.copyToChannel(data, 0);
      this.buffers.set(midi, b);
    }
    return b;
  }

  private release(voice: Voice, when: number) {
    voice.gain.gain.setTargetAtTime(0, when, RELEASE);
    voice.src.stop(when + RELEASE * 8);
  }

  private stopString(s: StringNumber, when: number) {
    const v = this.voices.get(s);
    if (v) {
      this.release(v, when);
      this.voices.delete(s);
    }
  }

  dampAll(when: number) {
    for (const s of [...this.voices.keys()]) this.stopString(s, when);
  }

  private playString(s: StringNumber, midi: number, when: number, level: number) {
    this.stopString(s, when);
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer(midi);
    const gain = this.ctx.createGain();
    gain.gain.value = level;
    src.connect(gain).connect(this.dest);
    src.start(when);
    this.voices.set(s, { src, gain });
  }

  private muteHit(when: number) {
    if (!this.noise) {
      const len = Math.floor(this.ctx.sampleRate * 0.06);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < len; i++) {
        seed = (seed * 9301 + 49297) % 233280;
        d[i] = (seed / 233280 - 0.5) * 2 * Math.exp(-i / (len / 6));
      }
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.8;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(filter).connect(gain).connect(this.dest);
    src.start(when);
  }

  private click(when: number, accent: boolean) {
    const osc = this.ctx.createOscillator();
    osc.frequency.value = accent ? 1600 : 1000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(accent ? 0.25 : 0.15, when);
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
    osc.connect(gain).connect(this.dest);
    osc.start(when);
    osc.stop(when + 0.05);
  }

  apply(e: AudioEvent, when: number) {
    switch (e.kind) {
      case "strum": {
        const order = e.direction === "down" ? e.notes : [...e.notes].reverse();
        const gap = e.direction === "down" ? STRUM_GAP_DOWN : STRUM_GAP_UP;
        const level = e.direction === "down" ? 0.32 : 0.24;
        order.forEach((n, i) => this.playString(n.stringNumber, n.midi, when + i * gap, level));
        break;
      }
      case "pluck":
        for (const n of e.notes) this.playString(n.stringNumber, n.midi, when, 0.4);
        break;
      case "mute":
        this.dampAll(when);
        this.muteHit(when);
        break;
      case "damp":
        this.dampAll(when);
        break;
      case "click":
        this.click(when, e.accent);
        break;
    }
  }
}

/** スケジュール全体をオフラインで描画する（検証用） */
export async function renderOffline(schedule: Schedule, sampleRate = 22050, tail = 0.5): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, Math.ceil((schedule.duration + tail) * sampleRate), sampleRate);
  const r = new VoiceRenderer(ctx, ctx.destination);
  for (const e of schedule.events) r.apply(e, e.time);
  const out = await ctx.startRendering();
  return out.getChannelData(0);
}

const LOOKAHEAD = 0.3; // 秒
const TIMER_MS = 50;

/**
 * リアルタイム再生。少し先（LOOKAHEAD）までのイベントだけを順次登録するので、
 * 停止すれば以降の音は鳴らない。
 */
export class GuitarPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private timeouts: ReturnType<typeof setTimeout>[] = [];
  private stopFn: (() => void) | null = null;
  private renderer: VoiceRenderer | null = null;

  get playing() {
    return this.stopFn !== null;
  }

  /** ユーザー操作（クリック）の中で呼ぶこと（iOS などの自動再生制限のため） */
  async play(
    schedule: Schedule,
    handlers: { onChord?: (id: string) => void; onEnd?: () => void } = {},
  ): Promise<{ start: number }> {
    this.stop();
    if (!this.ctx) this.ctx = new AudioContext();
    const ctx = this.ctx;
    if (ctx.state !== "running") await ctx.resume();
    const master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    this.master = master;
    const renderer = new VoiceRenderer(ctx, master);
    this.renderer = renderer;
    const start = ctx.currentTime + 0.1;
    let next = 0;
    const pump = () => {
      const horizon = ctx.currentTime + LOOKAHEAD - start;
      while (next < schedule.events.length && schedule.events[next].time <= horizon) {
        const e = schedule.events[next++];
        renderer.apply(e, start + e.time);
      }
    };
    pump();
    this.timer = setInterval(pump, TIMER_MS);
    for (const c of schedule.chordStarts) {
      this.timeouts.push(setTimeout(() => handlers.onChord?.(c.chordId), (start + c.time - ctx.currentTime) * 1000));
    }
    let ended = false;
    const finish = () => {
      if (ended) return;
      ended = true;
      handlers.onEnd?.();
    };
    this.timeouts.push(
      setTimeout(
        () => {
          this.stop();
          finish();
        },
        (start + schedule.duration - ctx.currentTime) * 1000 + 200,
      ),
    );
    this.stopFn = () => {
      renderer.dampAll(ctx.currentTime);
      finish();
    };
    return { start };
  }

  /**
   * いま耳に届いている音の、オーディオ時計上の時刻。
   * 出力には遅延があるので、クリックに合わせたタップの時刻はこの分だけ前にずらして比べる。
   */
  heardTime(): number {
    const ctx = this.ctx;
    if (!ctx) return 0;
    return ctx.currentTime - (ctx.baseLatency || 0) - (ctx.outputLatency || 0);
  }

  /** タップの手応えとして、すぐにストロークを鳴らす */
  strumNow(notes: SoundingNote[], direction: "down" | "up") {
    if (!this.ctx || !this.renderer || notes.length === 0) return;
    const ns = direction === "down" ? notes : notes.slice(-4);
    this.renderer.apply({ kind: "strum", time: 0, direction, notes: ns }, this.ctx.currentTime);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const t of this.timeouts) clearTimeout(t);
    this.timeouts = [];
    const fn = this.stopFn;
    this.stopFn = null;
    fn?.();
    // 登録済みの先の音も含めて、少し後にまとめて切り離す
    const master = this.master;
    if (master && this.ctx) {
      master.gain.setTargetAtTime(0, this.ctx.currentTime, RELEASE);
      setTimeout(() => master.disconnect(), 200);
    }
    this.master = null;
    this.renderer = null;
  }
}

/** 画面間で共有する1つのプレーヤー */
export const player = new GuitarPlayer();
