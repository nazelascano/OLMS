const normalizeAuthorName = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
};

const splitAuthorValue = (value) => {
  if (typeof value !== "string") {
    return [];
  }
  if (/[;,|]/.test(value)) {
    return value
      .split(/[,;|]/)
      .map((entry) => normalizeAuthorName(entry))
      .filter(Boolean);
  }
  const normalized = normalizeAuthorName(value);
  return normalized ? [normalized] : [];
};

const addUniqueAuthor = (author, seen, list) => {
  const normalized = normalizeAuthorName(author);
  if (!normalized) {
    return;
  }
  const key = normalized.toLowerCase();
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  list.push(normalized);
};

export const extractUniqueAuthors = (record) => {
  if (!record) {
    return [];
  }

  const seen = new Set();
  const authors = [];

  const addFromValue = (value) => {
    splitAuthorValue(value).forEach((entry) => addUniqueAuthor(entry, seen, authors));
  };

  if (Array.isArray(record.authors)) {
    record.authors.forEach(addFromValue);
  }

  if (typeof record.author === "string") {
    addFromValue(record.author);
  }

  return authors;
};

export const formatAuthorsList = (record, fallback = "Unknown Author") => {
  const authors = extractUniqueAuthors(record);
  if (authors.length === 0) {
    return fallback;
  }
  return authors.join(", ");
};
