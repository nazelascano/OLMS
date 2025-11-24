const express = require('express');
const {
  verifyToken,
  requireStaff,
} = require('../middleware/customAuth');
const {
  getProvinces,
  getMunicipalitiesByProvince,
  getBarangaysByMunicipality,
} = require('../utils/psgcClient');

const router = express.Router();

const handleError = (res, error, fallbackMessage) => {
  console.error('[Locations API]', error.message);
  res.status(502).json({ message: fallbackMessage });
};

router.get('/provinces', verifyToken, requireStaff, async (req, res) => {
  try {
    const provinces = await getProvinces();
    const query = (req.query.q || '').toLowerCase().trim();
    const filtered = query
      ? provinces.filter((province) =>
          province.name.toLowerCase().includes(query),
        )
      : provinces;

    res.json({ provinces: filtered });
  } catch (error) {
    handleError(res, error, 'Failed to load provinces from PSGC');
  }
});

router.get(
  '/provinces/:provinceCode/municipalities',
  verifyToken,
  requireStaff,
  async (req, res) => {
    try {
      const { provinceCode } = req.params;
      if (!provinceCode) {
        return res.status(400).json({ message: 'provinceCode is required' });
      }

      const municipalities = await getMunicipalitiesByProvince(provinceCode);
      const query = (req.query.q || '').toLowerCase().trim();
      const filtered = query
        ? municipalities.filter((municipality) =>
            municipality.name.toLowerCase().includes(query),
          )
        : municipalities;

      res.json({ municipalities: filtered });
    } catch (error) {
      handleError(
        res,
        error,
        'Failed to load municipalities for the selected province',
      );
    }
  },
);

router.get(
  '/municipalities/:municipalityCode/barangays',
  verifyToken,
  requireStaff,
  async (req, res) => {
    try {
      const { municipalityCode } = req.params;
      if (!municipalityCode) {
        return res.status(400).json({ message: 'municipalityCode is required' });
      }

      const barangays = await getBarangaysByMunicipality(municipalityCode);
      const query = (req.query.q || '').toLowerCase().trim();
      const filtered = query
        ? barangays.filter((barangay) =>
            barangay.name.toLowerCase().includes(query),
          )
        : barangays;

      res.json({ barangays: filtered });
    } catch (error) {
      handleError(res, error, 'Failed to load barangays for the municipality');
    }
  },
);

module.exports = router;
