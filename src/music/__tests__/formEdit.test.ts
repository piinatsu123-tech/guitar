import { describe, expect, it } from "vitest";
import { formShorthand, positionsFromFrets } from "../chord";
import { placementsOf, toggleNoteInForm } from "../formEdit";

const sh = (f: (number | null)[] | null) => (f ? formShorthand(positionsFromFrets(f)) : null);
const MUTED = [null, null, null, null, null, null];

describe("toggleNoteInForm（鍵盤でフォームを編集）", () => {
  it("鳴っている音をタップするとその弦がミュートになる", () => {
    // C: x32010。C4 (60) は2弦1フレット
    expect(sh(toggleNoteInForm([null, 3, 2, 0, 1, 0], 60))).toBe("x320x0");
    // E は 4弦2F (E3=52) と 1弦開放 (E4=64) で別の音高。E4 だけ消える
    expect(sh(toggleNoteInForm([null, 3, 2, 0, 1, 0], 64))).toBe("x3201x");
  });

  it("空いている弦を使って音を加える", () => {
    // x3201x に E4 を足すと1弦開放
    expect(sh(toggleNoteInForm([null, 3, 2, 0, 1, null], 64))).toBe("x32010");
    // 最低音 C3 (48) は 5弦3F（6弦8Fより近い）
    expect(sh(toggleNoteInForm([null, null, 2, 0, 1, 0], 48))).toBe("x32010");
  });

  it("今押さえている位置の近くを選ぶ", () => {
    // x355xx に G4 (67) を足す → 1弦3F（2弦8F は指が届かない）
    expect(sh(toggleNoteInForm([null, 3, 5, 5, null, null], 67))).toBe("x355x3");
    // 7フレット付近の形に A3 (57) → 4弦7F（5弦12F・6弦17Fではない）
    expect(sh(toggleNoteInForm([null, 7, null, 6, 5, null], 57))).toBe("x7765x");
  });

  it("空き弦がなければ他の弦を置き換える／音域外は null", () => {
    const full = [0, 2, 2, 1, 0, 0]; // E
    const next = toggleNoteInForm(full, 59 + 3); // D4 (62)
    expect(next).not.toBeNull();
    expect(next!.filter((f) => f !== null).length).toBe(6);
    expect(toggleNoteInForm(MUTED, 30)).toBeNull();
    expect(toggleNoteInForm(MUTED, 120)).toBeNull();
  });

  it("何も押さえていなければ低いフレット（開放弦）を選ぶ", () => {
    expect(sh(toggleNoteInForm(MUTED, 40))).toBe("0xxxxx");
    expect(sh(toggleNoteInForm(MUTED, 55))).toBe("xxx0xx");
    expect(placementsOf(55).map((p) => p.index)).toEqual([0, 1, 2, 3]);
  });
});
