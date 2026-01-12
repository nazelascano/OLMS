const MAX_NOTE_PREVIEW = 180;

const formatCountLabel = (count, singular, plural) => {
  const numericValue = Number(count);
  const resolvedCount = Number.isFinite(numericValue) ? numericValue : 0;
  const resolvedPlural = plural || `${singular}s`;
  const label = resolvedCount === 1 ? singular : resolvedPlural;
  return `${resolvedCount} ${label}`;
};

const normalizeTransactionTypeValue = (value) => {
  if (!value) {
    return '';
  }
  return String(value).trim().toLowerCase();
};

const formatBorrowRequestTypeLabel = (type) => {
  const normalized = normalizeTransactionTypeValue(type);
  if (normalized === 'overnight') {
    return 'an overnight borrow request';
  }
  if (normalized === 'annual' || normalized === 'annual-set') {
    return 'an annual borrow request';
  }
  return 'a borrow request';
};

const buildNotePreview = (notes, maxLength = MAX_NOTE_PREVIEW) => {
  if (typeof notes !== 'string') {
    return '';
  }
  const trimmed = notes.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`;
};

const buildBorrowRequestStaffMessage = ({
  borrowerName,
  transactionId,
  transactionType,
  itemCount,
  notes,
} = {}) => {
  const subject = borrowerName || 'A borrower';
  const typeLabel = formatBorrowRequestTypeLabel(transactionType);
  const countLabel = formatCountLabel(itemCount || 0, 'book');
  const requestSegment = transactionId ? ` (${transactionId})` : '';
  const notePreview = buildNotePreview(notes);

  let message = `${subject} submitted ${typeLabel}${requestSegment} for ${countLabel}.`;
  if (notePreview) {
    message += ` Note from borrower: "${notePreview}".`;
  }
  return message.trim();
};

module.exports = {
  buildBorrowRequestStaffMessage,
  buildNotePreview,
  formatBorrowRequestTypeLabel,
  formatCountLabel,
};
