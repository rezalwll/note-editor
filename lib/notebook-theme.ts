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
    tab: "#8fb3e2",
    tabText: "#24364a",
    tabBorder: "#6f98cf",
    accent: "#6e9fd8",
    accentSoft: "#eff5fd",
    sidebarBg: "#eef5fd",
    sidebarHeaderBg: "#bfd4f2",
    sidebarBorder: "#b5cceb",
    sidebarHover: "#ddeaf9",
    sidebarActive: "#ffffff",
    sidebarText: "#304355",
    sidebarMuted: "#607489",
    editorBorder: "#d5e3f5",
    editorGlow: "rgba(111, 152, 207, 0.18)",
  },
  {
    tab: "#d6b48c",
    tabText: "#4a3522",
    tabBorder: "#c59663",
    accent: "#c59663",
    accentSoft: "#fcf4ea",
    sidebarBg: "#fbf3ea",
    sidebarHeaderBg: "#ead2b6",
    sidebarBorder: "#e2c7a8",
    sidebarHover: "#f3e2cf",
    sidebarActive: "#ffffff",
    sidebarText: "#4c3b2d",
    sidebarMuted: "#7b6858",
    editorBorder: "#eddcc7",
    editorGlow: "rgba(197, 150, 99, 0.18)",
  },
  {
    tab: "#d7df73",
    tabText: "#454a16",
    tabBorder: "#bcc84c",
    accent: "#bcc84c",
    accentSoft: "#fafcdf",
    sidebarBg: "#f7fadf",
    sidebarHeaderBg: "#e4eba2",
    sidebarBorder: "#d4dd8c",
    sidebarHover: "#edf3c3",
    sidebarActive: "#ffffff",
    sidebarText: "#4d5423",
    sidebarMuted: "#757c53",
    editorBorder: "#e4eab5",
    editorGlow: "rgba(188, 200, 76, 0.18)",
  },
  {
    tab: "#9dcb64",
    tabText: "#294016",
    tabBorder: "#7fb046",
    accent: "#7fb046",
    accentSoft: "#edf8e1",
    sidebarBg: "#eef7e3",
    sidebarHeaderBg: "#c8e0a5",
    sidebarBorder: "#bfd89a",
    sidebarHover: "#dfefca",
    sidebarActive: "#ffffff",
    sidebarText: "#355026",
    sidebarMuted: "#617555",
    editorBorder: "#d5e7bc",
    editorGlow: "rgba(127, 176, 70, 0.18)",
  },
  {
    tab: "#d3c0ea",
    tabText: "#40314d",
    tabBorder: "#b79ad9",
    accent: "#ab88d2",
    accentSoft: "#f5effc",
    sidebarBg: "#f6effd",
    sidebarHeaderBg: "#dfcff2",
    sidebarBorder: "#d4c0eb",
    sidebarHover: "#ebdef8",
    sidebarActive: "#ffffff",
    sidebarText: "#47395a",
    sidebarMuted: "#726584",
    editorBorder: "#e3d6f3",
    editorGlow: "rgba(171, 136, 210, 0.18)",
  },
  {
    tab: "#f0ba7f",
    tabText: "#4f3313",
    tabBorder: "#db9954",
    accent: "#db9954",
    accentSoft: "#fef2e4",
    sidebarBg: "#fff3e7",
    sidebarHeaderBg: "#f6d3ac",
    sidebarBorder: "#edc191",
    sidebarHover: "#fae4c9",
    sidebarActive: "#ffffff",
    sidebarText: "#5a4127",
    sidebarMuted: "#86684b",
    editorBorder: "#f2d7b6",
    editorGlow: "rgba(219, 153, 84, 0.18)",
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
