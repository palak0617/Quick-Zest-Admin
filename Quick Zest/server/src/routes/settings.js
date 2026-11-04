const router = require('express').Router();
const { ah, getSettings, pick } = require('../utils/helpers');

router.get(
  '/',
  ah(async (req, res) => res.json({ settings: await getSettings() }))
);

router.put(
  '/',
  ah(async (req, res) => {
    const s = await getSettings();
    const data = pick(req.body, ['businessName', 'currency', 'openingBalance', 'orderPrefix']);
    if (data.openingBalance !== undefined) data.openingBalance = Number(data.openingBalance) || 0;
    Object.assign(s, data);
    await s.save();
    res.json({ settings: s });
  })
);

module.exports = router;
