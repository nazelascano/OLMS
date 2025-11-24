import { api } from "./api";

const DEFAULT_CACHE_TTL = 1000 * 60 * 60; // 1 hour
const PSGC_BASE_URL = "https://psgc.gitlab.io/api";
const FALLBACK_HTTP_ERROR_CODES = new Set([404, 500, 502, 503, 504]);

const createCacheEntry = (data, ttl = DEFAULT_CACHE_TTL) => ({
  data,
  expiresAt: Date.now() + ttl,
});

const isCacheValid = (entry) => entry && entry.expiresAt > Date.now();

const provinceCache = { entry: null };
const municipalityCache = new Map();
const barangayCache = new Map();

const shouldFallbackToPsgc = (error) => {
  if (!error || !error.response) {
    // Network error or no response details
    return true;
  }

  const status = error.response.status;
  return FALLBACK_HTTP_ERROR_CODES.has(status);
};

const fetchFromPsgc = async (relativePath) => {
  const fetchImpl =
    (typeof window !== "undefined" && window.fetch)
      ? window.fetch.bind(window)
      : typeof fetch !== "undefined"
        ? fetch
        : null;

  if (!fetchImpl) {
    throw new Error("Fetch API is not available in this environment.");
  }

  const response = await fetchImpl(`${PSGC_BASE_URL}${relativePath}`);
  if (!response.ok) {
    throw new Error(`PSGC request failed with status ${response.status}`);
  }
  return response.json();
};

const projectProvince = (province = {}) => ({
  code: province.code,
  name: province.name,
  regionCode: province.regionCode,
  regionName: province.regionName,
});

const projectMunicipality = (municipality = {}) => ({
  code: municipality.code,
  name: municipality.name,
  provinceCode: municipality.provinceCode,
});

const projectBarangay = (barangay = {}) => ({
  code: barangay.code,
  name: barangay.name,
  municipalityCode: barangay.municipalityCode,
});

const loadProvinces = async () => {
  try {
    const response = await api.get("/locations/provinces");
    const { provinces = [] } = response?.data || {};
    return provinces;
  } catch (error) {
    if (!shouldFallbackToPsgc(error)) {
      throw error;
    }
    return fetchFromPsgc("/provinces/");
  }
};

const loadMunicipalities = async (provinceCode) => {
  if (!provinceCode) {
    return [];
  }

  try {
    const response = await api.get(
      `/locations/provinces/${provinceCode}/municipalities`,
    );
    const { municipalities = [] } = response?.data || {};
    return municipalities;
  } catch (error) {
    if (!shouldFallbackToPsgc(error)) {
      throw error;
    }
    return fetchFromPsgc(`/provinces/${provinceCode}/cities-municipalities/`);
  }
};

const loadBarangays = async (municipalityCode) => {
  if (!municipalityCode) {
    return [];
  }

  try {
    const response = await api.get(
      `/locations/municipalities/${municipalityCode}/barangays`,
    );
    const { barangays = [] } = response?.data || {};
    return barangays;
  } catch (error) {
    if (!shouldFallbackToPsgc(error)) {
      throw error;
    }
    return fetchFromPsgc(
      `/cities-municipalities/${municipalityCode}/barangays/`,
    );
  }
};

export const getProvinces = async () => {
  if (isCacheValid(provinceCache.entry)) {
    return provinceCache.entry.data;
  }

  const provinces = await loadProvinces();
  const mapped = provinces.map(projectProvince);
  provinceCache.entry = createCacheEntry(mapped);
  return mapped;
};

export const getMunicipalities = async (provinceCode) => {
  if (!provinceCode) {
    return [];
  }

  const cacheEntry = municipalityCache.get(provinceCode);
  if (isCacheValid(cacheEntry)) {
    return cacheEntry.data;
  }

  const municipalities = await loadMunicipalities(provinceCode);
  const mapped = municipalities.map(projectMunicipality);

  municipalityCache.set(provinceCode, createCacheEntry(mapped));
  return mapped;
};

export const getBarangays = async (municipalityCode) => {
  if (!municipalityCode) {
    return [];
  }

  const cacheEntry = barangayCache.get(municipalityCode);
  if (isCacheValid(cacheEntry)) {
    return cacheEntry.data;
  }

  const barangays = await loadBarangays(municipalityCode);
  const mapped = barangays.map(projectBarangay);

  barangayCache.set(municipalityCode, createCacheEntry(mapped));
  return mapped;
};

export const clearAddressCaches = () => {
  provinceCache.entry = null;
  municipalityCache.clear();
  barangayCache.clear();
};
