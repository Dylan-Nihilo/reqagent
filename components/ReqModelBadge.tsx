import { ReqProviderIcon } from "@/components/ReqIcons";
import styles from "@/components/ReqModelBadge.module.css";

type ReqModelBadgeProps = {
  model?: string;
  providerName?: string;
  wireApi?: "chat-completions" | "responses";
};

export function ReqModelBadge({
  model,
  providerName,
  wireApi,
}: ReqModelBadgeProps) {
  if (!model) return null;

  const transportLabel = wireApi === "responses" ? "RESP" : wireApi === "chat-completions" ? "CHAT" : null;

  return (
    <span className={styles.badge} title={providerName ? `${providerName} · ${model}` : model}>
      <span className={styles.provider}>
        <ReqProviderIcon providerName={providerName} />
      </span>
      <span className={styles.model}>{model}</span>
      {transportLabel ? <span className={styles.transport}>{transportLabel}</span> : null}
    </span>
  );
}
