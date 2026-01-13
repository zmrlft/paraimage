export type PromptItem = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

type PromptLibraryResponse = {
  prompts: PromptItem[];
};

type SavePromptLibraryResponse = {
  ok: boolean;
  prompts?: PromptItem[];
  error?: string;
};

type PyWebviewPromptApi = {
  get_prompt_library?: () => Promise<PromptLibraryResponse>;
  save_prompt_library?: (
    payload: PromptLibraryResponse
  ) => Promise<SavePromptLibraryResponse>;
};

const STORAGE_KEY = "paraimage.prompt_library";

const getPywebviewApi = (): PyWebviewPromptApi | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const api = (
    window as unknown as { pywebview?: { api?: PyWebviewPromptApi } }
  ).pywebview?.api;
  return api ?? null;
};

const waitForPywebviewApi = (
  timeoutMs = 1500
): Promise<PyWebviewPromptApi | null> => {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }
  const api = getPywebviewApi();
  if (api) {
    return Promise.resolve(api);
  }
  return new Promise((resolve) => {
    let settled = false;
    const handleReady = () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener("pywebviewready", handleReady);
      resolve(getPywebviewApi());
    };
    const timer = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      window.removeEventListener("pywebviewready", handleReady);
      resolve(getPywebviewApi());
    }, timeoutMs);
    window.addEventListener("pywebviewready", handleReady);
  });
};

const readLocalPrompts = (): PromptItem[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLocalPrompts = (prompts: PromptItem[]) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
  } catch {
    // Best-effort persistence; ignore localStorage failures.
  }
};

export const getPromptLibrary = async (): Promise<PromptItem[]> => {
  const api = await waitForPywebviewApi();
  if (!api?.get_prompt_library) {
    return readLocalPrompts();
  }
  const response = await api.get_prompt_library();
  const prompts = Array.isArray(response?.prompts) ? response.prompts : [];
  writeLocalPrompts(prompts);
  return prompts;
};

export const savePromptLibrary = async (
  prompts: PromptItem[]
): Promise<SavePromptLibraryResponse> => {
  const api = await waitForPywebviewApi();
  if (!api?.save_prompt_library) {
    writeLocalPrompts(prompts);
    return { ok: true, prompts };
  }
  const response = await api.save_prompt_library({ prompts });
  writeLocalPrompts(prompts);
  return response;
};
