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

export const ensureUserAttributes = (attributes = {}) => ({
  curriculum: normalizeStringList(
    attributes.curriculum ?? attributes.curricula,
    DEFAULT_CURRICULA
  ),
  gradeLevels: normalizeStringList(attributes.gradeLevels, DEFAULT_GRADE_LEVELS),
});
