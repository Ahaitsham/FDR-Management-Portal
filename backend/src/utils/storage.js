const crypto = require('crypto');
const supabase = require('../config/supabase');
const { supabaseBucket } = require('../config');

const extensions = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

function safeKey(key) {
  return typeof key === 'string' && key.startsWith('fdrs/');
}

// Builds a private, unguessable object key from verified file information.
function buildObjectKey({ institutionId, mimeType }) {
  const extension = extensions[mimeType];
  if (!extension) throw new Error('Unsupported document type');
  return `fdrs/${institutionId}/${crypto.randomUUID()}.${extension}`;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function uploadFile(key, buffer, contentType) {
  if (!safeKey(key)) throw new Error('Invalid document key');
  const { error } = await supabase.storage.from(supabaseBucket).upload(key, buffer, { contentType, upsert: false });
  if (error) {
    const storageError = new Error(error.message);
    storageError.status = 502;
    throw storageError;
  }
  return key;
}

async function downloadFile(key) {
  if (!safeKey(key)) {
    const error = new Error('Document not found');
    error.status = 404;
    throw error;
  }
  const { data, error: downloadError } = await supabase.storage.from(supabaseBucket).download(key);
  if (downloadError || !data) {
    const error = new Error('Document not found');
    error.status = downloadError && /not found|object/i.test(downloadError.message) ? 404 : 502;
    throw error;
  }
  return { buffer: Buffer.from(await data.arrayBuffer()), contentType: data.type };
}

async function deleteFile(key) {
  if (!safeKey(key)) return;
  try {
    const { error } = await supabase.storage.from(supabaseBucket).remove([key]);
    if (error) console.error('document delete error:', error.message);
  } catch (err) {
    console.error('document delete error:', err.message);
  }
}

async function getSignedUrl(key, seconds = 120) {
  if (!safeKey(key)) throw new Error('Invalid document key');
  const { data, error } = await supabase.storage.from(supabaseBucket).createSignedUrl(key, seconds);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

module.exports = { buildObjectKey, uploadFile, downloadFile, deleteFile, sha256, getSignedUrl };
