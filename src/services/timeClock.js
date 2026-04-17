const API = process.env.REACT_APP_API_URL || '/api';

const post = async (path, body) => {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
};

export const lookupEmployee = async (phoneNumber) => {
  try {
    const data = await post('/authenticate', { phoneNumber });
    return data.success
      ? { success: true, employee: data.employee }
      : { success: false, message: data.message };
  } catch {
    return { success: false, message: 'Cannot reach server' };
  }
};

export const clockIn = async (phoneNumber) => {
  try {
    const data = await post('/clock-in', { phoneNumber });
    return data.success
      ? { success: true, entry: data.entry }
      : { success: false, message: data.message };
  } catch {
    return { success: false, message: 'Cannot reach server' };
  }
};

export const clockOut = async (phoneNumber) => {
  try {
    const data = await post('/clock-out', { phoneNumber });
    return data.success
      ? { success: true, entry: data.entry }
      : { success: false, message: data.message };
  } catch {
    return { success: false, message: 'Cannot reach server' };
  }
};
