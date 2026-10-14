import { useState } from "react";
import { newId } from "../model/factory";
import type { GuitarAction, RhythmEvent, TimeSignature } from "../model/types";
import {
  EIGHTH,
  eventsToSteps,
  SIXTEENTH,
  stepsToEvents,
  subdivisionLabel,
  ticksPerBeat,
  ticksPerMeasure,
  type Step,
} from "../music/timeline";
import { ACTION_LABEL, ACTION_SYMBOL } from "./RhythmTimeline";

const ACTIONS: GuitarAction[] = ["downstroke", "upstroke", "pluck", "mute", "none"];

type Props = {
  events: RhythmEvent[];
  lengthTicks: number;
  timeSignature: TimeSignature;
  stepTicks: number;
  onStepTicksChange: (t: number) => void;
  onChange: (events: RhythmEvent[]) => void;
  /** 小節番号の表示を何番から始めるか（譜面で編集するとき） */
  firstMeasureNumber?: number;
};

/** マス目（8分／16分）でリズムを編集する。1小節ごとに折り返す。 */
export function StepEditor({
  events,
  lengthTicks,
  timeSignature: ts,
  stepTicks,
  onStepTicksChange,
  onChange,
  firstMeasureNumber = 1,
}: Props) {
  const beat = ticksPerBeat(ts);
  const m = ticksPerMeasure(ts);
  const aligned16 = events.every((e) => e.startTick % SIXTEENTH === 0 && e.durationTicks % SIXTEENTH === 0);
  const aligned8 = events.every((e) => e.startTick % EIGHTH === 0 && e.durationTicks % EIGHTH === 0);
  const [cursor, setCursor] = useState(0);
  const steps = eventsToSteps(events, lengthTicks, stepTicks);

  const setSteps = (next: Step[]) => onChange(stepsToEvents(next, stepTicks, newId, events));
  const setStep = (i: number, patch: Partial<Step>) => {
    const next = steps.map((s, j) => (j === i ? { ...s, ...patch } : s));
    if (next[i].state !== "note") next[i].action = "none";
    else if (patch.state === "note" && steps[i].state !== "note") next[i].action = "downstroke";
    setSteps(next);
  };
  const cur = steps[Math.min(cursor, steps.length - 1)];

  return (
    <div className="step-editor">
      <div className="btn-row">
        <span className="small">マス目</span>
        <div className="segmented small" role="radiogroup" aria-label="グリッド">
          <button
            type="button"
            role="radio"
            aria-checked={stepTicks === EIGHTH}
            className={stepTicks === EIGHTH ? "on" : ""}
            disabled={!aligned8}
            onClick={() => onStepTicksChange(EIGHTH)}
            title={aligned8 ? "" : "16分音符の位置にイベントがあるため選べません"}
          >
            8分
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={stepTicks === SIXTEENTH}
            className={stepTicks === SIXTEENTH ? "on" : ""}
            disabled={!aligned16}
            onClick={() => onStepTicksChange(SIXTEENTH)}
          >
            16分
          </button>
        </div>
        <span className="muted small">
          マスを選んで「音符・休符・伸ばす」と「弾き方」を設定します。音符でも「弾かない（—）」にすると、新しく弾かずに音を伸ばします（タイ）。
        </span>
      </div>

      <div
        className="step-grid"
        role="grid"
        aria-label="リズムのステップ"
        // 1小節ごとに折り返す
        style={{ gridTemplateColumns: `repeat(${Math.min(steps.length, m / stepTicks)}, minmax(26px, 1fr))` }}
      >
        {steps.map((s, i) => {
          const tick = (i * stepTicks) % m;
          const label = subdivisionLabel(tick, ts);
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              className={`step ${s.state}${i === cursor ? " cursor" : ""}${tick % beat === 0 ? " beat" : ""}${tick === 0 ? " bar" : ""}`}
              onClick={() => setCursor(i)}
              aria-selected={i === cursor}
              aria-label={`${label || "·"} ${s.state === "note" ? "音符" : s.state === "rest" ? "休符" : "伸ばす"} ${s.state === "note" ? ACTION_LABEL[s.action] : ""}`}
            >
              {tick === 0 && (lengthTicks > m || firstMeasureNumber !== 1) && (
                <span className="step-bar" aria-hidden>
                  {(i * stepTicks) / m + firstMeasureNumber}
                </span>
              )}
              <span className="step-state">{s.state === "note" ? "♪" : s.state === "rest" ? "休" : "～"}</span>
              <span className="step-action">{s.state === "note" ? ACTION_SYMBOL[s.action] : ""}</span>
              <span className="step-label">{label || "·"}</span>
            </button>
          );
        })}
      </div>

      {cur && (
        <div className="step-tools">
          <div className="btn-row">
            <span className="small">種類:</span>
            <button
              type="button"
              className={`chip${cur.state === "note" ? " on" : ""}`}
              onClick={() => setStep(cursor, { state: "note" })}
            >
              ♪ 音符
            </button>
            <button
              type="button"
              className={`chip${cur.state === "rest" ? " on" : ""}`}
              onClick={() => setStep(cursor, { state: "rest" })}
            >
              休符
            </button>
            <button
              type="button"
              className={`chip${cur.state === "hold" ? " on" : ""}`}
              onClick={() => setStep(cursor, { state: "hold" })}
              disabled={cursor === 0}
              title={cursor === 0 ? "先頭は伸ばせません（音符＋「弾かない」でタイを表せます）" : ""}
            >
              ～ 伸ばす
            </button>
          </div>
          <div className="btn-row">
            <span className="small">弾き方:</span>
            {ACTIONS.map((a) => (
              <button
                key={a}
                type="button"
                className={`chip${cur.state === "note" && cur.action === a ? " on" : ""}`}
                disabled={cur.state !== "note"}
                onClick={() => setStep(cursor, { action: a })}
                title={ACTION_LABEL[a]}
              >
                {ACTION_SYMBOL[a]} {ACTION_LABEL[a].replace(/（.*）/, "")}
              </button>
            ))}
          </div>
          <div className="btn-row">
            <button type="button" className="small-btn" onClick={() => setCursor((c) => Math.max(0, c - 1))}>
              ◀ 前のマス
            </button>
            <button
              type="button"
              className="small-btn"
              onClick={() => setCursor((c) => Math.min(steps.length - 1, c + 1))}
            >
              次のマス ▶
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
