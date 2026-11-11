export interface EmbedThemeTokens {
  bg: string;
  bgSecondary: string;
  bgTertiary: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  accent: string;
  nodeText: string;
  edgeColor: string;
  edgeText: string;
  edgeLabelBg: string;
}

export const EMBED_THEMES: Record<'dark' | 'light', EmbedThemeTokens> = {
  dark: {
    bg: '#1B1B1B',
    bgSecondary: '#2D2D2D',
    bgTertiary: '#3D3D3D',
    text: '#FFFFFF',
    textSecondary: '#B3B3B3',
    textTertiary: '#808080',
    border: '#404040',
    accent: '#0078D4',
    nodeText: '#B3B3B3',
    edgeColor: '#6E6E6E',
    edgeText: '#B3B3B3',
    edgeLabelBg: '#2D2D2D',
  },
  light: {
    bg: '#FFFFFF',
    bgSecondary: '#F5F5F5',
    bgTertiary: '#EEEEEE',
    text: '#1A1A1A',
    textSecondary: '#555555',
    textTertiary: '#888888',
    border: '#DDDDDD',
    accent: '#0078D4',
    nodeText: '#2A2A2A',
    edgeColor: '#888888',
    edgeText: '#555555',
    edgeLabelBg: '#F5F5F5',
  },
};
