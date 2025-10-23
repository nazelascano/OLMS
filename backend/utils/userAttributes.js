const DEFAULT_DEPARTMENTS = [
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

module.exports = {
  DEFAULT_DEPARTMENTS,
  DEFAULT_GRADE_LEVELS,
  normalizeStringList,
  toSlug
};
