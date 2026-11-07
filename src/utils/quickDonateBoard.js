export const confirmedBoardDonations = (donations, campaignId) => {
  const seen = new Set();
  return (Array.isArray(donations) ? donations : []).filter((donation) => {
    const key = String(donation.gatewayTransactionId || donation.id || '');
    const cents = Math.round(Number(donation.amount) * 100);
    if (!key || seen.has(key) || String(donation.campaignId) !== String(campaignId)
      || donation.paymentProvider !== 'STRIPE' || donation.paymentStatus !== 'PAID'
      || !Number.isSafeInteger(cents) || cents <= 0) return false;
    seen.add(key);
    return true;
  });
};

export const boardDonationKey = (donation) => String(donation.gatewayTransactionId || donation.id);
export const boardDonationCents = (donations) => donations.reduce((total, donation) => total + Math.round(Number(donation.amount) * 100), 0);