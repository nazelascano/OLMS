const randomSuffix = () => Math.random().toString(36).slice(2, 8);

const resolveKindFromType = (type) => {
  if (!type) {
    return 'borrow';
  }
  if (type === 'annual-set') {
    return 'annual';
  }
  return 'borrow';
};

const generateTransactionId = (kind = 'borrow') => {
  const prefix = kind === 'annual' ? 'annual' : 'borrow';
  return `${prefix}_${Date.now()}_${randomSuffix()}`;
};

const ensureTransactionId = (transaction) => {
  if (!transaction || transaction.id) {
    return null;
  }
  const kind = resolveKindFromType(transaction.type);
  return generateTransactionId(kind);
};

module.exports = {
  generateTransactionId,
  ensureTransactionId,
  resolveKindFromType
};
