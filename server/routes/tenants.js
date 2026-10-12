const router = require('express').Router();
const Tenant = require('../models/Tenant');
const asyncHandler = require('../utils/asyncHandler');

router.get(
  '/public',
  asyncHandler(async (req, res) => {
    const tenants = await Tenant.find({ active: true }).select('title slug').sort({ title: 1 }).lean();
    res.json(tenants);
  })
);

module.exports = router;
