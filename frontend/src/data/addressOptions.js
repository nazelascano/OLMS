const CUSTOM_FALLBACK = "Other / Not Listed";

const NCR_MUNICIPALITIES = [
  {
    name: "Quezon City",
    barangays: [
      "Alicia",
      "Bagong Pag-asa",
      "Bagumbayan",
      "Batasan Hills",
      "Bayanihan",
      "Commonwealth",
      "Fairview",
      "Novaliches",
      "Project 4",
      "Project 6",
      "San Bartolome",
      "Santol",
      "Sauyo",
      "Santo Domingo",
      "Teachers Village",
      "UP Campus",
      CUSTOM_FALLBACK,
    ],
  },
  {
    name: "Manila",
    barangays: [
      "Barangay 1",
      "Barangay 2",
      "Ermita",
      "Malate",
      "Paco",
      "Pandacan",
      "Port Area",
      "Quiapo",
      "Sampaloc",
      "San Andres",
      "San Miguel",
      "Santa Ana",
      "Santa Cruz",
      "Tondo",
      CUSTOM_FALLBACK,
    ],
  },
  {
    name: "Marikina City",
    barangays: [
      "Barangka",
      "Concepcion Uno",
      "Concepcion Dos",
      "Fortune",
      "Industrial Valley",
      "Malanday",
      "Marikina Heights",
      "Nangka",
      "Parang",
      "Tumana",
      CUSTOM_FALLBACK,
    ],
  },
];

const ROMBLON_MUNICIPALITIES = [
  {
    name: "Odiongan",
    barangays: [
      "Anahao",
      "Anilao",
      "Amatong",
      "Batiano",
      "Cagbo-aya",
      "Canduyong",
      "Dao",
      "Dapawan",
      "Gabawan",
      "Ligaya",
      "Libertad",
      "Liwanag",
      "Mabini",
      "Malilico",
      "Pajo",
      "Panique",
      "Patoo",
      "Poctoy",
      "Rizal",
      "Tabin-dagat",
      "Talcogon",
      "Tuguis",
      "Tulay",
      "Tumingad",
      "Victoria",
      CUSTOM_FALLBACK,
    ],
  },
  {
    name: "Calatrava",
    barangays: [
      "Balogo",
      "Balalit",
      "Lenasing",
      "Linao",
      "Palian",
      "Punta",
      "San Roque",
      "Talisay",
      CUSTOM_FALLBACK,
    ],
  },
];

export const ADDRESS_HIERARCHY = [
  {
    province: "Romblon",
    municipalities: ROMBLON_MUNICIPALITIES,
  },
  {
    province: "Metro Manila",
    municipalities: NCR_MUNICIPALITIES,
  },
  {
    province: "Philippines",
    municipalities: NCR_MUNICIPALITIES,
  },
];

const normalize = (value = "") => value.toLowerCase().replace(/\s+/g, " ").trim();
const findProvinceEntry = (province) =>
  ADDRESS_HIERARCHY.find(
    (entry) => normalize(entry.province) === normalize(province),
  );

const findMunicipalityEntry = (province, municipality) => {
  const provinceEntry = findProvinceEntry(province);
  return provinceEntry?.municipalities?.find(
    (item) => normalize(item.name) === normalize(municipality),
  );
};

export const getProvinceOptions = () =>
  ADDRESS_HIERARCHY.map((entry) => entry.province);

export const getMunicipalityOptions = (province) => {
  const provinceEntry = findProvinceEntry(province);
  return provinceEntry?.municipalities?.map((item) => item.name) || [];
};

export const getBarangayOptions = (province, municipality) => {
  const municipalityEntry = findMunicipalityEntry(province, municipality);
  return municipalityEntry?.barangays || [];
};

const buildPatternVariants = (segments) => {
  const cleaned = segments
    .filter(Boolean)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (cleaned.length === 0) {
    return [];
  }

  const base = cleaned.join(", ");
  const noComma = cleaned.join(" ");

  return [base, noComma, cleaned.join(","), cleaned.join(" , "), cleaned.join(" ,")];
};

const stripAddressTail = (value, segments) => {
  if (!value) {
    return "";
  }

  const lowerValue = value.toLowerCase();
  const variants = buildPatternVariants(segments);

  for (const variant of variants) {
    const trimmedVariant = variant.trim();
    if (!trimmedVariant) {
      continue;
    }

    const idx = lowerValue.lastIndexOf(trimmedVariant.toLowerCase());
    if (idx !== -1) {
      return value.slice(0, idx).replace(/[\s,]+$/g, "").trim();
    }
  }

  return value.trim();
};

export const composeFullAddress = ({
  street = "",
  barangay = "",
  municipality = "",
  province = "",
} = {}) => {
  const segments = [street, barangay, municipality, province]
    .map((segment) => segment?.trim())
    .filter(Boolean);
  return segments.join(", ");
};

export const resolveAddressComponents = (rawAddress = "") => {
  const normalizedAddress = normalize(rawAddress);

  for (const provinceEntry of ADDRESS_HIERARCHY) {
    const provinceLabel = provinceEntry.province;
    const provinceMatch = normalize(provinceLabel);
    if (provinceMatch && !normalizedAddress.includes(provinceMatch)) {
      continue;
    }

    for (const municipality of provinceEntry.municipalities) {
      const municipalityMatch = normalize(municipality.name);
      if (
        municipalityMatch &&
        !normalizedAddress.includes(municipalityMatch)
      ) {
        continue;
      }

      for (const barangay of municipality.barangays) {
        if (barangay === CUSTOM_FALLBACK) {
          continue;
        }
        const barangayMatch = normalize(barangay);
        if (barangayMatch && !normalizedAddress.includes(barangayMatch)) {
          continue;
        }

        const street = stripAddressTail(rawAddress, [
          barangay,
          municipality.name,
          provinceLabel,
        ]);

        return {
          province: provinceLabel,
          municipality: municipality.name,
          barangay,
          street,
        };
      }
    }
  }

  return {
    province: "",
    municipality: "",
    barangay: "",
    street: rawAddress.trim(),
  };
};

export const ensureAddressValue = (value) => value || "";
export const ADDRESS_FALLBACK_LABEL = CUSTOM_FALLBACK;
export const addressHasOptions = (province) =>
  Boolean(getMunicipalityOptions(province).length);
export const municipalityHasOptions = (province, municipality) =>
  Boolean(getBarangayOptions(province, municipality).length);

export const getAllBarangays = () => {
  const barangays = [];
  ADDRESS_HIERARCHY.forEach((provinceEntry) => {
    provinceEntry.municipalities.forEach((municipality) => {
      municipality.barangays.forEach((barangay) => {
        if (barangay !== CUSTOM_FALLBACK) {
          barangays.push(barangay);
        }
      });
    });
  });
  return Array.from(new Set(barangays));
};
