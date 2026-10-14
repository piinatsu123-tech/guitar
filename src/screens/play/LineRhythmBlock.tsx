import { useEffect, useRef, useState } from "react";
import { player } from "../../audio/player";
import { buildRhythmSchedule } from "../../audio/schedule";
import { StepEditor } from "../../components/StepEditor";
import { EIGHTH, ticksPerMeasure } from "../../music/timeline";
import { addPatternFromRhythm, patternToRhythm, setLineRhythm } from "../../model/songOps";
import { defaultPatterns } from "../../model/factory";
import type { RhythmEvent, Section, SectionRhythm, Song } from "../../model/types";
import { TapRecorder } from "../edit/TapRecorder";

type Props = {
  song: Song;
  section: Section;
  /** セクション内の行番号 */
  line: number;
  /** 歌詞のこの行の小節数（区切り＋1）。リズム譜の小節数の目安 */
  bars: number;
  /** この行だけを鳴らしているとき、今の小節（0始まり、止まったら null）を知らせる */
  onPlayingBar?: (bar: number | null) => void;
  editing: boolean;
  onSongChange: (song: Song) => void;
};

/**
 * 歌詞の行のリズム譜（行の下に置く）。コードとは切り離して、リズムだけを採譜・表示・再生する。
 * 再生は音程のない打撃音で、頭から1回通す（くり返さない）。
 */
export function LineRhythmBlock({ song, section, line, bars, onPlayingBar, editing, onSongChange }: Props) {
  const ts = song.timeSignature;
  const m = ticksPerMeasure(ts);
  const rhythm = section.lineRhythms?.find((r) => r.line === line);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [bar, setBar] = useState<number | null>(null);
  // 親へは小節が変わったときだけ知らせる（関数は毎回作り直されるので依存に入れない）
  const notify = useRef(onPlayingBar);
  notify.current = onPlayingBar;
  useEffect(() => notify.current?.(bar), [bar]);
  const [metronome, setMetronome] = useState(false);
  const [stepTicks, setStepTicks] = useState(EIGHTH);
  const patterns = song.rhythmPatterns.length ? song.rhythmPatterns : defaultPatterns();
  const [patternId, setPatternId] = useState(patterns[0]?.id ?? "");
  const [patternBars, setPatternBars] = useState(bars);
  // 歌詞の小節の区切りを変えたら、入れる小節数もそれに合わせる
  useEffect(() => setPatternBars(bars), [bars]);
  const timer = useRef<number | null>(null);
  // 録音の直前のリズム譜（録音の「元に戻す」で戻す。なかったときは消す）
  const beforeRecording = useRef<SectionRhythm | undefined>(undefined);

  // 編集を終えたら採譜の欄は閉じる（次に編集するときは閉じた状態から）
  useEffect(() => {
    if (!editing) setOpen(false);
  }, [editing]);

  const stopTimer = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    setBar(null);
  };
  useEffect(
    () => () => {
      stopTimer();
      if (player.owner === "rhythm") player.stop();
    },
    [],
  );

  const play = async () => {
    if (playing) {
      player.stop();
      return;
    }
    if (!rhythm) return;
    const schedule = buildRhythmSchedule(rhythm, song.tempo, ts, { metronome });
    const barSec = schedule.duration / Math.max(1, Math.round(rhythm.lengthTicks / m));
    setPlaying(true);
    const started = performance.now();
    setBar(0);
    timer.current = window.setInterval(() => {
      setBar(Math.floor((performance.now() - started) / 1000 / barSec));
    }, 100);
    await player.play(schedule, {
      owner: "rhythm",
      onEnd: () => {
        setPlaying(false);
        stopTimer();
      },
    });
  };

  const save = (events: RhythmEvent[], lengthTicks: number) =>
    onSongChange(setLineRhythm(song, section.id, line, { events, lengthTicks }));

  const label = `${section.name} ${line + 1}行目のリズム`;
  if (!rhythm && !editing) return null;
  // 編集中でまだリズム譜のない行は、小さなボタンだけ（行ごとに大きな枠を出さない）
  if (!rhythm && !open)
    return (
      <div className="line-rhythm-add">
        <button type="button" className="link-btn small" aria-label={`${label}を採譜`} onClick={() => setOpen(true)}>
          ＋ この行のリズム
        </button>
      </div>
    );

  return (
    <div className="section-rhythm" role="region" aria-label={label}>
      <div className="btn-row">
        <span className="section-rhythm-title">リズム</span>
        {rhythm && (
          <>
            <button type="button" className={`small-btn${playing ? " active" : ""}`} onClick={play}>
              {playing ? "■ 停止" : "▶ リズムを聴く"}
            </button>
            <label className="toggle-inline small">
              <input type="checkbox" checked={metronome} onChange={(e) => setMetronome(e.target.checked)} />
              クリック
            </label>
          </>
        )}
        {editing && (
          <button type="button" className="small-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "閉じる" : "✎ リズムを直す"}
          </button>
        )}
      </div>
      {editing && rhythm && Math.round(rhythm.lengthTicks / m) !== bars && (
        <p className="muted small">
          歌詞は{bars}小節、リズム譜は{Math.round(rhythm.lengthTicks / m)}
          小節です（通し再生ではリズム譜の長さで進みます）。
        </p>
      )}
      {editing && open && (
        <div className="section-rhythm-editor">
          <div className="btn-row pattern-fill" role="group" aria-label="パターンから入れる">
            <span className="small">パターンから</span>
            <select aria-label="パターン" value={patternId} onChange={(e) => setPatternId(e.target.value)}>
              {patterns.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              aria-label="入れる小節数"
              value={patternBars}
              onChange={(e) => setPatternBars(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 6, 8].concat(bars > 8 ? [bars] : []).map((n) => (
                <option key={n} value={n}>
                  {n}小節{n === bars ? "（歌詞と同じ）" : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="small-btn primary"
              disabled={!patterns.some((p) => p.id === patternId)}
              onClick={() => {
                const p = patterns.find((x) => x.id === patternId);
                if (!p) return;
                const next = patternToRhythm(p, patternBars, m);
                onSongChange(setLineRhythm(song, section.id, line, next));
              }}
            >
              入れる
            </button>
            {rhythm && (
              <button
                type="button"
                className="small-btn"
                onClick={() => {
                  const name = window.prompt("パターンの名前", `${section.name} ${line + 1}行目`);
                  if (name && name.trim()) {
                    const next = addPatternFromRhythm(song, name.trim(), rhythm);
                    onSongChange(next);
                    setPatternId(next.rhythmPatterns[next.rhythmPatterns.length - 1].id);
                  }
                }}
              >
                この行のリズムをパターンに登録
              </button>
            )}
          </div>
          <TapRecorder
            current={rhythm ?? { events: [], lengthTicks: m * bars }}
            tempo={song.tempo}
            timeSignature={ts}
            measureTicks={m}
            onUndo={() => onSongChange(setLineRhythm(song, section.id, line, beforeRecording.current ?? null))}
            onApply={(events, lengthTicks, gridTicks) => {
              beforeRecording.current = rhythm;
              save(events, lengthTicks);
              if (gridTicks) setStepTicks(gridTicks);
            }}
          />
          {rhythm && (
            <>
              <p className="muted small">マス目で1つずつ直すこともできます。</p>
              <StepEditor
                events={rhythm.events}
                lengthTicks={rhythm.lengthTicks}
                timeSignature={ts}
                stepTicks={stepTicks}
                onStepTicksChange={setStepTicks}
                onChange={(events) => save(events, rhythm.lengthTicks)}
              />
              <div className="btn-row end">
                <button
                  type="button"
                  className="small-btn danger"
                  onClick={() => {
                    if (window.confirm(`この行（${section.name} ${line + 1}行目）のリズム譜を消しますか？`)) {
                      onSongChange(setLineRhythm(song, section.id, line, null));
                      setOpen(false);
                    }
                  }}
                >
                  リズム譜を消す
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
