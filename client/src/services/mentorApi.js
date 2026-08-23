import httpClient from './httpClient';

export async function fetchMentors(options = {}) {
  const params = new URLSearchParams();
  if (options.sort) params.set('sort', options.sort);
  if (options.university) params.set('university', options.university);
  const query = params.toString();
  return httpClient.request(`/mentor-connections/mentors${query ? `?${query}` : ''}`);
}

export async function fetchMentorProfile(mentorId) {
  return httpClient.request(`/mentor-connections/mentors/${mentorId}`);
}

export async function fetchStudentMentorDashboard() {
  return httpClient.request('/mentor-connections/student-dashboard');
}

export async function fetchMentorDashboard() {
  return httpClient.request('/mentor-connections/mentor-dashboard');
}

export async function sendMentorRequest(mentorId) {
  return httpClient.request('/mentor-connections/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mentorId })
  });
}

export async function submitMentorReview(mentorId, payload) {
  return httpClient.request(`/mentor-connections/mentors/${mentorId}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function respondToMentorRequest(connectionId, action) {
  return httpClient.request(`/mentor-connections/requests/${connectionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  });
}

export async function fetchStudentDossier(studentId) {
  return httpClient.request(`/mentor-connections/students/${studentId}/dossier`);
}

export async function fetchStudentNotes(studentId) {
  return httpClient.request(`/mentor-connections/students/${studentId}/notes`);
}

export async function saveStudentNote(studentId, payload) {
  return httpClient.request(`/mentor-connections/students/${studentId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function updateStudentNote(noteId, payload) {
  return httpClient.request(`/mentor-connections/notes/${noteId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export async function deleteStudentNote(noteId) {
  return httpClient.request(`/mentor-connections/notes/${noteId}`, {
    method: 'DELETE'
  });
}

export async function uploadClassAttachment(file) {
  const formData = new FormData();
  formData.append('file', file);
  return httpClient.request('/mentor-connections/upload', {
    method: 'POST',
    body: formData
  });
}

export async function postMentorAnnouncement(message, attachments = []) {
  return httpClient.request('/mentor-connections/announcements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, attachments })
  });
}

/* ---------------------------------------------------------------------------
   My Class — the student-facing classroom and the mentor's review queue.
   -------------------------------------------------------------------------- */

export async function fetchMyClass() {
  return httpClient.request('/mentor-connections/my-class');
}

export async function submitAssignment(noteId, payload) {
  const bodyData = typeof payload === 'string' ? { body: payload } : payload;
  return httpClient.request(`/mentor-connections/assignments/${noteId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyData)
  });
}

export async function unsubmitAssignment(noteId) {
  return httpClient.request(`/mentor-connections/assignments/${noteId}/unsubmit`, {
    method: 'POST'
  });
}

export async function fetchMentorSubmissions() {
  return httpClient.request('/mentor-connections/submissions');
}

export async function reviewAssignment(noteId, { action, feedback }) {
  return httpClient.request(`/mentor-connections/assignments/${noteId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, feedback })
  });
}
