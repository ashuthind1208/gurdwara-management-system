import { createContext, useContext, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import brandingService from '../services/brandingService';
import gurdwaraLogo from '../assets/default-gurdwara.svg';

export const DEFAULT_GURDWARA_BRANDING = Object.freeze({
  organizationName: String(process.env.REACT_APP_ORGANIZATION_NAME || 'Your Gurdwara').trim(),
  shortName: String(process.env.REACT_APP_ORGANIZATION_SHORT_NAME || process.env.REACT_APP_ORGANIZATION_NAME || 'Your Gurdwara').trim(), logoUrl: '',
  primaryColor: '#0B4EA2', accentColor: '#F4A300', surfaceColor: '#FFF8E8', footerColor: '',
  textColor: '', buttonColor: '', buttonHoverColor: '', linkColor: '', linkHoverColor: '',
  tagline: 'A spiritually rooted and community focused digital platform for sangat services.',
  faviconUrl: '', headingFont: 'Crimson Text', bodyFont: 'Manrope', cornerStyle: 'soft', logoShape: 'circle',
  address: '', phone: '', email: '', facebookUrl: '', instagramUrl: '', youtubeUrl: '', savedThemes: []
});

export const BRANDING_THEME_KEYS = Object.freeze(['primaryColor', 'accentColor', 'surfaceColor', 'footerColor', 'textColor', 'buttonColor', 'buttonHoverColor', 'linkColor', 'linkHoverColor', 'headingFont', 'bodyFont', 'cornerStyle']);
export const BRANDING_FONT_OPTIONS = Object.freeze([
  'Crimson Text', 'Manrope', 'Playfair Display', 'Lora', 'Merriweather', 'Poppins', 'Inter', 'Nunito', 'Open Sans', 'Roboto',
  'Noto Serif', 'Roboto Slab', 'DM Sans', 'Source Sans 3', 'Source Serif 4', 'Libre Baskerville', 'Raleway', 'Ubuntu', 'Montserrat', 'Lato',
  'Nunito Sans', 'Work Sans', 'IBM Plex Sans', 'IBM Plex Serif', 'PT Sans', 'PT Serif', 'Cormorant Garamond', 'Spectral', 'Mukta', 'Hind', 'Archivo', 'Figtree'
]);

export const BRANDING_PRESETS = Object.freeze([
  { id: 'classic', label: 'Classic Blue and Gold', primaryColor: '#0B4EA2', accentColor: '#F4A300', surfaceColor: '#FFF8E8', footerColor: '#0B4EA2', textColor: '#172033', buttonColor: '#0B4EA2', buttonHoverColor: '#B97800', linkColor: '#0B4EA2', linkHoverColor: '#9A5D00', headingFont: 'Crimson Text', bodyFont: 'Manrope', cornerStyle: 'soft' },
  { id: 'saffron', label: 'Saffron and Cream', primaryColor: '#9A3412', accentColor: '#F59E0B', surfaceColor: '#FFF7ED', textColor: '#431407', buttonColor: '#9A3412', buttonHoverColor: '#B45309', linkColor: '#9A3412', linkHoverColor: '#7C2D12', headingFont: 'Playfair Display', bodyFont: 'Nunito', cornerStyle: 'soft' },
  { id: 'heritage', label: 'Heritage Green', primaryColor: '#14532D', accentColor: '#C89B3C', surfaceColor: '#FEFCE8', textColor: '#1C2B20', buttonColor: '#14532D', buttonHoverColor: '#9A7424', linkColor: '#14532D', linkHoverColor: '#7A5A18', headingFont: 'Lora', bodyFont: 'Open Sans', cornerStyle: 'soft' },
  { id: 'minimal', label: 'Minimal Slate', primaryColor: '#1E293B', accentColor: '#0EA5E9', surfaceColor: '#F8FAFC', textColor: '#0F172A', buttonColor: '#1E293B', buttonHoverColor: '#0369A1', linkColor: '#0369A1', linkHoverColor: '#0C4A6E', headingFont: 'Inter', bodyFont: 'Inter', cornerStyle: 'sharp' },
  { id: 'royal', label: 'Royal Plum', primaryColor: '#4C1D95', accentColor: '#FBBF24', surfaceColor: '#FAF5FF', textColor: '#2E1065', buttonColor: '#4C1D95', buttonHoverColor: '#A16207', linkColor: '#6B21A8', linkHoverColor: '#581C87', headingFont: 'Merriweather', bodyFont: 'Poppins', cornerStyle: 'soft' },
  { id: 'ocean', label: 'Ocean Teal', primaryColor: '#115E59', accentColor: '#2DD4BF', surfaceColor: '#F0FDFA', textColor: '#134E4A', buttonColor: '#115E59', buttonHoverColor: '#0F766E', linkColor: '#0F766E', linkHoverColor: '#134E4A', headingFont: 'Lora', bodyFont: 'Roboto', cornerStyle: 'soft' },
  { id: 'rose', label: 'Rosewood', primaryColor: '#881337', accentColor: '#FDA4AF', surfaceColor: '#FFF1F2', textColor: '#4C0519', buttonColor: '#881337', buttonHoverColor: '#BE123C', linkColor: '#9F1239', linkHoverColor: '#4C0519', headingFont: 'Playfair Display', bodyFont: 'Open Sans', cornerStyle: 'soft' },
  { id: 'forest', label: 'Forest and Copper', primaryColor: '#1F5132', accentColor: '#D97736', surfaceColor: '#F5F8F2', textColor: '#1B2B20', buttonColor: '#1F5132', buttonHoverColor: '#A84E1D', linkColor: '#1F5132', linkHoverColor: '#7C3B1D', headingFont: 'Merriweather', bodyFont: 'Nunito', cornerStyle: 'soft' },
  { id: 'sky', label: 'Sky and Indigo', primaryColor: '#1E40AF', accentColor: '#38BDF8', surfaceColor: '#F0F9FF', textColor: '#172554', buttonColor: '#1E40AF', buttonHoverColor: '#0369A1', linkColor: '#1D4ED8', linkHoverColor: '#1E3A8A', headingFont: 'Crimson Text', bodyFont: 'Manrope', cornerStyle: 'soft' },
  { id: 'earth', label: 'Earth and Sand', primaryColor: '#57534E', accentColor: '#D6A756', surfaceColor: '#FAF7F0', textColor: '#292524', buttonColor: '#57534E', buttonHoverColor: '#8A5A18', linkColor: '#57534E', linkHoverColor: '#78350F', headingFont: 'Lora', bodyFont: 'Nunito', cornerStyle: 'soft' },
  { id: 'midnight', label: 'Midnight and Silver', primaryColor: '#111827', accentColor: '#94A3B8', surfaceColor: '#F1F5F9', textColor: '#111827', buttonColor: '#111827', buttonHoverColor: '#334155', linkColor: '#334155', linkHoverColor: '#0F172A', headingFont: 'Merriweather', bodyFont: 'Inter', cornerStyle: 'sharp' },
  { id: 'marigold', label: 'Marigold and Deep Green', primaryColor: '#166534', accentColor: '#EAB308', surfaceColor: '#FFFBEB', textColor: '#1C2B20', buttonColor: '#166534', buttonHoverColor: '#A16207', linkColor: '#166534', linkHoverColor: '#713F12', headingFont: 'Playfair Display', bodyFont: 'Poppins', cornerStyle: 'soft' }
]);

const BrandingContext = createContext({ branding: DEFAULT_GURDWARA_BRANDING, logoSrc: gurdwaraLogo, isLoading: false });
const hexToRgb = (value, fallback) => {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(value || ''));
  return match ? `${parseInt(match[1], 16)} ${parseInt(match[2], 16)} ${parseInt(match[3], 16)}` : fallback;
};
const parseHex = (hex) => [1, 3, 5].map((index) => parseInt(String(hex).slice(index, index + 2), 16));
const mixHex = (hex, targetHex, weight) => parseHex(hex).map((channel, index) => Math.round(channel * (1 - weight) + parseHex(targetHex)[index] * weight));
const rgbToHex = (rgb) => `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
const THEME_SHADE_MIX = Object.freeze({ 50: ['#fff', 0.94], 100: ['#fff', 0.88], 200: ['#fff', 0.76], 300: ['#fff', 0.6], 400: ['#fff', 0.4], 500: ['#fff', 0.22], 600: ['#fff', 0.1], 700: ['#000', 0], 800: ['#000', 0.15], 900: ['#000', 0.3], 950: ['#000', 0.45] });

export const BrandingProvider = ({ children }) => {
  const { data, isLoading } = useQuery({ queryKey: ['gurdwara-branding'], queryFn: () => brandingService.getBranding().then((response) => response.data), staleTime: 5 * 60 * 1000, retry: false });
  const branding = { ...DEFAULT_GURDWARA_BRANDING, ...(data || {}) };
  const logoSrc = branding.logoUrl || gurdwaraLogo;

  useEffect(() => {
    const root = document.documentElement;
    const variables = {
      '--brand-blue': branding.primaryColor,
      '--brand-blue-rgb': hexToRgb(branding.primaryColor, '11 78 162'),
      '--brand-navy': branding.primaryColor,
      '--brand-navy-rgb': hexToRgb(branding.primaryColor, '29 53 87'),
      '--brand-saffron': branding.accentColor,
      '--brand-saffron-rgb': hexToRgb(branding.accentColor, '244 163 0'),
      '--brand-gold': branding.accentColor,
      '--brand-gold-rgb': hexToRgb(branding.accentColor, '200 155 60'),
      '--brand-cream': branding.surfaceColor,
      '--brand-cream-rgb': hexToRgb(branding.surfaceColor, '255 248 232')
    };
    if (/^#[0-9a-f]{6}$/i.test(branding.primaryColor || '')) {
      Object.entries(THEME_SHADE_MIX).forEach(([shade, [target, weight]]) => {
        const normalizedTarget = target === '#fff' ? '#ffffff' : target === '#000' ? '#000000' : target;
        variables[`--theme-${shade}-rgb`] = mixHex(branding.primaryColor, normalizedTarget, weight).join(' ');
      });
      variables['--theme-dark'] = rgbToHex(mixHex(branding.primaryColor, '#000000', 0.55));
      variables['--theme-darker'] = rgbToHex(mixHex(branding.primaryColor, '#000000', 0.72));
    }
    const isHex = (value) => /^#[0-9a-f]{6}$/i.test(value || '');
    variables['--theme-button'] = isHex(branding.buttonColor) ? branding.buttonColor : branding.primaryColor;
    variables['--theme-button-hover'] = isHex(branding.buttonHoverColor) ? branding.buttonHoverColor : branding.accentColor;
    const headingFont = BRANDING_FONT_OPTIONS.includes(branding.headingFont) ? branding.headingFont : DEFAULT_GURDWARA_BRANDING.headingFont;
    const bodyFont = BRANDING_FONT_OPTIONS.includes(branding.bodyFont) ? branding.bodyFont : DEFAULT_GURDWARA_BRANDING.bodyFont;
    variables['--font-heading'] = `'${headingFont}', serif`;
    variables['--font-body'] = `'${bodyFont}', sans-serif`;
    Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value));
    const optionalColors = [
      [branding.textColor, '--brand-text', 'customText'], [branding.buttonHoverColor, '--brand-hover', 'customHover'],
      [branding.buttonColor, '--brand-button', 'customButton'], [branding.linkColor, '--brand-link', 'customLink'], [branding.linkHoverColor, '--brand-link-hover', 'customLinkHover']
    ];
    optionalColors.forEach(([color, variable, flag]) => {
      if (!isHex(color)) return;
      root.style.setProperty(variable, color);
      root.dataset[flag] = 'true';
    });
    root.dataset.cornerStyle = branding.cornerStyle === 'sharp' ? 'sharp' : 'soft';
    root.dataset.logoShape = branding.logoShape === 'original' ? 'original' : 'circle';
    const customFonts = [headingFont, bodyFont].filter((font) => !['Crimson Text', 'Manrope'].includes(font));
    let fontLink = null;
    if (customFonts.length) {
      fontLink = document.createElement('link');
      fontLink.rel = 'stylesheet';
      fontLink.href = `https://fonts.googleapis.com/css2?${[...new Set(customFonts)].map((font) => `family=${font.replace(/ /g, '+')}:wght@400;600;700`).join('&')}&display=swap`;
      document.head.appendChild(fontLink);
    }
    return () => {
      Object.keys(variables).forEach((name) => root.style.removeProperty(name));
      delete root.dataset.cornerStyle;
      delete root.dataset.logoShape;
      ['customText', 'customHover', 'customButton', 'customLink', 'customLinkHover'].forEach((flag) => delete root.dataset[flag]);
      ['--brand-text', '--brand-hover', '--brand-button', '--brand-link', '--brand-link-hover'].forEach((variable) => root.style.removeProperty(variable));
      fontLink?.remove();
    };
  }, [branding.accentColor, branding.primaryColor, branding.surfaceColor, branding.headingFont, branding.bodyFont, branding.cornerStyle, branding.logoShape, branding.textColor, branding.buttonHoverColor, branding.buttonColor, branding.linkColor, branding.linkHoverColor]);

  useEffect(() => {
    if (!branding.faviconUrl && !branding.logoUrl) return undefined;
    const icon = document.querySelector('link[rel="icon"]');
    if (!icon) return undefined;
    const previous = icon.getAttribute('href');
    icon.setAttribute('href', branding.faviconUrl || branding.logoUrl);
    return () => icon.setAttribute('href', previous);
  }, [branding.faviconUrl, branding.logoUrl]);
  useEffect(() => { if (branding.organizationName) document.title = branding.organizationName; }, [branding.organizationName]);
  return <BrandingContext.Provider value={{ branding, logoSrc, isLoading }}>{children}</BrandingContext.Provider>;
};

export const useBranding = () => useContext(BrandingContext);