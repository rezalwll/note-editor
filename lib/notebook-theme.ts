import { getNotebookThemeByKey } from "@/lib/theme-presets";

export {
  GROUP_THEMES,
  NOTEBOOK_THEMES,
  getGroupThemeByKey,
  getRandomThemeKey,
  isThemeKey,
  type GroupTheme,
  type NotebookTheme,
  type ThemeKey,
} from "@/lib/theme-presets";

export function getNotebookTheme(notebookId: string, themeKey?: string | null) {
  return getNotebookThemeByKey(themeKey ?? notebookId);
}
