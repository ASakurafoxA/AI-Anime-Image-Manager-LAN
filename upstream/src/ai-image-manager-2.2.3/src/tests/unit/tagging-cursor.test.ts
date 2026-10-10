import { describe, expect, it } from "vitest";
import { shouldResetTaggingCursor } from "@/services/ai/tagging-cursor";

/**
 * 自用（需求 1）：打标"断点续跑"的核心判定。
 *
 * 这是对用户报的"建库中途退出后，再建库要从头开始"的回归保护：
 * 只要有游标（上次跑到一半），就绝不归零。
 */
describe("shouldResetTaggingCursor (自用需求 1)", () => {
  it("keeps the cursor when a previous run was interrupted", () => {
    // 跑到一半（5000 张）崩溃/关软件/取消 → FULL_RUN 标记没置位，但游标已在
    expect(
      shouldResetTaggingCursor(
        { resetCursor: true },
        { cursor: 5000, fullRunDone: false }
      )
    ).toBe(false);
  });

  it("keeps the cursor after a completed full run (incremental thereafter)", () => {
    expect(
      shouldResetTaggingCursor(
        { resetCursor: true },
        { cursor: 20_000, fullRunDone: true }
      )
    ).toBe(false);
  });

  it("only allows a reset when nothing has been tagged yet", () => {
    // 全新库：游标为 0 → 归零等于没做事，全库扫一遍就是"首次建库"
    expect(
      shouldResetTaggingCursor(
        { resetCursor: true },
        { cursor: 0, fullRunDone: false }
      )
    ).toBe(true);
  });

  it("never resets when the caller did not ask for it", () => {
    expect(
      shouldResetTaggingCursor(
        { resetCursor: false },
        { cursor: 0, fullRunDone: false }
      )
    ).toBe(false);
    expect(
      shouldResetTaggingCursor({}, { cursor: 5000, fullRunDone: false })
    ).toBe(false);
  });
});
