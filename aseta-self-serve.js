(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const fmtRp = (value) => {
    if (!Number.isFinite(value)) return '—';
    if (value >= 1e9) return `Rp${(value / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`;
    if (value >= 1e6) return `Rp${(value / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
    if (value >= 1e3) return `Rp${(value / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`;
    return `Rp${Math.round(value).toLocaleString('id-ID')}`;
  };
  const assetRanges = {
    'under-50': { label: '< 50', min: 1, max: 49, subscription: { qr: [525000, 525000], rfid: [750000, 750000] } },
    '50-199': { label: '50–200', min: 50, max: 199, subscription: { qr: [525000, 525000], rfid: [750000, 750000] } },
    '200-499': { label: '200–500', min: 200, max: 499, subscription: { qr: [525000, 525000], rfid: [750000, 750000] } },
    '500-999': { label: '500–1.000', min: 500, max: 999, subscription: { qr: [750000, 750000], rfid: [1200000, 1200000] } },
    '1000-2000': { label: '1.000–2.000', min: 1000, max: 2000, subscription: { qr: [1200000, 1200000], rfid: [2400000, 2400000] } }
  };
  const enterpriseFeatureLabels = {
    depreciation: 'Depresiasi aset otomatis',
    maintenance: 'Maintenance & work order',
    'borrowing-disposal': 'Peminjaman & disposal/write-off',
    'cross-branch-approval': 'Approval & kontrol lintas cabang',
    'erp-integration': 'Integrasi accounting/ERP via API'
  };
  const state = { profile: {}, painPoints: [], features: [], estimate: null, score: 0, lead: null, pdfBlob: null };
  const selectedFeatures = () => $$('.feature-choice input:checked').map((input) => input.value);
  const selectedAssetRange = () => $('#asset-range')?.value || '';
  const getProfile = () => ({
    assetRange: selectedAssetRange(),
    system: $('#profile-system')?.value || '',
    branches: $('#profile-branches')?.value || '',
    implementationTarget: $('#implementation-target')?.value || ''
  });
  const estimateRange = () => {
    const range = assetRanges[selectedAssetRange()];
    if (!range) return null;
    const features = selectedFeatures();
    const method = $('#subscription-type')?.value || 'qr';
    const subscriptions = range.subscription[method].map((monthly) => monthly * 12);
    const enterprise = features.map(() => 375000 * 12).reduce((sum, value) => sum + value, 0);
    const hardwareSelected = method === 'qr' ? $('#qr-hardware')?.checked : $('#rfid-hardware')?.checked;
    const tagPrice = Number($('#rfid-tag-type')?.value || 180000);
    const hardware = hardwareSelected
      ? method === 'rfid'
        ? [19500000 + Math.ceil(range.min / 100) * tagPrice, 19500000 + Math.ceil(range.max / 100) * tagPrice]
        : [8060000, 8060000]
      : [0, 0];
    const low = subscriptions[0] + enterprise + hardware[0];
    const high = subscriptions[1] + enterprise + hardware[1];
    const downtime = Number($('#dt-range')?.value || 0);
    const costPerHour = Number($('#dtcost-range')?.value || 0);
    const repair = Number($('#repair-range')?.value || 0);
    const reduce = Number($('#reduce-range')?.value || 0);
    const annualLoss = (downtime * costPerHour * 12) + (repair * 12);
    const annualSaving = annualLoss * reduce / 100;
    return { range, method, features, hardware, low, high, annualLoss, annualSaving, reduce };
  };
  const updateEstimate = () => {
    const downtime = Number($('#dt-range')?.value || 0);
    const costPerHour = Number($('#dtcost-range')?.value || 0);
    const repair = Number($('#repair-range')?.value || 0);
    const reduce = Number($('#reduce-range')?.value || 0);
    $('#dt-output').textContent = `${downtime} jam`;
    $('#dtcost-output').textContent = fmtRp(costPerHour);
    $('#repair-output').textContent = fmtRp(repair);
    $('#reduce-output').textContent = `${reduce}%`;
    const liveLoss = (downtime * costPerHour * 12) + (repair * 12);
    const hint = liveLoss > 0 ? '' : 'Geser downtime atau biaya perbaikan untuk melihat estimasi kerugian.';
    const lossValue = $('#loss-value');
    if (lossValue) lossValue.textContent = liveLoss > 0 ? fmtRp(liveLoss) : '\u2014';
    const lossMonth = $('#loss-month');
    if (lossMonth) lossMonth.innerHTML = liveLoss > 0 ? `\u2248 <b>${fmtRp(liveLoss / 12)}</b> bocor setiap bulan` : hint;
    const liveSummary = $('#live-summary');
    if (liveSummary) {
      liveSummary.innerHTML = `<p class="live-label">Perkiraan kerugian saat ini</p><p class="live-value">${liveLoss > 0 ? fmtRp(liveLoss) : '\u2014'}</p><p class="live-month">${liveLoss > 0 ? `\u2248 <b>${fmtRp(liveLoss / 12)}</b> bocor setiap bulan` : 'Geser slider untuk melihat angka'}</p>`;
      liveSummary.hidden = false;
    }
    state.estimate = estimateRange();
    renderDiagnosis();
  };
  const painLabels = {
    'data-tersebar': 'Data aset tersebar',
    'audit-lambat': 'Stock opname/audit memakan waktu',
    'maintenance-reaktif': 'Maintenance masih reaktif',
    'lintas-lokasi': 'Kontrol lintas lokasi sulit',
    'laporan-keuangan': 'Laporan lifecycle/keuangan belum siap'
  };
  const painSolutions = {
    'data-tersebar': 'Detail Asset + QR/RFID',
    'audit-lambat': 'QR/RFID + Laporan Aktifitas',
    'maintenance-reaktif': 'Preventive Maintenance',
    'lintas-lokasi': 'Transfer & Mutasi + Dashboard',
    'laporan-keuangan': 'Laporan Aktifitas + Depresiasi'
  };
  const renderDiagnosis = () => {
    const causeList = $('#cause-list');
    const solutionList = $('#solution-list');
    if (!causeList || !solutionList) return;
    const downtime = Number($('#dt-range')?.value || 0);
    const repair = Number($('#repair-range')?.value || 0);
    const causes = [];
    if (downtime > 0) causes.push(`Downtime operasi ${downtime} jam/bulan`);
    if (repair > 0) causes.push(`Perbaikan reaktif ${fmtRp(repair)}/bulan`);
    const checked = $$('[name="pain_point"]:checked');
    checked.forEach((input) => causes.push(painLabels[input.value] || input.value));
    const solutions = new Set();
    checked.forEach((input) => { const s = painSolutions[input.value]; if (s) solutions.add(s); });
    if (downtime > 0 || repair > 0) solutions.add('Preventive Maintenance');
    if (!solutions.size) solutions.add('Detail Asset + QR/RFID');
    causeList.innerHTML = causes.length ? causes.map((c) => `<li>${c}</li>`).join('') : '<li class="diag-empty">Belum ada data simulasi.</li>';
    solutionList.innerHTML = [...solutions].map((s) => `<li>${s}</li>`).join('');
  };  const updateProfileSummary = () => {
    const profile = getProfile();
    const range = assetRanges[profile.assetRange];
    const summary = $('#profile-summary');
    if (summary) summary.textContent = range ? `${range.label} aset · ${profile.branches || 'lokasi belum dipilih'} · target ${$('#implementation-target option:checked')?.textContent || 'belum dipilih'}` : 'Lengkapi identifikasi kebutuhan untuk mulai.';
  };
  const calculateScore = () => {
    const profile = getProfile();
    const pain = $$('[name="pain_point"]:checked').length;
    let score = pain * 10;
    if (state.features.length) score += 15;
    if (profile.assetRange === '500-999' || profile.assetRange === '1000-2000') score += 15;
    if (profile.branches === '6-20' || profile.branches === 'over-20') score += 10;
    if (profile.implementationTarget === 'now') score += 20;
    else if (profile.implementationTarget === 'later') score += 10;
    if (profile.system === 'manual' || profile.system === 'spreadsheet') score += 10;
    return Math.min(100, score);
  };
  const renderResults = () => {
    state.score = calculateScore();
    state.profile = getProfile();
    state.painPoints = $$('[name="pain_point"]:checked').map((input) => input.value);
    state.features = selectedFeatures();
    const enterprise = state.features.length > 0 || state.painPoints.includes('maintenance-reaktif') || state.painPoints.includes('laporan-keuangan');
    const scoreLabel = state.score >= 70 ? 'Prioritas tinggi' : state.score >= 40 ? 'Perlu ditindaklanjuti' : 'Masih eksplorasi';
    const scoreReason = 'Skor ini merangkum urgensi, kompleksitas, dan target implementasi untuk membantu tim Aseta menindaklanjuti kebutuhan Anda.';
    $('#readiness-score').textContent = state.score;
    $('#readiness-label').textContent = scoreLabel;
    $('#readiness-reason').textContent = scoreReason;
    $('#recommendation-plan').textContent = enterprise ? 'Aseta Enterprise' : 'Aseta Essentials';
    $('#recommendation-reason').textContent = enterprise ? 'Kebutuhan Anda menyentuh lifecycle, maintenance, governance, atau integrasi yang perlu dibahas lebih detail.' : 'Kebutuhan awal Anda berfokus pada inventaris, audit, lokasi, dan kontrol dasar aset.';
    $('#result-feature-summary').textContent = state.features.length ? `Kapabilitas yang dipilih: ${state.features.map((id) => enterpriseFeatureLabels[id]).join('; ')}.` : 'Belum ada kapabilitas Enterprise yang dipilih.';
    $('#results').hidden = false;
    $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const dt = Number($('#dt-range')?.value || 0);
    const cost = Number($('#dtcost-range')?.value || 0);
    const repair = Number($('#repair-range')?.value || 0);
    const reduce = Number($('#reduce-range')?.value || 0);
    const loss = (dt * cost * 12) + (repair * 12);
    const saving = loss * reduce / 100;
    const setText = (id, value) => { const el = $('#' + id); if (el) el.textContent = value; };
    setText('flow-loss', loss > 0 ? fmtRp(loss) : '—');
    setText('flow-formula', '(' + dt + ' jam × ' + fmtRp(cost) + ' × 12) + (' + fmtRp(repair) + ' × 12)');
    setText('saving-value', saving > 0 ? fmtRp(saving) : '—');
    setText('saving-month', saving > 0 ? fmtRp(saving / 12) : '—');
    setText('saving-badge', reduce + '%');
    setText('saving-without', loss > 0 ? fmtRp(loss) : '—');
    setText('saving-with', loss > 0 ? fmtRp(loss - saving) : '—');
    const barWith = $('#saving-bar-with');
    if (barWith) barWith.style.width = Math.max(0, 100 - reduce) + '%';
    setText('saving-foot', 'Dari total kerugian ' + fmtRp(loss) + '/tahun dengan target pengurangan ' + reduce + '%. Sisanya tetap biaya operasional yang perlu dikelola. Angka indikatif, bukan jaminan hasil.');
    renderDiagnosis();
    const flowCauses = $('#flow-causes');
    const flowSolutions = $('#flow-solutions');
    if (flowCauses) flowCauses.innerHTML = $('#cause-list')?.innerHTML || '<li class="diag-empty">Belum ada data simulasi.</li>';
    if (flowSolutions) flowSolutions.innerHTML = $('#solution-list')?.innerHTML || '<li class="diag-empty">Belum ada data simulasi.</li>';
    state.pdfBlob = null;
    generatePdf().then((blob) => { state.pdfBlob = blob; uploadLeadPdf(blob, state.requestId); }).catch(() => {});
  };
  const dialog = $('#lead-dialog');
  const menuToggle = $('.menu-toggle');
  const mainNav = $('#main-nav');
  const closeMenu = () => {
    if (!mainNav || !menuToggle) return;
    mainNav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.textContent = 'Menu';
  };
  if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', () => {
      const open = mainNav.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', String(open));
      menuToggle.textContent = open ? 'Tutup' : 'Menu';
    });
    mainNav.addEventListener('click', (event) => {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('click', (event) => {
      if (!mainNav.classList.contains('open') || event.target.closest('.nav-wrap')) return;
      closeMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 800) closeMenu();
    });
  }
  $('#problem-identification-form').addEventListener('submit', (event) => {
    event.preventDefault();
    state.profile = getProfile();
    $('#simulator').scrollIntoView({ behavior: 'smooth' });
    updateProfileSummary();
  });
  ['#asset-range', '#profile-system', '#profile-branches', '#implementation-target'].forEach((selector) => $(selector)?.addEventListener('change', updateProfileSummary));
  $$('.calc-panel input, .calc-panel select').forEach((input) => input.addEventListener('input', updateEstimate));
  $$('.calc-panel input, .calc-panel select').forEach((input) => input.addEventListener('change', updateEstimate));
  const bindMethodToggle = () => {
    const sel = document.getElementById('subscription-type');
    const qrCard = document.getElementById('card-qr');
    const rfidCard = document.querySelector('.cost-card.is-rfid');
    const radios = document.querySelectorAll('input[name="method"]');
    if (!radios.length) return;
    radios.forEach((r) => {
      r.addEventListener('change', () => {
        const v = r.value;
        if (sel) sel.value = v;
        if (qrCard) qrCard.style.display = v === 'qr' ? 'block' : 'none';
        if (rfidCard) rfidCard.style.display = v === 'rfid' ? 'block' : 'none';
        document.querySelectorAll('.radio-chip').forEach((c) => c.classList.toggle('is-active', c.querySelector('input')?.checked));
        syncHardwareOptions();
        updateEstimate();
      });
    });
  };
  const syncHardwareOptions = () => {
    const isRfid = $('#subscription-type').value === 'rfid';
    $('#qr-hardware-choice').hidden = isRfid;
    $('#rfid-hardware-choice').hidden = !isRfid;
    $('#rfid-tag-choice').hidden = !(isRfid && $('#rfid-hardware').checked);
  };
  $('#subscription-type').addEventListener('change', () => { syncHardwareOptions(); updateEstimate(); });
  $('#rfid-hardware').addEventListener('change', syncHardwareOptions);
  const leadForm = $('#simulator-lead-form');
  const leadError = $('#lead-error');
  const leadSubmit = $('#lead-submit');
  const leadFallback = $('#lead-fallback');
  const normalizePhone = (value) => {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('0062')) digits = digits.slice(4);
    else if (digits.startsWith('62')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = digits.slice(1);
    return digits ? `62${digits}` : '';
  };
  const makeRequestId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const attribution = new URLSearchParams(window.location.search);
  const previewMode = attribution.get('preview') === '1';
  const attributionFields = Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'].map((key) => [key, attribution.get(key) || '']));
  let retryRequestId = '';
  const buildLeadMessage = (data) => {
    const estimate = state.estimate;
    return [
      'Halo tim Aseta, saya sudah mengisi simulasi.',
      `Nama: ${data.name}`,
      `Perusahaan: ${data.company}`,
      `Jabatan: ${data.position}`,
      `Email: ${data.email}`,
      `WhatsApp: +${normalizePhone(data.phone)}`,
      estimate ? `Rentang aset: ${estimate.range.label}` : '',
      estimate ? `Estimasi biaya tahun pertama: ${fmtRp(estimate.low)}–${fmtRp(estimate.high)}` : '',
      estimate ? `Potensi biaya terhindarkan: ${fmtRp(estimate.annualSaving)}` : '',
      `Prioritas tindak lanjut: ${calculateScore()}/100`
    ].filter(Boolean).join('\n');
  };
  const submitLeadToSheet = (data, requestId) => new Promise((resolve, reject) => {
    const endpoint = leadForm.dataset.leadEndpoint.trim();
    if (!endpoint) { reject(new Error('Integrasi Google Sheets belum dikonfigurasi.')); return; }
    let scriptUrl;
    try { scriptUrl = new URL(endpoint, window.location.href); }
    catch (error) { reject(new Error('URL Google Apps Script tidak valid. Periksa konfigurasi integrasi.')); return; }
    if (!['script.google.com', '127.0.0.1', 'localhost'].includes(scriptUrl.hostname) || (scriptUrl.hostname === 'script.google.com' && scriptUrl.protocol !== 'https:')) {
      reject(new Error('URL Google Apps Script tidak valid. Periksa konfigurasi integrasi.')); return;
    }
    const attemptId = makeRequestId();
    const frame = document.createElement('iframe');
    const form = document.createElement('form');
    const cleanup = () => { clearTimeout(timeout); window.removeEventListener('message', onMessage); frame.remove(); form.remove(); };
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Respons Google Sheets tidak diterima. Coba lagi.')); }, 20000);
    const onMessage = (event) => {
      let origin;
      try { origin = new URL(event.origin); } catch (error) { return; }
      if (event.source === window || !(origin.origin === scriptUrl.origin || origin.hostname.endsWith('-script.googleusercontent.com'))) return;
      const result = event.data;
      if (result?.type !== 'aseta-lead-result' || result.requestId !== requestId || result.attemptId !== attemptId) return;
      cleanup();
      if (result.status === 'success') { retryRequestId = ''; resolve(); }
      else if (result.status === 'duplicate') {
        const duplicateError = new Error('duplicate');
        duplicateError.duplicateAt = result.existingAt || '';
        reject(duplicateError);
      }
      else reject(new Error('Data belum tersimpan di Google Sheets. Coba lagi.'));
    };
    frame.name = `aseta-lead-${attemptId}`;
    frame.hidden = true;
    form.action = scriptUrl.href;
    form.method = 'post';
    form.target = frame.name;
    form.acceptCharset = 'UTF-8';
    form.hidden = true;
    const estimate = state.estimate;
    const investment = estimate ? Math.round((estimate.low + estimate.high) / 2) : 0;
    const annualSaving = estimate ? Math.round(estimate.annualSaving) : 0;
    const netBenefit = investment ? annualSaving - investment : 0;
    const roi = investment ? Math.round(netBenefit / investment * 100) : '';
    const payback = investment && annualSaving > 0 ? Math.round(investment / (annualSaving / 12) * 10) / 10 : '';
    const fields = {
      ...data,
      phone: normalizePhone(data.phone),
      ...attributionFields,
      request_id: requestId,
      attempt_id: attemptId,
      website: '',
      consent: 'yes',
      downtime: String(Number($('#dt-range')?.value || 0)),
      downtime_cost_per_hour: String(Number($('#dtcost-range')?.value || 0)),
      reactive_repair_cost_monthly: String(Number($('#repair-range')?.value || 0)),
      breakdown_reduction_target: String(Number($('#reduce-range')?.value || 0)),
      annual_loss: String(estimate ? Math.round(estimate.annualLoss) : 0),
      annual_saving: String(annualSaving),
      annual_investment_estimate: estimate ? String(investment) : '',
      annual_net_benefit_estimate: estimate ? String(netBenefit) : '',
      roi_estimate_percent: roi === '' ? '' : String(roi),
      payback_months_estimate: payback === '' ? '' : String(payback),
      source: window.location.href,
      submitted_at: new Date().toISOString()
    };
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = name; input.value = value;
      form.append(input);
    });
    window.addEventListener('message', onMessage);
    document.body.append(frame, form);
    form.submit();
  });
  $('#result-gate').addEventListener('click', () => {
    const gateHint = $('#gate-hint');
    const problemForm = $('#problem-identification-form');
    const requiredFields = ['#asset-range', '#profile-system', '#profile-branches', '#implementation-target'];
    const missingField = requiredFields.find((selector) => !$(selector)?.value);
    const painSelected = $$('[name="pain_point"]:checked').length > 0;
    if (!painSelected || missingField) {
      if (gateHint) {
        gateHint.textContent = 'Lengkapi Langkah 1 dulu: pilih minimal satu masalah utama dan isi jumlah aset, sistem yang dipakai, jumlah lokasi, serta target implementasi. Estimasi penghematan dan rekomendasi baru bisa dihitung setelahnya.';
        gateHint.hidden = false;
      }
      if (!painSelected) $('.choice-grid')?.classList.add('needs-attention');
      if (missingField) $(missingField)?.closest('label')?.classList.add('needs-attention');
      problemForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const downtime = Number($('#dt-range')?.value || 0);
    const costPerHour = Number($('#dtcost-range')?.value || 0);
    const repair = Number($('#repair-range')?.value || 0);
    const liveLoss = (downtime * costPerHour * 12) + (repair * 12);
    if (liveLoss <= 0) {
      if (gateHint) {
        gateHint.textContent = 'Geser downtime atau biaya perbaikan untuk melihat diagnosis kerugian terlebih dahulu.';
        gateHint.hidden = false;
      }
      $('#dt-range')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (gateHint) gateHint.hidden = true;
    leadError.hidden = true;
    leadSubmit.hidden = false;
    if (leadFallback) { leadFallback.hidden = true; leadFallback.classList.remove('is-button'); }
    dialog.showModal();
    leadForm.querySelector('[name="name"]').focus();
  });
  ['#asset-range', '#profile-system', '#profile-branches', '#implementation-target'].forEach((selector) => {
    $(selector)?.addEventListener('change', () => {
      const hint = $('#gate-hint');
      if (hint) hint.hidden = true;
      $(selector)?.closest('label')?.classList.remove('needs-attention');
    });
  });
  $$('[name="pain_point"]').forEach((input) => input.addEventListener('change', () => { const hint = $('#gate-hint'); if (hint) hint.hidden = true; if ($$('[name="pain_point"]:checked').length) $$('[name="pain_point"]')[0]?.closest('.choice-grid')?.classList.remove('needs-attention'); renderDiagnosis(); }));
  $('[data-close-lead]').addEventListener('click', () => dialog.close());
  leadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!leadForm.reportValidity()) return;
    const data = Object.fromEntries(new FormData(leadForm).entries());
    state.lead = data;
    state.profile = getProfile();
    state.features = selectedFeatures();
    state.painPoints = $$('[name="pain_point"]:checked').map((input) => input.value);
    const requestId = retryRequestId || makeRequestId();
    state.requestId = requestId;
    const originalLabel = leadSubmit.textContent;
    leadError.hidden = true;
    if (leadFallback) leadFallback.hidden = true;
    leadSubmit.disabled = true; leadSubmit.classList.add('is-loading');
    leadSubmit.textContent = 'Menyimpan data…';
    try {
      await submitLeadToSheet(data, requestId);
      const saved = JSON.parse(localStorage.getItem('asetaDraftLeads') || '[]');
      saved.push({ ...data, profile: state.profile, painPoints: state.painPoints, enterpriseFeatures: state.features, readinessScore: calculateScore(), estimate: state.estimate, savedAt: new Date().toISOString() });
      localStorage.setItem('asetaDraftLeads', JSON.stringify(saved));
      dialog.close();
      renderResults();
    } catch (error) {
      if (previewMode && error.duplicateAt !== undefined) {
        leadError.hidden = true;
        dialog.close();
        renderResults();
        return;
      } else if (error.duplicateAt !== undefined) {
        const when = error.duplicateAt ? new Date(error.duplicateAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
        leadError.textContent = `Nomor WhatsApp atau email ini sudah pernah mengisi simulasi${when ? ` pada ${when}` : ''}. Jika Anda ingin memperbarui data atau berdiskusi, hubungi tim Aseta.`;
        leadError.hidden = false;
        leadSubmit.hidden = true;
        if (leadFallback) {
          leadFallback.href = `https://wa.me/6281217984959?text=${encodeURIComponent('Halo tim Aseta, saya sudah pernah mengisi simulasi dan ingin memperbarui data.')}`;
          leadFallback.textContent = 'Hubungi tim Aseta via WhatsApp \u2197';
          leadFallback.classList.add('is-button');
          leadFallback.hidden = false;
        }
        return;
      }
      if (error.message.startsWith('Data belum tersimpan') || error.message.startsWith('Respons Google Sheets')) retryRequestId = requestId;
      leadError.textContent = error.message || 'Data belum berhasil disimpan. Silakan coba lagi.';
      leadError.hidden = false;
      if (leadFallback) {
        leadFallback.href = `https://wa.me/6281217984959?text=${encodeURIComponent(buildLeadMessage(data))}`;
        leadFallback.hidden = false;
      }
    } finally {
      leadSubmit.disabled = false; leadSubmit.classList.remove('is-loading');
      leadSubmit.textContent = originalLabel;
    }
  });
  const generatePdf = async () => {
    await document.fonts?.ready;
    const estimate = state.estimate;
    const canvas = document.createElement('canvas');
    canvas.width = 1860;
    canvas.height = 2631;
    const ctx = canvas.getContext('2d');
    ctx.scale(1.5, 1.5);
    const colors = { navy: '#173b78', blue: '#1c4488', gold: '#f3b000', ink: '#263449', muted: '#718096', line: '#dce4ee', pale: '#f4f7fb', white: '#ffffff' };
    const date = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
    const roundRect = (x, y, w, h, r, fill, stroke) => {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.beginPath();
    };
    const text = (value, x, y, size, color = colors.ink, weight = 400) => {
      ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(value, x, y);
    };
    const paragraph = (value, x, y, maxWidth, lineHeight, size, color = colors.muted, weight = 400) => {
      ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`;
      ctx.fillStyle = color;
      let line = '';
      let row = 0;
      value.split(' ').forEach((word) => {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > maxWidth && line) {
          ctx.fillText(line, x, y + row++ * lineHeight);
          line = word;
        } else line = next;
      });
      if (line) ctx.fillText(line, x, y + row * lineHeight);
      return row + 1;
    };
    const money = (value) => fmtRp(value);
    const rangeMoney = (low, high) => low === high ? money(low) : `${money(low)}–${money(high)}`;
    const methodLabel = estimate?.method === 'rfid' ? 'RFID' : 'QR Code';
    const subscription = estimate ? estimate.range.subscription[estimate.method] : [0, 0];
    const investmentLow = estimate ? estimate.low : 0;
    const investmentHigh = estimate ? estimate.high : 0;
    const investmentMid = estimate ? (estimate.low + estimate.high) / 2 : 0;
    const annualSaving = estimate ? estimate.annualSaving : 0;
    const netBenefit = estimate ? annualSaving - investmentMid : 0;
    const roi = investmentMid ? Math.round(netBenefit / investmentMid * 100) : null;
    const payback = investmentMid && annualSaving > 0 ? investmentMid / (annualSaving / 12) : null;
    const featureList = state.features.map((id) => enterpriseFeatureLabels[id]).join(', ') || 'Tidak ada';

    ctx.fillStyle = colors.white;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = colors.navy;
    ctx.fillRect(0, 0, 1240, 390);
    ctx.fillStyle = colors.gold;
    ctx.fillRect(0, 386, canvas.width, 6);
    const logo = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = 'assets/aseta-logo-white.png';
    });
    if (logo) {
      const logoH = 48;
      const logoW = logo.width * (logoH / logo.height);
      ctx.drawImage(logo, 92, 74, logoW, logoH);
      const tagX = 92 + logoW + 26;
      ctx.font = '700 24px Inter, Arial, sans-serif';
      ctx.fillStyle = colors.white;
      ctx.fillText('Solusi Tepat Kelola ', tagX, 105);
      ctx.fillStyle = colors.gold;
      ctx.fillText('Aset', tagX + ctx.measureText('Solusi Tepat Kelola ').width, 105);
    } else {
      roundRect(92, 70, 56, 56, 14, colors.gold);
      text('A', 110, 109, 34, colors.navy, 800);
      text('ASETA  |  SOLUSI TEPAT KELOLA ASET', 170, 103, 20, '#d9e5f7', 700);
    }
    text('Ringkasan Kebutuhan Sistem Aset', 92, 205, 46, colors.white, 700);
    text('Hasil identifikasi kebutuhan dan simulasi biaya', 92, 253, 27, '#d9e5f7', 400);
    text(`Dibuat ${date}`, 92, 322, 20, '#d9e5f7', 400);

    text('HASIL UTAMA', 92, 454, 18, colors.blue, 700);
    roundRect(92, 482, 506, 218, 18, colors.pale, colors.line);
    roundRect(620, 482, 528, 218, 18, '#fff9e9', '#f4dfaa');
    text('Prioritas tindak lanjut', 122, 535, 19, colors.muted, 500);
    text(String(state.score), 122, 610, 64, colors.blue, 800);
    text($('#readiness-label').textContent, 122, 650, 20, colors.ink, 700);
    text('Rekomendasi', 650, 535, 19, colors.muted, 500);
    text($('#recommendation-plan').textContent, 650, 590, 34, colors.ink, 800);
    paragraph($('#recommendation-reason').textContent, 650, 630, 455, 26, 16);

    text('ESTIMASI BIAYA TAHUN PERTAMA', 92, 762, 18, colors.blue, 700);
    roundRect(92, 790, 1056, 112, 16, colors.white, colors.line);
    ctx.fillStyle = colors.line; ctx.fillRect(620, 790, 2, 112);
    text('Kisaran total biaya sistem', 126, 833, 18, colors.muted, 500);
    text(estimate ? rangeMoney(investmentLow, investmentHigh) : 'Pilih rentang aset', 126, 873, estimate ? 28 : 18, colors.ink, 700);
    text('Potensi biaya terhindarkan / tahun', 664, 833, 18, colors.muted, 500);
    text(estimate ? money(annualSaving) : '—', 664, 873, 28, colors.blue, 700);

    text('RINCIAN SIMULASI', 92, 975, 18, colors.blue, 700);
    const rows = [
      ['Rentang aset aktif', estimate ? estimate.range.label : '—'],
      ['Metode identifikasi', methodLabel],
      ['Langganan tahunan', estimate ? rangeMoney(subscription[0] * 12, subscription[1] * 12) : '—'],
      ['Hardware', estimate && estimate.hardware[0] ? rangeMoney(estimate.hardware[0], estimate.hardware[1]) : 'Tidak disertakan'],
      ['Kapabilitas Enterprise', featureList],
      ['Estimasi kerugian tahunan', estimate ? money(estimate.annualLoss) : '—'],
      ['Potensi biaya terhindarkan', estimate ? money(annualSaving) : '—'],
      ['Net benefit indikatif tahun pertama', estimate ? money(netBenefit) : '—'],
      ['ROI indikatif tahun pertama', roi === null ? '—' : `${roi}%`],
      ['Estimasi balik modal', payback === null ? '—' : `${payback.toLocaleString('id-ID', { maximumFractionDigits: 1 })} bulan`]
    ];
    rows.forEach(([label, value], index) => {
      const y = 1019 + index * 38;
      if (index % 2 === 0) { ctx.fillStyle = colors.pale; ctx.fillRect(92, y - 22, 1056, 34); }
      text(label, 116, y + 5, 19, colors.ink, 500);
      ctx.font = '700 19px Inter, Arial, sans-serif';
      ctx.fillStyle = colors.ink;
      ctx.textAlign = 'right'; ctx.fillText(value, 1118, y + 5); ctx.textAlign = 'left';
    });

    text('METODE PERHITUNGAN', 92, 1440, 18, colors.blue, 700);
    paragraph('Kerugian tahunan = (downtime bulanan × biaya downtime per jam × 12) + (biaya perbaikan reaktif bulanan × 12). Potensi biaya terhindarkan = kerugian tahunan × target pengurangan breakdown.', 92, 1475, 1040, 23, 15, colors.muted);
    paragraph('Estimasi biaya sistem mencakup langganan tahunan, kapabilitas Enterprise yang dipilih, dan hardware bila disertakan. Net benefit = potensi biaya terhindarkan − titik tengah estimasi biaya. ROI = net benefit ÷ estimasi biaya × 100%. Balik modal membandingkan estimasi biaya dengan potensi penghematan bulanan yang diasumsikan merata.', 92, 1535, 1056, 22, 14, colors.muted);
    ctx.strokeStyle = colors.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(92, 1640); ctx.lineTo(1148, 1640); ctx.stroke();
    text('CATATAN', 92, 1677, 15, colors.blue, 700);
    paragraph('Simulasi indikatif, bukan hasil aktual, jaminan penghematan, audit finansial, atau penawaran harga. Estimasi biaya dihitung dari acuan harga yang tersedia dan pilihan pengguna; validasi asumsi dan scope ke tim Aseta sebelum mengambil keputusan.', 92, 1712, 1056, 22, 14, colors.muted);
    text('Aseta · Kelola aset dengan data. Jaga operasi tetap berjalan.', 92, 1800, 15, colors.navy, 700);

    const jpeg = Uint8Array.from(atob(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]), (char) => char.charCodeAt(0));
    const encoder = new TextEncoder();
    const chunks = [];
    let length = 0;
    const append = (chunk) => { chunks.push(chunk); length += chunk.length; };
    const addText = (value) => { const chunk = encoder.encode(value); append(chunk); if (chunk.length !== value.length) throw new Error('Karakter di luar rentang ASCII pada struktur PDF.'); };
    const offsets = [];
    const object = (id, value) => { offsets[id] = length; addText(`${id} 0 obj\n${value}\nendobj\n`); };
    addText('%PDF-1.4\n');
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    offsets[4] = length;
    addText(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    append(jpeg);
    addText('\nendstream\nendobj\n');
    const stream = encoder.encode('q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n');
    offsets[5] = length;
    addText(`5 0 obj\n<< /Length ${stream.length} >>\nstream\n`);
    append(stream);
    addText('endstream\nendobj\n');
    const xref = length;
    addText(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    return new Blob(chunks, { type: 'application/pdf' });
  };
  const pdfFileName = () => {
    const company = String(state.lead?.company || '').trim();
    const slug = company ? '-' + company.replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) : '';
    return `aseta-ringkasan${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
  };
  const downloadPdf = (blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = pdfFileName();
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const uploadLeadPdf = (blob, requestId) => {
    if (!blob || !requestId) return;
    const endpoint = $('#simulator-lead-form')?.dataset?.leadEndpoint?.trim();
    if (!endpoint) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result || '').split(',')[1];
      if (!base64) return;
      const frameName = `aseta-pdf-${requestId}`;
      const frame = document.createElement('iframe');
      frame.name = frameName;
      frame.hidden = true;
      const form = document.createElement('form');
      form.action = endpoint;
      form.method = 'post';
      form.target = frameName;
      form.acceptCharset = 'UTF-8';
      form.hidden = true;
      [['action', 'pdf'], ['request_id', requestId], ['pdf_base64', base64], ['pdf_name', pdfFileName()], ['source', window.location.href]].forEach(([key, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.append(input);
      });
      document.body.append(frame, form);
      form.submit();
      setTimeout(() => { frame.remove(); form.remove(); }, 60000);
    };
    reader.readAsDataURL(blob);
  };
  const buildWhatsAppMessage = (closing) => {
    const lead = state.lead || {};
    const label = (selector) => $(selector)?.selectedOptions?.[0]?.textContent?.trim() || '';
    const pains = Array.from(document.querySelectorAll('[name="pain_point"]:checked')).map((input) => input.closest('label')?.querySelector('b')?.textContent?.trim() || input.value);
    const lines = [
      'Halo tim Aseta, saya sudah mengisi simulasi.',
      '',
      `Nama: ${lead.name || '-'}`,
      `Perusahaan: ${lead.company || '-'}`,
      `Jabatan: ${lead.position || '-'}`,
      `Email: ${lead.email || '-'}`,
      '',
      `Prioritas tindak lanjut: ${state.score}/100`,
      `Rekomendasi: ${$('#recommendation-plan').textContent}`,
      '',
      'PROFIL OPERASIONAL',
      `Rentang aset: ${assetRanges[state.profile.assetRange]?.label || '-'}`,
      `Jumlah lokasi: ${label('#profile-branches') || '-'}`,
      `Sistem saat ini: ${label('#profile-system') || '-'}`,
      `Target implementasi: ${label('#implementation-target') || '-'}`,
      `Metode identifikasi: ${state.estimate?.method === 'rfid' ? 'RFID' : 'QR Code'}`,
      '',
      'KEBUTUHAN',
      `Fitur: ${state.features.map((id) => enterpriseFeatureLabels[id]).join(', ') || 'belum dipilih'}`,
      `Masalah utama: ${pains.join(', ') || 'belum dipilih'}`
    ];
    if (closing) lines.push('', closing);
    return lines.join('\n');
  };
  const whatsappUrl = (message) => `https://wa.me/6281217984959?text=${encodeURIComponent(message)}`;
  $('#download-result').addEventListener('click', async () => {
    const button = $('#download-result');
    const originalLabel = button.textContent;
    button.disabled = true; button.classList.add('is-loading');
    button.textContent = 'Menyiapkan PDF…';
    try {
      downloadPdf(state.pdfBlob || await generatePdf());
    } catch (error) {
      window.alert('PDF gagal dibuat. Silakan coba lagi.');
    } finally {
      button.disabled = false; button.classList.remove('is-loading');
      button.textContent = originalLabel;
    }
  });
  $('#whatsapp-result').addEventListener('click', async () => {
    const button = $('#whatsapp-result');
    const hint = $('#whatsapp-hint');
    const originalLabel = button.textContent;
    const openChat = () => window.open(whatsappUrl(buildWhatsAppMessage()), '_blank', 'noopener,noreferrer');
    const showHint = () => {
      if (!hint) return;
      hint.textContent = `PDF ${pdfFileName()} sudah diunduh. Di chat WhatsApp, ketuk ikon lampiran, pilih Dokumen, lalu pilih file itu.`;
      hint.hidden = false;
    };
    if (hint) hint.hidden = true;
    if (state.pdfBlob) {
      // Blob sudah siap: unduh dan buka chat sales dalam satu gesture agar tidak diblokir popup blocker.
      downloadPdf(state.pdfBlob);
      openChat();
      showHint();
      return;
    }
    button.disabled = true; button.classList.add('is-loading');
    button.textContent = 'Menyiapkan PDF…';
    try {
      const blob = await generatePdf();
      state.pdfBlob = blob;
      downloadPdf(blob);
      openChat();
      showHint();
    } catch (error) {
      window.alert('PDF gagal dibuat. Silakan coba lagi.');
    } finally {
      button.disabled = false; button.classList.remove('is-loading');
      button.textContent = originalLabel;
    }
  });
  const stepBar = $('.step-bar');
  const stepLinks = $$('.step');
  const stepSections = stepLinks.map((link) => document.getElementById(link.dataset.step));
  const updateStep = () => {
    const offset = 150;
    let active = -1;
    stepSections.forEach((section, index) => {
      if (section && !section.hidden && section.getBoundingClientRect().top <= offset) active = index;
    });
    stepLinks.forEach((link, index) => {
      link.classList.toggle('is-active', index === active);
      link.classList.toggle('is-done', index < active);
    });
    if (stepBar) stepBar.classList.toggle('is-visible', active >= 0);
  };
  window.addEventListener('scroll', updateStep, { passive: true });
  window.addEventListener('resize', updateStep);
  updateStep();
  bindMethodToggle();   syncHardwareOptions(); updateEstimate(); updateProfileSummary();
})();
