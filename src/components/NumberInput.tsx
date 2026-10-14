import { useState } from "react";

type Props = {
  value: number;
  /** 確定した値（範囲内に丸めたもの）を受け取る */
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** 整数だけを受け付ける */
  integer?: boolean;
  className?: string;
  "aria-label"?: string;
};

/**
 * 数値の入力欄。入力中は自由に打てる（空欄や「1.」のような途中の状態も可）。
 * Enter かフォーカスを外したときに確定し、範囲外は範囲内に丸め、数字でなければ元に戻す。
 * （1文字ごとに保存すると、途中の値が丸められて思った数字を打てないため）
 */
export function NumberInput({
  value,
  onCommit,
  min = -Infinity,
  max = Infinity,
  step,
  integer,
  className,
  ...rest
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
    setDraft(null);
    if (draft.trim() === "" || !Number.isFinite(n)) return; // 元の値に戻す
    const v = Math.min(max, Math.max(min, integer ? Math.round(n) : n));
    if (v !== value) onCommit(v);
  };

  return (
    <input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      className={className}
      aria-label={rest["aria-label"]}
      value={draft ?? String(value)}
      data-step={step}
      onFocus={(e) => {
        setDraft(String(value));
        e.target.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(null);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
