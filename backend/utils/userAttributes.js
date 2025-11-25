const DEFAULT_CURRICULA = [
  'Computer Science',
  'Engineering',
  'Mathematics',
  'Science',
  'Arts',
  'Business',
  'Education',
  'Medicine',
  'Law',
  'Other'
];

const DEFAULT_GRADE_LEVELS = [
  'Grade 7',
  'Grade 8',
  'Grade 9',
  'Grade 10',
  'Grade 11',
  'Grade 12',
  'College Freshman',
  'College Sophomore',
  'College Junior',
  'College Senior',
  'Graduate'
];

const DEFAULT_GRADE_STRUCTURE = DEFAULT_GRADE_LEVELS.map((grade) => ({
  grade,
  sections: []
}));

const normalizeStringList = (input, fallback = []) => {
  const source = Array.isArray(input) ? input : [];
  const normalized = source
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);

  const unique = [];
  normalized.forEach((value) => {
    if (!unique.includes(value)) {
      unique.push(value);
    }
  });

  return unique.length > 0 ? unique : [...fallback];
};

const toSlug = (value, fallback) => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return slug || fallback;
};

const normalizeGradeStructure = (input, fallback = DEFAULT_GRADE_STRUCTURE, { useFallbackWhenEmpty = true } = {}) => {
  const source = Array.isArray(input) ? input : [];
  const normalized = [];
  const seenGrades = new Set();

  source.forEach((entry) => {
    let gradeName = '';
    let sections = [];

    if (typeof entry === 'string') {
      gradeName = entry.trim();
    } else if (entry && typeof entry === 'object') {
      gradeName = typeof entry.grade === 'string' ? entry.grade.trim() : '';
      if (!gradeName && typeof entry.name === 'string') {
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
      sections: normalizeStringList(sections, [])
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

module.exports = {
  DEFAULT_CURRICULA,
  DEFAULT_GRADE_LEVELS,
  DEFAULT_GRADE_STRUCTURE,
  normalizeStringList,
  normalizeGradeStructure,
  toSlug
};
