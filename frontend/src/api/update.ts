export type AppInfo = {
  version: string;
  repoUrl: string;
};

export type UpdateAsset = {
  name?: string;
  size?: number;
  url?: string;
  installable?: boolean;
};

export type UpdateCheckResponse = {
  ok: boolean;
  repoUrl?: string;
  currentVersion?: string;
  latestVersion?: string;
  updateAvailable?: boolean;
  releaseUrl?: string;
  publishedAt?: string;
  notes?: string;
  asset?: UpdateAsset | null;
  error?: string;
};

export type DownloadUpdateResponse = {
  ok: boolean;
  path?: string;
  error?: string;
};

export type InstallUpdateResponse = {
  ok: boolean;
  error?: string;
};

type PyWebviewUpdateApi = {
  get_app_info?: () => Promise<AppInfo>;
  check_update?: () => Promise<UpdateCheckResponse>;
  download_update?: (
    payload: { assetUrl: string }
  ) => Promise<DownloadUpdateResponse>;
  install_update?: (payload: { path: string }) => Promise<InstallUpdateResponse>;
};

const getPywebviewApi = (): PyWebviewUpdateApi | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const api = (
    window as unknown as { pywebview?: { api?: PyWebviewUpdateApi } }
  ).pywebview?.api;
  return api ?? null;
};

export const getAppInfo = async (): Promise<AppInfo | null> => {
  const api = getPywebviewApi();
  if (!api?.get_app_info) {
    return null;
  }
  return api.get_app_info();
};

export const checkUpdate = async (): Promise<UpdateCheckResponse> => {
  const api = getPywebviewApi();
  if (!api?.check_update) {
    return { ok: false, error: "pywebview not available" };
  }
  return api.check_update();
};

export const downloadUpdate = async (
  assetUrl: string
): Promise<DownloadUpdateResponse> => {
  const api = getPywebviewApi();
  if (!api?.download_update) {
    return { ok: false, error: "pywebview not available" };
  }
  return api.download_update({ assetUrl });
};

export const installUpdate = async (
  path: string
): Promise<InstallUpdateResponse> => {
  const api = getPywebviewApi();
  if (!api?.install_update) {
    return { ok: false, error: "pywebview not available" };
  }
  return api.install_update({ path });
};
