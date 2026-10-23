// Removes sensitive account and private storage data from FDR API responses.
function cleanFdr(fdr) {
  const item = fdr && fdr.toObject ? fdr.toObject() : { ...fdr };
  delete item.accountNo;
  item.hasDocument = Boolean(item.document && item.document.url);
  if (item.document) {
    item.document = { mimeType: item.document.mimeType, sizeBytes: item.document.sizeBytes };
  }
  return item;
}

module.exports = { cleanFdr };
