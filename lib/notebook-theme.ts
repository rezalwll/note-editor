export type NotebookTheme = {
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

const notebookThemes: NotebookTheme[] = [
  {
    tab: "#9FA1FF",
    tabText: "#2D3561",
    tabBorder: "#8E93F2",
    accent: "#9FA1FF",
    accentSoft: "#F0F1FF",
    sidebarBg: "#F5F5FF",
    sidebarHeaderBg: "#DDE0FF",
    sidebarBorder: "#CFD3FF",
    sidebarHover: "#E8EAFF",
    sidebarActive: "#FFFFFF",
    sidebarText: "#303964",
    sidebarMuted: "#7680A8",
    editorBorder: "#D8DBFF",
    editorGlow: "rgba(159, 161, 255, 0.18)",
  },
  {
    tab: "#B5BAFF",
    tabText: "#2F3864",
    tabBorder: "#A1A9F4",
    accent: "#B5BAFF",
    accentSoft: "#F3F4FF",
    sidebarBg: "#F6F7FF",
    sidebarHeaderBg: "#E2E5FF",
    sidebarBorder: "#D6DAFF",
    sidebarHover: "#ECEEFF",
    sidebarActive: "#FFFFFF",
    sidebarText: "#33406A",
    sidebarMuted: "#7985AD",
    editorBorder: "#DDE0FF",
    editorGlow: "rgba(181, 186, 255, 0.18)",
  },
  {
    tab: "#AEE2FF",
    tabText: "#24465B",
    tabBorder: "#95D2F2",
    accent: "#AEE2FF",
    accentSoft: "#EFF9FF",
    sidebarBg: "#F2FBFF",
    sidebarHeaderBg: "#D3EEFF",
    sidebarBorder: "#C5E8FF",
    sidebarHover: "#E2F5FF",
    sidebarActive: "#FFFFFF",
    sidebarText: "#285068",
    sidebarMuted: "#6F8EA2",
    editorBorder: "#CDEBFF",
    editorGlow: "rgba(174, 226, 255, 0.2)",
  },
  {
    tab: "#D9F9DF",
    tabText: "#2E5440",
    tabBorder: "#BFEFCA",
    accent: "#BFEFCA",
    accentSoft: "#F4FFF6",
    sidebarBg: "#F5FFF7",
    sidebarHeaderBg: "#E4FBE8",
    sidebarBorder: "#D7F5DE",
    sidebarHover: "#ECFDF0",
    sidebarActive: "#FFFFFF",
    sidebarText: "#37614B",
    sidebarMuted: "#749480",
    editorBorder: "#D8F4DF",
    editorGlow: "rgba(217, 249, 223, 0.22)",
  },
  {
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
  {
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
  {
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
  {
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
  {
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
  {
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
  {
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
];

function hashNotebookId(id: string) {
  let hash = 0;

  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }

  return hash;
}

export function getNotebookTheme(notebookId: string) {
  const index = hashNotebookId(notebookId) % notebookThemes.length;
  return notebookThemes[index];
}
