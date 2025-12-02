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

const DEFAULT_GRADE_COLORS = [
  '#C62828', // red
  '#AD1457', // pink
  '#6A1B9A', // purple
  '#4527A0', // deep purple
  '#283593', // indigo
  '#1565C0', // blue
  '#0277BD', // light blue
  '#00838F', // cyan
  '#00695C', // teal
  '#2E7D32', // green
  '#558B2F'  // light green
];

const DEFAULT_GRADE_COLOR = DEFAULT_GRADE_COLORS[0];

const getDefaultColorForIndex = (index = 0) => (
  DEFAULT_GRADE_COLORS[index % DEFAULT_GRADE_COLORS.length] || DEFAULT_GRADE_COLOR
);

const DEFAULT_GRADE_STRUCTURE = DEFAULT_GRADE_LEVELS.map((grade, index) => ({
  grade,
  sections: [],
  color: getDefaultColorForIndex(index)
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

const sanitizeHexColor = (value, fallback = DEFAULT_GRADE_COLOR) => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().replace(/^#/u, '').toUpperCase();
  if (/^[0-9A-F]{6}$/u.test(normalized)) {
    return `#${normalized}`;
  }

  return fallback;
};

const normalizeGradeStructure = (input, fallback = DEFAULT_GRADE_STRUCTURE, { useFallbackWhenEmpty = true } = {}) => {
  const source = Array.isArray(input) ? input : [];
  const normalized = [];
  const seenGrades = new Set();
  const fallbackColorMap = new Map();

  (Array.isArray(fallback) ? fallback : []).forEach((entry = {}, index) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const key = typeof entry.grade === 'string' ? entry.grade.trim().toLowerCase() : '';
    if (!key) {
      return;
    }
    fallbackColorMap.set(key, sanitizeHexColor(entry.color, getDefaultColorForIndex(index)));
  });

  source.forEach((entry) => {
    let gradeName = '';
    let sections = [];
    let rawColor = '';

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
      if (typeof entry.color === 'string') {
        rawColor = entry.color;
      } else if (typeof entry.barColor === 'string') {
        rawColor = entry.barColor;
      } else if (typeof entry.stripeColor === 'string') {
        rawColor = entry.stripeColor;
      }
    }

    if (!gradeName || seenGrades.has(gradeName.toLowerCase())) {
      return;
    }

    const gradeKey = gradeName.toLowerCase();
    const normalizedColor = sanitizeHexColor(
      rawColor,
      fallbackColorMap.get(gradeKey) || getDefaultColorForIndex(normalized.length)
    );

    normalized.push({
      grade: gradeName,
      sections: normalizeStringList(sections, []),
      color: normalizedColor
    });
    seenGrades.add(gradeKey);
    fallbackColorMap.set(gradeKey, normalizedColor);
  });

  if (normalized.length === 0) {
    if (useFallbackWhenEmpty && Array.isArray(fallback) && fallback.length > 0) {
      return fallback.map((entry = {}, index) => ({
        grade: entry.grade,
        sections: Array.isArray(entry.sections) ? [...entry.sections] : [],
        color: sanitizeHexColor(entry.color, getDefaultColorForIndex(index))
      }));
    }
    return [];
  }

  return normalized;
};

module.exports = {
  DEFAULT_CURRICULA,
  DEFAULT_GRADE_LEVELS,
  DEFAULT_GRADE_STRUCTURE,
  DEFAULT_GRADE_COLORS,
  DEFAULT_GRADE_COLOR,
  normalizeStringList,
  normalizeGradeStructure,
  sanitizeHexColor,
  toSlug
};
