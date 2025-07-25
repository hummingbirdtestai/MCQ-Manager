module.exports = function validateStep4(json) {
  if (json.step !== 4) return false;
  if (!Array.isArray(json.content) || json.content.length !== 60) return false;

  const validSenders = ['teacher', 'student'];

  return json.content.every(
    (entry) => typeof entry.html === 'string' &&
      validSenders.includes(entry.sender)
  );
};
