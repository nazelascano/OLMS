const https = require('https');

const PSGC_BASE_URL = process.env.PSGC_API_BASE_URL || 'https://psgc.gitlab.io/api';
const DEFAULT_CACHE_TTL_MS = Number(process.env.PSGC_CACHE_TTL_MS || 1000 * 60 * 60 * 24); // 24 hours

const cache = new Map();

const readJsonResponse = (url) =>
  new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      const { statusCode } = response;
      if (statusCode && statusCode >= 400) {
        response.resume();
        reject(new Error(`PSGC request failed with status ${statusCode}`));
        return;
      }

      response.setEncoding('utf8');
      let rawData = '';
      response.on('data', (chunk) => {
        rawData += chunk;
      });
      response.on('end', () => {
        try {
          const parsedData = JSON.parse(rawData);
          resolve(parsedData);
        } catch (error) {
          reject(new Error(`Failed to parse PSGC response from ${url}: ${error.message}`));
        }
      });
    });

    request.on('error', (error) => {
      reject(new Error(`PSGC request error for ${url}: ${error.message}`));
    });

    request.end();
  });

const fetchJson = async (path) => {
  const trimmedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${PSGC_BASE_URL}${trimmedPath}`;
  return readJsonResponse(url);
};

const withCache = async (key, fetcher, ttlMs = DEFAULT_CACHE_TTL_MS) => {
  const cachedEntry = cache.get(key);
  const now = Date.now();
  if (cachedEntry && cachedEntry.expiresAt > now) {
    return cachedEntry.value;
  }

  const value = await fetcher();
  cache.set(key, {
    value,
    expiresAt: now + ttlMs,
  });
  return value;
};

const projectProvince = (province) => ({
  code: province.code,
  name: province.name,
  regionCode: province.regionCode,
  regionName: province.regionName,
});

const projectMunicipality = (municipality) => ({
  code: municipality.code,
  name: municipality.name,
  oldName: municipality.oldName,
  provinceCode: municipality.provinceCode,
  districtCode: municipality.districtCode,
});

const projectBarangay = (barangay) => ({
  code: barangay.code,
  name: barangay.name,
  oldName: barangay.oldName,
  cityCode: barangay.cityCode,
  municipalityCode: barangay.municipalityCode,
  provinceCode: barangay.provinceCode,
});

const getProvinces = () =>
  withCache('psgc:provinces', async () => {
    const provinces = await fetchJson('/provinces/');
    return provinces.map(projectProvince);
  });

const getMunicipalitiesByProvince = (provinceCode) => {
  if (!provinceCode) {
    return [];
  }
  return withCache(`psgc:province:${provinceCode}:municipalities`, async () => {
    const municipalities = await fetchJson(`/provinces/${provinceCode}/cities-municipalities/`);
    return municipalities.map(projectMunicipality);
  });
};

const getBarangaysByMunicipality = (municipalityCode) => {
  if (!municipalityCode) {
    return [];
  }
  return withCache(`psgc:municipality:${municipalityCode}:barangays`, async () => {
    const barangays = await fetchJson(`/cities-municipalities/${municipalityCode}/barangays/`);
    return barangays.map(projectBarangay);
  });
};

const searchProvinces = async (query) => {
  if (!query) {
    return [];
  }
  const normalized = query.toLowerCase();
  const provinces = await getProvinces();
  return provinces.filter((item) => item.name.toLowerCase().includes(normalized));
};

module.exports = {
  getProvinces,
  getMunicipalitiesByProvince,
  getBarangaysByMunicipality,
  searchProvinces,
};
