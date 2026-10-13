import type { DisplaySettings, NoteLabelMode } from "../model/types";

type Props = {
  settings: DisplaySettings;
  onChange: (s: DisplaySettings) => void;
  compact?: boolean;
  /** 表示のオン・オフだけを出す（音名表記の切替を省く） */
  togglesOnly?: boolean;
};

const MODES: { value: NoteLabelMode; label: string }[] = [
  { value: "solfege", label: "ドレミ" },
  { value: "abc", label: "ABC" },
  { value: "hidden", label: "非表示" },
];

function Segmented({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: NoteLabelMode;
  onChange: (v: NoteLabelMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={name}>
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          role="radio"
          aria-checked={value === m.value}
          className={value === m.value ? "on" : ""}
          onClick={() => onChange(m.value)}
          disabled={disabled}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={`toggle${checked ? " on" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className="toggle-mark">
        {checked ? "✓" : ""}
      </span>
      {label}
    </label>
  );
}

/** 表示設定。変更は即座に反映・保存される。 */
export function SettingsPanel({ settings, onChange, compact, togglesOnly }: Props) {
  const set = <K extends keyof DisplaySettings>(k: K, v: DisplaySettings[K]) => onChange({ ...settings, [k]: v });
  return (
    <div className={`settings-panel${compact ? " compact" : ""}`}>
      <div className="settings-toggles">
        <Toggle label="TAB（コード図）" checked={settings.showTab} onChange={(v) => set("showTab", v)} />
        <Toggle label="ピアノ鍵盤" checked={settings.showPiano} onChange={(v) => set("showPiano", v)} />
        <Toggle label="歌詞" checked={settings.showLyrics} onChange={(v) => set("showLyrics", v)} />
        <Toggle label="リズム（音符）" checked={settings.showRhythm} onChange={(v) => set("showRhythm", v)} />
        <Toggle label="ピッキング（↓↑）" checked={settings.showStrokes} onChange={(v) => set("showStrokes", v)} />
      </div>
      {!togglesOnly && (
        <div className="settings-modes">
          <div className="settings-mode">
            <span>TAB譜の音名</span>
            <Segmented name="TAB譜の音名" value={settings.tabLabelMode} onChange={(v) => set("tabLabelMode", v)} />
          </div>
          <div className="settings-mode">
            <span>鍵盤の音名</span>
            <Segmented
              name="ピアノ鍵盤の音名"
              value={settings.pianoLabelMode}
              onChange={(v) => set("pianoLabelMode", v)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
