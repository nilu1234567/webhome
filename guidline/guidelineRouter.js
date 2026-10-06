const express = require('express');
const { File } = require('megajs');

const router = express.Router();

// ====================================================================
// MEGA FOLDER LINK (shared folder with district/tehsil PDFs)
// Structure: DistrictName/TehsilName.pdf
// ====================================================================
const MEGA_FOLDER_URL = process.env.MEGA_FOLDER_URL || 'https://mega.nz/folder/zJUywQRB#dNH9hxV4fXOXLoQY4Ov3LA';

let zipStructure = {};   // { "District": ["Tehsil1", ...], ... }
let megaFileMap  = {};   // { "District/Tehsil": File object, ... }
let indexReady   = false;
let indexError   = null;

function walkMegaTree(node, result) {
  if (!node.children || node.children.length === 0) return;

  const pdfsHere = node.children.filter(
    c => !c.directory && c.name && c.name.toLowerCase().endsWith('.pdf')
  );

  if (pdfsHere.length > 0) {
    const distName = node.name || '__root__';
    if (!result[distName]) result[distName] = {};
    for (const pdf of pdfsHere) {
      const tehsilName = pdf.name.replace(/\.pdf$/i, '');
      result[distName][tehsilName] = pdf;
    }
  }

  for (const child of node.children) {
    if (child.directory) {
      walkMegaTree(child, result);
    }
  }
}

function buildMegaIndex() {
  return new Promise((resolve) => {
    console.log('[GUIDELINE] Connecting to MEGA folder...');
    console.log('[GUIDELINE]', MEGA_FOLDER_URL);

    let folder;
    try {
      folder = File.fromURL(MEGA_FOLDER_URL);
    } catch (e) {
      indexError = 'Invalid MEGA URL: ' + e.message;
      console.error('[GUIDELINE ERR]', indexError);
      resolve();
      return;
    }

    folder.loadAttributes((err) => {
      if (err) {
        indexError = 'MEGA connect error: ' + err.message;
        console.error('[GUIDELINE ERR]', indexError);
        resolve();
        return;
      }

      const rawMap = {};
      walkMegaTree(folder, rawMap);

      const nextZipStructure = {};
      const nextMegaFileMap = {};

      Object.keys(rawMap).sort().forEach(dist => {
        nextZipStructure[dist] = Object.keys(rawMap[dist]).sort();
        Object.keys(rawMap[dist]).forEach(teh => {
          nextMegaFileMap[dist + '/' + teh] = rawMap[dist][teh];
        });
      });

      zipStructure = nextZipStructure;
      megaFileMap = nextMegaFileMap;
      indexReady = true;
      indexError = null;

      const totalT = Object.values(zipStructure).reduce((a, b) => a + b.length, 0);
      console.log(`[GUIDELINE OK] MEGA indexed: ${Object.keys(zipStructure).length} districts, ${totalT} tehsils`);
      resolve();
    });
  });
}

// ── API: Status ───────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json({
    ready:        indexReady,
    error:        indexError,
    districts:    Object.keys(zipStructure).length,
    totalTehsils: Object.values(zipStructure).reduce((a, b) => a + b.length, 0),
    megaUrl:      MEGA_FOLDER_URL
  });
});

// ── API: Districts ────────────────────────────────────────────────────
router.get('/districts', (req, res) => {
  if (!indexReady) {
    return res.status(503).json({ error: 'Index not ready yet, please wait...' });
  }
  res.json({ districts: Object.keys(zipStructure) });
});

// ── API: Tehsils ──────────────────────────────────────────────────────
router.get('/tehsils/:district', (req, res) => {
  const district = decodeURIComponent(req.params.district);
  const tehsils  = zipStructure[district];
  if (!tehsils) return res.status(404).json({ error: 'District not found: ' + district });
  res.json({ tehsils });
});

// ── API: Stream PDF from MEGA ─────────────────────────────────────────
router.get('/pdf/:district/:tehsil', (req, res) => {
  const district = decodeURIComponent(req.params.district);
  const tehsil   = decodeURIComponent(req.params.tehsil);
  const key      = district + '/' + tehsil;
  const file     = megaFileMap[key];

  if (!file) {
    return res.status(404).json({ error: 'PDF not found: ' + key });
  }

  console.log('[GUIDELINE PDF] Streaming:', key, file.size ? `(${(file.size/1024/1024).toFixed(1)} MB)` : '');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(tehsil) + '.pdf"');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (file.size) res.setHeader('Content-Length', file.size);

  const download = file.download({});

  download.on('error', (e) => {
    console.error('[GUIDELINE ERR] MEGA stream:', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'MEGA stream error: ' + e.message });
  });

  req.on('close', () => {
    if (download && download.destroy) download.destroy();
  });

  download.pipe(res);
});

module.exports = {
  router,
  buildMegaIndex
};
