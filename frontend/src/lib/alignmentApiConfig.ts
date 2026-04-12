import { useAppStore } from '../store/appStore';

export function normalizeAlignmentApiBaseUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/\/+$/, '');
  return normalized || null;
}

export function getAlignmentApiBaseUrl(): string | null {
  const runtimeValue = normalizeAlignmentApiBaseUrl(
    useAppStore.getState().alignmentApiBaseUrl,
  );
  if (runtimeValue) {
    return runtimeValue;
  }

  return normalizeAlignmentApiBaseUrl(import.meta.env.VITE_ALIGNMENT_API_BASE_URL);
}

export function isAlignmentApiConfigured(): boolean {
  return Boolean(getAlignmentApiBaseUrl());
}
