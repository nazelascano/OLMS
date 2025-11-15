const SCAN_EVENT_NAME = "qrscan:detected";

const toPlainObject = (value) => {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const plain = {};
  Object.keys(value).forEach((key) => {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      plain[key] = candidate;
    }
  });
  return Object.keys(plain).length > 0 ? plain : undefined;
};

export const dispatchScanEvent = (rawValue, meta = {}) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = rawValue == null ? "" : String(rawValue);
  const detail = {
    value: normalized,
    meta: {
      ...meta,
      pointer: toPlainObject(meta.pointer),
      rect: toPlainObject(meta.rect),
    },
  };

  window.dispatchEvent(new CustomEvent(SCAN_EVENT_NAME, { detail }));
};

export const SCAN_EVENT = SCAN_EVENT_NAME;
