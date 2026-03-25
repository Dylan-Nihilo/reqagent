import type { SVGProps } from "react";

type ReqBrandMarkProps = SVGProps<SVGSVGElement> & {
  title?: string;
};

export function ReqBrandMark({
  title,
  ...props
}: ReqBrandMarkProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="none"
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M5.25 3.25h6.05l3.45 3.45v8.05a2 2 0 0 1-2 2H5.25a2 2 0 0 1-2-2V5.25a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M11.3 3.35V6.8h3.45"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M6.25 9.95h3.2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <path
        d="M9.45 9.95 11.95 7.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <path
        d="M9.45 9.95 11.95 12.3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <circle cx="5.7" cy="9.95" fill="currentColor" r="1" />
      <circle cx="12.65" cy="6.95" fill="currentColor" r="1" />
      <circle cx="12.65" cy="12.95" fill="currentColor" r="1" />
    </svg>
  );
}
