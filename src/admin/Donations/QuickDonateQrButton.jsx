import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useBranding } from '../../context/BrandingContext';
import { buildQuickDonatePath } from '../../utils/quickDonate';

const QuickDonateQrButton = ({ campaigns = [] }) => {
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState('');
  const qrRef = useRef(null);
  const triggerRef = useRef(null);
  const { branding } = useBranding();
  useEffect(() => {
    if (!open) return undefined;
    const trigger = triggerRef.current;
    return () => trigger?.focus();
  }, [open]);
  const handleDialogKey = (event) => {
    if (event.key === 'Escape') setOpen(false);
    if (event.key !== 'Tab') return;
    const controls = event.currentTarget.querySelectorAll('button, select, a[href]');
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const eligible = campaigns.filter((entry) => entry.isActive === true && entry.isClosed === false && entry.id != null
    && String(entry.paymentProvider || entry.payment_provider || 'STRIPE').toUpperCase() === 'STRIPE');
  const campaign = eligible.find((entry) => String(entry.id) === campaignId);
  const path = buildQuickDonatePath(campaign?.id);
  const url = `${window.location.origin}${path}`;
  const download = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl; anchor.download = 'gurdwara-quick-donate-qr.svg'; anchor.click();
    URL.revokeObjectURL(objectUrl);
  };
  return <>
    <button ref={triggerRef} type="button" onClick={() => { setCampaignId(''); setOpen(true); }} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-brand-blue">Quick Donate QR</button>
    {open ? createPortal(<div className="fixed inset-0 z-[290] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label="Quick Donate QR" onKeyDown={handleDialogKey} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold text-brand-blue">Quick Donate QR</h2><button autoFocus type="button" onClick={() => setOpen(false)} className="rounded-lg border px-3 py-2 text-sm">Close</button></div>
        <p className="mt-2 text-sm text-slate-600">Select a campaign to download its QR or open its LED board.</p>
        <label className="mt-4 block text-sm font-semibold">Donation campaign<select aria-label="QR donation campaign" value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="">Select a donation campaign</option>{eligible.map((entry) => <option key={entry.id} value={String(entry.id)}>{entry.name || entry.campaignName || `Campaign ${entry.id}`}</option>)}</select></label>
        {!eligible.length ? <p className="mt-3 text-sm text-amber-800">Create or activate a campaign with Stripe selected as its payment provider.</p> : null}
        {campaign ? <><div className="mt-5 rounded-xl border p-5 text-center"><p className="font-bold text-brand-blue">{branding.organizationName}</p><p className="mt-1 text-sm text-slate-600">Scan to donate</p><div ref={qrRef} className="mt-4 flex justify-center"><QRCodeSVG value={url} size={220} marginSize={4} level="M" /></div></div><p className="mt-3 break-all text-xs text-slate-500">{url}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={download} className="flex-1 rounded-lg bg-brand-blue px-4 py-2 text-sm font-bold text-white">Download QR</button><a href={path} target="_blank" rel="noreferrer" className="rounded-lg border px-4 py-2 text-sm font-bold">Preview</a><a href={`/quick-donate-board?${new URLSearchParams({ campaign: String(campaign.id) })}`} target="_blank" rel="noreferrer" className="rounded-lg border px-4 py-2 text-sm font-bold">Open LED board</a></div></> : null}
        <p className="mt-4 text-xs text-slate-500">Apple Pay and Google Pay appear only on supported devices after Stripe is configured. For printed posters, generate the QR on the live website—not localhost.</p>
      </section>
    </div>, document.body) : null}
  </>;
};

export default QuickDonateQrButton;