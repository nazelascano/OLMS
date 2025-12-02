import {
  DEFAULT_GRADE_LEVELS,
  DEFAULT_GRADE_STRUCTURE,
  normalizeGradeStructure,
  getSectionsForGrade,
  collectAllSections,
  ensureUserAttributes,
} from "../userAttributes";

describe("normalizeGradeStructure", () => {
  it("normalizes strings, objects, and section lists while removing duplicates", () => {
    const raw = [
      "Grade 7",
      { grade: "Grade 8", sections: ["Alpha", "alpha", " Beta "] },
      { name: "Grade 9", sectionList: ["Gamma", "", "Gamma", "Delta"] },
      { grade: "grade 7", sections: ["Zeta"] },
      null,
      42,
    ];

    const normalized = normalizeGradeStructure(raw);

    expect(normalized).toHaveLength(3);
    expect(normalized[0]).toMatchObject({ grade: "Grade 7", sections: [] });
    expect(normalized[1]).toMatchObject({ grade: "Grade 8", sections: ["Alpha", "alpha", "Beta"] });
    expect(normalized[2]).toMatchObject({ grade: "Grade 9", sections: ["Gamma", "Delta"] });
    normalized.forEach((entry) => {
      expect(entry.color).toMatch(/^#[0-9A-F]{6}$/);
    });
  });

  it("returns fallback copy when input is empty", () => {
    const fallback = [
      { grade: "Special Grade", sections: ["S1"] },
      { grade: "Special Grade 2", sections: [] },
    ];

    const normalized = normalizeGradeStructure([], fallback);

    expect(normalized).toHaveLength(2);
    normalized.forEach((entry, index) => {
      expect(entry).toMatchObject({ grade: fallback[index].grade, sections: fallback[index].sections });
      expect(entry.color).toMatch(/^#[0-9A-F]{6}$/);
    });
    expect(normalized).not.toBe(fallback);
  });

  it("allows returning an empty list when requested", () => {
    const normalized = normalizeGradeStructure([], DEFAULT_GRADE_STRUCTURE, {
      useFallbackWhenEmpty: false,
    });

    expect(normalized).toEqual([]);
  });
});

describe("getSectionsForGrade", () => {
  const structure = [
    { grade: "Grade 11", sections: ["STEM-A", "STEM-B"] },
    { grade: "Grade 12", sections: ["ABM-A"] },
  ];

  it("matches grade names case-insensitively", () => {
    expect(getSectionsForGrade(structure, "grade 11")).toEqual(["STEM-A", "STEM-B"]);
    expect(getSectionsForGrade(structure, "GRADE 12")).toEqual(["ABM-A"]);
  });

  it("falls back to empty array when grade missing", () => {
    expect(getSectionsForGrade(structure, "Grade 10")).toEqual([]);
    expect(getSectionsForGrade(structure, "")).toEqual([]);
    expect(getSectionsForGrade(null, "Grade 11")).toEqual([]);
  });
});

describe("collectAllSections", () => {
  it("collects unique, trimmed sections across the structure", () => {
    const gradeStructure = [
      { grade: "Grade 7", sections: ["Alpha", "Beta"] },
      { grade: "Grade 8", sections: [" Beta ", "Gamma"] },
      { grade: "Grade 9", sections: ["gamma", "delta", ""] },
    ];

    expect(collectAllSections(gradeStructure)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
      "gamma",
      "delta",
    ]);
  });
});

describe("ensureUserAttributes", () => {
  it("derives gradeLevels from the normalized gradeStructure when not provided", () => {
    const attributes = {
      gradeStructure: [
        { grade: "Grade X", sections: ["Section 1"] },
        { grade: "Grade Y", sections: [] },
      ],
      curriculum: ["STEM"],
    };

    const result = ensureUserAttributes(attributes);

    expect(result.gradeStructure).toHaveLength(2);
    expect(result.gradeStructure[0]).toMatchObject({ grade: "Grade X", sections: ["Section 1"] });
    expect(result.gradeStructure[1]).toMatchObject({ grade: "Grade Y", sections: [] });
    result.gradeStructure.forEach((entry) => {
      expect(entry.color).toMatch(/^#[0-9A-F]{6}$/);
    });
    expect(result.gradeLevels).toEqual(["Grade X", "Grade Y"]);
    expect(result.curriculum).toEqual(["STEM"]);
  });

  it("falls back to defaults when nothing is provided", () => {
    const result = ensureUserAttributes();

    expect(result.gradeStructure).toEqual(DEFAULT_GRADE_STRUCTURE);
    expect(result.gradeLevels).toEqual(DEFAULT_GRADE_LEVELS);
    expect(result.curriculum.length).toBeGreaterThan(0);
  });
});
