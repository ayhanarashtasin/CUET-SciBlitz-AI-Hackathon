const express = require('express');
const router = express.Router();
const landingController = require('../controllers/landingController');
const { waitlistLimiter } = require('../middleware/rateLimiters');

router.post('/waitlist', waitlistLimiter, landingController.joinWaitlist);
router.get('/stats', landingController.getStats);

module.exports = router;
