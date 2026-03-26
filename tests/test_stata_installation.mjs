import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  inferStataVersion,
  inferStataVersionFromPath,
} = require('../out/stata-installation.js');

test('inferStataVersionFromPath keeps path-only detection working', () => {
  assert.equal(inferStataVersionFromPath('/usr/local/stata19'), '19');
});

test('inferStataVersion prefers macOS bundle metadata when available', { skip: process.platform !== 'darwin' }, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stata-installation-test-'));
  const installRoot = path.join(tempRoot, 'StataNow');
  const infoPlistPath = path.join(installRoot, 'StataMP.app', 'Contents', 'Info.plist');

  fs.mkdirSync(path.dirname(infoPlistPath), { recursive: true });
  fs.writeFileSync(
    infoPlistPath,
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>StataNow/MP 19.5</string>
  <key>CFBundleShortVersionString</key>
  <string>19.5.038</string>
</dict>
</plist>
`,
    'utf8',
  );

  try {
    assert.equal(inferStataVersion(installRoot), '19.5.038');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
