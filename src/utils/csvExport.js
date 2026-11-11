import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const LOGO_BLUE_RGB = [0, 64, 129];

const escapeCsvCell = (value) => {
  const raw = value == null ? '' : String(value);
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
};

const buildCsv = (headers = [], rows = []) => {
  const headerLine = headers.map((header) => escapeCsvCell(header)).join(',');
  const rowLines = rows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(','));
  return [headerLine, ...rowLines].join('\n');
};

const triggerFileDownload = (blob, fileName) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const downloadCsv = ({ fileName, headers, rows }) => {
  const csvData = buildCsv(headers, rows);
  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });

  triggerFileDownload(blob, fileName || 'export.csv');
};

const loadLogoDataUrl = async () => '';

export const downloadRegistrationCsv = ({
  fileName,
  organizationName,
  serviceName,
  serviceDate,
  serviceTime,
  headers,
  rows
}) => {
  const metadataRows = [
    ['Organization', organizationName || ''],
    ['Service', serviceName || ''],
    ['Date', serviceDate || '-'],
    ['Time', serviceTime || '-'],
    ['Generated On', new Date().toLocaleString()],
    []
  ];

  const csvData = [
    ...metadataRows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')),
    buildCsv(headers, rows)
  ].join('\n');

  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  triggerFileDownload(blob, fileName || 'registrations.csv');
};

export const downloadRegistrationPdf = async ({
  fileName,
  organizationName,
  serviceName,
  serviceDate,
  serviceTime,
  headers,
  rows
}) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const logoDataUrl = await loadLogoDataUrl();
  const generatedOn = new Date().toLocaleString();

  doc.setFillColor(...LOGO_BLUE_RGB);
  doc.rect(0, 0, pageWidth, 98, 'F');

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', 34, 22, 54, 54);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(organizationName || 'Gurdwara', 102, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Volunteer Registration Sheet', 102, 58);
  doc.text(`Service: ${serviceName || '-'}`, 102, 72);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Registration List', pageWidth - 40, 42, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Total Registrations: ${rows.length}`, pageWidth - 40, 60, { align: 'right' });
  doc.text(`Generated: ${generatedOn}`, pageWidth - 40, 74, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Date: ${serviceDate || '-'}`, 40, 114);
  doc.text(`Time: ${serviceTime || '-'}`, pageWidth / 2, 114);

  autoTable(doc, {
    startY: 126,
    head: [headers],
    body: rows,
    styles: {
      fontSize: 10,
      cellPadding: 6
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: 255,
      fontStyle: 'bold'
    },
    theme: 'grid',
    margin: { left: 40, right: 40 }
  });

  const finalY = doc.lastAutoTable?.finalY || 260;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('This report compiles all registrations captured for the selected service.', 40, Math.min(finalY + 20, pageHeight - 34));

  doc.save(fileName || 'registrations.pdf');
};

export const createDonationInvoicePdfBlob = async ({
  organizationName,
  address,
  phone,
  donation,
  campaignDescription = ''
}) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const logoDataUrl = await loadLogoDataUrl();
  const invoiceDate = donation?.createdAt
    ? new Date(donation.createdAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
    : new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  const purposeText = campaignDescription || `Support for ${donation?.campaignName || 'community seva'}`;

  doc.setFillColor(...LOGO_BLUE_RGB);
  doc.rect(0, 0, pageWidth, 98, 'F');

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', 34, 22, 54, 54);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(organizationName || 'Gurdwara', 102, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(address || '', 102, 58);
  doc.text(phone || '', 102, 72);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Donation Invoice', pageWidth - 40, 42, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Invoice No: ${donation?.receiptId || donation?.id || '-'}`, pageWidth - 40, 60, { align: 'right' });
  doc.text(`Date: ${invoiceDate}`, pageWidth - 40, 74, { align: 'right' });

  autoTable(doc, {
    startY: 126,
    head: [['Field', 'Details']],
    body: [
      ['Donor Name', donation?.donorName || '-'],
      ['Donor Email', donation?.donorEmail || '-'],
      ['Campaign', donation?.campaignName || '-'],
      ['Purpose', purposeText],
      ['Amount', donation?.amount != null ? `$${Number(donation.amount).toFixed(2)}` : '-'],
      ['Frequency', donation?.frequency || '-'],
      ['Payment Provider', donation?.paymentProvider || '-'],
      ['Payment Status', donation?.paymentStatus || '-'],
      ['Gateway Transaction', donation?.gatewayTransactionId || '-']
    ],
    styles: {
      fontSize: 10,
      cellPadding: 7,
      valign: 'top'
    },
    headStyles: {
      fillColor: LOGO_BLUE_RGB,
      textColor: 255,
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 120, fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [30, 41, 59] },
      1: { cellWidth: 'auto' }
    },
    theme: 'grid',
    margin: { left: 40, right: 40 }
  });

  const finalY = doc.lastAutoTable?.finalY || 260;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Authorized Signature', 40, Math.min(finalY + 120, pageHeight - 70));
  doc.setDrawColor(148, 163, 184);
  doc.line(40, Math.min(finalY + 138, pageHeight - 55), 220, Math.min(finalY + 138, pageHeight - 55));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('This invoice confirms the donation received for the specified campaign.', 40, Math.min(finalY + 160, pageHeight - 34));

  return doc.output('blob');
};

export const createBulkDonationStatementPdfBlob = async ({
  organizationName,
  address,
  phone,
  donor = {},
  donations = [],
  dateFrom = '',
  dateTo = ''
}) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const logoDataUrl = await loadLogoDataUrl();
  const formatStatementDate = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
      : '-';
  };
  const totalAmount = donations.reduce((sum, donation) => sum + Number(donation?.amount || 0), 0);
  const periodLabel = dateFrom || dateTo
    ? `${dateFrom ? formatStatementDate(`${dateFrom}T00:00:00`) : 'Beginning'} to ${dateTo ? formatStatementDate(`${dateTo}T00:00:00`) : 'Present'}`
    : 'All dates';

  doc.setFillColor(...LOGO_BLUE_RGB);
  doc.rect(0, 0, pageWidth, 112, 'F');
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'WEBP', 34, 24, 62, 62);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(organizationName || 'Your Gurdwara', 112, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(address || '', 112, 59, { maxWidth: 330 });
  doc.text(phone || '', 112, 84);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Donation Statement', pageWidth - 34, 36, { align: 'right' });
  doc.setFontSize(11);
  doc.text(donor.name || 'Donor', pageWidth - 34, 56, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(donor.email || '-', pageWidth - 34, 72, { align: 'right' });
  if (donor.phone) {
    doc.text(donor.phone, pageWidth - 34, 88, { align: 'right' });
  }

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Statement period: ${periodLabel}`, 40, 136);
  doc.text(`Donations: ${donations.length}`, pageWidth / 2 - 40, 136);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total: CAD $${totalAmount.toFixed(2)}`, pageWidth - 40, 136, { align: 'right' });

  autoTable(doc, {
    startY: 150,
    head: [['Date', 'Receipt', 'Donor Name', 'Campaign', 'Amount', 'Provider', 'Status']],
    body: donations.map((donation) => ([
      formatStatementDate(donation?.createdAt),
      donation?.receiptId || donation?.id || '-',
      donation?.donorName || donor.name || '-',
      donation?.campaignName || '-',
      donation?.amount != null ? `CAD $${Number(donation.amount).toFixed(2)}` : '-',
      donation?.paymentProvider || '-',
      donation?.paymentStatus || '-'
    ])),
    styles: { fontSize: 9, cellPadding: 6, valign: 'top' },
    headStyles: { fillColor: LOGO_BLUE_RGB, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 78 },
      1: { cellWidth: 105 },
      4: { cellWidth: 82, halign: 'right' }
    },
    theme: 'grid',
    margin: { left: 40, right: 40 },
    didDrawPage: (data) => {
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`Page ${data.pageNumber}`, pageWidth - 40, pageHeight - 22, { align: 'right' });
    }
  });

  const finalY = doc.lastAutoTable?.finalY || 300;
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    'This statement confirms the donation records received for the selected period. Please contact the Gurdwara office if any details need correction.',
    40,
    Math.min(finalY + 24, pageHeight - 34),
    { maxWidth: pageWidth - 80 }
  );

  return doc.output('blob');
};

const toDisplayLabel = (value, fallback = '-') => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return fallback;
  }
  return normalized
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

export const createBookingReceiptPdfBlob = async ({
  organizationName,
  address,
  phone,
  email,
  booking = {}
}) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const logoDataUrl = await loadLogoDataUrl();
  const receiptNumber = booking.receiptNumber || booking.id || 'Pending';
  const generatedOn = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });

  doc.setFillColor(...LOGO_BLUE_RGB);
  doc.rect(0, 0, pageWidth, 112, 'F');
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'WEBP', 34, 24, 62, 62);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(organizationName || 'Your Gurdwara', 112, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(address || '', 112, 60);
  doc.text([phone, email].filter(Boolean).join('  |  '), 112, 77);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Booking Receipt', pageWidth - 34, 42, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Receipt: ${receiptNumber}`, pageWidth - 34, 61, { align: 'right' });
  doc.text(`Prepared: ${generatedOn}`, pageWidth - 34, 77, { align: 'right' });

  autoTable(doc, {
    startY: 140,
    head: [['Booking Information', 'Details']],
    body: [
      ['Occasion Type', booking.occasionType || '-'],
      ['Event Date', formatBookingReportDate(booking.date)],
      ...(booking.toDate && booking.toDate !== booking.date ? [['Event End Date', formatBookingReportDate(booking.toDate)]] : []),
      ['Time', `${booking.startTime || '-'} - ${booking.endTime || '-'}`],
      ['Location', booking.bookingLocation || '-'],
      ['Booking ID', booking.id || '-']
    ],
    styles: { fontSize: 10, cellPadding: 8, valign: 'top' },
    headStyles: { fillColor: LOGO_BLUE_RGB, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 140, fontStyle: 'bold', fillColor: [238, 245, 255], textColor: [0, 64, 129] },
      1: { cellWidth: 'auto' }
    },
    theme: 'grid',
    margin: { left: 40, right: 40 }
  });

  autoTable(doc, {
    startY: (doc.lastAutoTable?.finalY || 330) + 24,
    head: [['Receipt Items', 'Amount (CAD)']],
    body: [
      ...(Array.isArray(booking.itemizedItems) && booking.itemizedItems.length
        ? booking.itemizedItems.map((item) => [item.name || 'Booking item', Number(item.amount || 0).toFixed(2)])
        : [[booking.categoryName || booking.title || 'Booking', Number(booking.amount || 0).toFixed(2)]]),
      ['Total', Number(booking.amount || 0).toFixed(2)]
    ],
    styles: { fontSize: 10, cellPadding: 8, valign: 'top' },
    headStyles: { fillColor: LOGO_BLUE_RGB, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 140, fontStyle: 'bold', fillColor: [238, 245, 255], textColor: [0, 64, 129] },
      1: { cellWidth: 'auto', halign: 'right' }
    },
    theme: 'grid',
    margin: { left: 40, right: 40 }
  });

  autoTable(doc, {
    startY: (doc.lastAutoTable?.finalY || 420) + 16,
    head: [['Payment Information', 'Details']],
    body: [
      ['Amount Received', `CAD ${Number(booking.amountPaid || (booking.paymentStatus === 'paid' ? booking.amount : 0)).toFixed(2)}`],
      ['Payment Status', toDisplayLabel(booking.paymentStatus)],
      ['Payment Method', toDisplayLabel(booking.paymentMethod || booking.paymentProvider)],
      ['Receipt Number', booking.receiptNumber || 'Not assigned'],
      ['Payment Reference', booking.paymentReference || '-'],
      ...(booking.status === 'cancelled' ? [
        ['Refund Status', toDisplayLabel(booking.refundStatus, 'Not required')],
        ['Refund Amount', `CAD ${Number(booking.refundAmount || 0).toFixed(2)}`],
        ['Refund Method', toDisplayLabel(booking.refundMethod)],
        ['Refund Reference', booking.refundReference || '-'],
        ['Refund Date', booking.refundDate || '-']
      ] : [])
    ],
    styles: { fontSize: 10, cellPadding: 8, valign: 'top' },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 140, fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [30, 41, 59] },
      1: { cellWidth: 'auto' }
    },
    theme: 'grid',
    margin: { left: 40, right: 40 }
  });

  const contactY = Math.min((doc.lastAutoTable?.finalY || 540) + 36, pageHeight - 70);
  doc.setDrawColor(203, 213, 225);
  doc.line(40, contactY - 16, pageWidth - 40, contactY - 16);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Please retain this receipt for your records. Contact the Gurdwara office if any details need correction.', 40, contactY, { maxWidth: pageWidth - 80 });

  return doc.output('blob');
};

export const createMembershipFeeInformationPdfBlob = async ({ user = {}, membershipFeeRecord = null, organizationName, address, phone, email }) => {
  const records = Array.isArray(user?.membershipFeeRecords) ? user.membershipFeeRecords : [];
  const latestPaidRecord = records
    .filter((entry) => String(entry?.status || '').trim().toLowerCase() === 'paid')
    .sort((left, right) => (
      new Date(right?.paymentDate || right?.updatedAt || 0).getTime()
      - new Date(left?.paymentDate || left?.updatedAt || 0).getTime()
    ))[0];
  const selectedFeeRecord = membershipFeeRecord && typeof membershipFeeRecord === 'object' ? membershipFeeRecord : null;
  const feeRecord = selectedFeeRecord || latestPaidRecord;
  const feeStatus = String(feeRecord?.status || '').trim().toLowerCase();
  const isPaidFee = feeStatus === 'paid';
  const schedule = String(user?.membershipProfile?.donationSchedule || 'monthly').trim().toLowerCase() === 'yearly'
    ? 'Yearly'
    : 'Monthly';
  const validityDays = schedule === 'Yearly' ? 365 : 30;
  const paymentDate = feeRecord ? new Date(feeRecord.paymentDate || feeRecord.updatedAt || '') : null;
  const hasValidPaymentDate = paymentDate && !Number.isNaN(paymentDate.getTime());
  const validUntil = hasValidPaymentDate
    ? new Date(paymentDate.getTime() + (validityDays * 24 * 60 * 60 * 1000))
    : null;
  const isCurrent = isPaidFee && validUntil ? validUntil.getTime() >= Date.now() : false;
  const formatDate = (value) => value
    ? value.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Not recorded';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const logoDataUrl = await loadLogoDataUrl();

  doc.setFillColor(...LOGO_BLUE_RGB);
  doc.rect(0, 0, pageWidth, 112, 'F');
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', 34, 24, 62, 62);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(organizationName || 'Your Gurdwara', 112, 43);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(address || '', 112, 61);
  doc.text([phone, email].filter(Boolean).join('  |  '), 112, 77);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Membership Fee', pageWidth - 34, 38, { align: 'right' });
  doc.text('Information', pageWidth - 34, 55, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Prepared ${formatDate(new Date())}`, pageWidth - 34, 75, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(`Welcome, ${String(user?.name || 'Member').trim()}.`, 40, 148);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(51, 65, 85);
  const welcomeText = feeRecord
    ? `This document summarizes your membership profile and ${selectedFeeRecord ? 'the selected' : 'the latest'} fee transaction recorded on your account.`
    : 'Your registration has been approved. A current paid membership fee activates Member access and helps support programs, services, and community work at your Gurdwara.';
  doc.text(welcomeText, 40, 171, { maxWidth: pageWidth - 80, lineHeightFactor: 1.45 });

  const statusY = 220;
  doc.setFillColor(isCurrent ? 232 : 255, isCurrent ? 248 : 247, isCurrent ? 239 : 237);
  doc.setDrawColor(isCurrent ? 74 : 245, isCurrent ? 180 : 166, isCurrent ? 116 : 35);
  doc.roundedRect(40, statusY, pageWidth - 80, 48, 7, 7, 'FD');
  doc.setTextColor(isCurrent ? 22 : 154, isCurrent ? 101 : 52, isCurrent ? 52 : 18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const displayedStatus = selectedFeeRecord
    ? (feeStatus || 'pending').replace(/_/g, ' ').toUpperCase()
    : (isCurrent ? 'CURRENT' : 'PAYMENT REQUIRED');
  doc.text(`Membership fee status: ${displayedStatus}`, 55, statusY + 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    isCurrent ? `Current through ${formatDate(validUntil)}.` : (selectedFeeRecord ? 'This document reflects the selected transaction status.' : 'No current paid membership fee is recorded on this account.'),
    55,
    statusY + 36
  );

  autoTable(doc, {
    startY: statusY + 70,
    head: [['Member Information', 'Details']],
    body: [
      ['Member Name', String(user?.name || 'Member').trim()],
      ['Email Address', String(user?.email || '').trim() || '-'],
      ['Phone', String(user?.phone || '').trim() || '-'],
      ['Membership Schedule', schedule],
      ['Registration Status', String(user?.approvalStatus || 'approved').replace(/^./, (value) => value.toUpperCase())]
    ],
    styles: { fontSize: 10, cellPadding: 7, valign: 'top' },
    headStyles: { fillColor: LOGO_BLUE_RGB, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 145, fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [30, 41, 59] },
      1: { cellWidth: 'auto' }
    },
    theme: 'grid',
    margin: { left: 40, right: 40 }
  });

  const paymentTableY = (doc.lastAutoTable?.finalY || 430) + 24;
  autoTable(doc, {
    startY: paymentTableY,
    head: [[selectedFeeRecord ? 'Selected Fee Record' : 'Latest Fee Record', 'Details']],
    body: [
      ...(selectedFeeRecord ? [['Transaction Type', String(feeRecord?.membershipEntryType || 'new').trim().toLowerCase() === 'renew' ? 'Renewal' : 'New Membership']] : []),
      ['Payment Status', feeRecord ? (feeStatus || 'pending').replace(/^./, (value) => value.toUpperCase()) : 'Payment required'],
      ['Payment Date', formatDate(hasValidPaymentDate ? paymentDate : null)],
      ['Amount', feeRecord ? `${String(feeRecord.currency || 'CAD')} ${Number(feeRecord.amount || 0).toFixed(2)}` : '-'],
      ['Receipt Number', String(feeRecord?.receiptNumber || '').trim() || '-'],
      ['Payment Method', String(feeRecord?.paymentMethod || '').trim() || '-'],
      ['Valid Until', formatDate(validUntil)]
    ],
    styles: { fontSize: 10, cellPadding: 7, valign: 'top' },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 145, fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [30, 41, 59] },
      1: { cellWidth: 'auto' }
    },
    theme: 'grid',
    margin: { left: 40, right: 40 }
  });

  const footerY = Math.min((doc.lastAutoTable?.finalY || 620) + 36, pageHeight - 62);
  doc.setDrawColor(203, 213, 225);
  doc.line(40, footerY - 16, pageWidth - 40, footerY - 16);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Please retain this document for your records. Contact the Gurdwara office if any information needs correction.', 40, footerY, { maxWidth: pageWidth - 80 });
  doc.text('Thank you for your continued participation and seva in the sangat.', 40, footerY + 18);

  return doc.output('blob');
};

export const downloadMembershipFeeInformationPdf = async (payload) => {
  const blob = await createMembershipFeeInformationPdfBlob(payload);
  const memberName = String(payload?.user?.name || 'member').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  const transactionReference = String(payload?.membershipFeeRecord?.receiptNumber || payload?.membershipFeeRecord?.id || '')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  triggerFileDownload(blob, `membership-fee-${memberName || 'member'}${transactionReference ? `-${transactionReference}` : ''}.pdf`);
};

export const downloadDonationInvoicePdf = async (payload) => {
  const blob = await createDonationInvoicePdfBlob(payload);
  const fileName = payload?.fileName || `invoice-${payload?.donation?.receiptId || payload?.donation?.id || 'donation'}.pdf`;
  triggerFileDownload(blob, fileName);
};

export const downloadBulkDonationStatementPdf = async (payload) => {
  const blob = await createBulkDonationStatementPdfBlob(payload);
  const donorName = String(payload?.donor?.name || 'donor').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  triggerFileDownload(blob, payload?.fileName || `donation-statement-${donorName || 'donor'}.pdf`);
};

export const downloadBookingReceiptPdf = async (payload) => {
  const blob = await createBookingReceiptPdfBlob(payload);
  const reference = payload?.booking?.receiptNumber || payload?.booking?.id || 'booking';
  triggerFileDownload(blob, payload?.fileName || `booking-receipt-${reference}.pdf`);
};

const formatBookingReportDate = (value) => {
  if (!value) return '-';
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00(?::00(?:\.000)?)?(?:Z|[+-]00:00)?)?$/);
  if (dateOnly) {
    const localDate = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12);
    return localDate.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
};

const getBookingRevenueReportRows = (bookings = []) => (Array.isArray(bookings) ? bookings : []).map((booking) => ([
  formatBookingReportDate(booking.createdAt),
  formatBookingReportDate(booking.date),
  booking.requesterName || '',
  booking.createdByName || booking.bookedByName || booking.createdBy || booking.bookedBy || (booking.source === 'admin-manual' ? 'Admin' : 'Website'),
  booking.requesterEmail || '',
  booking.requesterPhone || '',
  booking.occasionType || '-',
  `${booking.startTime || ''}${booking.endTime ? ` - ${booking.endTime}` : ''}`,
  booking.bookingLocation || booking.location || '',
  Number(booking.amount || 0).toFixed(2),
  String(booking.paymentStatus || 'pending')
]));

const BOOKING_REVENUE_HEADERS = [
  'Date Created', 'Date of Event', 'Booked By', 'Booking Taken By',
  'Booker Email', 'Booker Phone', 'Occasion Type', 'Event Time', 'Location',
  'Gross Amount (CAD)', 'Payment Status'
];

export const downloadBookingRevenueCsv = ({ fileName, organizationName, bookings = [], startDate, endDate, categoryName, totalRevenue = 0 }) => {
  const rows = getBookingRevenueReportRows(bookings);
  const metadataRows = [
    ['Organization', organizationName || 'Your Gurdwara'],
    ['Report', 'Booking Revenue'],
    ['Created Date Range', `${startDate || '-'} to ${endDate || '-'}`],
    ['Occasion Type', categoryName || 'All booking types'],
    ['Included Paid Bookings', bookings.length],
    ['Net Revenue (CAD)', Number(totalRevenue || 0).toFixed(2)],
    ['Generated On', new Date().toLocaleString()],
    []
  ];
  const csvData = [...metadataRows.map((row) => row.map(escapeCsvCell).join(',')), buildCsv(BOOKING_REVENUE_HEADERS, rows)].join('\n');
  triggerFileDownload(new Blob([`\uFEFF${csvData}`], { type: 'text/csv;charset=utf-8;' }), fileName || 'booking-revenue.csv');
};

export const createBookingRevenuePdfBlob = async ({ organizationName, bookings = [], startDate, endDate, categoryName, totalRevenue = 0 }) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const tableWidth = 605;
  const tableSideMargin = (pageWidth - tableWidth) / 2;
  const logoDataUrl = await loadLogoDataUrl();
  const generatedOn = new Date().toLocaleString();
  const rows = getBookingRevenueReportRows(bookings);

  doc.setFillColor(...LOGO_BLUE_RGB);
  doc.rect(0, 0, pageWidth, 112, 'F');
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'WEBP', 30, 22, 62, 62);
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(organizationName || 'Your Gurdwara', 106, 39);
  doc.setFontSize(15);
  doc.text('Booking Revenue Report', 106, 64);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const headerRightX = pageWidth - 30;
  doc.text(`Created date: ${formatBookingReportDate(startDate)} to ${formatBookingReportDate(endDate)}`, headerRightX, 32, { align: 'right' });
  doc.text(`Booking type: ${categoryName || 'All booking types'}`, headerRightX, 51, { align: 'right' });
  doc.text(`Generated: ${generatedOn}`, headerRightX, 70, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Bookings: ${bookings.length}`, 34, 136);
  doc.text(`Net revenue: CAD ${Number(totalRevenue || 0).toFixed(2)}`, pageWidth - 34, 136, { align: 'right' });

  autoTable(doc, {
    startY: 150,
    head: [BOOKING_REVENUE_HEADERS],
    body: rows,
    tableWidth,
    styles: { fontSize: 6.5, cellPadding: 3, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fillColor: LOGO_BLUE_RGB, textColor: 255, fontStyle: 'bold', fontSize: 6.5 },
    columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 52 }, 2: { cellWidth: 65 }, 3: { cellWidth: 65 }, 4: { cellWidth: 68 }, 5: { cellWidth: 52 }, 6: { cellWidth: 60 }, 7: { cellWidth: 50 }, 8: { cellWidth: 60 }, 9: { cellWidth: 48, halign: 'right' }, 10: { cellWidth: 45 } },
    didDrawPage: () => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated ${generatedOn}`, 34, pageHeight - 18);
      doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber}`, pageWidth - 34, pageHeight - 18, { align: 'right' });
    },
    theme: 'grid',
    margin: { left: tableSideMargin, right: tableSideMargin, bottom: 34 }
  });
  return doc.output('blob');
};

export const downloadBookingRevenuePdf = async ({ fileName, ...payload }) => {
  const blob = await createBookingRevenuePdfBlob(payload);
  triggerFileDownload(blob, fileName || 'booking-revenue.pdf');
};

export const downloadCampaignDonationsCsv = ({
  fileName,
  organizationName,
  campaignName,
  donations = []
}) => {
  const metadataRows = [
    ['Organization', organizationName || ''],
    ['Campaign', campaignName || ''],
    ['Total Donations', String(donations.length)],
    ['Generated On', new Date().toLocaleString()],
    []
  ];

  const headers = ['Date', 'Donor Name', 'Email', 'Amount', 'Frequency', 'Receipt', 'Status', 'Gateway Transaction'];
  const rows = donations.map((donation) => ([
    donation.createdAt ? new Date(donation.createdAt).toLocaleString() : '',
    donation.donorName || '',
    donation.donorEmail || '',
    donation.amount != null ? Number(donation.amount).toFixed(2) : '',
    donation.frequency || '',
    donation.receiptId || '',
    donation.paymentStatus || '',
    donation.gatewayTransactionId || ''
  ]));

  const csvData = [
    ...metadataRows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')),
    buildCsv(headers, rows)
  ].join('\n');

  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  triggerFileDownload(blob, fileName || 'campaign-donations.csv');
};

export const downloadCampaignDonationsPdf = async ({
  fileName,
  organizationName,
  campaignName,
  donations = []
}) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const logoDataUrl = await loadLogoDataUrl();
  const generatedOn = new Date().toLocaleString();

  doc.setFillColor(...LOGO_BLUE_RGB);
  doc.rect(0, 0, pageWidth, 98, 'F');

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', 34, 22, 54, 54);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(organizationName || 'Gurdwara', 102, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Campaign Donation Report', 102, 58);
  doc.text(`Campaign: ${campaignName || '-'}`, 102, 72);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Donor List', pageWidth - 40, 42, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Total Donations: ${donations.length}`, pageWidth - 40, 60, { align: 'right' });
  doc.text(`Generated: ${generatedOn}`, pageWidth - 40, 74, { align: 'right' });

  autoTable(doc, {
    startY: 126,
    head: [['Date', 'Donor Name', 'Email', 'Amount', 'Frequency', 'Receipt'] ],
    body: donations.map((donation) => ([
      donation.createdAt ? new Date(donation.createdAt).toLocaleString() : '-',
      donation.donorName || '-',
      donation.donorEmail || '-',
      donation.amount != null ? `$${Number(donation.amount).toFixed(2)}` : '-',
      donation.frequency || '-',
      donation.receiptId || '-'
    ])),
    styles: {
      fontSize: 9,
      cellPadding: 5,
      valign: 'top'
    },
    headStyles: {
      fillColor: LOGO_BLUE_RGB,
      textColor: 255,
      fontStyle: 'bold'
    },
    theme: 'grid',
    margin: { left: 40, right: 40 }
  });

  const finalY = doc.lastAutoTable?.finalY || 260;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('This report compiles all donation entries for the selected campaign.', 40, Math.min(finalY + 20, pageHeight - 34));

  doc.save(fileName || 'campaign-donations.pdf');
};

const groupLangarReportRows = (rows = []) => {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row.itemName || 'Unknown item';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(row);
  });
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
};

export const downloadLangarReceivedReportPdf = async ({
  organizationName,
  periodLabel,
  rows = [],
  fileName
}) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const logoDataUrl = await loadLogoDataUrl();
  const generatedOn = new Date().toLocaleString();
  const groupedRows = groupLangarReportRows(rows);

  doc.setFillColor(...LOGO_BLUE_RGB);
  doc.rect(0, 0, pageWidth, 98, 'F');

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', 34, 22, 54, 54);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(organizationName || 'Gurdwara', 102, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Langar Items Received Report', 102, 58);
  doc.text(`Period: ${periodLabel || '-'}`, 102, 72);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Items Received', pageWidth - 40, 42, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Total Commitments: ${rows.length}`, pageWidth - 40, 60, { align: 'right' });
  doc.text(`Generated: ${generatedOn}`, pageWidth - 40, 74, { align: 'right' });

  let nextY = 126;
  groupedRows.forEach(([itemName, entries]) => {
    if (nextY > pageHeight - 130) {
      doc.addPage();
      nextY = 42;
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(itemName, 40, nextY);
    const subtotal = entries.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    autoTable(doc, {
      startY: nextY + 8,
      head: [['Contributor', 'Quantity', 'Received Date', 'Created Date', 'Expected Date']],
      body: [
        ...entries.map((row) => [
          row.donorName || '-',
          `${row.quantity} ${row.unit}`,
          row.receivedDate || '-',
          row.createdDate || '-',
          row.expectedDate || '-'
        ]),
        [
          { content: 'Subtotal', colSpan: 1, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [15, 23, 42] } },
          { content: `${subtotal} ${entries[0]?.unit || ''}`, colSpan: 4, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: [15, 23, 42] } }
        ]
      ],
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
      theme: 'grid',
      margin: { left: 40, right: 40 }
    });
    nextY = (doc.lastAutoTable?.finalY || nextY + 50) + 28;
  });

  const finalY = doc.lastAutoTable?.finalY || 260;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('This report compiles Langar item commitments marked received for the selected period.', 40, Math.min(finalY + 20, pageHeight - 34));

  doc.save(fileName || 'langar-items-received.pdf');
};

export const downloadLangarReceivedReportCsv = ({
  organizationName,
  periodLabel,
  rows = [],
  fileName
}) => {
  const groupedRows = groupLangarReportRows(rows);
  const dataRows = [];
  groupedRows.forEach(([itemName, entries]) => {
    entries.forEach((row) => dataRows.push([
      itemName,
      row.donorName || '-',
      `${row.quantity} ${row.unit}`,
      row.receivedDate || '-',
      row.createdDate || '-',
      row.expectedDate || '-'
    ]));
    const subtotal = entries.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    dataRows.push([`${itemName} — Subtotal`, '', `${subtotal} ${entries[0]?.unit || ''}`, '', '', '']);
  });
  const metadataRows = [
    ['Organization', organizationName || ''],
    ['Report', 'Langar Items Received Report'],
    ['Period', periodLabel || '-'],
    ['Generated On', new Date().toLocaleString()],
    []
  ];

  const csvData = [
    ...metadataRows.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')),
    buildCsv(['Item', 'Contributor', 'Quantity', 'Received Date', 'Created Date', 'Expected Date'], dataRows)
  ].join('\n');

  const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  triggerFileDownload(blob, fileName || 'langar-items-received.csv');
};
