import contentApiService from './contentApiService';
import apiClient from './apiClient';
import { serviceResponse } from './serviceResponse';
import { siteConfig } from '../constants/siteConfig';
import { createBookingReceiptPdfBlob, downloadBookingReceiptPdf } from '../utils/csvExport';

const BOOKINGS_RESOURCE = 'bookings';
const BOOKING_CATEGORIES_RESOURCE = 'booking_categories';
const BOOKING_SETTINGS_RESOURCE = 'booking_page_settings';

const DEFAULT_BOOKING_SETTINGS = {
  guidelinesTitle: 'Booking Guidelines',
  guidelines: '<p>Please review the available dates and times before submitting your request. A booking is confirmed only after the Gurdwara office reviews the request and any required payment is completed.</p>',
  donationCampaignId: '',
  showCreateBookingButton: true
};

const DEFAULT_CATEGORIES = [
  { id: 'cat-akhand-path', name: 'Akhand Path', color: '#1d4ed8', active: true },
  { id: 'cat-sehaj-path', name: 'Sehaj Path', color: '#0891b2', active: true },
  { id: 'cat-bhog', name: 'Bhog', color: '#b45309', active: true },
  { id: 'cat-antim-ardas', name: 'Antim Ardas', color: '#b91c1c', active: true },
  { id: 'cat-other', name: 'Other', color: '#475569', active: true }
];

const STATUS_VALUES = new Set(['pending', 'confirmed', 'cancelled']);
const PAYMENT_STATUS_VALUES = new Set(['pending', 'paid', 'partial', 'refunded']);
const getBookingItemsLabel = (booking = {}) => {
  const itemNames = (Array.isArray(booking.itemizedItems) ? booking.itemizedItems : [])
    .map((item) => String(item?.name || '').trim())
    .filter(Boolean);
  return [...new Set(itemNames)].join(', ') || String(booking.categoryName || booking.title || 'Booking').trim();
};

const normalizeBooking = (record = {}, index = 0) => {
  const paymentStatus = String(record.paymentStatus || 'pending').trim().toLowerCase();
  const rawStatus = String(record.status || 'pending').trim().toLowerCase();
  const status = rawStatus === 'completed' ? 'confirmed' : rawStatus;
  return {
    id: String(record.id || `booking-${Date.now()}-${index}`),
    title: String(record.title || record.categoryName || 'Booking Request').trim(),
    categoryId: String(record.categoryId || '').trim(),
    categoryName: String(record.categoryName || 'Other').trim() || 'Other',
    occasionType: String(record.occasionType || '').trim(),
    itemizedItems: Array.isArray(record.itemizedItems) ? record.itemizedItems.map((item) => ({
      categoryId: String(item?.categoryId || '').trim(),
      name: String(item?.name || '').trim(),
      description: String(item?.description || '').trim(),
      amount: Math.max(0, Number(item?.amount || 0))
    })).filter((item) => item.categoryId || item.name) : [],
    date: String(record.date || '').trim(),
    toDate: String(record.toDate || record.date || '').trim(),
    startTime: String(record.startTime || '').trim(),
    endTime: String(record.endTime || '').trim(),
    bookingLocation: String(record.bookingLocation || record.location || '').trim(),
    bookingVenueType: ['gurdwara', 'residence'].includes(String(record.bookingVenueType || '').trim().toLowerCase())
      ? String(record.bookingVenueType).trim().toLowerCase()
      : (/gurdwara|7035\s+sixth\s+line/i.test(String(record.bookingLocation || record.location || '')) ? 'gurdwara' : 'residence'),
    hidePublicLocation: record.hidePublicLocation !== false,
    requesterName: String(record.requesterName || '').trim(),
    requesterEmail: String(record.requesterEmail || '').trim().toLowerCase(),
    bookedByEmail: String(record.bookedByEmail || '').trim().toLowerCase(),
    requesterPhone: String(record.requesterPhone || '').trim(),
    requesterAddress: String(record.requesterAddress || '').trim(),
    dutyAssigneeId: String(record.dutyAssigneeId || '').trim(),
    dutyAssigneeName: String(record.dutyAssigneeName || '').trim(),
    dutyAssigneeEmail: String(record.dutyAssigneeEmail || '').trim().toLowerCase(),
    dutyAssignees: (Array.isArray(record.dutyAssignees) ? record.dutyAssignees : []).map((assignee) => ({
      userId: String(assignee?.userId || '').trim(),
      name: String(assignee?.name || '').trim(),
      email: String(assignee?.email || '').trim().toLowerCase(),
      dutyType: String(assignee?.dutyType || '').trim(),
      bookingItemCategoryId: String(assignee?.bookingItemCategoryId || '').trim(),
      dutyCategoryId: String(assignee?.dutyCategoryId || '').trim()
    })),
    bookingForDifferentPerson: record.bookingForDifferentPerson === true,
    notes: String(record.notes || '').trim(),
    status: STATUS_VALUES.has(status) ? status : 'pending',
    paymentStatus: PAYMENT_STATUS_VALUES.has(paymentStatus) ? paymentStatus : 'pending',
    paymentMethod: String(record.paymentMethod || '').trim(),
    amount: Number(record.amount || 0),
    amountPaid: Math.max(0, Number(record.amountPaid || 0)),
    paymentReceivedAt: String(record.paymentReceivedAt || '').trim(),
    receiptNumber: String(record.receiptNumber || '').trim(),
    paymentReference: String(record.paymentReference || '').trim(),
    refundStatus: String(record.refundStatus || '').trim().toLowerCase(),
    refundAmount: Math.max(0, Number(record.refundAmount || 0)),
    refundMethod: String(record.refundMethod || '').trim(),
    refundReference: String(record.refundReference || '').trim(),
    refundDate: String(record.refundDate || '').trim(),
    refundNotes: String(record.refundNotes || '').trim(),
    donationPendingId: String(record.donationPendingId || '').trim(),
    donationCampaignId: String(record.donationCampaignId || '').trim(),
    paymentProvider: String(record.paymentProvider || '').trim().toUpperCase(),
    checkoutUrl: String(record.checkoutUrl || '').trim(),
    source: String(record.source || 'public').trim(),
    color: String(record.color || '').trim(),
    createdAt: String(record.createdAt || new Date().toISOString()),
    updatedAt: String(record.updatedAt || new Date().toISOString())
  };
};

const normalizeCategory = (entry = {}, index = 0) => ({
  id: String(entry.id || `booking-category-${Date.now()}-${index}`).trim(),
  sortOrder: entry.sortOrder !== undefined && Number.isFinite(Number(entry.sortOrder)) ? Number(entry.sortOrder) : index + 1,
  name: String(entry.name || '').trim(),
  description: String(entry.description || '').trim(),
  color: String(entry.color || '#0a4d9f').trim() || '#0a4d9f',
  active: entry.active !== false,
  paymentRequired: entry.paymentRequired === true,
  feeAmount: Math.max(0, Number(entry.feeAmount || 0))
});

const normalizeBookingSettings = (settings = {}) => ({
  guidelinesTitle: String(settings.guidelinesTitle || DEFAULT_BOOKING_SETTINGS.guidelinesTitle).trim(),
  guidelines: String(settings.guidelines || DEFAULT_BOOKING_SETTINGS.guidelines).trim(),
  donationCampaignId: String(settings.donationCampaignId || '').trim(),
  showCreateBookingButton: settings.showCreateBookingButton !== false
});

const escapeHtml = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const toDisplayLabel = (value, fallback = '-') => {
  const normalized = String(value || '').trim();
  return normalized
    ? normalized.toLowerCase().replace(/[-_]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
    : fallback;
};

const buildReceiptAttachment = async (booking = {}, address = '') => {
  const blob = await createBookingReceiptPdfBlob({
    organizationName: siteConfig.name,
    address: String(address || siteConfig.contact.address).trim(),
    phone: siteConfig.contact.phone,
    email: siteConfig.contact.email,
    booking
  });
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return {
    filename: `booking-receipt-${String(booking.receiptNumber || booking.id || Date.now())}.pdf`,
    contentType: 'application/pdf',
    content: dataUrl.split(',')[1] || '',
    disposition: 'attachment'
  };
};

const bookingService = {
  getBookings: async () => {
    const rows = await contentApiService.list(BOOKINGS_RESOURCE);
    return serviceResponse((rows || []).map((entry, index) => normalizeBooking(entry, index)));
  },

  getPublicBookings: async () => {
    const response = await apiClient.get('/bookings/public');
    return serviceResponse((response.data?.data || []).map((entry, index) => normalizeBooking(entry, index)));
  },

  createBooking: async (payload = {}) => {
    const record = normalizeBooking({
      ...payload,
      id: payload.id || `booking-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const created = await contentApiService.create(BOOKINGS_RESOURCE, record);
    return serviceResponse(normalizeBooking(created || record));
  },

  updateBooking: async (bookingId, payload = {}) => {
    const id = String(bookingId || '').trim();
    if (!id) {
      throw new Error('Booking id is required.');
    }
    const updated = await contentApiService.update(BOOKINGS_RESOURCE, id, {
      ...payload,
      updatedAt: new Date().toISOString()
    });
    return serviceResponse(normalizeBooking(updated || { id, ...payload }));
  },

  removeBooking: async (bookingId) => {
    const id = String(bookingId || '').trim();
    if (!id) {
      throw new Error('Booking id is required.');
    }
    await contentApiService.remove(BOOKINGS_RESOURCE, id);
    return serviceResponse({ success: true });
  },

  attachPaymentReceipt: async ({ pendingId, receiptNumber, gatewayTransactionId, paymentProvider, amount }) => {
    const normalizedPendingId = String(pendingId || '').trim();
    if (!normalizedPendingId) {
      return serviceResponse(null);
    }

    const rows = await contentApiService.list(BOOKINGS_RESOURCE);
    const booking = (rows || []).find((entry) => String(entry?.donationPendingId || '').trim() === normalizedPendingId);
    if (!booking?.id) {
      return serviceResponse(null);
    }

    const updated = await contentApiService.update(BOOKINGS_RESOURCE, booking.id, {
      receiptNumber: String(receiptNumber || booking.receiptNumber || '').trim(),
      paymentReference: String(gatewayTransactionId || booking.paymentReference || normalizedPendingId).trim(),
      paymentProvider: String(paymentProvider || booking.paymentProvider || '').trim().toUpperCase(),
      paymentStatus: 'paid',
      amount: Number(amount || booking.amount || 0),
      updatedAt: new Date().toISOString()
    });

    return serviceResponse(normalizeBooking(updated || { ...booking, paymentStatus: 'paid' }));
  },

  getBookingCategories: async () => {
    const stored = await contentApiService.getSingleton(BOOKING_CATEGORIES_RESOURCE, null);
    const storedCategories = Array.isArray(stored) ? stored : stored?.categories;
    const nextCategories = Array.isArray(storedCategories)
      ? storedCategories.map((entry, index) => normalizeCategory(entry, index)).filter((entry) => entry.name)
      : [];

    if (nextCategories.length > 0) {
      return serviceResponse(nextCategories);
    }

    await contentApiService.setSingleton(BOOKING_CATEGORIES_RESOURCE, { categories: DEFAULT_CATEGORIES });
    return serviceResponse(DEFAULT_CATEGORIES.map((entry, index) => normalizeCategory(entry, index)));
  },

  setBookingCategories: async (categories = []) => {
    const normalized = (Array.isArray(categories) ? categories : [])
      .map((entry, index) => normalizeCategory(entry, index))
      .filter((entry) => entry.name);

    const payload = normalized.length > 0 ? normalized : DEFAULT_CATEGORIES;
    const saved = await contentApiService.setSingleton(BOOKING_CATEGORIES_RESOURCE, { categories: payload });
    const rows = Array.isArray(saved?.categories) ? saved.categories : payload;
    return serviceResponse(rows.map((entry, index) => normalizeCategory(entry, index)));
  },

  getBookingPageSettings: async () => {
    const stored = await contentApiService.getSingleton(BOOKING_SETTINGS_RESOURCE, DEFAULT_BOOKING_SETTINGS);
    return serviceResponse(normalizeBookingSettings(stored || DEFAULT_BOOKING_SETTINGS));
  },

  setBookingPageSettings: async (settings = {}) => {
    const payload = normalizeBookingSettings(settings);
    const saved = await contentApiService.setSingleton(BOOKING_SETTINGS_RESOURCE, payload);
    return serviceResponse(normalizeBookingSettings(saved || payload));
  },

  sendDutyNotification: async ({ bookingId = '', role, scope = 'single' }) => {
    const response = await apiClient.post('/bookings/duty-notifications/send', { bookingId, role, scope });
    return serviceResponse(response.data?.data || {});
  },

  downloadInvoice: (booking = {}, address = '') => downloadBookingReceiptPdf({
    organizationName: siteConfig.name,
    address: String(address || siteConfig.contact.address).trim(),
    phone: siteConfig.contact.phone,
    email: siteConfig.contact.email,
    booking
  }),

  sendBookingConfirmationEmail: async (booking = {}, address = '') => {
    const bookingItemsLabel = getBookingItemsLabel(booking);
    const targetEmail = String(booking.requesterEmail || '').trim().toLowerCase();
    if (!targetEmail) {
      return serviceResponse({ sent: false, reason: 'missing_email' });
    }

    const deliveryUrl = String(
      process.env.REACT_APP_WEBHOOK_URL ||
      process.env.REACT_APP_APPROVAL_EMAIL_WEBHOOK_URL ||
      '/api/internal/mail-relay'
    ).trim();

    const savedAddress = String(address || siteConfig.contact.address).trim();
    const attachment = await buildReceiptAttachment(booking, savedAddress);
    const details = [
      ['Booking Type', bookingItemsLabel || '-'],
      ['Date and Time', `${booking.date || '-'}, ${booking.startTime || '-'} - ${booking.endTime || '-'}`],
      ['Location', booking.bookingLocation || '-'],
      ['Booking Status', toDisplayLabel(booking.status)],
      ['Payment Status', toDisplayLabel(booking.paymentStatus)],
      ['Payment Method', toDisplayLabel(booking.paymentMethod || booking.paymentProvider)],
      ['Amount', `CAD ${Number(booking.amount || 0).toFixed(2)}`],
      ['Receipt Number', booking.receiptNumber || 'Not assigned']
    ];
    const detailsHtml = `
      <div style="background:#f5f8fc;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f6;border-radius:14px;overflow:hidden;">
          <tr><td style="padding:20px 24px;background:linear-gradient(90deg,#004081,#0b67c2,#e58b16);color:#ffffff;"><div style="font-size:13px;font-weight:700;text-transform:uppercase;">${escapeHtml(siteConfig.name)}</div><div style="margin-top:4px;font-size:21px;font-weight:800;">Booking Confirmation</div></td></tr>
          <tr><td style="padding:24px;"><p style="font-size:17px;font-weight:700;">Dear ${escapeHtml(booking.requesterName || 'Sangat Member')},</p><p style="color:#334155;line-height:1.7;">Your booking details are shown below. A PDF receipt is attached for your records.</p>
            <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="border:1px solid #d7e3f3;border-radius:10px;overflow:hidden;">${details.map(([label, value]) => `<tr><td style="width:34%;padding:11px 12px;background:#eef5ff;border-bottom:1px solid #d7e3f3;font-weight:700;color:#0a4d9f;">${escapeHtml(label)}</td><td style="padding:11px 12px;border-bottom:1px solid #d7e3f3;font-weight:700;">${escapeHtml(value)}</td></tr>`).join('')}</table>
            <p style="margin-top:18px;color:#475569;line-height:1.7;">Please contact the Gurdwara office if any details need to be changed.</p>
            <div style="border-top:1px solid #e2e8f0;padding-top:14px;font-size:12px;line-height:1.8;color:#64748b;"><strong>${escapeHtml(siteConfig.name)}</strong><br/>${escapeHtml(savedAddress)}<br/>${escapeHtml(siteConfig.contact.phone)} | ${escapeHtml(siteConfig.contact.email)}</div>
          </td></tr>
        </table>
      </div>
    `;

    const payload = {
      type: 'booking_confirmation',
      to: targetEmail,
      name: booking.requesterName || 'Member',
      subject: `Booking Confirmation - ${bookingItemsLabel}`,
      text: `Booking confirmed for ${bookingItemsLabel} on ${booking.date || '-'} (${booking.startTime || '-'} - ${booking.endTime || '-'})`,
      html: detailsHtml,
      bodyHtml: detailsHtml,
      content: detailsHtml,
      attachments: attachment.content ? [attachment] : []
    };

    try {
      const response = await fetch(deliveryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        return serviceResponse({ sent: false, reason: 'webhook_error' });
      }
      return serviceResponse({ sent: true });
    } catch {
      return serviceResponse({ sent: false, reason: 'network_error' });
    }
  }
};

export default bookingService;
