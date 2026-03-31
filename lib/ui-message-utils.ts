function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function readMessageParts(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as {
    content?: unknown;
    parts?: unknown;
  };

  if (Array.isArray(record.content)) {
    return record.content;
  }

  if (Array.isArray(record.parts)) {
    return record.parts;
  }

  return [];
}

export function extractTextFromMessageParts(value: unknown) {
  return normalizeWhitespace(
    readMessageParts(value)
      .flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? [text] : [];
      })
      .join(" "),
  );
}
