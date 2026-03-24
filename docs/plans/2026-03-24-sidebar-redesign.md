# ReqAgent Sidebar 重设计（Stitch 风格）

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完全按照 Stitch Workspace 侧边栏设计语言，重写 ReqNavDrawer，包含展开态（260px）和收缩态（72px）。

**Architecture:** 只改 CSS（`ReqNavDrawer.module.css`）和一处 globals.css token，不改 TSX 结构（现有 Props 和 DOM 不动）。

**Tech Stack:** CSS Modules, CSS custom properties

---

## Stitch 设计参考（已分析）

Stitch 侧边栏核心语言：
- 背景：`bg-slate-100` = `#f1f5f9`，比主区 `#f7f9fb` 明显更深（~4% lightness）
- Logo 区：8px rounded icon box + 品牌大字 + 10px uppercase subtitle
- 导航项：`px-3 py-2.5 rounded-lg`，active 态 `bg-slate-200`，hover 同背景
- 整体：`py-8 gap-y-4`，宽松呼吸感
- 字体：Inter，font-black 标题，medium 导航项
- 收缩态：只显示 icon，宽度 ~56px

## 用户要求
- 圆角，不要胶囊
- 展开/收缩两态都要设计好
- 对齐 Stitch 视觉质感

---

## Task 1: 更新 globals.css sidebar 背景 token

**Files:**
- Modify: `app/globals.css`

当前 `--ra-surface-sub: oklch(93.5% 0.012 75)` 已更新，但需确认 sidebarColumn 用的是这个变量。

**Step 1: 确认当前值**
```bash
grep 'surface-sub' /Users/dylanthomas/Desktop/projects/reqagent/app/globals.css
```
Expected: `oklch(93.5% 0.012 75)`

**Step 2: 若不对，更新**
```css
--ra-surface-sub: oklch(93.5% 0.012 75);
```

**Step 3: typecheck**
```bash
pnpm typecheck 2>&1
```

---

## Task 2: 完整重写 ReqNavDrawer.module.css

**Files:**
- Modify: `components/ReqNavDrawer.module.css`

**完整 CSS（直接替换整个文件）：**

```css
/* ===================================================
   ReqNavDrawer — Stitch-inspired sidebar
   Expanded: 260px | Collapsed: 72px
   =================================================== */

.sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 28px 0 20px;
  background: transparent;
  overflow: hidden;
}

.sidebarCollapsed {
  align-items: center;
}

/* ── Logo Section ───────────────────────────────── */

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 0 20px;
  margin-bottom: 24px;
  gap: 8px;
}

.brandRow {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
  flex: 1;
}

.brandMark {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--ra-text-1);
  color: white;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.03em;
  flex-shrink: 0;
}

.brandCopy {
  min-width: 0;
  flex: 1;
}

.brandName {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: var(--ra-text-1);
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.brandMeta {
  margin: 2px 0 0;
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ra-text-3);
}

.toggle {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ra-text-3);
  cursor: pointer;
  transition: background var(--ra-dur-base) var(--ra-ease-out),
    color var(--ra-dur-base) var(--ra-ease-out);
}

.toggle:hover {
  background: color-mix(in oklch, var(--ra-text-1) 9%, transparent);
  color: var(--ra-text-1);
}

.toggleGlyph {
  font-size: 13px;
  line-height: 1;
  display: block;
}

/* ── New Chat Button ────────────────────────────── */

.primaryActions {
  padding: 0 12px;
  margin-bottom: 20px;
}

.primaryButton {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 14px;
  height: 38px;
  border: 0;
  border-radius: var(--ra-radius-md);
  background: var(--ra-text-1);
  color: white;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: opacity var(--ra-dur-base) var(--ra-ease-out);
}

.primaryButton:hover {
  opacity: