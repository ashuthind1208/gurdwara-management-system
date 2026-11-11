const ALLOWED_TAGS = new Set(['a', 'b', 'blockquote', 'br', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'hr', 'i', 'img', 'li', 'ol', 'p', 's', 'span', 'strong', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul']);
const DROP_CONTENT_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template']);
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/i;

const safeUrl = (value, { image = false } = {}) => {
  const url = String(value || '').trim();
  if (!url || url.startsWith('//') || [...url].some((character) => character.charCodeAt(0) <= 32)) return '';
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return '';
    if (image) return ['http:', 'https:'].includes(parsed.protocol) ? url : '';
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol) ? url : '';
  } catch {
    return '';
  }
};

const sanitizeNode = (node, documentRef) => {
  if (node.nodeType === 3) return documentRef.createTextNode(node.nodeValue || '');
  if (node.nodeType !== 1) return null;
  const tag = node.tagName.toLowerCase();
  if (DROP_CONTENT_TAGS.has(tag)) return null;
  if (!ALLOWED_TAGS.has(tag)) {
    const fragment = documentRef.createDocumentFragment();
    [...node.childNodes].forEach((child) => {
      const safeChild = sanitizeNode(child, documentRef);
      if (safeChild) fragment.appendChild(safeChild);
    });
    return fragment;
  }

  const clean = documentRef.createElement(tag);
  if (tag === 'a') {
    const href = safeUrl(node.getAttribute('href'));
    if (href) clean.setAttribute('href', href);
    if (href.startsWith('http')) {
      clean.setAttribute('target', '_blank');
      clean.setAttribute('rel', 'noopener noreferrer');
    }
  }
  if (tag === 'img') {
    const src = safeUrl(node.getAttribute('src'), { image: true });
    if (!src) return null;
    clean.setAttribute('src', src);
    clean.setAttribute('alt', String(node.getAttribute('alt') || '').slice(0, 300));
    for (const dimension of ['width', 'height']) {
      const value = Number(node.getAttribute(dimension));
      if (Number.isInteger(value) && value > 0 && value <= 1920) clean.setAttribute(dimension, String(value));
    }
  }
  if (tag === 'font') {
    const color = String(node.getAttribute('color') || '').trim();
    if (SAFE_COLOR.test(color)) clean.setAttribute('color', color);
  }
  if (tag === 'span') {
    const color = String(node.style?.color || '').trim();
    if (SAFE_COLOR.test(color)) clean.style.color = color;
  }
  [...node.childNodes].forEach((child) => {
    const safeChild = sanitizeNode(child, documentRef);
    if (safeChild) clean.appendChild(safeChild);
  });
  return clean;
};

export const sanitizeWidgetHtml = (html) => {
  if (typeof html !== 'string' || typeof DOMParser === 'undefined') return '';
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const output = document.createElement('div');
  [...parsed.body.childNodes].forEach((node) => {
    const safeNode = sanitizeNode(node, document);
    if (safeNode) output.appendChild(safeNode);
  });
  return output.innerHTML;
};

export default sanitizeWidgetHtml;
