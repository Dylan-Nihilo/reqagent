"use client";

import Link from "next/link";
import styles from "./ReqAgentComponentGallery.module.css";

const galleryEntries = [
  {
    title: "工具系统",
    href: "/gallery/tools",
    summary: "真实工具调用、简洁工具卡片、审批流、终端输出与结构化目录。",
    stats: ["4 类工具", "9 个状态", "轻量卡片 / 终端 / 目录"],
  },
  {
    title: "消息系统",
    href: "/gallery/messages",
    summary: "用户、助手、系统消息，以及 text / reasoning / source / file / image 的统一消息壳。",
    stats: ["4 类消息", "5 个状态", "多 part 渲染"],
  },
];

export function ReqAgentComponentGallery() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>ReqAgent</p>
          <h1 className={styles.title}>组件库</h1>
          <p className={styles.lead}>
            目录页只展示已经完成、可以直接进入预览的板块。现在可看的只有工具系统和消息系统。
          </p>
        </header>

        <section className={styles.directory}>
          {galleryEntries.map((entry) => (
            <Link key={entry.href} className={styles.entry} href={entry.href}>
              <div className={styles.entryMain}>
                <div className={styles.entryTitleRow}>
                  <h2 className={styles.entryTitle}>{entry.title}</h2>
                  <span className={styles.entryBadge}>Live</span>
                </div>
                <p className={styles.entrySummary}>{entry.summary}</p>
              </div>

              <div className={styles.entryMeta}>
                {entry.stats.map((item) => (
                  <span key={item} className={styles.entryPill}>
                    {item}
                  </span>
                ))}
              </div>

              <span className={styles.entryRoute}>{entry.href}</span>
            </Link>
          ))}
        </section>

        <footer className={styles.footer}>
          <Link className={styles.footerLink} href="/gallery/tools">
            打开工具系统
          </Link>
          <Link className={styles.footerLink} href="/gallery/messages">
            打开消息系统
          </Link>
          <Link className={styles.footerLink} href="/">
            返回应用
          </Link>
        </footer>
      </div>
    </main>
  );
}
