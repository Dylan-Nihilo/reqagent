# Plan: Skill Gallery UI — 加载态展示 + 选择器

> 给 GPT 执行的 UI 实现 plan
> 前置条件：后端 skill loader 已完成（`lib/skills/types.ts`、`lib/skills/loader.ts`、route 集成）
> 设计系统：monochrome, `--reqagent-*` CSS variables, CSS Modules

## 目标

1. **Skill 加载指示器**：在对话流中展示当前加载了哪些 skill（类似 Claude Code 显示 "loaded xxx skill" 的效果）
2. **Skill 选择器**：在设置面板或对话起始页让用户选择激活哪些 skill

---

## 1. Skill 加载指示器

### 数据来源

后端在每条消息的 streaming metadata 中会携带 `loadedSkills`：

```ts
// 前端通过 useMessage() 拿到的 metadata.custom.debug.loadedSkills
type LoadedSkillMeta = {
  id: string;     // e.g. "req-prd-generic"
  name: string;   // e.g. "通用 PRD 模板"
  type: "knowledge" | "capability" | "hybrid";
};
```

### 组件：`ReqSkillLoadedChips`

**位置**：assistant 消息顶部，在第一条工具调用或文本之前显示。

**交互**：
- 首次出现时有淡入动画
- 不可点击，纯展示
- 如果没有加载 skill，不渲染

**渲染逻辑**：

```tsx
// components/ReqSkillLoadedChips.tsx
import styles from './ReqSkillLoadedChips.module.css';

type LoadedSkillMeta = {
  id: string;
  name: string;
  type: "knowledge" | "capability" | "hybrid";
};

export function ReqSkillLoadedChips({ skills }: { skills: LoadedSkillMeta[] }) {
  if (skills.length === 0) return null;

  return (
    <div className={styles.root}>
      <span className={styles.label}>已加载</span>
      <div className={styles.chips}>
        {skills.map((skill) => (
          <span key={skill.id} className={styles.chip}>
            <span className={styles.dot} data-type={skill.type} />
            {skill.name}
          </span>
        ))}
      </div>
    </div>
  );
}
```

**样式**：`ReqSkillLoadedChips.module.css`

```css
.root {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 11px;
  color: var(--reqagent-muted);
}

.label {
  flex-shrink: 0;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  font-size: 10px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--reqagent-border, #e5e5e5);
  font-size: 11px;
  color: var(--reqagent-fg, #222);
  background: var(--reqagent-bg, #fff);
  animation: chipIn 0.2s ease-out;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--reqagent-muted);
}

.dot[data-type="knowledge"] {
  background: #666;
}

.dot[data-type="capability"] {
  background: #333;
}

@keyframes chipIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### 集成位置

在 `components/ReqAgentUI.tsx` 的 `AssistantMessage` 组件中，在 parts 渲染之前：

```tsx
// 在 AssistantMessage 组件内
const loadedSkills = metadata?.custom?.debug?.loadedSkills ?? [];

return (
  <div className={styles.assistantMessage}>
    {loadedSkills.length > 0 && (
      <ReqSkillLoadedChips skills={loadedSkills} />
    )}
    {/* ...existing parts rendering */}
  </div>
);
```

---

## 2. Skill 选择器

### 数据来源

```ts
// GET /api/skills → { skills: SkillManifest[] }
// localStorage per workspace: `reqagent-skills-${workspaceId}`
```

### 组件：`ReqSkillSelector`

**位置**：设置面板（Gallery → 设置页），或 Empty 状态页的底部。

**交互**：
- 显示所有可用 skill 列表
- 每个 skill 有 toggle 开关
- 切换立即保存到 localStorage
- 显示 skill 类型（knowledge/capability）和简短描述

**渲染逻辑**：

```tsx
// components/ReqSkillSelector.tsx
import { useEffect, useState } from 'react';
import styles from './ReqSkillSelector.module.css';

type SkillManifest = {
  id: string;
  name: string;
  version: string;
  type: "knowledge" | "capability" | "hybrid";
  description: string;
  tags?: string[];
};

export function ReqSkillSelector({ workspaceId }: { workspaceId: string }) {
  const [skills, setSkills] = useState<SkillManifest[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/skills').then(r => r.json()).then(d => setSkills(d.skills ?? []));
    const stored = localStorage.getItem(`reqagent-skills-${workspaceId}`);
    if (stored) setActiveIds(new Set(JSON.parse(stored)));
  }, [workspaceId]);

  function toggle(id: string) {
    setActiveIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem(`reqagent-skills-${workspaceId}`, JSON.stringify([...next]));
      return next;
    });
  }

  if (skills.length === 0) return null;

  return (
    <div className={styles.root}>
      <h4 className={styles.heading}>Skills</h4>
      <div className={styles.list}>
        {skills.map(skill => (
          <button
            key={skill.id}
            className={`${styles.item} ${activeIds.has(skill.id) ? styles.active : ''}`}
            onClick={() => toggle(skill.id)}
          >
            <div className={styles.itemHead}>
              <span className={styles.itemName}>{skill.name}</span>
              <span className={styles.typeBadge} data-type={skill.type}>
                {skill.type === 'knowledge' ? '知识' : '能力'}
              </span>
            </div>
            <p className={styles.itemDesc}>{skill.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
```

**样式**：`ReqSkillSelector.module.css`

```css
.root {
  display: grid;
  gap: 8px;
}

.heading {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--reqagent-fg, #222);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.list {
  display: grid;
  gap: 4px;
}

.item {
  all: unset;
  cursor: pointer;
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--reqagent-border, #e5e5e5);
  transition: border-color 0.15s, background 0.15s;
}

.item:hover {
  border-color: var(--reqagent-fg, #222);
}

.item.active {
  border-color: var(--reqagent-fg, #222);
  background: var(--reqagent-bg-hover, #fafafa);
}

.itemHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.itemName {
  font-size: 12px;
  font-weight: 560;
  color: var(--reqagent-fg, #222);
}

.typeBadge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid var(--reqagent-border, #e5e5e5);
  color: var(--reqagent-muted);
}

.itemDesc {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--reqagent-muted);
}
```

### 前端 transport 传参

在 `app/page.tsx` 中读取 localStorage 并传给后端：

```ts
// 在 prepareSendMessagesRequest 中
body: {
  ...existing,
  skills: JSON.parse(localStorage.getItem(`reqagent-skills-${workspaceId}`) || '[]'),
}
```

---

## 3. Gallery 展示项

在 `components/ReqToolStateGallery.tsx` 中添加 Skill 相关的 gallery 预览：

```tsx
// 在 gallery 的展示区域添加
<section>
  <h3>Skill 加载指示器</h3>
  <ReqSkillLoadedChips skills={[
    { id: 'req-prd-generic', name: '通用 PRD 模板', type: 'knowledge' },
    { id: 'cap-mermaid', name: 'Mermaid 图表', type: 'capability' },
  ]} />
</section>
```

---

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `components/ReqSkillLoadedChips.tsx` | 新建 | 加载指示器组件 |
| `components/ReqSkillLoadedChips.module.css` | 新建 | 样式 |
| `components/ReqSkillSelector.tsx` | 新建 | Skill 选择器 |
| `components/ReqSkillSelector.module.css` | 新建 | 样式 |
| `components/ReqAgentUI.tsx` | 修改 | 集成 ReqSkillLoadedChips |
| `components/ReqToolStateGallery.tsx` | 修改 | 添加 skill gallery 预览 |
| `app/page.tsx` | 修改 | transport body 传 skills |

## 设计原则

- 跟随 monochrome design system（`--reqagent-*` variables）
- Skill chips 要小巧克制，不抢对话内容的注意力
- 选择器用 toggle 风格，不是 checkbox
- 动画轻量（0.15-0.2s），用 ease-out
- 中文 UI copy，英文代码/注释
