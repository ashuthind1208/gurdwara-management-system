const BRANDING_RESOURCE = 'gurdwara_branding';
const LEGACY_BRANDING_RESOURCE = 'ask_granthi_branding';
const DEFAULT_ORGANIZATION_NAME = String(process.env.ORGANIZATION_NAME || 'Your Gurdwara').trim();
const DEFAULT_ORGANIZATION_SHORT_NAME = String(process.env.ORGANIZATION_SHORT_NAME || DEFAULT_ORGANIZATION_NAME).trim();

const DEFAULT_GURDWARA_BRANDING = Object.freeze({
  organizationName: DEFAULT_ORGANIZATION_NAME,
  shortName: DEFAULT_ORGANIZATION_SHORT_NAME,
  logoUrl: '',
  primaryColor: '#0B4EA2',
  accentColor: '#F4A300',
  surfaceColor: '#FFF8E8',
  footerColor: '',
  textColor: '',
  buttonColor: '',
  buttonHoverColor: '',
  linkColor: '',
  linkHoverColor: '',
  tagline: 'A spiritually rooted and community focused digital platform for sangat services.',
  faviconUrl: '',
  headingFont: 'Crimson Text',
  bodyFont: 'Manrope',
  cornerStyle: 'soft',
  logoShape: 'circle',
  address: '',
  phone: '',
  email: '',
  facebookUrl: '',
  instagramUrl: '',
  youtubeUrl: '',
  savedThemes: []
});

const BRANDING_THEME_KEYS = Object.freeze(['primaryColor', 'accentColor', 'surfaceColor', 'footerColor', 'textColor', 'buttonColor', 'buttonHoverColor', 'linkColor', 'linkHoverColor', 'headingFont', 'bodyFont', 'cornerStyle']);
const BRANDING_FONTS = Object.freeze([
  'Crimson Text', 'Manrope', 'Playfair Display', 'Lora', 'Merriweather', 'Poppins', 'Inter', 'Nunito', 'Open Sans', 'Roboto',
  'Noto Serif', 'Roboto Slab', 'DM Sans', 'Source Sans 3', 'Source Serif 4', 'Libre Baskerville', 'Raleway', 'Ubuntu', 'Montserrat', 'Lato',
  'Nunito Sans', 'Work Sans', 'IBM Plex Sans', 'IBM Plex Serif', 'PT Sans', 'PT Serif', 'Cormorant Garamond', 'Spectral', 'Mukta', 'Hind', 'Archivo', 'Figtree'
]);
const BRANDING_CORNER_STYLES = Object.freeze(['soft', 'sharp']);

const getGurdwaraBranding = async (db) => {
  const stored = await db.getSingleton(BRANDING_RESOURCE, null);
  if (stored) {
    return { ...DEFAULT_GURDWARA_BRANDING, ...stored };
  }

  const legacy = await db.getSingleton(LEGACY_BRANDING_RESOURCE, null);
  const { productName, ...legacyBranding } = legacy || {};
  return {
    ...DEFAULT_GURDWARA_BRANDING,
    ...legacyBranding,
    shortName: String(legacy?.shortName || legacy?.organizationName || DEFAULT_GURDWARA_BRANDING.shortName).trim(),
  };
};

const saveGurdwaraBranding = async (db, branding) => db.setSingleton(BRANDING_RESOURCE, {
  ...DEFAULT_GURDWARA_BRANDING,
  ...branding,
  updatedAt: new Date().toISOString()
});

module.exports = {
  BRANDING_FONTS,
  BRANDING_THEME_KEYS,
  BRANDING_CORNER_STYLES,
  BRANDING_RESOURCE,
  DEFAULT_GURDWARA_BRANDING,
  getGurdwaraBranding,
  saveGurdwaraBranding
};