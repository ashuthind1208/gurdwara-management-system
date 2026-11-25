import apiClient from './apiClient';

let registrationInFlight;
const readCount = (response) => {
  const count = response.data?.data?.count;
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Visitor count unavailable.');
  return count;
};
const inaugurationVisitorService = {
  load: (register = false) => {
    if (!register) return apiClient.get('/inauguration/visitors').then(readCount);
    // Share the first request until its cookie arrives, including React StrictMode remounts.
    if (!registrationInFlight) {
      registrationInFlight = apiClient.post('/inauguration/visitors', {}).then(readCount)
        .finally(() => { registrationInFlight = undefined; });
    }
    return registrationInFlight;
  }
};

export default inaugurationVisitorService;