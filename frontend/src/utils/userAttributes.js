export const DEFAULT_CURRICULA = [
  "Computer Science",
  "Engineering",
  "Mathematics",
  "Science",
  "Arts",
  "Business",
  "Education",
  "Medicine",
  "Law",
  "Other",
];

export const DEFAULT_GRADE_LEVELS = [
  "Grade 7",
  "Grade 8",
  "Grade 9",
  "Grade 10",
  "Grade 11",
  "Grade 12",
  "College Freshman",
  "College Sophomore",
  "College Junior",
  "College Senior",
  "Graduate",
];

export const DEFAULT_GRADE_COLORS = [
  "#C62828",
  "#AD1457",
  "#6A1B9A",
  "#4527A0",
  "#283593",
  "#1565C0",
  "#0277BD",
  "#00838F",
  "#00695C",
  "#2E7D32",
  "#558B2F",
];

export const DEFAULT_GRADE_COLOR = DEFAULT_GRADE_COLORS[0];

export const getDefaultGradeColor = (index = 0) =>
  DEFAULT_GRADE_COLORS[index % DEFAULT_GRADE_COLORS.length] || DEFAULT_GRADE_COLOR;

export const sanitizeHexColor = (value, fallback = DEFAULT_GRADE_COLOR) => {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().replace(/^#/u, "").toUpperCase();
  if (/^[0-9A-F]{6}$/u.test(normalized)) {
    return `#${normalized}`;
  }
  return fallback;
};

export const DEFAULT_GRADE_STRUCTURE = DEFAULT_GRADE_LEVELS.map((grade, index) => ({
  grade,
  sections: [],
  color: getDefaultGradeColor(index),
}));

export const normalizeStringList = (input, fallback = []) => {
  const source = Array.isArray(input) ? input : [];
  const normalized = source
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);

  const unique = [];
  normalized.forEach((value) => {
    if (!unique.includes(value)) {
      unique.push(value);
    }
  });

  return unique.length > 0 ? unique : [...fallback];
};

export const normalizeGradeStructure = (
  input,
  fallback = DEFAULT_GRADE_STRUCTURE,
  { useFallbackWhenEmpty = true } = {}
) => {
  const source = Array.isArray(input) ? input : [];
  const normalized = [];
  const seenGrades = new Set();
  const fallbackColorMap = new Map();

  (Array.isArray(fallback) ? fallback : []).forEach((entry = {}, index) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const key = typeof entry.grade === "string" ? entry.grade.trim().toLowerCase() : "";
    if (!key) {
      return;
    }
    fallbackColorMap.set(key, sanitizeHexColor(entry.color, getDefaultGradeColor(index)));
  });

  source.forEach((entry) => {
    let gradeName = "";
    let sections = [];
    let rawColor = "";

    if (typeof entry === "string") {
      gradeName = entry.trim();
    } else if (entry && typeof entry === "object") {
      if (typeof entry.grade === "string") {
        gradeName = entry.grade.trim();
      } else if (typeof entry.name === "string") {
        gradeName = entry.name.trim();
      }

      if (Array.isArray(entry.sections)) {
        sections = entry.sections;
      } else if (Array.isArray(entry.sectionList)) {
        sections = entry.sectionList;
      }
      if (typeof entry.color === "string") {
        rawColor = entry.color;
      } else if (typeof entry.barColor === "string") {
        rawColor = entry.barColor;
      } else if (typeof entry.stripeColor === "string") {
        rawColor = entry.stripeColor;
      }
    }

    if (!gradeName || seenGrades.has(gradeName.toLowerCase())) {
      return;
    }

    const gradeKey = gradeName.toLowerCase();
    const normalizedColor = sanitizeHexColor(
      rawColor,
      fallbackColorMap.get(gradeKey) || getDefaultGradeColor(normalized.length),
    );

    normalized.push({
      grade: gradeName,
      sections: normalizeStringList(sections),
      color: normalizedColor,
    });
    seenGrades.add(gradeKey);
    fallbackColorMap.set(gradeKey, normalizedColor);
  });

  if (normalized.length === 0) {
    if (useFallbackWhenEmpty && Array.isArray(fallback) && fallback.length > 0) {
      return fallback.map((entry = {}, index) => ({
        grade: entry.grade,
        sections: Array.isArray(entry.sections) ? [...entry.sections] : [],
        color: sanitizeHexColor(entry.color, getDefaultGradeColor(index)),
      }));
    }
    return [];
  }

  return normalized;
};

export const buildGradeColorMap = (gradeStructure = []) => {
  const entries = Array.isArray(gradeStructure) ? gradeStructure : [];
  return entries.reduce((acc, entry = {}, index) => {
    const key = typeof entry.grade === "string" ? entry.grade.trim().toLowerCase() : "";
    if (!key) {
      return acc;
    }
    acc[key] = sanitizeHexColor(entry.color, getDefaultGradeColor(index));
    return acc;
  }, {});
};

export const getSectionsForGrade = (gradeStructure = [], gradeName) => {
  if (!gradeName) {
    return [];
  }
  const match = (gradeStructure || []).find(
    (entry) => entry.grade && entry.grade.toLowerCase() === gradeName.toLowerCase()
  );
  return match ? [...match.sections] : [];
};

export const collectAllSections = (gradeStructure = []) => {
  const sectionSet = new Set();
  (gradeStructure || []).forEach((entry = {}) => {
    (entry.sections || []).forEach((section) => {
      const trimmed = typeof section === "string" ? section.trim() : "";
      if (trimmed) {
        sectionSet.add(trimmed);
      }
    });
  });
  return Array.from(sectionSet);
};

export const ensureUserAttributes = (attributes = {}) => {
  const curriculum = normalizeStringList(
    attributes.curriculum ?? attributes.curricula,
    DEFAULT_CURRICULA
  );

  const gradeStructureSource =
    attributes.gradeStructure ?? attributes.gradeStructures ?? attributes.gradeLevels;
  const gradeStructure = normalizeGradeStructure(
    gradeStructureSource,
    DEFAULT_GRADE_STRUCTURE
  );
  const structureGrades = gradeStructure.map((entry) => entry.grade);
  const gradeLevels = normalizeStringList(
    attributes.gradeLevels,
    structureGrades.length > 0 ? structureGrades : DEFAULT_GRADE_LEVELS
  );

  return {
    curriculum,
    gradeLevels,
    gradeStructure,
  };
};
