import { api } from "./api";

const absoluteUrlPattern = /^https?:\/\//i;
const dataUrlPattern = /^data:/i;

const extractUrlCandidate = (value) => {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    const nested = value.url || value.href || value.path;
    if (typeof nested === "string") {
      return nested;
    }
  }

  return "";
};

export const resolveApiOrigin = () => {
  const base = api.defaults.baseURL || "";
  if (base) {
    const sanitized = base.replace(/\/api$/i, "");
    return sanitized || base;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }

  return "";
};

export const resolveAssetUrl = (value) => {
  const raw = (value || "").trim();
  if (!raw) {
    return "";
  }

  if (absoluteUrlPattern.test(raw) || dataUrlPattern.test(raw)) {
    return raw;
  }

  const origin = resolveApiOrigin();
  if (!origin) {
    return raw;
  }

  const normalizedPath = raw.startsWith("/") ? raw : `/${raw}`;
  return `${origin}${normalizedPath}`;
};

export const resolveEntityAvatar = (entity) => {
  if (!entity || typeof entity !== "object") {
    return "";
  }

  const candidates = [
    entity.profilePictureUrl,
    extractUrlCandidate(entity.profilePicture),
    entity.profileImageUrl,
    extractUrlCandidate(entity.profileImage),
    entity.photoUrl,
    extractUrlCandidate(entity.photo),
    entity.avatarUrl,
    extractUrlCandidate(entity.avatar),
    entity.imageUrl,
    extractUrlCandidate(entity.image),
  ];

  const raw = candidates.find((candidate) => {
    if (typeof candidate !== "string") {
      return false;
    }
    const trimmed = candidate.trim();
    return trimmed.length > 0;
  });

  if (!raw) {
    return "";
  }

  const trimmed = raw.trim();

  return resolveAssetUrl(trimmed);
};
