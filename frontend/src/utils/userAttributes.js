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

export const DEFAULT_GRADE_STRUCTURE = DEFAULT_GRADE_LEVELS.map((grade) => ({
  grade,
  sections: [],
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

  source.forEach((entry) => {
    let gradeName = "";
    let sections = [];

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
    }

    if (!gradeName || seenGrades.has(gradeName.toLowerCase())) {
      return;
    }

    normalized.push({
      grade: gradeName,
      sections: normalizeStringList(sections),
    });
    seenGrades.add(gradeName.toLowerCase());
  });

  if (normalized.length === 0) {
    if (useFallbackWhenEmpty && Array.isArray(fallback) && fallback.length > 0) {
      return fallback.map((entry) => ({ ...entry }));
    }
    return [];
  }

  return normalized;
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
