const API_BASE = (window.location.pathname.startsWith('/guidline') || window.location.pathname.startsWith('/guideline')) ? '/guidline/api' : '/api';
// CG Guideline Portal - app.js
// Fetches district/tehsil list and individual PDFs from MEGA via server API

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ── Global Security: Disable Right-Click everywhere ───────────────────
document.addEventListener('contextmenu', e => e.preventDefault());

// ── Global Security: Disable text selection & drag ───────────────────
document.addEventListener('selectstart', e => e.preventDefault());
document.addEventListener('dragstart',   e => e.preventDefault());

// ── DOM refs ─────────────────────────────────────────────────────────
const districtSelect    = document.getElementById('districtSelect');
const tehsilSelect      = document.getElementById('tehsilSelect');
const viewPdfBtn        = document.getElementById('viewPdfBtn');
const pdfSection        = document.getElementById('pdf-section');
const pdfScrollContainer= document.getElementById('pdfScrollContainer');
const pdfTitleText      = document.getElementById('pdfTitleText');
const pageInfo          = document.getElementById('pageInfo');
const zoomInBtn         = document.getElementById('zoomInBtn');
const zoomOutBtn        = document.getElementById('zoomOutBtn');
const zoomBadge         = document.getElementById('zoomBadge');
const loadingOverlay    = document.getElementById('loadingOverlay');
const loadingText       = document.getElementById('loadingText');
const menuBtn           = document.getElementById('menuBtn');
const sidebar           = document.getElementById('sidebar');
const sideOverlay       = document.getElementById('overlay');
const errorBanner       = document.getElementById('errorBanner');
const errorMsg          = document.getElementById('errorMsg');
const connectingBanner  = document.getElementById('connectingBanner');

// ── State ─────────────────────────────────────────────────────────────
let pdfDoc          = null;
let totalPages      = 0;
let scale           = 1.5;
let renderingAll    = false;
let currentDistrict = '';
let currentTehsil   = '';

// ── Sidebar ───────────────────────────────────────────────────────────
menuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  sideOverlay.classList.toggle('show');
});
sideOverlay.addEventListener('click', closeSidebar);
function closeSidebar() {
  sidebar.classList.remove('open');
  sideOverlay.classList.remove('show');
}

// ── Scroll: track visible page in pageInfo ────────────────────────────
function updatePageInfoOnScroll() {
  const canvases = pdfScrollContainer.querySelectorAll('canvas[data-page]');
  if (!canvases.length) return;
  const containerTop = pdfScrollContainer.getBoundingClientRect().top;
  let closest = 1;
  let minDist = Infinity;
  canvases.forEach(cv => {
    const dist = Math.abs(cv.getBoundingClientRect().top - containerTop);
    if (dist < minDist) { minDist = dist; closest = parseInt(cv.dataset.page); }
  });
  pageInfo.textContent = `पृष्ठ ${closest} / ${totalPages}`;
}
pdfScrollContainer.addEventListener('scroll', updatePageInfoOnScroll);

// ── Init: Wait for MEGA index, then load districts ────────────────────
async function init() {
  connectingBanner.style.display = 'flex';
  errorBanner.style.display = 'none';

  let retries = 0;
  const maxRetries = 30;

  async function tryLoadDistricts() {
    try {
      const status = await fetch(API_BASE + '/status').then(r => r.json());

      if (status.error) {
        connectingBanner.style.display = 'none';
        errorBanner.style.display = 'block';
        errorMsg.textContent = status.error;
        return;
      }

      if (!status.ready || status.districts === 0) {
        retries++;
        if (retries >= maxRetries) {
          connectingBanner.style.display = 'none';
          errorBanner.style.display = 'block';
          errorMsg.textContent = 'Timeout: MEGA folder index nahi bana. Server check karen.';
          return;
        }
        setTimeout(tryLoadDistricts, 2000);
        return;
      }

      // Index ready — load districts
      connectingBanner.style.display = 'none';
      const data = await fetch(API_BASE + '/districts').then(r => r.json());
      districtSelect.innerHTML = '<option value="">— जिला चुनें —</option>';
      data.districts.forEach(d => {
        const o = document.createElement('option');
        o.value = d; o.textContent = d;
        districtSelect.appendChild(o);
      });

    } catch (e) {
      retries++;
      if (retries >= maxRetries) {
        connectingBanner.style.display = 'none';
        errorBanner.style.display = 'block';
        errorMsg.textContent = 'Server connect nahi hua: ' + e.message;
        return;
      }
      setTimeout(tryLoadDistricts, 2000);
    }
  }

  tryLoadDistricts();
}

// ── District change ───────────────────────────────────────────────────
districtSelect.addEventListener('change', async () => {
  const dist = districtSelect.value;
  tehsilSelect.disabled = true;
  tehsilSelect.innerHTML = '<option value="">लोड हो रही है...</option>';
  viewPdfBtn.disabled = true;
  hidePdfSection();

  if (!dist) {
    tehsilSelect.innerHTML = '<option value="">— पहले जिला चुनें —</option>';
    return;
  }

  try {
    const data = await fetch(API_BASE + '/tehsils/' + encodeURIComponent(dist)).then(r => r.json());
    tehsilSelect.innerHTML = '<option value="">— तहसील चुनें —</option>';
    data.tehsils.forEach(t => {
      const o = document.createElement('option');
      o.value = t; o.textContent = t;
      tehsilSelect.appendChild(o);
    });
    tehsilSelect.disabled = false;
  } catch (e) {
    tehsilSelect.innerHTML = '<option value="">त्रुटि</option>';
    console.error('Tehsil load error:', e);
  }
});

// ── Tehsil change ─────────────────────────────────────────────────────
tehsilSelect.addEventListener('change', () => {
  viewPdfBtn.disabled = !tehsilSelect.value;
});

// ── View PDF ──────────────────────────────────────────────────────────
viewPdfBtn.addEventListener('click', async () => {
  const dist = districtSelect.value;
  const teh  = tehsilSelect.value;
  if (!dist || !teh) return;

  currentDistrict = dist;
  currentTehsil   = teh;

  showLoading(dist + ' / ' + teh + ' लोड हो रही है...');

  try {
    const url = API_BASE + '/pdf/' + encodeURIComponent(dist) + '/' + encodeURIComponent(teh);

    pdfDoc = await pdfjsLib.getDocument({
      url: url,
      withCredentials: false,
      disableStream: false,
      disableAutoFetch: false
    }).promise;

    totalPages = pdfDoc.numPages;
    scale = 1.5;

    pdfTitleText.textContent = dist + ' › ' + teh;
    pageInfo.textContent = `पृष्ठ 1 / ${totalPages}`;

    await renderAllPages();

    pdfSection.classList.add('visible');
    hideLoading();

    setTimeout(() => {
      pdfSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);

  } catch (e) {
    hideLoading();
    console.error('PDF load error:', e);
    alert('पीडीएफ लोड नहीं हुई: ' + e.message +
      '\n\nServer और internet connection जाँचें।');
  }
});

// ── Render ALL pages (scroll mode) ───────────────────────────────────
async function renderAllPages() {
  if (!pdfDoc) return;
  if (renderingAll) return;
  renderingAll = true;

  // Clear old pages
  pdfScrollContainer.innerHTML = '';

  const dpr = window.devicePixelRatio || 1;

  for (let num = 1; num <= totalPages; num++) {
    const page = await pdfDoc.getPage(num);
    const vp   = page.getViewport({ scale: scale * dpr });

    // Page wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';

    // Page number badge
    const badge = document.createElement('div');
    badge.className = 'pdf-page-badge';
    badge.textContent = `${num} / ${totalPages}`;
    wrapper.appendChild(badge);

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.dataset.page = num;
    canvas.width  = vp.width;
    canvas.height = vp.height;
    canvas.style.width  = (vp.width  / dpr) + 'px';
    canvas.style.height = (vp.height / dpr) + 'px';

    // Disable right-click on each canvas
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    wrapper.appendChild(canvas);

    // ── Save button (hover pe dikhta hai) ──
    const saveBtn = document.createElement('button');
    saveBtn.className = 'page-save-btn';
    saveBtn.title = `पृष्ठ ${num} सेव करें`;
    saveBtn.innerHTML = '<span class="material-symbols-outlined">photo_camera</span><span class="page-save-label">इमेज सेव</span>';
    saveBtn.addEventListener('click', () => {
      const a = document.createElement('a');
      a.download = `${currentDistrict}_${currentTehsil}_page${num}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    });
    wrapper.appendChild(saveBtn);

    pdfScrollContainer.appendChild(wrapper);

    const ctx = canvas.getContext('2d');
    const renderTask = page.render({ canvasContext: ctx, viewport: vp });
    try {
      await renderTask.promise;
    } catch (e) {
      if (e.name !== 'RenderingCancelledException') console.error(e);
    }
  }

  zoomBadge.textContent = Math.round(scale * 100) + '%';
  renderingAll = false;
}

// ── Zoom ──────────────────────────────────────────────────────────────
zoomInBtn.addEventListener('click', () => {
  if (scale < 3.5) {
    scale = parseFloat((scale + 0.25).toFixed(2));
    renderAllPages();
  }
});
zoomOutBtn.addEventListener('click', () => {
  if (scale > 0.5) {
    scale = parseFloat((scale - 0.25).toFixed(2));
    renderAllPages();
  }
});

// ── Keyboard zoom ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!pdfDoc) return;
  if (e.ctrlKey && e.key === '+') { e.preventDefault(); zoomInBtn.click(); }
  if (e.ctrlKey && e.key === '-') { e.preventDefault(); zoomOutBtn.click(); }
});

// ── Helpers ───────────────────────────────────────────────────────────
function showLoading(msg) {
  loadingText.textContent = msg || 'Loading...';
  loadingOverlay.classList.add('show');
}
function hideLoading() {
  loadingOverlay.classList.remove('show');
}
function hidePdfSection() {
  pdfSection.classList.remove('visible');
  pdfDoc = null;
  pdfScrollContainer.innerHTML = '';
}

// ── Start ─────────────────────────────────────────────────────────────
init();
