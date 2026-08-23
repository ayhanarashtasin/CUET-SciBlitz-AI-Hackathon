const express = require('express');
const auth = require('../middleware/auth');
const mentorController = require('../controllers/mentorController');
const { classUploadMiddleware } = require('../middleware/classUpload');
const { uploadLimiter, writeLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

router.get('/mentors', auth, mentorController.listMentors);
router.get('/mentors/:mentorId', auth, mentorController.getMentorProfile);
router.post('/mentors/:mentorId/reviews', auth, writeLimiter, mentorController.submitMentorReview);
router.get('/student-dashboard', auth, mentorController.studentDashboard);
router.get('/mentor-dashboard', auth, mentorController.mentorDashboard);

// Student Dossier routes (supporting both plural and singular)
router.get('/students/:studentId/dossier', auth, mentorController.getStudentDossier);
router.get('/student/:studentId/dossier', auth, mentorController.getStudentDossier);
router.get('/students/:studentId/full-profile', auth, mentorController.getStudentDossier);
router.get('/student/:studentId/full-profile', auth, mentorController.getStudentDossier);
router.get('/dossier/:studentId', auth, mentorController.getStudentDossier);

// Notes routes
router.get('/students/:studentId/notes', auth, mentorController.getStudentNotes);
router.get('/student/:studentId/notes', auth, mentorController.getStudentNotes);
router.post('/students/:studentId/notes', auth, writeLimiter, mentorController.saveStudentNote);
router.post('/student/:studentId/notes', auth, writeLimiter, mentorController.saveStudentNote);
router.patch('/notes/:noteId', auth, writeLimiter, mentorController.updateStudentNote);
router.delete('/notes/:noteId', auth, writeLimiter, mentorController.deleteStudentNote);

// My Class — the student's classroom feed and assignment hand-in flow.
router.get('/my-class', auth, mentorController.myClass);
router.post('/assignments/:noteId/submit', auth, writeLimiter, mentorController.submitAssignment);
router.post('/assignments/:noteId/unsubmit', auth, writeLimiter, mentorController.unsubmitAssignment);

// The mentor's side of the same loop: review what students handed in.
router.get('/submissions', auth, mentorController.listSubmissions);
router.post('/assignments/:noteId/review', auth, writeLimiter, mentorController.reviewAssignment);

// File Upload for Announcements, Homework, and Classwork (PDF & Images).
// `uploadLimiter` matters more here than on most routes: multer buffers the
// whole 25 MB in memory before it ever reaches the handler, so an unthrottled
// caller can turn this endpoint into a heap-pressure lever on its own.
router.post(
  '/upload',
  auth,
  uploadLimiter,
  classUploadMiddleware.single('file'),
  mentorController.uploadAttachment
);

// Announcements & Requests
router.post('/announcements', auth, writeLimiter, mentorController.postAnnouncement);
router.post('/requests', auth, writeLimiter, mentorController.requestMentor);
router.patch('/requests/:connectionId', auth, writeLimiter, mentorController.respondToRequest);

module.exports = router;
