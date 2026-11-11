import { BRANDING_PRESETS } from '../context/BrandingContext';

const LEGACY_THEME_IDS = { navy: 'classic', blue: 'sky', warm: 'saffron' };
const darkenHex = (hex, factor = 0.28) => {
  const parsed = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!parsed) return '#071b3a';
  const channels = [0, 2, 4].map((index) => Math.round(parseInt(parsed[1].slice(index, index + 2), 16) * (1 - factor)));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

export const WELCOME_THEME_OPTIONS = BRANDING_PRESETS.map(({ id, label, primaryColor, accentColor, surfaceColor, textColor }) => ({ id, label, primaryColor, accentColor, surfaceColor, textColor }));
export const WELCOME_THEMES = Object.fromEntries(WELCOME_THEME_OPTIONS.map((theme) => [theme.id, {
  ...theme,
  backgroundImage: `linear-gradient(125deg, ${darkenHex(theme.primaryColor)}, ${theme.primaryColor}, ${darkenHex(theme.primaryColor, 0.12)})`
}]));
WELCOME_THEMES.navy = WELCOME_THEMES.classic;
WELCOME_THEMES.blue = WELCOME_THEMES.sky;
WELCOME_THEMES.warm = WELCOME_THEMES.saffron;

export const resolveWelcomeTheme = (themeId, branding = {}) => {
  const theme = WELCOME_THEMES[LEGACY_THEME_IDS[themeId] || themeId] || WELCOME_THEMES.classic;
  const validHex = (value) => /^#[0-9a-f]{6}$/i.test(String(value || ''));
  const primaryColor = validHex(theme.primaryColor) ? theme.primaryColor : (validHex(branding.primaryColor) ? branding.primaryColor : '#0B4EA2');
  const accentColor = validHex(theme.accentColor) ? theme.accentColor : (validHex(branding.accentColor) ? branding.accentColor : '#F4A300');
  const surfaceColor = validHex(theme.surfaceColor) ? theme.surfaceColor : (validHex(branding.surfaceColor) ? branding.surfaceColor : '#FFF8E8');
  const textColor = validHex(theme.textColor) ? theme.textColor : (validHex(branding.textColor) ? branding.textColor : '#172033');
  return {
    ...theme,
    primaryColor,
    accentColor,
    surfaceColor,
    textColor,
    backgroundImage: `linear-gradient(125deg, ${darkenHex(primaryColor)}, ${primaryColor}, ${darkenHex(primaryColor, 0.12)})`,
    pageBackground: `linear-gradient(180deg, ${surfaceColor} 0%, #ffffff 48%, ${surfaceColor} 100%)`
  };
};

// Both public displays use the same curated menu, never CMS grocery inventory.
export const selectedWelcomeDishes = (settings) => {
  const dishes = new Map((Array.isArray(settings.dishes) ? settings.dishes : []).map((dish) => [dish.id, dish]));
  return (Array.isArray(settings.selectedDishIds) ? settings.selectedDishIds : []).map((id) => dishes.get(id)).filter(Boolean);
};