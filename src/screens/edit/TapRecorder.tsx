import { useEffect, useRef, useState } from "react";
import { player } from "../../audio/player";
import { buildClickTrack, secondsPerTick } from "../../audio/schedule";
import { describeTiming, estimateOffset, transcribeTaps, type Tap, type Transcription } from "../../music/tapRhythm";
import { EIGHTH, SIXTEENTH } from "../../music/timeline";
import { newId } from "../../model/factory";
import type { GuitarAction, RhythmEvent, TimeSignature } from "../../model/types";

type Props = {
  /** 今のリズム（録音前の状態。「元に戻す」と、録音する小節数の初期値に使う） */
  current: { events: RhythmEvent[]; lengthTicks: number };
  tempo: number;
  timeSignature: TimeSignature;
  measureTicks: number;
  /** 録音する長さを固定する（譜面で選んだ小節に録音するとき） */
  fixedLengthTicks?: number;
  /** 「元に戻す」を親で行う場合 */
  onUndo?: () => void;
  /** 録音した長さ（小節数×小節長）でパターンを置き換える。gridTicks は採譜に使った細かさ */
  onApply: (events: RhythmEvent[], lengthTicks: number, gridTicks?: number) => void;
};

type Phase = "idle" | "countin" | "recording";
type Mode = "record" | "calibrate";

// タイミング補正（ミリ秒）。端末やイヤホンによる音の遅れなので、曲ではなくこのブラウザに保存する。
const OFFSET_KEY = "guitar-player/tap-offset-ms";
function loadOffset(): number {
  try {
    const v = Number(localStorage.getItem(OFFSET_KEY));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}
function saveOffset(ms: number) {
  try {
    localStorage.setItem(OFFSET_KEY, String(Math.round(ms)));
  } catch {
    // 保存できなくても、この画面の間は使える
  }
}
const CALIBRATION_BARS = 2;

const SPEEDS = [
  [1, "原曲の速さ"],
  [0.8, "80%"],
  [0.6, "60%（ゆっくり）"],
] as const;

/**
 * クリックに合わせてタップしたリズムを採譜する。
 * 1小節のカウントインのあと、指定の小節数だけ続けて録音し、グリッドに寄せて採譜する。
 * パターン編集では録音する小節数を選び、譜面での編集では選んだ小節の長さに固定する。
 */
const BAR_CHOICES = [1, 2, 4, 8];

type Resolution = "auto" | typeof EIGHTH | typeof SIXTEENTH;

export function TapRecorder({ current, tempo, timeSignature, measureTicks, fixedLengthTicks, onUndo, onApply }: Props) {
  // 採譜の細かさ。自動なら叩いたリズムから 8分／16分 を決める
  const [resolution, setResolution] = useState<Resolution>("auto");
  const [phase, setPhase] = useState<Phase>("idle");
  const [speed, setSpeed] = useState<number>(1);
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const [result, setResult] = useState<Transcription | null>(null);
  const [undo, setUndo] = useState<{ events: RhythmEvent[]; lengthTicks: number } | null>(null);
  // 何小節まとめて録音するか（初期値は今のパターンの長さ）
  const [bars, setBars] = useState(() => {
    const n = Math.round(current.lengthTicks / measureTicks);
    return BAR_CHOICES.includes(n) ? n : 1;
  });
  const recordTicks = fixedLengthTicks ?? bars * measureTicks;
  const session = useRef<{ recordStart: number; taps: Tap[]; cancelled: boolean; mode: Mode } | null>(null);
  const [mode, setMode] = useState<Mode>("record");
  const [offsetMs, setOffsetMs] = useState(loadOffset);
  const [calibrationMessage, setCalibrationMessage] = useState<string | null>(null);
  const updateOffset = (ms: number) => {
    const v = Math.max(-400, Math.min(400, Math.round(ms)));
    setOffsetMs(v);
    saveOffset(v);
  };

  const recTempo = Math.round(tempo * speed);
  const spt = secondsPerTick(recTempo);
  const recordSeconds = recordTicks * spt;
  const activeSeconds = mode === "calibrate" ? CALIBRATION_BARS * measureTicks * spt : recordSeconds;
  const barSeconds = measureTicks * spt;
  const [currentBar, setCurrentBar] = useState(1);
  const beatSeconds = (60 / recTempo) * (4 / timeSignature.denominator);

  const tap = (action?: GuitarAction) => {
    const s = session.current;
    if (!s) return;
    // 記録は補正前の時刻で残し、採譜・測定のときに補正する
    const time = player.heardTime() - s.recordStart;
    s.taps.push({ time, action });
    setTapCount(s.taps.length);
    // 手応えは短い電子音（クリックを聞き取りやすいように、ギターの音は鳴らさない）
    player.tapSound();
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
          setProgress(Math.min(1, t / activeSeconds));
          setCurrentBar(Math.min(bars, Math.floor(t / barSeconds) + 1));
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, beatSeconds, activeSeconds, barSeconds, bars]);

  // キーボード：スペース＝自動、↓／↑＝向きを指定
  useEffect(() => {
    if (phase === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === " ") tap();
      else if (e.key === "ArrowDown") tap("downstroke");
      else if (e.key === "ArrowUp") tap("upstroke");
      else return;
      // 同じ window に登録された他の操作（演奏画面のスペース＝再生など）にも渡さない
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  useEffect(() => () => player.stop(), []);

  const start = async (m: Mode) => {
    setResult(null);
    setCalibrationMessage(null);
    setTapCount(0);
    setProgress(0);
    setMode(m);
    const ticks = m === "calibrate" ? CALIBRATION_BARS * measureTicks : recordTicks;
    const track = buildClickTrack(recTempo, timeSignature, timeSignature.numerator, ticks);
    setCurrentBar(1);
    session.current = { recordStart: Infinity, taps: [], cancelled: false, mode: m };
    setCountdown(timeSignature.numerator);
    setPhase("countin");
    const { start: t0 } = await player.play(track, {
      owner: "recording",
      onEnd: () => {
        const s = session.current;
        session.current = null;
        setPhase("idle");
        if (!s || s.cancelled) return;
        if (s.mode === "calibrate") {
          const offset = estimateOffset(
            s.taps.map((t) => t.time),
            beatSeconds,
          );
          if (offset === null) {
            setCalibrationMessage("タップが少なすぎて測れませんでした。クリックに合わせて毎拍タップしてください。");
          } else {
            updateOffset(offset * 1000);
            setCalibrationMessage(`補正を ${Math.round(offset * 1000)}ms にしました。`);
          }
          return;
        }
        const corrected = s.taps.map((t) => ({ ...t, time: t.time - offsetMs / 1000 }));
        const r = transcribeTaps(corrected, { secondsPerTick: spt, lengthTicks: recordTicks, gridTicks: resolution });
        setResult(r);
        setUndo({ events: current.events, lengthTicks: current.lengthTicks });
        onApply(
          r.events.map((e) => ({ id: newId(), ...e })),
          recordTicks,
          r.gridTicks,
        );
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
        「録音」を押すと {timeSignature.numerator} 拍のカウントインのあと、
        {fixedLengthTicks === undefined
          ? "選んだ小節数だけ続けて録音し、パターンをその長さで置き換えます。"
          : `選んだ ${fixedLengthTicks / measureTicks} 小節を続けて録音し、その小節のリズムを置き換えます（タップの音は曲のコードで鳴ります）。`}
        パッドをタップ（またはスペースキー）すると、表拍は ↓・裏拍は ↑ として採譜します。
        細かさが「自動」なら、叩いたリズムに合わせて8分か16分かを決めます。向きを指定したいときは ↓／↑
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
        {fixedLengthTicks === undefined && (
          <label className="field inline-field" style={{ margin: 0 }}>
            <span>録音する長さ</span>
            <select value={bars} onChange={(e) => setBars(Number(e.target.value))} disabled={busy}>
              {BAR_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n}小節
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field inline-field" style={{ margin: 0 }}>
          <span>細かさ</span>
          <select
            value={String(resolution)}
            onChange={(e) => setResolution(e.target.value === "auto" ? "auto" : (Number(e.target.value) as Resolution))}
            disabled={busy}
          >
            <option value="auto">自動（おすすめ）</option>
            <option value={EIGHTH}>8分まで</option>
            <option value={SIXTEENTH}>16分まで</option>
          </select>
        </label>
        <span className="muted small">♩={recTempo}</span>
        {busy ? (
          <button type="button" className="small-btn danger" onClick={cancel}>
            ■ 中止
          </button>
        ) : (
          <button type="button" className="small-btn primary" onClick={() => void start("record")}>
            ● 録音
          </button>
        )}
        {!busy && undo && (
          <button
            type="button"
            className="small-btn"
            onClick={() => {
              if (onUndo) onUndo();
              else onApply(undo.events, undo.lengthTicks);
              setUndo(null);
              setResult(null);
            }}
          >
            元に戻す
          </button>
        )}
      </div>

      <div className="btn-row tap-offset">
        <span className="small">
          タイミング補正 <strong>{offsetMs > 0 ? `+${offsetMs}` : offsetMs}ms</strong>
        </span>
        <button type="button" className="small-btn" onClick={() => void start("calibrate")} disabled={busy}>
          補正を測る
        </button>
        <button
          type="button"
          className="small-btn"
          onClick={() => updateOffset(offsetMs - 10)}
          disabled={busy}
          aria-label="補正を10ms減らす"
        >
          −10
        </button>
        <button
          type="button"
          className="small-btn"
          onClick={() => updateOffset(offsetMs + 10)}
          disabled={busy}
          aria-label="補正を10ms増やす"
        >
          ＋10
        </button>
        <button type="button" className="small-btn" onClick={() => updateOffset(0)} disabled={busy || offsetMs === 0}>
          0に戻す
        </button>
        <span className="muted small">
          ↓↑ が逆になる・音符が1つずれる・8分が入らないときは「補正を測る」で、クリックに合わせて4分音符で{" "}
          {CALIBRATION_BARS}小節タップしてください（Bluetooth
          イヤホンなどで音が遅れる環境の補正。この端末に保存されます）。
        </span>
      </div>

      <div className={`tap-status ${phase}`} role="status" aria-live="polite">
        {phase === "countin" && <span className="tap-count">カウント {countdown}</span>}
        {phase === "recording" && mode === "calibrate" && (
          <span className="tap-count">補正を測定中… クリックに合わせて毎拍タップ（{tapCount}回）</span>
        )}
        {phase === "recording" && mode === "record" && (
          <span className="tap-count">
            録音中 {currentBar}/{bars}小節… タップ {tapCount}回
          </span>
        )}
        {phase === "idle" && result && (
          <span>
            {notesCount}個の音符を{result.gridTicks === EIGHTH ? "8分" : "16分"}の細かさで入力しました。
            {describeTiming(result.deviationsMs)}
            {result.ignored > 0 &&
              `（範囲外・同じマスへの重複タップ ${result.ignored}回は除外${resolution === EIGHTH ? "。細かいリズムなら細かさを「自動」か「16分まで」に" : ""}）`}
          </span>
        )}
        {phase === "idle" && calibrationMessage && <span>{calibrationMessage}</span>}
        {phase === "idle" && !result && !calibrationMessage && <span className="muted">録音を押してください</span>}
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
