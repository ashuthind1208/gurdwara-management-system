import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { BRANDING_FONT_OPTIONS, BRANDING_PRESETS, BRANDING_THEME_KEYS, DEFAULT_GURDWARA_BRANDING } from '../../context/BrandingContext';
import brandingService from '../../services/brandingService';
import uploadService from '../../services/uploadService';
import gurdwaraLogo from '../../assets/default-gurdwara.svg';

const CONTACT_FIELDS = ['address', 'phone', 'email', 'facebookUrl', 'instagramUrl', 'youtubeUrl'];
const getReadableTextColor = (hexColor) => {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hexColor || ''));
  if (!match) return '#FFFFFF';
  const rgb = match.slice(1).map((channel) => parseInt(channel, 16) / 255);
  const luminance = rgb.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return (0.2126 * luminance[0]) + (0.7152 * luminance[1]) + (0.0722 * luminance[2]) > 0.45 ? '#172033' : '#FFFFFF';
};

const AdminGurdwaraBrandingPage = () => {
  const queryClient = useQueryClient();
  const [uploadState, setUploadState] = useState({ pending: false, progress: 0, error: '' });
  const [themeName, setThemeName] = useState('');
  const [selectedSavedThemeId, setSelectedSavedThemeId] = useState('');
  const form = useForm({ defaultValues: DEFAULT_GURDWARA_BRANDING });
  const { data, error: brandingLoadError } = useQuery({
    queryKey: ['gurdwara-branding'],
    queryFn: () => brandingService.getBranding().then((response) => response.data)
  });

  useEffect(() => {
    if (data) form.reset({ ...DEFAULT_GURDWARA_BRANDING, ...data });
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: ({ values, section }) => {
      const merged = { ...DEFAULT_GURDWARA_BRANDING, ...(data || {}) };
      Object.keys(DEFAULT_GURDWARA_BRANDING).forEach((key) => {
        if (CONTACT_FIELDS.includes(key) === (section === 'contact')) merged[key] = values[key];
      });
      return brandingService.saveBranding({
        organizationName: String(merged.organizationName || '').trim(),
        shortName: String(merged.shortName || '').trim(),
        logoUrl: String(merged.logoUrl || '').trim(),
        primaryColor: String(merged.primaryColor || '').trim().toUpperCase(),
        accentColor: String(merged.accentColor || '').trim().toUpperCase(),
        surfaceColor: String(merged.surfaceColor || '').trim().toUpperCase(),
        savedThemes: Array.isArray(merged.savedThemes) ? merged.savedThemes : [],
        ...Object.fromEntries(['footerColor', 'textColor', 'buttonColor', 'buttonHoverColor', 'linkColor', 'linkHoverColor', 'tagline', 'faviconUrl', 'headingFont', 'bodyFont', 'cornerStyle', 'logoShape', ...CONTACT_FIELDS].map((key) => [key, String(merged[key] || '').trim()]))
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gurdwara-branding'] });
      queryClient.invalidateQueries({ queryKey: ['ask-granthi-board'] });
    }
  });

  const applyTheme = (themeValues) => {
    const derived = {
      footerColor: themeValues.primaryColor,
      buttonColor: themeValues.primaryColor,
      buttonHoverColor: themeValues.accentColor,
      linkColor: themeValues.primaryColor,
      linkHoverColor: themeValues.accentColor
    };
    const current = form.getValues();
    const applied = { ...current };
    BRANDING_THEME_KEYS.forEach((field) => {
      applied[field] = themeValues[field] ?? derived[field] ?? '';
      form.setValue(field, applied[field], { shouldDirty: true, shouldValidate: true });
    });
    saveMutation.mutate({ values: applied, section: 'branding' });
  };

  const saveCurrentTheme = () => {
    const name = themeName.trim();
    if (!name) return;
    const current = form.getValues();
    const theme = {
      id: `theme-${Date.now().toString(36)}`,
      name,
      values: Object.fromEntries(BRANDING_THEME_KEYS.map((key) => [key, String(current[key] || '')]))
    };
    const savedThemes = [...(current.savedThemes || []), theme].slice(-12);
    form.setValue('savedThemes', savedThemes, { shouldDirty: true });
    setThemeName('');
    saveMutation.mutate({ values: { ...current, savedThemes }, section: 'branding' });
  };

  const deleteSavedTheme = (themeId) => {
    const savedThemes = (form.getValues('savedThemes') || []).filter((theme) => theme.id !== themeId);
    const current = { ...form.getValues(), savedThemes };
    form.setValue('savedThemes', savedThemes, { shouldDirty: true });
    saveMutation.mutate({ values: current, section: 'branding' });
  };

  const saveSection = (section) => form.handleSubmit((payload) => saveMutation.mutate({ values: payload, section }))();
  const renderSaveStatus = (section) => {
    if (saveMutation.variables?.section !== section) return null;
    if (saveMutation.isError) return <p role="alert" className="mb-3 w-full whitespace-nowrap rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{saveMutation.error?.response?.data?.message || saveMutation.error?.message || 'Unable to save. Check the entered details.'}</p>;
    if (saveMutation.isSuccess) return <p role="status" className="mb-3 w-full whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{section === 'contact' ? 'Contact information saved.' : 'Branding saved and published across the application.'}</p>;
    return null;
  };

  const uploadLogo = async (file, field = 'logoUrl') => {
    if (!file) return;
    setUploadState({ pending: true, progress: 0, error: '' });
    try {
      const uploaded = await uploadService.uploadFile({
        service: 'cms',
        file,
        allowedMimeTypes: ['image/*'],
        maxSizeMB: 5,
        onProgress: (progress) => setUploadState({ pending: true, progress, error: '' })
      });
      form.setValue(field, String(uploaded?.url || ''), { shouldDirty: true, shouldValidate: true });
      setUploadState({ pending: false, progress: 0, error: '' });
    } catch (error) {
      setUploadState({ pending: false, progress: 0, error: error.message || 'Unable to upload logo.' });
    }
  };

  const values = form.watch();
  const logoSrc = values.logoUrl || gurdwaraLogo;

  useEffect(() => {
    const fonts = [...new Set([values.headingFont, values.bodyFont])].filter((font) => BRANDING_FONT_OPTIONS.includes(font));
    if (!fonts.length) return undefined;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?${fonts.map((font) => `family=${font.replace(/ /g, '+')}:wght@400;600;700`).join('&')}&display=swap`;
    document.head.appendChild(link);
    return () => link.remove();
  }, [values.headingFont, values.bodyFont]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Super Admin only</p>
        <h1 className="mt-1 font-heading text-2xl font-semibold text-slate-900">Gurdwara Branding</h1>
        <p className="mt-1 text-sm text-slate-600">Configure the name, logo, and theme used across the public website, admin portal, displays, and mobile pages.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <Card className="rounded-lg hover:translate-y-0">
          <form onSubmit={(event) => { event.preventDefault(); saveSection('branding'); }} className="space-y-4">
            <label className="block text-sm font-semibold text-slate-700">Gurdwara name
              <input {...form.register('organizationName', { required: true, minLength: 2, maxLength: 120 })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-normal" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">Short name
              <input {...form.register('shortName', { required: true, minLength: 2, maxLength: 80 })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-normal" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">Logo URL
              <input {...form.register('logoUrl')} placeholder="https://... or /uploads/..." className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-normal" />
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="mt-2 block w-full text-xs font-normal" onChange={(event) => uploadLogo(event.target.files?.[0])} />
              <p className="mt-1 text-xs font-normal text-slate-500">Paste a URL or upload PNG, JPEG, WebP, or GIF up to 5 MB.</p>
              {uploadState.pending ? <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand-blue transition-all" style={{ width: `${uploadState.progress}%` }} /></div> : null}
              {uploadState.error ? <p className="mt-2 text-xs font-semibold text-red-700">{uploadState.error}</p> : null}
            </label>

            <label className="block text-sm font-semibold text-slate-700">Tagline
              <input {...form.register('tagline', { maxLength: 240 })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-normal" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">Favicon URL (optional, defaults to the logo)
              <input {...form.register('faviconUrl')} placeholder="https://... or /uploads/..." className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 font-normal" />
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="mt-2 block w-full text-xs font-normal" onChange={(event) => uploadLogo(event.target.files?.[0], 'faviconUrl')} />
            </label>

            <fieldset className="rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold text-slate-700">Theme presets</legend>
              <div className="flex flex-wrap gap-2">{BRANDING_PRESETS.map((preset) => (
                <button key={preset.id} type="button" onClick={() => applyTheme(preset)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <span className="flex gap-0.5">{[preset.primaryColor, preset.accentColor, preset.surfaceColor].map((color) => <span key={color} className="h-4 w-4 rounded-full border border-slate-300" style={{ backgroundColor: color }} />)}</span>{preset.label}
                </button>
              ))}</div>
            </fieldset>

            <fieldset className="rounded-lg border border-slate-200 p-3">
              <legend className="px-1 text-sm font-semibold text-slate-700">My saved themes</legend>
              <p className="text-xs text-slate-500">Apply or create themes from Theme actions below.</p>
              <ul className="mt-2 divide-y divide-slate-100">{(values.savedThemes || []).map((theme) => (
                <li key={theme.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2"><span className="flex gap-0.5">{[theme.values.primaryColor, theme.values.accentColor, theme.values.surfaceColor].map((color, index) => <span key={index} className="h-4 w-4 rounded-full border border-slate-300" style={{ backgroundColor: color }} />)}</span><span className="truncate font-semibold text-slate-800">{theme.name}</span></span>
                  <button type="button" onClick={() => deleteSavedTheme(theme.id)} className="text-xs font-semibold text-red-700 underline">Delete</button>
                </li>
              ))}{!(values.savedThemes || []).length ? <li className="py-2 text-xs text-slate-500">No saved themes yet.</li> : null}</ul>
            </fieldset>

            <fieldset className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-4">
              <legend className="px-1 text-sm font-semibold text-slate-700">Application theme</legend>
              <p className="text-xs text-slate-500 sm:col-span-4">Primary: header and navigation. Accent: highlights and secondary buttons. Surface: page canvas. Footer can have its own color or follow primary.</p>
              {[
                ['primaryColor', 'Primary'],
                ['accentColor', 'Accent'],
                ['surfaceColor', 'Surface'],
                ['footerColor', 'Footer background']
              ].map(([field, label]) => (
                <label key={field} className="text-xs font-semibold text-slate-600">{label}
                  <div className="mt-1 flex items-center gap-2">
                    <input type="color" value={values[field] || (field === 'footerColor' ? values.primaryColor || '#0B4EA2' : '#000000')} onChange={(event) => form.setValue(field, event.target.value.toUpperCase(), { shouldDirty: true, shouldValidate: true })} className="h-10 w-12 rounded border border-slate-300 bg-white p-1" />
                    <input {...form.register(field, { required: field !== 'footerColor', pattern: /^(#[0-9a-f]{6})?$/i })} maxLength={7} className="min-w-0 flex-1 rounded-lg border border-slate-300 p-2 font-mono text-xs" />
                  </div>
                </label>
              ))}
            </fieldset>

            <fieldset className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-6">
              <legend className="px-1 text-sm font-semibold text-slate-700">Buttons, links, typography and corners</legend>
              {[
                ['textColor', 'Text color', '#0F172A', 'sm:col-span-6'],
                ['buttonColor', 'Button color', '#0B4EA2', 'sm:col-span-3'],
                ['buttonHoverColor', 'Button hover color', '#1E40AF', 'sm:col-span-3'],
                ['linkColor', 'Link color', '#0B4EA2', 'sm:col-span-3'],
                ['linkHoverColor', 'Link hover color', '#1E40AF', 'sm:col-span-3']
              ].map(([field, label, fallback, span]) => <label key={field} className={`text-xs font-semibold text-slate-600 ${span}`}>{label}
                <div className="mt-1 flex items-center gap-2"><input type="color" aria-label={`Pick ${label.toLowerCase()}`} value={values[field] || fallback} onChange={(event) => form.setValue(field, event.target.value.toUpperCase(), { shouldDirty: true, shouldValidate: true })} className="h-10 w-12 shrink-0 rounded border border-slate-300 bg-white p-1" /><input {...form.register(field, { pattern: /^(#[0-9a-f]{6})?$/i })} maxLength={7} placeholder={fallback} className="min-w-0 flex-1 rounded-lg border border-slate-300 p-2 font-mono text-xs" /></div>
              </label>)}
              {[['headingFont', 'Heading font'], ['bodyFont', 'Body font']].map(([field, label]) => <label key={field} className="text-xs font-semibold text-slate-600 sm:col-span-2">{label}
                <select {...form.register(field)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 font-normal leading-tight">{BRANDING_FONT_OPTIONS.map((font) => <option key={font} value={font} className="py-0 leading-tight">{font}</option>)}</select>
              </label>)}
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Corner style<select {...form.register('cornerStyle')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-normal"><option value="soft">Soft (rounded)</option><option value="sharp">Sharp (square)</option></select></label>
              <div className="sm:col-span-6">{renderSaveStatus('branding')}<Button type="button" className="w-full" onClick={() => saveSection('branding')} disabled={saveMutation.isPending || uploadState.pending}>{saveMutation.isPending ? 'Saving…' : 'Save branding'}</Button></div>
            </fieldset>

            <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4" aria-label="Theme actions">
              <h3 className="font-heading text-lg font-bold text-slate-900">Theme actions</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-3"><label htmlFor="saved-theme-picker" className="block text-xs font-bold uppercase text-slate-600">Apply a saved theme</label><select id="saved-theme-picker" value={selectedSavedThemeId} onChange={(event) => setSelectedSavedThemeId(event.target.value)} disabled={!(values.savedThemes || []).length} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Choose a saved theme…</option>{(values.savedThemes || []).map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select><Button type="button" className="mt-2 w-full" onClick={() => { const theme = (values.savedThemes || []).find((entry) => entry.id === selectedSavedThemeId); if (theme) applyTheme(theme.values); }} disabled={!selectedSavedThemeId || saveMutation.isPending}>Apply theme</Button></div>
                <div className="rounded-lg border border-slate-200 bg-white p-3"><label htmlFor="new-theme-name" className="block text-xs font-bold uppercase text-slate-600">Save current design</label><input id="new-theme-name" value={themeName} onChange={(event) => setThemeName(event.target.value)} maxLength={60} placeholder="Enter a name for this theme" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /><Button type="button" variant="secondary" className="mt-2 w-full" onClick={saveCurrentTheme} disabled={!themeName.trim() || saveMutation.isPending || uploadState.pending}>Save and create theme</Button></div>
              </div>
            </section>

            <fieldset className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold text-slate-700">Contact and social links</legend>
              {[['address', 'Address', 'text'], ['phone', 'Phone', 'text'], ['email', 'Email', 'email'], ['facebookUrl', 'Facebook URL', 'url'], ['instagramUrl', 'Instagram URL', 'url'], ['youtubeUrl', 'YouTube URL', 'url']].map(([field, label, type]) => <label key={field} className="text-xs font-semibold text-slate-600">{label}<input type={type} {...form.register(field)} className="mt-1 w-full rounded-lg border border-slate-300 p-2 font-normal" /></label>)}
              <div className="sm:col-span-2">{renderSaveStatus('contact')}<div className="flex justify-end"><Button type="button" variant="secondary" onClick={() => saveSection('contact')} disabled={saveMutation.isPending}>{saveMutation.isPending && saveMutation.variables?.section === 'contact' ? 'Saving…' : 'Save contact information'}</Button></div></div>
            </fieldset>
            {brandingLoadError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Unable to load saved branding. Defaults are shown until the API is available.</p> : null}

          </form>
        </Card>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="p-5" style={{ backgroundColor: values.primaryColor }}>
            <div className="flex items-center gap-3">
              <img src={logoSrc} alt="Brand preview" className="h-16 w-16 rounded-full border-2 bg-white object-cover" style={{ borderColor: values.accentColor }} />
              <div className="min-w-0">
                <p className="truncate text-xs font-bold uppercase tracking-wider" style={{ color: values.accentColor }}>{values.shortName || 'Short name'}</p>
                <h2 className="mt-1 truncate text-2xl font-bold text-white" style={{ fontFamily: `'${values.headingFont}', serif` }}>{values.organizationName || 'Gurdwara name'}</h2>
              </div>
            </div>
          </div>
          <div className="m-5 rounded-lg p-5" style={{ backgroundColor: values.surfaceColor }}>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Application preview</p>
            <p className="mt-3 text-xl font-bold" style={{ color: values.primaryColor, fontFamily: `'${values.headingFont}', serif` }}>Welcome to {values.shortName || 'your Gurdwara'}</p>
            <div className="mt-4 h-1 w-20" style={{ backgroundColor: values.accentColor }} />
            <div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="rounded-lg border border-slate-200 bg-white/80 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Heading · {values.headingFont}</p><p className="mt-1 text-lg font-bold text-slate-900" style={{ fontFamily: `'${values.headingFont}', serif` }}>Waheguru Ji Ka Khalsa</p></div><div className="rounded-lg border border-slate-200 bg-white/80 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Body · {values.bodyFont}</p><p className="mt-1 text-sm text-slate-700" style={{ fontFamily: `'${values.bodyFont}', sans-serif` }}>Welcome to {values.shortName || 'your Gurdwara'}. Join the sangat for seva.</p></div></div>
            <style>{`.brand-hover-preview{background:${values.buttonColor || values.primaryColor}}.brand-hover-preview:hover{background:${values.buttonHoverColor || values.accentColor}}.brand-link-preview{color:${values.linkColor || values.primaryColor}}.brand-link-preview:hover{color:${values.linkHoverColor || values.accentColor}}`}</style>
            <div className="mt-4 flex flex-wrap items-center gap-4"><button type="button" className="brand-hover-preview rounded-lg px-4 py-2 text-sm font-semibold text-white transition">Hover over me</button><a href="#preview" onClick={(event) => event.preventDefault()} className="brand-link-preview text-sm font-semibold underline">Sample link</a></div>
            <p className="mt-4 text-sm leading-6 text-slate-700">{values.tagline}</p>
            <div className="mt-4 rounded-lg px-4 py-3 text-sm font-semibold" style={{ backgroundColor: values.footerColor || values.primaryColor, color: getReadableTextColor(values.footerColor || values.primaryColor) }}>Footer background preview</div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminGurdwaraBrandingPage;