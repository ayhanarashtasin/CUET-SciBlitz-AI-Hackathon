jest.mock('../config/cloudinary', () => ({
  isCloudinaryEnabled: true,
  cloudinary: { uploader: { upload: jest.fn() } }
}));
jest.mock('../socket', () => ({ getIO: null }));

const ProctorViolation = require('../models/ProctorViolation');
const { cloudinary } = require('../config/cloudinary');
const { logViolation } = require('./proctorController');

afterEach(() => jest.restoreAllMocks());

test('preserves complete screenshot evidence when Cloudinary upload fails', async () => {
  const image = `data:image/jpeg;base64,${'abcd'.repeat(1000)}`;
  cloudinary.uploader.upload.mockRejectedValue(new Error('Upload unavailable'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const create = jest.spyOn(ProctorViolation, 'create').mockResolvedValue({ _id: 'violation' });
  jest.spyOn(ProctorViolation, 'countDocuments').mockResolvedValue(1);
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();

  await logViolation({ params: { id: 'contest' }, user: { id: 'student' }, body: { image, confidence: 80 } }, res, next);

  expect(create).toHaveBeenCalledWith(expect.objectContaining({ snapshotUrl: image }));
  expect(res.status).toHaveBeenCalledWith(200);
  expect(next).not.toHaveBeenCalled();
});
