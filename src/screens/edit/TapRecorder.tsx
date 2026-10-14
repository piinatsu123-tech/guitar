import { useEffect, useRef, useState } from "react";
import { player } from "../../audio/player";
import { buildClickTrack, secondsPerTick } from "../../audio/schedule";
import type { SoundingNote } from "../../music/chord";
import { autoDirection, describeTiming, transcribeTaps, type Tap, type Transcription } from "../../music/tapRhythm";
import { EIGHTH } from "../../music/timeline";
import { newId } from "../../model/factory";
import type { GuitarAction, RhythmEvent, RhythmPattern, TimeSignature } from "../../model/types";

type Props = {
  pattern: RhythmPattern;
  tempo: number;
  timeSignature: TimeSignature;
  gridTicks: number;
  /** タップしたときに鳴らすコードの音 */
  notes: SoundingNote[];
  onApply: (events: RhythmEvent[]) => void;
};

type Phase = "idle" | "countin" | "recording";

const SPEEDS = [
  [1, "原曲の速さ"],
  [0.8, "80%"],
  [0.6, "60%（ゆっくり）"],
] as const;

/**
 * クリックに合わせてタップしたリズムを採譜する。
 * 1小節のカウントインのあと、パターンの長さだけ録音し、グリッドに寄せてパターンに反映する。
 */
export function TapRecorder({ pattern, tempo, timeSignature, gridTicks, notes, onApply }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [speed, setSpeed] = useState<number>(1);
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [result, setResult] = useState<Transcription | null>(null);
  const [undo, setUndo] = useState<RhythmEvent[] | null>(null);
  const session = useRef<{ recordStart: number; taps: Tap[]; cancelled: boolean } | null>(null);

  const recTempo = Math.round(tempo * speed);
  const spt = secondsPerTick(recTempo);
  const recordSeconds = pattern.lengthTicks * spt;
  const beatSeconds = (60 / recTempo) * (4 / timeSignature.denominator);

  const tap = (action?: GuitarAction) => {
    const s = session.current;
    if (!s) return;
    const time = player.heardTime() - s.recordStart;
    s.taps.push({ time, action });
    setTapCount(s.taps.length);
    const tick = Math.round(time / spt / gridTicks) * gridTicks;
    const dir = action ?? autoDirection(tick, gridTicks);
    player.strumNow(notes, dir === "upstroke" ? "up" : "down");
  };

  // 録音中の表示（カウントダウンと進行バー）
  useEffect(() => {
    if (phase === "idle") return;
    let raf = 0;
    const loop = () => {
      const s = session.current;
      if (s) {
        const t = player.heardTime() - s.recordStart;
        if (t < 0) {
          setCountdown(Math.ceil(-t / beatSeconds - 1e-6));
        } else {
          if (phase === "countin") setPhase("recording");
          setProgress(Math.min(1, t / recordSeconds));
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, beatSeconds, recordSeconds]);

  // キーボード：スペース＝自動、↓／↑＝向きを指定
  useEffect(() => {
    if (phase === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === " ") tap();
      else if (e.key === "ArrowDown") tap("downstroke");
      else if (e.key === "ArrowUp") tap("upstroke");
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  useEffect(() => () => player.stop(), []);

  const start = async () => {
    setResult(null);
    setTapCount(0);
    setProgress(0);
    const track = buildClickTrack(recTempo, timeSignature, timeSignature.numerator, pattern.lengthTicks);
    session.current = { recordStart: Infinity, taps: [], cancelled: false };
    setCountdown(timeSignature.numerator);
    setPhase("countin");
    const { start: t0 } = await player.play(track, {
      onEnd: () => {
        const s = session.current;
        session.current = null;
        setPhase("idle");
        if (!s || s.cancelled) return;
        const r = transcribeTaps(s.taps, { secondsPerTick: spt, lengthTicks: pattern.lengthTicks, gridTicks });
        setResult(r);
        setUndo(pattern.events);
        onApply(r.events.map((e) => ({ id: newId(), ...e })));
      },
    });
    if (session.current) session.current.recordStart = t0 + track.recordOffset;
  };

  const cancel = () => {
    if (session.current) session.current.cancelled = true;
    player.stop();
  };

  const busy = phase !== "idle";
  const notesCount = result?.events.filter((e) => e.kind === "note").length ?? 0;

  return (
    <div className="tap-recorder" aria-label="タップで入力">
      <h3 className="block-title">タップで入力（クリックに合わせてタップ）</h3>
      <p className="muted small">
        「録音」を押すと {timeSignature.numerator} 拍のカウントインのあと、パターンの長さだけ録音します。
        パッドをタップ（またはスペースキー）すると、表拍は ↓・裏拍は ↑ として、
        {gridTicks === EIGHTH ? "8分" : "16分"}音符の位置に合わせて採譜します。向きを指定したいときは ↓／↑
        のパッド（または矢印キー）を使います。
      </p>
      <div className="btn-row">
        <label className="field inline-field" style={{ margin: 0 }}>
          <span>録音の速さ</span>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} disabled={busy}>
            {SPEEDS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span className="muted small">♩={recTempo}</span>
        {busy ? (
          <button type="button" className="small-btn danger" onClick={cancel}>
            ■ 中止
          </button>
        ) : (
          <button type="button" className="small-btn primary" onClick={() => void start()}>
            ● 録音
          </button>
        )}
        {!busy && undo && (
          <button
            type="button"
            className="small-btn"
            onClick={() => {
              onApply(undo);
              setUndo(null);
              setResult(null);
            }}
          >
            元に戻す
          </button>
        )}
      </div>

      <div className={`tap-status ${phase}`} role="status" aria-live="polite">
        {phase === "countin" && <span className="tap-count">カウント {countdown}</span>}
        {phase === "recording" && <span className="tap-count">録音中… タップ {tapCount}回</span>}
        {phase === "idle" && result && (
          <span>
            {notesCount}個の音符を入力しました。{describeTiming(result.deviationsMs)}
            {result.ignored > 0 && `（範囲外・重複のタップ ${result.ignored}回は除外）`}
          </span>
        )}
        {phase === "idle" && !result && <span className="muted">録音を押してください</span>}
      </div>
      <div className="tap-progress" aria-hidden>
        <span style={{ width: `${(phase === "recording" ? progress : phase === "idle" && result ? 1 : 0) * 100}%` }} />
      </div>

      <div className="tap-pads">
        <button
          type="button"
          className="tap-pad down"
          disabled={!busy}
          onPointerDown={(e) => {
            e.preventDefault();
            tap("downstroke");
          }}
        >
          ↓
        </button>
        <button
          type="button"
          className="tap-pad main"
          disabled={!busy}
          onPointerDown={(e) => {
            e.preventDefault();
            tap();
          }}
        >
          タップ
        </button>
        <button
          type="button"
          className="tap-pad up"
          disabled={!busy}
          onPointerDown={(e) => {
            e.preventDefault();
            tap("upstroke");
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
