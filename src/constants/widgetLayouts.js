export const widgetLayouts = [
  { id: 'single-column', label: 'Single column', slots: [{ id: 'main', label: 'Main content', className: 'col-span-12' }], gridClass: 'grid-cols-12' },
  { id: 'two-column', label: 'Two columns', slots: [{ id: 'left', label: 'Left column', className: 'col-span-12 md:col-span-6' }, { id: 'right', label: 'Right column', className: 'col-span-12 md:col-span-6' }], gridClass: 'grid-cols-12' },
  { id: 'three-column', label: 'Three columns', slots: [{ id: 'left', label: 'Left column', className: 'col-span-12 md:col-span-4' }, { id: 'center', label: 'Center column', className: 'col-span-12 md:col-span-4' }, { id: 'right', label: 'Right column', className: 'col-span-12 md:col-span-4' }], gridClass: 'grid-cols-12' },
  { id: 'two-column-header-footer', label: 'Two columns with header & footer', slots: [{ id: 'header', label: 'Header', className: 'col-span-12' }, { id: 'left', label: 'Left column', className: 'col-span-12 md:col-span-6' }, { id: 'right', label: 'Right column', className: 'col-span-12 md:col-span-6' }, { id: 'footer', label: 'Footer', className: 'col-span-12' }], gridClass: 'grid-cols-12' },
  { id: 'two-column-header', label: 'Two columns with header', slots: [{ id: 'header', label: 'Header', className: 'col-span-12' }, { id: 'left', label: 'Left column', className: 'col-span-12 md:col-span-6' }, { id: 'right', label: 'Right column', className: 'col-span-12 md:col-span-6' }], gridClass: 'grid-cols-12' },
  { id: 'two-column-footer', label: 'Two columns with footer', slots: [{ id: 'left', label: 'Left column', className: 'col-span-12 md:col-span-6' }, { id: 'right', label: 'Right column', className: 'col-span-12 md:col-span-6' }, { id: 'footer', label: 'Footer', className: 'col-span-12' }], gridClass: 'grid-cols-12' },
  { id: 'three-column-header-footer', label: 'Three columns with header & footer', slots: [{ id: 'header', label: 'Header', className: 'col-span-12' }, { id: 'left', label: 'Left column', className: 'col-span-12 md:col-span-4' }, { id: 'center', label: 'Center column', className: 'col-span-12 md:col-span-4' }, { id: 'right', label: 'Right column', className: 'col-span-12 md:col-span-4' }, { id: 'footer', label: 'Footer', className: 'col-span-12' }], gridClass: 'grid-cols-12' },
  { id: 'three-column-header', label: 'Three columns with header', slots: [{ id: 'header', label: 'Header', className: 'col-span-12' }, { id: 'left', label: 'Left column', className: 'col-span-12 md:col-span-4' }, { id: 'center', label: 'Center column', className: 'col-span-12 md:col-span-4' }, { id: 'right', label: 'Right column', className: 'col-span-12 md:col-span-4' }], gridClass: 'grid-cols-12' },
  { id: 'three-column-footer', label: 'Three columns with footer', slots: [{ id: 'left', label: 'Left column', className: 'col-span-12 md:col-span-4' }, { id: 'center', label: 'Center column', className: 'col-span-12 md:col-span-4' }, { id: 'right', label: 'Right column', className: 'col-span-12 md:col-span-4' }, { id: 'footer', label: 'Footer', className: 'col-span-12' }], gridClass: 'grid-cols-12' }
];

export const DEFAULT_WIDGET_LAYOUT = 'single-column';
export const getWidgetLayout = (layoutId) => widgetLayouts.find((layout) => layout.id === layoutId) || widgetLayouts[0];
export const getWidgetColumns = (layout) => layout.slots.filter((slot) => slot.id !== 'header' && slot.id !== 'footer');
export const distributePageSections = (sections = [], columns = []) => {
  const grouped = columns.map(() => []);
  if (!columns.length) return grouped;
  (Array.isArray(sections) ? sections : []).forEach((section, index) => grouped[index % columns.length].push(section));
  return grouped;
};
