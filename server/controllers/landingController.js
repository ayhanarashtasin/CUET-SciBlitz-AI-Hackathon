const WaitlistEntry = require('../models/WaitlistEntry');
const ApiResponse = require('../utils/apiResponse');

/**
 * Landing page controller — handles waitlist signups and stats
 */
const landingController = {
  /**
   * POST /api/landing/waitlist
   * Save an early-access signup
   */
  joinWaitlist: async (req, res, next) => {
    try {
      const { name, email, phone, targetExam, language, website_hp } = req.body;

      // Honeypot bot protection: if hidden field is filled, silently succeed
      if (website_hp) {
        return ApiResponse.success(res, null, "Welcome to TopKorbo! You're on the list 🎉", 201);
      }

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
        return ApiResponse.error(res, 'Please provide a valid email address.', 400);
      }

      const trimmedName = typeof name === 'string' ? name.trim().slice(0, 100) : '';
      const trimmedEmail = String(email).trim().toLowerCase().slice(0, 120);
      const trimmedPhone = typeof phone === 'string' ? phone.trim().slice(0, 20) : '';

      const entry = await WaitlistEntry.create({
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        targetExam: typeof targetExam === 'string' ? targetExam.slice(0, 50) : '',
        language: language === 'bn' ? 'bn' : 'en'
      });

      return ApiResponse.success(res, entry, "Welcome to TopKorbo! You're on the list 🎉", 201);
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/landing/stats
   * Return platform statistics (cached at edge and browser)
   */
  getStats: async (req, res) => {
    res.set('Cache-Control', 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600');
    const stats = {
      students: 52480,
      questions: 128750,
      contests: 1240,
      mentors: 385
    };
    return ApiResponse.success(res, stats, 'Platform stats retrieved');
  }
};

module.exports = landingController;
