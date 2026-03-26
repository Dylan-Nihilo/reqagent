import type { SVGProps } from "react";

export type ReqIconProps = SVGProps<SVGSVGElement>;

function iconProps(className?: string): ReqIconProps {
  return {
    "aria-hidden": true,
    className,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };
}

export function ReqHistoryIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M4 6.5V10h3.5" />
      <path d="M5.4 17.2A8 8 0 1 0 4.4 8.7" />
      <path d="M12 8v4.2l2.8 1.8" />
    </svg>
  );
}

export function ReqSidebarIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M9 4.5v15" />
      <path d="M12.5 9h4" />
      <path d="M12.5 12h4" />
      <path d="M12.5 15h2.5" />
    </svg>
  );
}

export function ReqGalleryIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </svg>
  );
}

export function ReqSettingsIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.3" />
      <path d="M12 18.2v2.3" />
      <path d="M3.5 12h2.3" />
      <path d="M18.2 12h2.3" />
      <path d="m5.9 5.9 1.6 1.6" />
      <path d="m16.5 16.5 1.6 1.6" />
      <path d="m5.9 18.1 1.6-1.6" />
      <path d="m16.5 7.5 1.6-1.6" />
    </svg>
  );
}

export function ReqArtifactsIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M5 5.5h14" />
      <path d="M5 10.5h14" />
      <path d="M5 15.5h8" />
      <path d="m15 13.5 3.5 3.5-3.5 3.5" />
    </svg>
  );
}

export function ReqArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

export function ReqArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function ReqCloseIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

export function ReqPlusIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function ReqChatIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M5.5 6.5h13v9H12l-4.5 3v-3h-2A2 2 0 0 1 3.5 13.5v-5a2 2 0 0 1 2-2Z" />
      <path d="M8 10h8" />
      <path d="M8 13h5" />
    </svg>
  );
}

export function ReqTrashIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M4.5 7h15" />
      <path d="M9 4.5h6" />
      <path d="m6.5 7 .8 11a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-11" />
      <path d="M10 10.5v5.5" />
      <path d="M14 10.5v5.5" />
    </svg>
  );
}

export function ReqCopyIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="9" y="9" width="10" height="10" rx="2.2" />
      <path d="M15 9V7a2 2 0 0 0-2-2H7A2 2 0 0 0 5 7v6a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

export function ReqDownloadIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M12 4.5v10" />
      <path d="m8 10.5 4 4 4-4" />
      <path d="M5.5 18.5h13" />
    </svg>
  );
}

export function ReqSparkIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3Z" />
      <path d="m18.5 3.5.7 1.7 1.8.8-1.8.7-.7 1.8-.8-1.8-1.7-.7 1.7-.8.8-1.7Z" />
      <path d="m5.3 14.8.9 2 2 .9-2 .8-.9 2-.8-2-2-.8 2-.9.8-2Z" />
    </svg>
  );
}

export function ReqBriefIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M7 4.5h8l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A2.5 2.5 0 0 1 6 18V5.5A1 1 0 0 1 7 4.5Z" />
      <path d="M15 4.5V9h4" />
      <path d="M9 12h6" />
      <path d="M9 15h6" />
      <path d="M9 18h4" />
    </svg>
  );
}

export function ReqStoriesIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="7.5" cy="8" r="2.5" />
      <circle cx="16.5" cy="9.5" r="2" />
      <path d="M4.5 18a4.5 4.5 0 0 1 6 0" />
      <path d="M13.2 18a3.5 3.5 0 0 1 5.1-2.3" />
    </svg>
  );
}

export function ReqDocumentIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M8 4.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-8A2.5 2.5 0 0 1 7 18V6a1.5 1.5 0 0 1 1-1.5Z" />
      <path d="M15 4.5V9h4" />
      <path d="M10 12h6" />
      <path d="M10 15h6" />
      <path d="M10 18h4" />
    </svg>
  );
}

export function ReqDocxIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M8 4.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-8A2.5 2.5 0 0 1 7 18V6a1.5 1.5 0 0 1 1-1.5Z" />
      <path d="M15 4.5V9h4" />
      <path d="M10 12h2.2l1.8 2.2 1.8-2.2H18" />
      <path d="m10 17 2-2.5" />
      <path d="m18 17-2-2.5" />
    </svg>
  );
}

export function ReqKnowledgeIcon({ className }: { className?: string }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M6 5.5h8.5A3.5 3.5 0 0 1 18 9v9.5H9.5A3.5 3.5 0 0 0 6 22Z" />
      <path d="M6 5.5v16.5" />
      <path d="M10 10.5h4.5" />
      <path d="M10 14h4.5" />
    </svg>
  );
}

export function ReqArtifactKindIcon({
  className,
  kind,
}: {
  className?: string;
  kind?: "brief" | "stories" | "document" | "knowledge" | "docx";
}) {
  switch (kind) {
    case "brief":
      return <ReqBriefIcon className={className} />;
    case "stories":
      return <ReqStoriesIcon className={className} />;
    case "knowledge":
      return <ReqKnowledgeIcon className={className} />;
    case "docx":
      return <ReqDocxIcon className={className} />;
    default:
      return <ReqDocumentIcon className={className} />;
  }
}

export function ReqProviderIcon({
  className,
  providerName,
}: {
  className?: string;
  providerName?: string | null;
}) {
  if (providerName === "openai") {
    return (
      <svg {...iconProps(className)}>
        <path d="M12 3.8a4 4 0 0 1 3.4 1.9l.5.8h1a4 4 0 0 1 3.3 6.2l-.5.8.6.8a4 4 0 0 1-3.1 6.3l-1 .1-.5.8a4 4 0 0 1-6.7 0l-.5-.8-1-.1a4 4 0 0 1-3.1-6.3l.6-.8-.5-.8a4 4 0 0 1 3.3-6.2h1l.5-.8A4 4 0 0 1 12 3.8Z" />
        <path d="m8.6 9.1 3.4-2 3.4 2v3.8l-3.4 2-3.4-2Z" />
        <path d="M8.6 9.1 6.1 7.6" />
        <path d="m15.4 9.1 2.5-1.5" />
        <path d="m8.6 12.9-2.4 1.4" />
        <path d="m15.4 12.9 2.4 1.4" />
      </svg>
    );
  }

  return (
    <svg {...iconProps(className)}>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M8.5 14.5a4.6 4.6 0 0 0 7 0" />
      <path d="M9.5 10h.01" />
      <path d="M14.5 10h.01" />
      <path d="M5 19 3.5 20.5" />
    </svg>
  );
}
