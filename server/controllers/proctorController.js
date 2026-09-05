const ProctorViolation = require('../models/ProctorViolation');
const ContestResult = require('../models/ContestResult');
const Contest = require('../models/Contest');
const ApiResponse = require('../utils/apiResponse');
const { cloudinary, isCloudinaryEnabled } = require('../config/cloudinary');

let getIO;
try {
  getIO = require('../socket').getIO;
} catch (error) {
  // Graceful fallback if socket isn't implemented yet
  getIO = null;
}

exports.logViolation = async (req, res, next) => {
  try {
    const { id: contestId } = req.params;
    const studentId = req.user.id;
    const { violationType, confidence, image, questionIndex } = req.body;

    if (!contestId || !image) {
      return ApiResponse.error(res, 'Contest ID and image are required', 400);
    }

    let snapshotUrl = image;
    // Attempt Cloudinary upload if it's base64 and cloudinary is enabled
    if (image.startsWith('data:image') && isCloudinaryEnabled) {
      try {
        const uploadResponse = await cloudinary.uploader.upload(image, {
          folder: 'topkorbo/proctoring',
          resource_type: 'image'
        });
        snapshotUrl = uploadResponse.secure_url;
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        // Keep the complete data URL already in snapshotUrl so evidence remains readable.
      }
    } else if (image.startsWith('data:image')) {
       // If no cloudinary, truncate the base64 or keep it
       snapshotUrl = image; // Keeping it as requested, but might be large
    }

    const violation = await ProctorViolation.create({
      contestId,
      studentId,
      violationType: violationType || 'MOBILE_PHONE_DETECTED',
      confidence,
      snapshotUrl,
      questionIndex: questionIndex || 0
    });

    const totalViolations = await ProctorViolation.countDocuments({ contestId, studentId });

    if (totalViolations >= 3) {
      await ContestResult.findOneAndUpdate(
        { contest: contestId, student: studentId },
        { 
          antiCheatStatus: 'flagged',
          antiCheatReason: `AI proctor: ${violation.violationType} detected ${totalViolations} times`
        }
      );
    }

    if (getIO) {
      try {
        const io = getIO();
        io.to(`contest:${contestId}`).emit('proctor:violation', {
          studentId,
          violationType: violation.violationType,
          confidence,
          timestamp: violation.timestamp,
          totalViolations
        });
      } catch (ioError) {
        console.error('Socket IO error:', ioError);
      }
    }

    return ApiResponse.success(res, {
      violationId: violation._id,
      totalViolations
    }, 'Violation logged successfully');
  } catch (error) {
    next(error);
  }
};

exports.getViolations = async (req, res, next) => {
  try {
    const { id: contestId } = req.params;
    const { page = 1, limit = 20, studentId } = req.query;

    // Authorization (OWASP API #1 — Broken Object Level Authorization): only an
    // admin or the teacher who created this contest may read its snapshots.
    const isAdmin = req.user.forumRole === 'admin';
    if (!isAdmin) {
      const contest = await Contest.findById(contestId).select('creator').lean();
      if (!contest || String(contest.creator) !== String(req.user.id)) {
        return ApiResponse.error(res, 'You are not authorized to view these violations', 403);
      }
    }

    const query = { contestId };
    if (studentId) {
      query.studentId = studentId;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const violations = await ProctorViolation.find(query)
      .populate('studentId', 'name email')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProctorViolation.countDocuments(query);
    const totalPages = Math.ceil(total / limit);

    return ApiResponse.success(res, {
      items: violations,
      pagination: {
        page: parseInt(page),
        totalPages,
        total
      }
    }, 'Violations retrieved successfully');
  } catch (error) {
    next(error);
  }
};

exports.reviewViolation = async (req, res, next) => {
  try {
    const { violationId } = req.params;
    const { status, reviewNote } = req.body;
    const reviewerId = req.user.id;

    if (!['confirmed_cheating', 'dismissed_false_positive'].includes(status)) {
      return ApiResponse.error(res, 'Invalid status', 400);
    }

    const violation = await ProctorViolation.findById(violationId);
    if (!violation) {
      return ApiResponse.error(res, 'Violation not found', 404);
    }

    // Authorization (OWASP API #1/#5): only an admin or the teacher who created
    // the contest may review — and confirming disqualifies the student.
    const isAdmin = req.user.forumRole === 'admin';
    if (!isAdmin) {
      const contest = await Contest.findById(violation.contestId).select('creator').lean();
      if (!contest || String(contest.creator) !== String(reviewerId)) {
        return ApiResponse.error(res, 'You are not authorized to review this violation', 403);
      }
    }

    violation.status = status;
    violation.reviewNote = reviewNote || '';
    violation.reviewedBy = reviewerId;
    await violation.save();

    if (status === 'confirmed_cheating') {
      await ContestResult.findOneAndUpdate(
        { contest: violation.contestId, student: violation.studentId },
        {
          isDisqualified: true,
          disqualificationReason: 'Confirmed cheating: mobile phone detected during exam',
          antiCheatStatus: 'flagged'
        }
      );
    }

    return ApiResponse.success(res, violation, 'Violation reviewed successfully');
  } catch (error) {
    next(error);
  }
};

// Return every proctor violation across the contests the requesting teacher owns
// (admins are unscoped). Powers the teacher "Cheating Verify" review page.
exports.getMyContestViolations = async (req, res, next) => {
  try {
    const isAdmin = req.user.forumRole === 'admin';
    const isTeacher = req.user.role === 'teacher';
    if (!isTeacher && !isAdmin) {
      return ApiResponse.error(res, 'Only teachers can view proctoring records', 403);
    }

    const { page = 1, limit = 50, status, contestId, studentId } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const VALID_STATUSES = ['pending_review', 'confirmed_cheating', 'dismissed_false_positive'];

    // Scope strictly to the teacher's own contests (OWASP API #1). Admins are unscoped.
    const contestFilter = isAdmin ? {} : { creator: req.user.id };
    const ownedContests = await Contest.find(contestFilter)
      .select('_id name level admissionType date startTime duration totalMarks totalQuestions createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean();

    if (!isAdmin && ownedContests.length === 0) {
      return ApiResponse.success(res, {
        items: [],
        contests: [],
        summary: { totalContests: 0, totalViolations: 0, pending: 0, confirmed: 0, dismissed: 0, flaggedStudents: 0 },
        pagination: { page: 1, totalPages: 0, total: 0 }
      }, 'No contests found');
    }

    const ownedContestIds = ownedContests.map(c => c._id);

    // Compute aggregated stats for each owned contest
    const contestStatsAgg = await ProctorViolation.aggregate([
      { $match: { contestId: { $in: ownedContestIds } } },
      {
        $group: {
          _id: '$contestId',
          totalViolations: { $sum: 1 },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'pending_review'] }, 1, 0] }
          },
          confirmedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'confirmed_cheating'] }, 1, 0] }
          },
          dismissedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'dismissed_false_positive'] }, 1, 0] }
          },
          flaggedStudents: { $addToSet: '$studentId' },
          latestTimestamp: { $max: '$timestamp' }
        }
      }
    ]);

    const statsMap = {};
    let globalPending = 0;
    let globalConfirmed = 0;
    let globalDismissed = 0;
    let globalViolations = 0;
    const globalStudentSet = new Set();

    contestStatsAgg.forEach(stat => {
      const cId = String(stat._id);
      const studentCount = (stat.flaggedStudents || []).length;
      statsMap[cId] = {
        totalViolations: stat.totalViolations || 0,
        pendingCount: stat.pendingCount || 0,
        confirmedCount: stat.confirmedCount || 0,
        dismissedCount: stat.dismissedCount || 0,
        flaggedStudentsCount: studentCount,
        latestTimestamp: stat.latestTimestamp || null
      };

      globalViolations += stat.totalViolations || 0;
      globalPending += stat.pendingCount || 0;
      globalConfirmed += stat.confirmedCount || 0;
      globalDismissed += stat.dismissedCount || 0;
      (stat.flaggedStudents || []).forEach(s => globalStudentSet.add(String(s)));
    });

    const enrichedContests = ownedContests.map(c => {
      const stats = statsMap[String(c._id)] || {
        totalViolations: 0,
        pendingCount: 0,
        confirmedCount: 0,
        dismissedCount: 0,
        flaggedStudentsCount: 0,
        latestTimestamp: null
      };
      return {
        ...c,
        stats
      };
    });

    const query = {};
    if (contestId) {
      const owns = ownedContests.some(c => String(c._id) === String(contestId));
      if (!isAdmin && !owns) {
        return ApiResponse.error(res, 'You are not authorized for this contest', 403);
      }
      query.contestId = contestId;
    } else if (!isAdmin) {
      query.contestId = { $in: ownedContestIds };
    }

    if (studentId) {
      query.studentId = studentId;
    }

    if (status && VALID_STATUSES.includes(status)) {
      query.status = status;
    }

    const [items, total] = await Promise.all([
      ProctorViolation.find(query)
        .populate('studentId', 'name email avatar')
        .populate('contestId', 'name level admissionType date')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      ProctorViolation.countDocuments(query)
    ]);

    return ApiResponse.success(res, {
      items,
      contests: enrichedContests,
      summary: {
        totalContests: ownedContests.length,
        totalViolations: globalViolations,
        pending: globalPending,
        confirmed: globalConfirmed,
        dismissed: globalDismissed,
        flaggedStudents: globalStudentSet.size
      },
      pagination: {
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        total
      }
    }, 'Violations retrieved successfully');
  } catch (error) {
    next(error);
  }
};

// Batch review all violations for a student in a specific contest (admin/teacher)
exports.reviewStudentContestViolations = async (req, res, next) => {
  try {
    const { id: contestId, studentId } = req.params;
    const { status, reviewNote } = req.body;
    const reviewerId = req.user.id;

    if (!['confirmed_cheating', 'dismissed_false_positive'].includes(status)) {
      return ApiResponse.error(res, 'Invalid status', 400);
    }

    const isAdmin = req.user.forumRole === 'admin';
    if (!isAdmin) {
      const contest = await Contest.findById(contestId).select('creator').lean();
      if (!contest || String(contest.creator) !== String(reviewerId)) {
        return ApiResponse.error(res, 'You are not authorized to review violations for this contest', 403);
      }
    }

    const updateResult = await ProctorViolation.updateMany(
      { contestId, studentId },
      {
        $set: {
          status,
          reviewNote: reviewNote || '',
          reviewedBy: reviewerId
        }
      }
    );

    if (status === 'confirmed_cheating') {
      await ContestResult.findOneAndUpdate(
        { contest: contestId, student: studentId },
        {
          isDisqualified: true,
          disqualificationReason: 'Confirmed cheating: mobile phone detected during exam',
          antiCheatStatus: 'flagged'
        }
      );
    } else if (status === 'dismissed_false_positive') {
      // If all violations are dismissed, restore candidate status unless there are other flags
      const remainingFlags = await ProctorViolation.countDocuments({
        contestId,
        studentId,
        status: { $ne: 'dismissed_false_positive' }
      });
      if (remainingFlags === 0) {
        await ContestResult.findOneAndUpdate(
          { contest: contestId, student: studentId },
          {
            isDisqualified: false,
            disqualificationReason: '',
            antiCheatStatus: 'clean'
          }
        );
      }
    }

    return ApiResponse.success(res, {
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
      status
    }, 'Student violations reviewed successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Delete all proctor violations for a student in a specific contest (admin/teacher)
exports.deleteStudentContestViolations = async (req, res, next) => {
  try {
    const { id: contestId, studentId } = req.params;
    const userId = req.user.id;

    const isAdmin = req.user.forumRole === 'admin' || req.user.role === 'admin';
    if (!isAdmin) {
      const contest = await Contest.findById(contestId).select('creator').lean();
      if (!contest || String(contest.creator) !== String(userId)) {
        return ApiResponse.error(res, 'You are not authorized to delete violations for this contest', 403);
      }
    }

    const deleteResult = await ProctorViolation.deleteMany({ contestId, studentId });

    // Reset ContestResult antiCheat status if previously flagged
    await ContestResult.findOneAndUpdate(
      { contest: contestId, student: studentId },
      {
        $set: {
          isDisqualified: false,
          disqualificationReason: '',
          antiCheatStatus: 'none',
          antiCheatReason: ''
        }
      }
    );

    return ApiResponse.success(res, {
      deletedCount: deleteResult.deletedCount,
      contestId,
      studentId
    }, 'Student proctoring records deleted successfully');
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a single proctor violation (admin/teacher)
exports.deleteViolation = async (req, res, next) => {
  try {
    const { violationId } = req.params;
    const userId = req.user.id;

    const violation = await ProctorViolation.findById(violationId);
    if (!violation) {
      return ApiResponse.error(res, 'Violation not found', 404);
    }

    const isAdmin = req.user.forumRole === 'admin' || req.user.role === 'admin';
    if (!isAdmin) {
      const contest = await Contest.findById(violation.contestId).select('creator').lean();
      if (!contest || String(contest.creator) !== String(userId)) {
        return ApiResponse.error(res, 'You are not authorized to delete this violation', 403);
      }
    }

    const contestId = violation.contestId;
    const studentId = violation.studentId;

    await ProctorViolation.findByIdAndDelete(violationId);

    // If no violations remain for this student in this contest, clean up ContestResult
    const remainingCount = await ProctorViolation.countDocuments({ contestId, studentId });
    if (remainingCount === 0) {
      await ContestResult.findOneAndUpdate(
        { contest: contestId, student: studentId },
        {
          $set: {
            isDisqualified: false,
            disqualificationReason: '',
            antiCheatStatus: 'none',
            antiCheatReason: ''
          }
        }
      );
    }

    return ApiResponse.success(res, {
      deletedViolationId: violationId,
      remainingCount
    }, 'Violation deleted successfully');
  } catch (error) {
    next(error);
  }
};
