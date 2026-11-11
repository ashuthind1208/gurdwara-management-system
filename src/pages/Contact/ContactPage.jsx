import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ClockIcon,
  EnvelopeIcon,
  MapPinIcon,
  PhoneIcon
} from '@heroicons/react/24/outline';
import PageHero from '../../components/common/PageHero';
import ContactForm from '../../components/forms/ContactForm';
import { siteConfig } from '../../constants/siteConfig';
import useSeoMeta from '../../hooks/useSeoMeta';
import Seo from '../../components/common/Seo';
import cmsService from '../../services/cmsService';

const DEFAULT_CONTACT_HOURS = [
  { label: 'Darbar Sahib', value: 'Daily: 5:00 AM to 9:00 PM' },
  { label: 'Langar Hall', value: 'Weekends and Gurpurab Specials' },
  { label: 'Office Support', value: 'Mon-Sun: 10:00 AM to 6:00 PM' }
];

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildContactInquiryHtml = ({ siteName, logoUrl, name, email, phone, message }) => {
  const submittedAt = new Date().toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `
  <div style="background:#f5f8fc;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f6;border-radius:14px;overflow:hidden;">
      <tr>
        <td style="padding:16px 22px;background:linear-gradient(90deg,#0a4d9f,#0b67c2,#e58b16);color:#ffffff;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="vertical-align:middle;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    ${logoUrl ? `<td style="width:44px;padding-right:12px;vertical-align:middle;"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(siteName)} logo" width="44" height="44" style="display:block;border-radius:9999px;background:#ffffff;object-fit:cover;"/></td>` : ''}
                    <td style="vertical-align:middle;">
                      <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.9;">${escapeHtml(siteName)}</div>
                      <div style="font-size:18px;font-weight:800;line-height:1.3;margin-top:2px;">Contact Us Inquiry</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 22px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid #c7dcf7;border-radius:14px;overflow:hidden;background:#f6faff;box-shadow:0 8px 24px -18px rgba(11,103,194,.65);margin-bottom:16px;">
            <tr>
              <td colspan="2" style="padding:11px 14px;background:linear-gradient(90deg,#eaf2ff,#f6f9ff);border-bottom:1px solid #c7dcf7;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#0a4d9f;">Submission Details</td>
            </tr>
            <tr>
              <td style="width:34%;padding:11px 12px;border-right:1px solid #d7e3f3;border-bottom:1px solid #d7e3f3;background:#edf4ff;font-size:12px;font-weight:700;color:#1e3a8a;">Name</td>
              <td style="padding:11px 12px;border-bottom:1px solid #d7e3f3;background:#ffffff;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(name || '-')}</td>
            </tr>
            <tr>
              <td style="width:34%;padding:11px 12px;border-right:1px solid #d7e3f3;border-bottom:1px solid #d7e3f3;background:#edf4ff;font-size:12px;font-weight:700;color:#1e3a8a;">Email</td>
              <td style="padding:11px 12px;border-bottom:1px solid #d7e3f3;background:#ffffff;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(email || '-')}</td>
            </tr>
            <tr>
              <td style="width:34%;padding:11px 12px;border-right:1px solid #d7e3f3;border-bottom:1px solid #d7e3f3;background:#edf4ff;font-size:12px;font-weight:700;color:#1e3a8a;">Phone</td>
              <td style="padding:11px 12px;border-bottom:1px solid #d7e3f3;background:#ffffff;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(phone || '-')}</td>
            </tr>
            <tr>
              <td style="width:34%;padding:11px 12px;border-right:1px solid #d7e3f3;background:#edf4ff;font-size:12px;font-weight:700;color:#1e3a8a;">Submitted</td>
              <td style="padding:11px 12px;background:#ffffff;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(submittedAt)}</td>
            </tr>
          </table>
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#0b67c2;margin-bottom:8px;">Message</div>
          <div style="border:1px solid #cfe1fb;border-radius:12px;background:#ffffff;padding:12px 14px;line-height:1.6;white-space:pre-wrap;box-shadow:inset 0 0 0 1px #f5f9ff;">${escapeHtml(message || '-')}</div>
        </td>
      </tr>
    </table>
  </div>`;
};

const ContactPage = () => {
  const [isSendingContactMessage, setIsSendingContactMessage] = useState(false);
  const contactSubmitEndpoint = String(
    process.env.REACT_APP_WEBHOOK_URL ||
    process.env.REACT_APP_CONTACT_US_WEBHOOK_URL ||
    '/api/internal/mail-relay'
  ).trim() || '/api/internal/mail-relay';
  const meta = useSeoMeta('Contact', 'Contact details, map placeholder, directions, and inquiry form.');
  const { data: content } = useQuery({
    queryKey: ['page-content', 'contact'],
    queryFn: () => cmsService.getPageContent('contact').then((res) => res.data)
  });

  const onSubmit = async (values) => {
    if (isSendingContactMessage) {
      return;
    }

    setIsSendingContactMessage(true);
    try {
      const siteName = String(siteConfig.name || 'Your Gurdwara').trim();
      const logoUrl = String(process.env.REACT_APP_NEWSLETTER_LOGO_URL || '').trim();
      const recipientEmail = String(email || '').trim();
      const subject = `Contact Us Inquiry from ${String(values?.name || 'Visitor').trim()}`;
      const htmlBody = buildContactInquiryHtml({
        siteName,
        logoUrl,
        name: values?.name,
        email: values?.email,
        phone: values?.phone,
        message: values?.message
      });
      const textBody = [
        `Contact inquiry received - ${siteName}`,
        '',
        `Name: ${String(values?.name || '').trim()}`,
        `Email: ${String(values?.email || '').trim()}`,
        `Phone: ${String(values?.phone || '').trim() || '-'}`,
        '',
        'Message:',
        String(values?.message || '').trim()
      ].join('\n');

      const contactPayload = {
        name: String(values?.name || '').trim(),
        email: String(values?.email || '').trim(),
        phone: String(values?.phone || '').trim(),
        message: String(values?.message || '').trim(),
        subject,
        to: recipientEmail
      };

      const relayPayload = {
        ...contactPayload,
        type: 'contact',
        html: htmlBody,
        bodyHtml: htmlBody,
        body: htmlBody,
        text: textBody,
        bodyText: textBody
      };

      const endpointUsesRelay = /\/api\/internal\/mail-relay\/?$/i.test(contactSubmitEndpoint);

      const contactResponse = await fetch(contactSubmitEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endpointUsesRelay ? relayPayload : contactPayload)
      });

      const contactBody = await contactResponse.json().catch(() => ({}));
      if (contactResponse.ok && contactBody?.ok !== false) {
        window.alert('Thank you. Your message has been sent successfully.');
        return;
      }

      // If a custom endpoint is configured and fails, do not silently override it.
      if (contactSubmitEndpoint !== '/api/contact-us/send' || contactResponse.status !== 404) {
        throw new Error(String(contactBody?.message || 'Unable to send your message right now.'));
      }

      const response = await fetch('/api/internal/mail-relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(relayPayload)
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) {
        throw new Error(String(body?.message || 'Unable to send your message right now.'));
      }

      window.alert('Thank you. Your message has been sent successfully.');
    } catch (error) {
      window.alert(String(error?.message || 'Unable to send your message right now.'));
    } finally {
      setIsSendingContactMessage(false);
    }
  };

  const address = content?.address || siteConfig.contact.address || '';
  const phone = content?.phone || siteConfig.contact.phone;
  const email = content?.email || siteConfig.contact.email;
  const normalizedPhone = String(phone || '').replace(/[^\d+]/g, '');
  const phoneHref = normalizedPhone ? `tel:${normalizedPhone}` : '#';
  const emailHref = `mailto:${email}`;
  const fallbackEmbed = `https://maps.google.com/maps?q=${encodeURIComponent(address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
  const mapEmbedSrc = fallbackEmbed;
  const mapOpenLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const social = siteConfig.social || {};
  const contactHours = Array.isArray(content?.contactHours) ? content.contactHours : DEFAULT_CONTACT_HOURS;
  const facebookUrl = String(content?.socialLinks?.facebook || social.facebook || '').trim();
  const instagramUrl = String(content?.socialLinks?.instagram || social.instagram || '').trim();

  return (
    <div className="space-y-8">
      <Seo {...meta} />
      <PageHero eyebrow="Connect with Sangat" title={content?.heroTitle ?? 'Contact Us'} />

      {content?.mediaUrl ? (
        <img
          src={content.mediaUrl}
          alt="Contact media"
          className="h-56 w-full rounded-2xl border border-slate-200 object-cover shadow-[0_18px_40px_-36px_rgba(15,23,42,0.7)]"
          loading="lazy"
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_-42px_rgba(15,23,42,0.7)] sm:p-5">
            <h3 className="font-heading text-2xl font-semibold text-brand-blue">Visit or Contact</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <PhoneIcon className="h-4 w-4" />
                  Phone
                </p>
                <a href={phoneHref} className="mt-1 block text-sm font-semibold text-slate-900 hover:text-brand-blue">{phone}</a>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <EnvelopeIcon className="h-4 w-4" />
                  Email
                </p>
                <a href={emailHref} className="mt-1 block truncate text-sm font-semibold text-slate-900 hover:text-brand-blue">{email}</a>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <MapPinIcon className="h-4 w-4" />
                  Address
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{address}</p>
              </div>
            </div>
          </article>

          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_45px_-42px_rgba(15,23,42,0.7)] sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <h3 className="font-heading text-xl font-semibold text-brand-blue">Find Us on Map</h3>
              <a href={mapOpenLink} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-brand-blue transition hover:border-brand-blue/30 hover:bg-blue-50">Open Google Maps</a>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <iframe
                title="Gurdwara location map"
                src={mapEmbedSrc}
                className="h-72 w-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </article>
        </section>

        <section className="space-y-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_-42px_rgba(15,23,42,0.7)] sm:p-5">
            <h3 className="font-heading text-2xl font-semibold text-brand-blue">Send a Message</h3>
            <p className="mt-1 text-sm text-slate-600">Share your query and the team will connect with you shortly.</p>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/55 p-3 sm:p-4">
              <ContactForm onSubmit={onSubmit} isSubmitting={isSendingContactMessage} />
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_-42px_rgba(15,23,42,0.7)]">
            <h3 className="font-heading text-xl font-semibold text-brand-blue">Hours &amp; Channels</h3>
            <ul className="mt-3 space-y-2">
              {contactHours.filter((item) => item?.label || item?.value).map((item, index) => (
                <li key={`${item.label}-${index}`} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                  <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                    <p className="text-sm font-semibold text-slate-900">{item.value}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {facebookUrl ? <a href={facebookUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 transition hover:border-brand-blue/30 hover:text-brand-blue">Facebook</a> : null}
              {instagramUrl ? <a href={instagramUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 transition hover:border-brand-blue/30 hover:text-brand-blue">Instagram</a> : null}
            </div>
          </article>
        </section>
      </div>

      {(content?.sections || []).length > 0 ? (
        <section className="space-y-3">
          {(content.sections || []).map((section) => (
            <article key={section.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_14px_35px_-38px_rgba(15,23,42,0.8)]">
              <h3 className="font-heading text-lg font-semibold text-brand-blue">{section.title}</h3>
              <div className="mt-1 text-sm leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: section.body }} />
              {section.mediaUrl ? <img src={section.mediaUrl} alt={section.title} className="mt-3 h-48 w-full rounded-lg object-contain bg-slate-50" loading="lazy" /> : null}
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
};

export default ContactPage;
