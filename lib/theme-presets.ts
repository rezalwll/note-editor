export type ThemeKey =
  | "iris"
  | "sky"
  | "mint"
  | "rose"
  | "amber"
  | "teal"
  | "coral"
  | "violet"
  | "ocean"
  | "lime";

export type NotebookTheme = {
  key: ThemeKey;
  label: string;
  tab: string;
  tabText: string;
  tabBorder: string;
  accent: string;
  accentSoft: string;
  sidebarBg: string;
  sidebarHeaderBg: string;
  sidebarBorder: string;
  sidebarHover: string;
  sidebarActive: string;
  sidebarText: string;
  sidebarMuted: string;
  editorBorder: string;
  editorGlow: string;
};

export type GroupTheme = {
  key: ThemeKey;
  label: string;
  bg: string;
  border: string;
  text: string;
  badgeBg: string;
  badgeText: string;
  ring: string;
  glow: string;
};

export const THEME_KEYS: ThemeKey[] = [
  "iris",
  "sky",
  "mint",
  "rose",
  "amber",
  "teal",
  "coral",
  "violet",
  "ocean",
  "lime",
];

const themeCatalog: Record<ThemeKey, NotebookTheme> = {
  iris: {
    key: "iris",
    label: "یاسی",
    tab: "#A9A4FF",
    tabText: "#2E3167",
    tabBorder: "#8E88F5",
    accent: "#9C98FF",
    accentSoft: "#F0EFFF",
    sidebarBg: "#F7F6FF",
    sidebarHeaderBg: "#E3E1FF",
    sidebarBorder: "#D4D0FF",
    sidebarHover: "#ECEAFF",
    sidebarActive: "#FFFFFF",
    sidebarText: "#353A73",
    sidebarMuted: "#7D82B5",
    editorBorder: "#DBD8FF",
    editorGlow: "rgba(156, 152, 255, 0.2)",
  },
  sky: {
    key: "sky",
    label: "آسمانی",
    tab: "#9FD9FF",
    tabText: "#214B66",
    tabBorder: "#79C5F2",
    accent: "#8ED0FF",
    accentSoft: "#EEF9FF",
    sidebarBg: "#F3FBFF",
    sidebarHeaderBg: "#D8F0FF",
    sidebarBorder: "#C7E8FF",
    sidebarHover: "#E6F6FF",
    sidebarActive: "#FFFFFF",
    sidebarText: "#2A5875",
    sidebarMuted: "#6D8EA3",
    editorBorder: "#CFEAFF",
    editorGlow: "rgba(142, 208, 255, 0.2)",
  },
  mint: {
    key: "mint",
    label: "نعنایی",
    tab: "#AEEBC5",
    tabText: "#2C5940",
    tabBorder: "#8FD7AC",
    accent: "#96E0B0",
    accentSoft: "#F1FFF5",
    sidebarBg: "#F6FFF8",
    sidebarHeaderBg: "#DDF8E6",
    sidebarBorder: "#CBEFD7",
    sidebarHover: "#E9FBEE",
    sidebarActive: "#FFFFFF",
    sidebarText: "#37684B",
    sidebarMuted: "#71907F",
    editorBorder: "#D2F1DC",
    editorGlow: "rgba(150, 224, 176, 0.22)",
  },
  rose: {
    key: "rose",
    label: "رز",
    tab: "#FFB3C7",
    tabText: "#693447",
    tabBorder: "#FF95B0",
    accent: "#FF9FBA",
    accentSoft: "#FFF1F5",
    sidebarBg: "#FFF6F9",
    sidebarHeaderBg: "#FFD6E2",
    sidebarBorder: "#FFC6D7",
    sidebarHover: "#FFE7EE",
    sidebarActive: "#FFFFFF",
    sidebarText: "#7A4254",
    sidebarMuted: "#AA7283",
    editorBorder: "#FFD3E0",
    editorGlow: "rgba(255, 149, 176, 0.2)",
  },
  amber: {
    key: "amber",
    label: "کهربایی",
    tab: "#FFD36E",
    tabText: "#654712",
    tabBorder: "#F2BE45",
    accent: "#FFC94D",
    accentSoft: "#FFF8E7",
    sidebarBg: "#FFFBEF",
    sidebarHeaderBg: "#FFE7A8",
    sidebarBorder: "#FFDB86",
    sidebarHover: "#FFF1C9",
    sidebarActive: "#FFFFFF",
    sidebarText: "#76551D",
    sidebarMuted: "#A3814A",
    editorBorder: "#FFE3A1",
    editorGlow: "rgba(255, 201, 77, 0.22)",
  },
  teal: {
    key: "teal",
    label: "فیروزه‌ای",
    tab: "#7DE0D1",
    tabText: "#1E5553",
    tabBorder: "#57CABA",
    accent: "#69D7C7",
    accentSoft: "#EFFFFC",
    sidebarBg: "#F1FFFC",
    sidebarHeaderBg: "#BDF4EC",
    sidebarBorder: "#A5E8DE",
    sidebarHover: "#D8FAF4",
    sidebarActive: "#FFFFFF",
    sidebarText: "#256562",
    sidebarMuted: "#5E8E89",
    editorBorder: "#B8EEE5",
    editorGlow: "rgba(87, 202, 186, 0.22)",
  },
  coral: {
    key: "coral",
    label: "مرجانی",
    tab: "#FF9E7A",
    tabText: "#6A3828",
    tabBorder: "#F8865B",
    accent: "#FF936A",
    accentSoft: "#FFF1EC",
    sidebarBg: "#FFF7F3",
    sidebarHeaderBg: "#FFD4C3",
    sidebarBorder: "#FFC2AC",
    sidebarHover: "#FFE4D9",
    sidebarActive: "#FFFFFF",
    sidebarText: "#7B4634",
    sidebarMuted: "#A16C5B",
    editorBorder: "#FFD1BF",
    editorGlow: "rgba(248, 134, 91, 0.22)",
  },
  violet: {
    key: "violet",
    label: "بنفش",
    tab: "#C6A6FF",
    tabText: "#4E3572",
    tabBorder: "#AE85F2",
    accent: "#BB98FF",
    accentSoft: "#F7F1FF",
    sidebarBg: "#FAF6FF",
    sidebarHeaderBg: "#E5D5FF",
    sidebarBorder: "#D9C3FF",
    sidebarHover: "#EEDFff",
    sidebarActive: "#FFFFFF",
    sidebarText: "#5E4383",
    sidebarMuted: "#8569A9",
    editorBorder: "#DDCCFF",
    editorGlow: "rgba(174, 133, 242, 0.22)",
  },
  ocean: {
    key: "ocean",
    label: "اقیانوسی",
    tab: "#8FC7FF",
    tabText: "#244A72",
    tabBorder: "#6DAEF0",
    accent: "#7DBBFF",
    accentSoft: "#EFF7FF",
    sidebarBg: "#F4FAFF",
    sidebarHeaderBg: "#CCE6FF",
    sidebarBorder: "#BADBFF",
    sidebarHover: "#E0F0FF",
    sidebarActive: "#FFFFFF",
    sidebarText: "#2D5A87",
    sidebarMuted: "#6887A8",
    editorBorder: "#C8E1FF",
    editorGlow: "rgba(109, 174, 240, 0.22)",
  },
  lime: {
    key: "lime",
    label: "لیمویی",
    tab: "#B8F28A",
    tabText: "#35531E",
    tabBorder: "#9AD662",
    accent: "#AEE772",
    accentSoft: "#F6FFE9",
    sidebarBg: "#FAFFF3",
    sidebarHeaderBg: "#DCF6BA",
    sidebarBorder: "#CFEBA4",
    sidebarHover: "#EAF9D6",
    sidebarActive: "#FFFFFF",
    sidebarText: "#45672A",
    sidebarMuted: "#74905C",
    editorBorder: "#D5EEB1",
    editorGlow: "rgba(154, 214, 98, 0.22)",
  },
};

export const NOTEBOOK_THEMES: NotebookTheme[] = THEME_KEYS.map(
  (key) => themeCatalog[key],
);

export const GROUP_THEMES: GroupTheme[] = NOTEBOOK_THEMES.map((theme) => ({
  key: theme.key,
  label: theme.label,
  bg: theme.tab,
  border: theme.tabBorder,
  text: theme.tabText,
  badgeBg: "rgba(255,255,255,0.58)",
  badgeText: theme.tabText,
  ring: `${theme.accent}aa`,
  glow: theme.editorGlow,
}));

function hashValue(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

export function isThemeKey(value: string | null | undefined): value is ThemeKey {
  return Boolean(value && THEME_KEYS.includes(value as ThemeKey));
}

export function getRandomThemeKey(seed: string) {
  return THEME_KEYS[hashValue(seed) % THEME_KEYS.length];
}

export function getNotebookThemeByKey(themeKey?: string | null) {
  if (themeKey && isThemeKey(themeKey)) {
    return themeCatalog[themeKey];
  }

  return themeCatalog[getRandomThemeKey(themeKey ?? "default")];
}

export function getGroupThemeByKey(themeKey?: string | null) {
  const notebookTheme = getNotebookThemeByKey(themeKey);
  return GROUP_THEMES.find((theme) => theme.key === notebookTheme.key) ?? GROUP_THEMES[0];
}
