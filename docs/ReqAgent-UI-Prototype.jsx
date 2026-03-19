import { useState, useEffect, useRef } from "react";

const FONT_URL = "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&display=swap";

// --- Mock data for the demo ---
const DEMO_MESSAGES = [
  {
    id: 1, role: "user", content: "我想做一个在线教育平台，支持视频课程、直播教学、作业提交和批改、学习进度跟踪。目标用户是 K12 学生和家长。",
    attachments: []
  },
  {
    id: 2, role: "assistant", content: "",
    agentName: "ReqAnalysis",
    toolCalls: [
      { name: "doc_parse", display: "解析输入", category: "reading", status: "done" },
    ],
    thinking: false,
    streamedText: "我已完成初步需求分析，识别出 **4 个核心功能模块**和 **3 个非功能需求**。\n\n需要确认几个关键问题：\n1. 是否需要支持**实时直播连麦**？\n2. 作业批改是否需要 **AI 辅助自动批改**？\n3. 目标并发用户数大约多少？"
  },
  {
    id: 3, role: "user", content: "需要连麦，AI批改也要，并发大概5000人",
    attachments: []
  },
  {
    id: 4, role: "assistant", content: "",
    agentName: "ReqDecomposer",
    toolCalls: [
      { name: "search_knowledge", display: "检索知识库", category: "searching", status: "done" },
      { name: "generate_stories", display: "生成 User Story", category: "thinking", status: "done" },
    ],
    thinking: false,
    streamedText: "已完成需求拆解，共生成 **12 条 User Story**，按 MoSCoW 优先级分类。正在生成完整的需求规格说明书..."
  },
];

const DEMO_ARTIFACTS = [
  {
    id: "a1", type: "req_doc", title: "需求规格说明书 v1", format: "markdown",
    preview: `# 在线教育平台 — 需求规格说明书\n\n## 1. 项目概述\n\n为 K12 学生和家长打造的综合在线教育平台...\n\n## 2. 功能需求\n\n### 2.1 视频课程模块\n- 支持录播课程上传和播放\n- 支持多清晰度切换（720p/1080p/4K）\n- 课程章节目录与书签功能\n\n### 2.2 直播教学模块\n- 实时直播推流（RTMP/WebRTC）\n- 师生连麦互动\n- 直播回放自动生成\n- 弹幕和聊天室\n\n### 2.3 作业系统\n- 教师发布作业（支持图片/PDF/文本）\n- 学生在线提交\n- AI 辅助自动批改（选择题/填空题）\n- 教师人工批改（主观题）\n\n### 2.4 学习进度跟踪\n- 课程完成率统计\n- 学习时长记录\n- 知识点掌握度分析\n- 家长端进度查看\n\n## 3. 非功能需求\n\n- **并发**: 支持 5000 并发用户\n- **延迟**: 直播延迟 < 3 秒\n- **可用性**: 99.9% SLA`
  },
  {
    id: "a2", type: "user_story", title: "User Story 看板", format: "stories",
    stories: [
      { id: "US-1", role: "学生", want: "在平台上观看录播课程", soThat: "可以按自己的节奏学习", priority: "must", status: "done" },
      { id: "US-2", role: "学生", want: "参加直播课并与老师连麦", soThat: "可以实时提问和互动", priority: "must", status: "done" },
      { id: "US-3", role: "教师", want: "在线发布和批改作业", soThat: "提高教学效率", priority: "must", status: "done" },
      { id: "US-4", role: "家长", want: "查看孩子的学习进度", soThat: "了解学习情况并及时辅导", priority: "must", status: "done" },
      { id: "US-5", role: "教师", want: "AI 自动批改选择题", soThat: "节省重复劳动时间", priority: "should", status: "active" },
      { id: "US-6", role: "学生", want: "获取知识点掌握度分析", soThat: "针对性地补强薄弱环节", priority: "should", status: "active" },
      { id: "US-7", role: "管理员", want: "查看平台运营数据", soThat: "做出数据驱动的决策", priority: "could", status: "pending" },
      { id: "US-8", role: "学生", want: "课程评价和评分", soThat: "帮助其他同学选课", priority: "could", status: "pending" },
    ]
  },
  {
    id: "a3", type: "prototype", title: "低保真原型", format: "html",
    html: `<div style="font-family:sans-serif;padding:20px;background:#f8fafc;min-height:100%">
      <div style="background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);overflow:hidden">
        <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:16px 24px;color:#fff;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:18px;font-weight:600">EduPlatform</div>
          <div style="display:flex;gap:16px;font-size:13px"><span>课程</span><span>直播</span><span>作业</span><span style="background:rgba(255,255,255,.2);padding:4px 12px;border-radius:20px">我的学习</span></div>
        </div>
        <div style="padding:24px">
          <div style="font-size:14px;color:#64748b;margin-bottom:12px">继续学习</div>
          <div style="display:flex;gap:16px">
            <div style="flex:1;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden">
              <div style="height:80px;background:linear-gradient(135deg,#fbbf24,#f59e0b)"></div>
              <div style="padding:12px"><div style="font-size:13px;font-weight:600">数学 · 函数与方程</div><div style="margin-top:8px;height:4px;background:#e2e8f0;border-radius:2px"><div style="width:65%;height:100%;background:#6366f1;border-radius:2px"></div></div><div style="font-size:11px;color:#94a3b8;margin-top:4px">进度 65%</div></div>
            </div>
            <div style="flex:1;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden">
              <div style="height:80px;background:linear-gradient(135deg,#34d399,#10b981)"></div>
              <div style="padding:12px"><div style="font-size:13px;font-weight:600">英语 · 阅读理解</div><div style="margin-top:8px;height:4px;background:#e2e8f0;border-radius:2px"><div style="width:40%;height:100%;background:#6366f1;border-radius:2px"></div></div><div style="font-size:11px;color:#94a3b8;margin-top:4px">进度 40%</div></div>
            </div>
          </div>
          <div style="margin-top:20px;padding:16px;background:#fef3c7;border-radius:8px;display:flex;align-items:center;gap:12px">
            <div style="font-size:20px">🔴</div>
            <div><div style="font-size:13px;font-weight:600;color:#92400e">直播中：物理 · 力学专题</div><div style="font-size:12px;color:#a16207">王老师 · 126人在线</div></div>
            <div style="margin-left:auto;background:#6366f1;color:#fff;padding:6px 16px;border-radius:6px;font-size:12px;font-weight:500">进入直播</div>
          </div>
        </div>
      </div>
    </div>`
  }
];

const PIPELINE_STEPS = [
  { name: "InputParser", display: "输入解析", status: "done" },
  { name: "ReqDecomposer", display: "需求拆解", status: "done" },
  { name: "DocGenerator", display: "文档生成", status: "active" },
];

// --- Styles ---
const colors = {
  bg: "#0a0a0f",
  surface: "#12121a",
  surfaceHover: "#1a1a26",
  border: "#1e1e2e",
  borderActive: "#3b3b5c",
  text: "#e4e4ed",
  textMuted: "#6b6b80",
  textDim: "#45455a",
  accent: "#818cf8",
  accentDim: "#4f46e5",
  green: "#34d399",
  amber: "#fbbf24",
  red: "#f87171",
  cyan: "#22d3ee",
};

const TOOL_ICONS = {
  thinking: { icon: "◉", color: colors.accent, label: "思考中" },
  reading: { icon: "◎", color: "#60a5fa", label: "读取中" },
  writing: { icon: "◈", color: colors.green, label: "写入中" },
  searching: { icon: "◍", color: colors.amber, label: "搜索中" },
  analyzing: { icon: "◐", color: "#f472b6", label: "分析中" },
  generating: { icon: "◆", color: colors.cyan, label: "生成中" },
};

const PRIORITY_COLORS = {
  must: { bg: "#4f46e510", border: "#4f46e540", text: "#818cf8", label: "Must Have" },
  should: { bg: "#f59e0b10", border: "#f59e0b40", text: "#fbbf24", label: "Should Have" },
  could: { bg: "#6b728010", border: "#6b728040", text: "#9ca3af", label: "Could Have" },
};

// --- Components ---
function ToolCallBadge({ tool }) {
  const config = TOOL_ICONS[tool.category] || TOOL_ICONS.thinking;
  const isDone = tool.status === "done";
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 10px", borderRadius: 6,
      background: isDone ? "#1a1a26" : `${config.color}10`,
      border: `1px solid ${isDone ? colors.border : config.color + "30"}`,
      fontSize: 11, fontFamily: "'DM Sans', sans-serif",
      color: isDone ? colors.textMuted : config.color,
      transition: "all 0.3s ease",
    }}>
      <span style={{
        display: "inline-block",
        animation: isDone ? "none" : "spin 2s linear infinite",
        fontSize: 10,
      }}>{isDone ? "✓" : config.icon}</span>
      <span>{tool.display}</span>
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: isUser ? "flex-end" : "flex-start",
      marginBottom: 20,
      animation: "fadeSlideUp 0.4s ease",
    }}>
      {!isUser && msg.agentName && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          marginBottom: 6, fontSize: 11, color: colors.accent,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: colors.accent,
            boxShadow: `0 0 8px ${colors.accent}60`,
          }}/>
          {msg.agentName}
        </div>
      )}
      <div style={{
        maxWidth: isUser ? "75%" : "85%",
        padding: "12px 16px",
        borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
        background: isUser ? colors.accentDim : colors.surface,
        border: isUser ? "none" : `1px solid ${colors.border}`,
        color: colors.text,
        fontSize: 13.5, lineHeight: 1.65,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 6,
            marginBottom: 10, paddingBottom: 10,
            borderBottom: `1px solid ${colors.border}`,
          }}>
            {msg.toolCalls.map((t, i) => <ToolCallBadge key={i} tool={t} />)}
          </div>
        )}
        <div dangerouslySetInnerHTML={{
          __html: (msg.streamedText || msg.content)
            .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#c4b5fd">$1</strong>')
            .replace(/\n/g, "<br/>")
        }} />
      </div>
    </div>
  );
}

function ArtifactReqDoc({ artifact }) {
  return (
    <div style={{
      background: colors.surface, borderRadius: 12,
      border: `1px solid ${colors.border}`, overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px",
        borderBottom: `1px solid ${colors.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>📄</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, fontFamily: "'DM Sans', sans-serif" }}>
            {artifact.title}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={{
            background: colors.surfaceHover, border: `1px solid ${colors.border}`,
            color: colors.textMuted, fontSize: 11, padding: "4px 10px",
            borderRadius: 6, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          }}>导出 Word</button>
          <button style={{
            background: colors.surfaceHover, border: `1px solid ${colors.border}`,
            color: colors.textMuted, fontSize: 11, padding: "4px 10px",
            borderRadius: 6, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          }}>导出 JSON</button>
        </div>
      </div>
      <div style={{
        padding: 20, fontSize: 12.5, lineHeight: 1.8,
        color: colors.textMuted, fontFamily: "'JetBrains Mono', monospace",
        maxHeight: 380, overflowY: "auto", whiteSpace: "pre-wrap",
      }}>
        {artifact.preview}
      </div>
    </div>
  );
}

function ArtifactStoryBoard({ artifact }) {
  const grouped = { must: [], should: [], could: [] };
  artifact.stories.forEach(s => grouped[s.priority]?.push(s));

  return (
    <div style={{
      background: colors.surface, borderRadius: 12,
      border: `1px solid ${colors.border}`, overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px", borderBottom: `1px solid ${colors.border}`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 16 }}>📋</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, fontFamily: "'DM Sans', sans-serif" }}>
          {artifact.title}
        </span>
        <span style={{
          marginLeft: "auto", fontSize: 11, color: colors.textMuted,
          fontFamily: "'JetBrains Mono', monospace",
        }}>{artifact.stories.length} stories</span>
      </div>
      <div style={{ display: "flex", gap: 1, background: colors.border }}>
        {Object.entries(grouped).map(([priority, stories]) => {
          const pc = PRIORITY_COLORS[priority];
          return (
            <div key={priority} style={{ flex: 1, background: colors.bg, padding: 12 }}>
              <div style={{
                fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                letterSpacing: "0.08em", color: pc.text, marginBottom: 10,
                fontFamily: "'DM Sans', sans-serif",
              }}>{pc.label}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {stories.map(s => (
                  <div key={s.id} style={{
                    padding: "10px 12px", borderRadius: 8,
                    background: pc.bg, border: `1px solid ${pc.border}`,
                    transition: "transform 0.2s ease",
                    cursor: "pointer",
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
                  onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
                  >
                    <div style={{
                      fontSize: 10, color: colors.textDim, marginBottom: 4,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>{s.id}</div>
                    <div style={{
                      fontSize: 12, color: colors.text, lineHeight: 1.5,
                      fontFamily: "'DM Sans', sans-serif",
                    }}>
                      作为<strong style={{ color: pc.text }}>{s.role}</strong>，我想{s.want}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ArtifactPrototype({ artifact }) {
  return (
    <div style={{
      background: colors.surface, borderRadius: 12,
      border: `1px solid ${colors.border}`, overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px", borderBottom: `1px solid ${colors.border}`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 16 }}>🎨</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, fontFamily: "'DM Sans', sans-serif" }}>
          {artifact.title}
        </span>
      </div>
      <div style={{ background: "#fff", height: 320 }}>
        <iframe
          srcDoc={artifact.html}
          style={{ width: "100%", height: "100%", border: "none" }}
          sandbox="allow-scripts"
          title="prototype"
        />
      </div>
    </div>
  );
}

function PipelineBar({ steps, currentTool }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 20px",
      borderTop: `1px solid ${colors.border}`,
      background: colors.surface,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {steps.map((step, i) => (
          <div key={step.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{
              padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500,
              display: "flex", alignItems: "center", gap: 5,
              background:
                step.status === "done" ? `${colors.green}15` :
                step.status === "active" ? `${colors.accent}15` : colors.surfaceHover,
              color:
                step.status === "done" ? colors.green :
                step.status === "active" ? colors.accent : colors.textDim,
              border: `1px solid ${
                step.status === "done" ? colors.green + "30" :
                step.status === "active" ? colors.accent + "30" : colors.border}`,
              transition: "all 0.3s ease",
            }}>
              {step.status === "done" ? "✓" :
               step.status === "active" ? <span style={{ animation: "pulse 1.5s ease infinite" }}>●</span> : "○"}
              <span>{step.display}</span>
            </div>
            {i < steps.length - 1 && (
              <span style={{ color: colors.textDim, fontSize: 10, margin: "0 2px" }}>→</span>
            )}
          </div>
        ))}
      </div>
      {currentTool && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 11, color: colors.cyan,
        }}>
          <span style={{ animation: "spin 2s linear infinite", fontSize: 10 }}>◆</span>
          <span>{currentTool}</span>
        </div>
      )}
    </div>
  );
}

// --- Main App ---
export default function ReqAgentUI() {
  const [activeTab, setActiveTab] = useState("req_doc");
  const [inputValue, setInputValue] = useState("");
  const [showTyping, setShowTyping] = useState(true);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setShowTyping(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const currentArtifact = DEMO_ARTIFACTS.find(a =>
    activeTab === "req_doc" ? a.type === "req_doc" :
    activeTab === "stories" ? a.type === "user_story" :
    a.type === "prototype"
  );

  return (
    <>
      <link href={FONT_URL} rel="stylesheet" />
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes typingDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${colors.border}; border-radius: 4px; }
        ::selection { background: ${colors.accent}40; }
      `}</style>

      <div style={{
        width: "100%", height: "100vh",
        background: colors.bg, color: colors.text,
        display: "flex", flexDirection: "column",
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 24px", height: 52,
          borderBottom: `1px solid ${colors.border}`,
          background: colors.surface,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: `linear-gradient(135deg, ${colors.accent}, ${colors.cyan})`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 700, color: "#fff",
            }}>R</div>
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-0.02em" }}>
              ReqAgent
            </span>
            <span style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 10,
              background: `${colors.accent}15`, color: colors.accent,
              border: `1px solid ${colors.accent}25`,
              fontFamily: "'JetBrains Mono', monospace",
            }}>v0.1 demo</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              fontSize: 11, color: colors.textMuted,
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: colors.green,
                boxShadow: `0 0 8px ${colors.green}60`,
              }}/>
              3 Agents · 6 MCP Tools
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* Left: Chat Panel */}
          <div style={{
            width: "45%", display: "flex", flexDirection: "column",
            borderRight: `1px solid ${colors.border}`,
          }}>
            {/* Chat messages */}
            <div style={{
              flex: 1, overflowY: "auto", padding: "20px 20px 0 20px",
            }}>
              {DEMO_MESSAGES.map(msg => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}

              {/* Typing indicator */}
              {showTyping && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  marginBottom: 20, marginLeft: 4,
                  animation: "fadeSlideUp 0.3s ease",
                }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    fontSize: 11, color: colors.accent,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: colors.accent,
                      boxShadow: `0 0 8px ${colors.accent}60`,
                    }}/>
                    DocGenerator
                  </div>
                  <div style={{
                    display: "flex", gap: 4, padding: "8px 14px",
                    background: colors.surface, borderRadius: 12,
                    border: `1px solid ${colors.border}`,
                  }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: colors.accent,
                        animation: `typingDot 1.2s ease infinite`,
                        animationDelay: `${i * 0.2}s`,
                      }}/>
                    ))}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: "16px 20px", borderTop: `1px solid ${colors.border}` }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: colors.surface, borderRadius: 12,
                border: `1px solid ${colors.border}`,
                padding: "4px 4px 4px 16px",
                transition: "border-color 0.2s",
              }}>
                <button style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: colors.textMuted, fontSize: 16, padding: 4,
                }} title="上传附件">📎</button>
                <input
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  placeholder="描述你的需求，或上传文档..."
                  style={{
                    flex: 1, background: "none", border: "none", outline: "none",
                    color: colors.text, fontSize: 13,
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                />
                <button style={{
                  background: inputValue ? colors.accent : colors.surfaceHover,
                  color: inputValue ? "#fff" : colors.textDim,
                  border: "none", borderRadius: 8,
                  padding: "8px 16px", fontSize: 12, fontWeight: 600,
                  cursor: inputValue ? "pointer" : "default",
                  transition: "all 0.2s",
                  fontFamily: "'DM Sans', sans-serif",
                }}>发送</button>
              </div>
              <div style={{
                display: "flex", gap: 8, marginTop: 8,
              }}>
                {["📄 Word 文档", "🖼️ 截图/草图", "📝 文本文件"].map(t => (
                  <button key={t} style={{
                    background: colors.surfaceHover, border: `1px solid ${colors.border}`,
                    color: colors.textMuted, fontSize: 10, padding: "4px 10px",
                    borderRadius: 6, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = colors.accent + "50"; e.currentTarget.style.color = colors.text; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.color = colors.textMuted; }}
                  >{t}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Artifacts Panel */}
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            background: colors.bg,
          }}>
            {/* Tabs */}
            <div style={{
              display: "flex", alignItems: "center", gap: 2,
              padding: "8px 16px",
              borderBottom: `1px solid ${colors.border}`,
              background: colors.surface,
            }}>
              {[
                { id: "req_doc", icon: "📄", label: "需求文档" },
                { id: "stories", icon: "📋", label: "用户故事" },
                { id: "prototype", icon: "🎨", label: "原型" },
              ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 8, border: "none",
                  background: activeTab === tab.id ? `${colors.accent}12` : "transparent",
                  color: activeTab === tab.id ? colors.accent : colors.textMuted,
                  fontSize: 12, fontWeight: 500, cursor: "pointer",
                  transition: "all 0.2s",
                  fontFamily: "'DM Sans', sans-serif",
                }}>
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {tab.id === "stories" && (
                    <span style={{
                      fontSize: 10, padding: "1px 6px", borderRadius: 8,
                      background: colors.accent + "20", color: colors.accent,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>12</span>
                  )}
                </button>
              ))}
            </div>

            {/* Artifact Content */}
            <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
              {currentArtifact?.type === "req_doc" && <ArtifactReqDoc artifact={currentArtifact} />}
              {currentArtifact?.type === "user_story" && <ArtifactStoryBoard artifact={currentArtifact} />}
              {currentArtifact?.type === "prototype" && <ArtifactPrototype artifact={currentArtifact} />}
            </div>
          </div>
        </div>

        {/* Bottom Pipeline Bar */}
        <PipelineBar steps={PIPELINE_STEPS} currentTool={showTyping ? "生成需求规格说明书..." : null} />
      </div>
    </>
  );
}
