const fs = require('fs');
const path = require('path');
const os = require('os');

function getSafeTempDir() {
  return path.join(os.tmpdir(), 'testforge');
}

function sanitizeFilename(filename) {
  return filename
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>:\"|?*]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/\/\\\\/g, '_')
    .trim();
}

function validateTempPath(inputPath) {
  try {
    const resolvedPath = path.resolve(inputPath);
    const resolvedBase = path.resolve(getSafeTempDir());
    const normalizedPath = resolvedPath.replace(/\\/g, '/').toLowerCase();
    const normalizedBase = (resolvedBase.replace(/\\/g, '/') + '/').toLowerCase();
    if (!normalizedPath.startsWith(normalizedBase)) return null;
    const relative = path.relative(resolvedBase, resolvedPath);
    if (relative.startsWith('..')) return null;
    return resolvedPath;
  } catch (err) {
    return null;
  }
}

(async () => {
  console.log('Smoke test: start');
  const tempDir = getSafeTempDir();
  const screenshotsDir = path.join(tempDir, 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });
  console.log('Ensured temp dirs:', tempDir, screenshotsDir);

  const filename = sanitizeFilename(`recording_smoke_${Date.now()}.webm`);
  const candidatePath = path.join(tempDir, filename);
  const validated = validateTempPath(candidatePath);
  if (!validated) {
    console.error('Failed to validate path:', candidatePath);
    process.exit(2);
  }

  const buffer = Buffer.from('smoke-test-bytes');
  fs.writeFileSync(validated, buffer);
  console.log('Wrote file:', validated, 'size:', fs.statSync(validated).size);

  const read = fs.readFileSync(validated);
  if (read.length !== buffer.length) {
    console.error('Read size mismatch', read.length, buffer.length);
    process.exit(3);
  }

  const b64 = read.toString('base64');
  if (!b64 || b64.length === 0) {
    console.error('Base64 encoding failed');
    process.exit(4);
  }

  const decoded = Buffer.from(b64, 'base64');
  if (decoded.toString() !== buffer.toString()) {
    console.error('Decoded content mismatch');
    process.exit(5);
  }

  console.log('Base64 read/verify OK, length:', b64.length);

  console.log('Smoke test: success');
  process.exit(0);
})();
