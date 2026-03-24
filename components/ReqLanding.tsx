"use client";

import { useComposerRuntime } from "@assistant-ui/react";
import { ReqComposer } from "@/components/ReqComposer";
import styles from "@/components/ReqLanding.module.css";

const SUGGESTIONS = [
  "分析电商平台的需求",
  "拆解用户登录模块",
  "生成用户故事",
  "查看工作区文件",
];

export function ReqLanding() {
  return (
    <div className={styles.page}>

      {/* TL: Logo */}
      <div className={styles.cornerTL}>
        <a className={styles.logo} href="/">
          <div className={styles.logoMark}>
            <ReqLogoSvg />
          </div>
          <div>
            <div className={styles.logoText}>ReqAgent</div>
          </div>
        </a>
      </div>

      {/* TR: Nav buttons */}
      <div className={styles.cornerTR}>
        <a className={styles.ghostBtn} href="/gallery">
          <GalleryIcon className={styles.ghostBtnIcon} />
          Gallery
        </a>
        <button className={styles.ghostBtn} type="button">
          <SettingsIcon className={styles.ghostBtnIcon} />
          设置
        </button>
      </div>

      {/* BL: Status */}
      <div className={styles.cornerBL}>
        <span className={styles.statusDot} />
        <span className={styles.versionTag}>系统正常</span>
      </div>

      {/* BR: Version */}
      <div className={styles.cornerBR}>
        <span className={styles.versionTag}>v0.1.0</span>
      </div>

      {/* Center stage */}
      <div className={styles.stage}>
        <div className={styles.center}>

          {/* Title */}
          <div className={styles.titleBlock}>
            <div className={styles.eyebrow}>
              <span className={styles.eyebrowDot} />
              AI 需求助手
            </div>
            <h1 className={styles.title}>
              把想法变成
              <span className={styles.titleAccent}> 清晰的需求</span>
            </h1>
            <p className={styles.subtitle}>
              描述你的产品、功能或问题，ReqAgent 会帮你分析、拆解并生成结构化文档。
            </p>
          </div>

          {/* Composer */}
          <div className={styles.composerWrap}>
            <ReqComposer
              hint="shift + enter 换行"
              placeholder="描述你的产品需求，或者问我任何问题……"
              variant="landing"
            />
          </div>

          {/* Suggestion chips */}
          <ReqSuggestionChips />
        </div>
      </div>
    </div>
  );
}

function ReqSuggestionChips() {
  const composer = useComposerRuntime();

  return (
    <div className={styles.suggestions}>
      {SUGGESTIONS.map((s) => (
        <button
          className={styles.chip}
          key={s}
          onClick={() => composer.setText(s)}
          type="button"
        >
          {s}
          <span className={styles.chipArrow}>→</span>
        </button>
      ))}
    </div>
  );
}

// === SVG assets ===

function ReqLogoSvg() {
  return (
    <svg
      fill="none"
      height="18"
      viewBox="0 0 18 18"
      width="18"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Stylised R: vertical stem + bowl + leg */}
      <rect fill="white" height="14" rx="1" width="2.5" x="3" y="2" />
      <path
        d="M5.5 2h4a3.5 3.5 0 0 1 0 7h-4"
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
      <path
        d="M7.5 9l4.5 7"
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="2.5"
      />
    </svg>
  );
}

function GalleryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 16 16">
      <rect height="5" rx="1" width="5" x="1.5" y="1.5" />
      <rect height="5" rx="1" width="5" x="9.5" y="1.5" />
      <rect height="5" rx="1" width="5" x="1.5" y="9.5" />
      <rect height="5" rx="1" width="5" x="9.5" y="9.5" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
    </svg>
  );
}
