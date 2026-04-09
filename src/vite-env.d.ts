/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_AI_BUILDER: string;
  readonly VITE_ENABLE_LEGACY_FORMATS: string;
  readonly VITE_BASE_PATH: string;
  readonly VITE_GITHUB_CLIENT_ID: string;
  readonly VITE_GITHUB_OAUTH_BASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
