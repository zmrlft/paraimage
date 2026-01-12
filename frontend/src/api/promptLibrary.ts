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
  get_prompt_library: () => Promise<PromptLibraryResponse>;
  save_prompt_library: (
    payload: PromptLibraryResponse
  ) => Promise<SavePromptLibraryResponse>;
};

const STORAGE_KEY = "omniimage.prompt_library";

const getPywebviewApi = (): PyWebviewPromptApi | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const api = (
    window as unknown as { pywebview?: { api?: PyWebviewPromptApi } }
  ).pywebview?.api;
  return api?.get_prompt_library && api?.save_prompt_library ? api : null;
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
  const api = getPywebviewApi();
  if (!api) {
    return readLocalPrompts();
  }
  const response = await api.get_prompt_library();
  return Array.isArray(response?.prompts) ? response.prompts : [];
};

export const savePromptLibrary = async (
  prompts: PromptItem[]
): Promise<SavePromptLibraryResponse> => {
  const api = getPywebviewApi();
  if (!api) {
    writeLocalPrompts(prompts);
    return { ok: true, prompts };
  }
  return api.save_prompt_library({ prompts });
};
