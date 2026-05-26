export function normalizePhoneNumber(value: string) {
  return value.replace(/[()\-\s.]/g, '').trim();
}

export function isValidInternationalPhone(value: string) {
  const normalized = normalizePhoneNumber(value);
  return /^\+[1-9]\d{7,14}$/.test(normalized);
}

export function validateOptionalInternationalPhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };

  const normalized = normalizePhoneNumber(trimmed);
  if (!isValidInternationalPhone(normalized)) {
    return {
      ok: false,
      value: null,
      message: 'Enter phone number with country code, for example +1 555 0100 or +91 98765 43210.',
    };
  }

  return { ok: true, value: normalized };
}
