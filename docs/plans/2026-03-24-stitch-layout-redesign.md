# ReqAgent 整体布局重设计（Stitch 风格融合）

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Stitch 设计系统的核心视觉语言融入 ReqAgent 现有布局，重点改善颜色体系、间距节奏、按钮圆角、表面分层，不涉及消息气泡内部细节。

**Architecture:** 只改 CSS 变量和 module.css 样式，不改组件结构和逻辑。保持现有 `--ra-*` 变量体系，在 `globals.css` 统一覆盖 token，各组件 CSS 只做局部调整。

**Tech Stack:** CSS Modules, CSS custom properties (oklch + hex), Next.js 15

---

## 设计决策摘要

### 来自 Stitch 的核心原则
1. **No-Line Rule** — 侧边栏、面板分隔不用 1px border，改用背景色差
2. **Surface 层级** — bg < surface < surface-container-low < surface-container-lowest
3. **按钮圆角** — 不用胶囊（999px），改用 `10-12px` 中等圆角
4. **字体** — Inter（已是 Geist，保留，风格接近）
5. **色系** — 暖米白底 `#faf9f5`，主色用深蓝灰 `#2a3439`，outline 用 `#a9b4b9`

### 用户偏好
- 按钮圆角：`var(--ra-radius-md)` = 10px（替换当前所有胶囊 `var(--ra-radius-full)`）
- 不做胶囊按钮

---

## Task 1: 更新 globals.css 设计 Token

**Files:**
- Modify: `app/globals.css`

**目标变更：**

```css
/* 颜色体系向 Stitch 暖底靠拢 */
--ra-bg:            oklch(97.8% 0.006 75);   /* #faf9f5 近似，暖米白 */
--ra-surface:       oklch(99.5% 0.002 75);   /* surface-container-lowest #fff */
--ra-surface-sub:   oklch(96.2% 0.008 75);   /* surface-container-low */
--ra-overlay:       oklch(98.5% 0.003 75);

/* 文字：更深的蓝灰（Stitch on-background #2a3439）*/
--ra-text-1:        oklch(20% 0.012 220);
--ra-text-2:        oklch(38% 0.010 220);
--ra-text-3:        oklch(55% 0.008 220);

/* Border：更柔，Stitch outline-variant #a9b4b9 */
--ra-border:        oklch(84% 0.008 220);
--ra-border-soft:   oklch(91% 0.005 220);
--ra-border-strong: oklch(72% 0.012 220);

/* Layout：微调 */
--ra-sidebar-width: 260px;
--ra-sidebar-collapsed-width: 72px;
--ra-topbar-height: 52px;
--ra-panel-width: 320px;
```

**Step 1: 在编辑器中更新 `:root` 块的以上变量**

**Step 2: 运行验证**
```bash
pnpm typecheck
```
Expected: 无错误

---

## Task 2: 按钮圆角去胶囊化

**Files:**
- Modify: `components/ReqAgentShell.module.css`

**变更：** `.ghostBtn` 和 `.chip` 的 `border-radius` 从 `var(--ra-radius-full)` 改为 `var(--ra-radius-md)`（10px）

```css
/* Before */
.ghostBtn {
  border-radius: var(--ra-radius-full);
}
.chip {
  border-radius: var(--ra-radius-full);
}

/* After */
.ghostBtn {
  border-radius: var(--ra-radius-md);
}
.chip {
  border-radius: var(--ra-radius-md);
}
```

同时检查 `ReqAgentPrimitives.module.css` 和 `ReqNavDrawer.module.css` 中是否有胶囊按钮，同步修改。

**Step 1: 全局搜索所有 `border-radius: var(--ra-radius-full)` 用于按钮的地方**
```bash
grep -rn 'radius-full' components/ --include='*.css'
```

**Step 2: 逐一修改为 `var(--ra-radius-md)`，tag input 和 pill badge 除外（可保留 full）**

**Step 3: 验证**
```bash
pnpm typecheck
```

---

## Task 3: 侧边栏 No-Line 分隔

**Files:**
- Modify: `components/ReqAgentShell.module.css`
- Modify: `components/ReqNavDrawer.module.css`

**变更：** 侧边栏右侧不用 `border-right: 1px solid`，改用背景色差 + `box-shadow` 向右投影

```css
/* ReqAgentShell.module.css */
.sidebarColumn {
  width: var(--ra-sidebar-width);
  flex-shrink: 0;
  min-height: 0;
  /* 移除 border-right，改用背景色差 */
  background: var(--ra-surface-sub);   /* 比主内容区稍深 */
  box-shadow: 1px 0 0 var(--ra-border-soft);  /* 极细分隔，非 border */
  transition: width 280ms var(--ra-ease-out);
}
```

**ReqNavDrawer.module.css 的 sidebar 背景同步：**
```css
.sidebar {
  background: var(--ra-surface-sub);
  /* 不要独立 border */
}
```

---

## Task 4: Topbar 磨砂背景优化

**Files:**
- Modify: `components/ReqAgentShell.module.css`

**变更：** Topbar 底部边框改为更柔的分隔，背景色更接近 surface

```css
.threadTopbar {
  /* 移除 border-bottom: 1px solid var(--ra-border-soft) */
  background: color-mix(in oklch, var(--ra-bg) 96%, white 4%);
  backdrop-filter: blur(12px);
  box-shadow: 0 1px 0 var(--ra-border-soft); /* 替代 border-bottom */
}
```

---

## Task 5: Landing 页背景梯度调整

**Files:**
- Modify: `components/ReqAgentShell.module.css`

**变更：** `.shell::before` 背景梯度更暖、更柔

```css
.shell::before {
  background:
    radial-gradient(ellipse at 20% 10%, color-mix(in oklch, var(--ra-surface-sub) 70%, transparent) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 90%, color-mix(in oklch, var(--ra-surface) 60%, transparent) 0%, transparent 45%);
}
```

---

## Task 6: 产物面板 No-Line 风格

**Files:**
- Modify: `components/ReqAgentShell.module.css`

**变更：** `.artifactsPanel` 左侧分隔改用 box-shadow

```css
.artifactsPanel {
  background: var(--ra-surface-sub);
  /* border-left → box-shadow */
  box-shadow: -1px 0 0 var(--ra-border-soft);
  border-left: none;
}

.artifactsPanelVisible {
  /* 不需要 border-left-color */
}
```

---

## Task 7: 全局验证

```bash
pnpm typecheck && pnpm build 2>&1 | tail -20
```

Expected: typecheck 通过，build 只有预存 ESLint