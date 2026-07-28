import '@testing-library/jest-dom/vitest';
import { setLocale } from '../i18n';

// Tests assert on English copy. The app defaults to Korean, so pin the locale
// here rather than duplicating every expectation in two languages.
setLocale('en');
