/**
 * 自用（需求 1）：打标游标"要不要归零"的判定。
 *
 * 背景（一个真实的 bug）：
 *   原来两个 tagger 里的条件是 `options.resetCursor && !isFullRunDone()`，
 *   注释写的是"只在第一次全库重扫时归零，之后中途关掉应用再点一次会从上次的游标继续"。
 *   但 `FULL_RUN_KEY` 只在**完整跑完**时才置位 —— 于是"跑到一半崩溃 / 关软件 / 取消"
 *   之后再点按钮，`isFullRunDone()` 仍是 false，游标被归零，
 *   已经打好的几千张会被**从头重打一遍**。这就是用户报的"建库中途退出后再建库要从头开始"。
 *
 * 现在的规则：
 *   · 有游标（> 0）→ **绝不**归零，从游标继续（断点续跑）。
 *   · 游标本来就是 0 → 归零等于没做事（首次建库走这里，等于全库扫一遍）。
 *   · 想**强制**全库重扫（例如换了模型要把旧标签全部重打）→ 用
 *     `resetPixaiTaggingProgress()` / `resetWd14TaggingProgress()` 显式清掉游标与完成标记，
 *     这是唯一会"从头开始"的入口，必须是用户明确要求的操作。
 */
export function shouldResetTaggingCursor(
  options: { resetCursor?: boolean },
  state: { cursor: number; fullRunDone: boolean }
): boolean {
  if (!options.resetCursor) {
    return false;
  }
  if (state.fullRunDone) {
    return false;
  }
  // 只有"确实一张都还没打"时才允许归零。
  return state.cursor <= 0;
}
