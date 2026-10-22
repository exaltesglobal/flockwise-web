// Build-time settings come from .env (VITE_*). In non-production builds the API URL
// can be changed at runtime from the Server panel, the same way the mobile app works.
const OVERRIDE_KEY = 'fw.apiUrlOverride';

export const BuildConfig = {
  apiUrl: stripSlash(import.meta.env.VITE_API_URL ?? 'https://api.flockwise.church/v1'),
  useMocks: (import.meta.env.VITE_USE_MOCKS ?? 'true') !== 'false',
  appEnv: (import.meta.env.VITE_APP_ENV ?? 'development') as 'development' | 'staging' | 'production',
};

let runtimeApiUrl: string | null = null;
let runtimeUseMocks = BuildConfig.useMocks;

if (BuildConfig.appEnv !== 'production') {
  const saved = safeGet(OVERRIDE_KEY);
  if (saved) {
    runtimeApiUrl = saved;
    runtimeUseMocks = false;
  }
}

export const getApiUrl = () => runtimeApiUrl ?? BuildConfig.apiUrl;
export const isUsingMocks = () => runtimeUseMocks;
export const canOverrideServer = () => BuildConfig.appEnv !== 'production';

/** Pass null to go back to the build defaults. Reloads so every screen refetches. */
export function setApiUrlOverride(url: string | null) {
  if (url) localStorage.setItem(OVERRIDE_KEY, stripSlash(url.trim()));
  else localStorage.removeItem(OVERRIDE_KEY);
  window.location.reload();
}

function stripSlash(url: string) {
  return url.replace(/\/+$/, '');
}

function safeGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
