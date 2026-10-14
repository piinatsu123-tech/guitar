import { useEffect, useRef, useState } from "react";
import { player } from "../../audio/player";
import { buildRhythmSchedule } from "../../audio/schedule";
import { RhythmStaff } from "../../components/RhythmStaff";
import { StepEditor } from "../../components/StepEditor";
import { EIGHTH, ticksPerMeasure } from "../../music/timeline";
import { setLineRhythm } from "../../model/songOps";
import type { RhythmEvent, Section, SectionRhythm, Song } from "../../model/types";
import { TapRecorder } from "../edit/TapRecorder";

type Props = {
  song: Song;
  section: Section;
  /** セクション内の行番号 */
  line: number;
  editing: boolean;
  onSongChange: (song: Song) => void;
};

/**
 * 歌詞の行のリズム譜（行の下に置く）。コードとは切り離して、リズムだけを採譜・表示・再生する。
 * 再生は音程のない打撃音で、頭から1回通す（くり返さない）。
 */
export function LineRhythmBlock({ song, section, line, editing, onSongChange }: Props) {
  const ts = song.timeSignature;
  const m = ticksPerMeasure(ts);
  const rhythm = section.lineRhythms?.find((r) => r.line === line);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [bar, setBar] = useState<number | null>(null);
  const [metronome, setMetronome] = useState(false);
  const [stepTicks, setStepTicks] = useState(EIGHTH);
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
      {rhythm && <RhythmStaff rhythm={rhythm} timeSignature={ts} playingBar={bar} />}
      {editing && open && (
        <div className="section-rhythm-editor">
          <TapRecorder
            current={rhythm ?? { events: [], lengthTicks: m * 2 }}
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
