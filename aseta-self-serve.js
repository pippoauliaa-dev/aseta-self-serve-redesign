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
  const state = { profile: {}, painPoints: [], features: [], estimate: null, score: 0, lead: null };
  const selectedFeatures = () => $$('.feature-choice input:checked').map((input) => input.value);
  const selectedAssetRange = () => $('#asset-range')?.value || $('#asset-range-summary')?.value || '';
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
        : [7610000, 7610000]
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
    const estimate = estimateRange();
    state.estimate = estimate;
    const selectedRange = estimate?.range;
    $('#investment-output').textContent = estimate ? `Kisaran ${fmtRp(estimate.low)}–${fmtRp(estimate.high)}` : 'Pilih rentang aset';
    const method = $('#subscription-type')?.value || 'qr';
    const methodLabel = method === 'rfid' ? 'RFID' : 'QR Code';
    const hardwareSelected = method === 'rfid' ? $('#rfid-hardware')?.checked : $('#qr-hardware')?.checked;
    const subscriptionLabel = estimate
      ? `langganan ${fmtRp(estimate.range.subscription[method][0] * 12)}–${fmtRp(estimate.range.subscription[method][1] * 12)}/tahun`
      : '';
    const hardwareLabel = estimate && hardwareSelected
      ? `hardware ${methodLabel} Aseta disertakan (${fmtRp(estimate.hardware[0])}–${fmtRp(estimate.hardware[1])})`
      : `hardware ${methodLabel} tidak disertakan`;
    $('#investment-breakdown').textContent = estimate
      ? `${methodLabel}; ${subscriptionLabel}; ${hardwareLabel}; ${estimate.features.length} kapabilitas Enterprise dipilih (${estimate.features.map((id) => enterpriseFeatureLabels[id]).join(', ') || 'tidak ada'}).`
      : 'Pilih rentang aset dan kapabilitas untuk melihat kisaran.';
    $('#enterprise-features-output').textContent = `${estimate?.features.length || 0} fitur dipilih`;
    $('#saving-result').textContent = estimate ? fmtRp(estimate.annualSaving) : 'Rp0';
    const mid = estimate ? (estimate.low + estimate.high) / 2 : 0;
    $('#net-benefit-result').textContent = estimate && estimate.annualSaving ? fmtRp(estimate.annualSaving - mid) : '—';
    $('#roi-result').textContent = estimate && mid ? `${Math.round((estimate.annualSaving - mid) / mid * 100).toLocaleString('id-ID')}%` : '—';
  };
  const updateProfileSummary = () => {
    const profile = getProfile();
    const range = assetRanges[profile.assetRange];
    $('#profile-summary').textContent = range ? `${range.label} aset · ${profile.branches || 'lokasi belum dipilih'} · target ${$('#implementation-target option:checked')?.textContent || 'belum dipilih'}` : 'Lengkapi identifikasi kebutuhan untuk mulai.';
    $('#asset-range-summary').value = profile.assetRange;
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
    const scoreReason = `${state.painPoints.length} pain point, ${state.features.length} kapabilitas Enterprise dipilih, dan target implementasi ${$('#implementation-target option:checked')?.textContent || 'belum dipilih'}.`;
    $('#readiness-score').textContent = state.score;
    $('#readiness-label').textContent = scoreLabel;
    $('#readiness-reason').textContent = scoreReason;
    $('#recommendation-plan').textContent = enterprise ? 'Aseta Enterprise' : 'Aseta Essentials';
    $('#recommendation-reason').textContent = enterprise ? 'Kebutuhan Anda menyentuh lifecycle, maintenance, governance, atau integrasi yang perlu dibahas lebih detail.' : 'Kebutuhan awal Anda berfokus pada inventaris, audit, lokasi, dan kontrol dasar aset.';
    $('#result-feature-summary').textContent = state.features.length ? `Kapabilitas yang dipilih: ${state.features.map((id) => enterpriseFeatureLabels[id]).join('; ')}.` : 'Belum ada kapabilitas Enterprise yang dipilih.';
    $('#results').hidden = false;
    $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const dialog = $('#lead-dialog');
  $('#problem-identification-form').addEventListener('submit', (event) => {
    event.preventDefault();
    state.profile = getProfile();
    $('#simulator').scrollIntoView({ behavior: 'smooth' });
    updateProfileSummary();
  });
  ['#asset-range', '#profile-system', '#profile-branches', '#implementation-target'].forEach((selector) => $(selector)?.addEventListener('change', updateProfileSummary));
  $('#asset-range-summary').addEventListener('change', () => { $('#asset-range').value = $('#asset-range-summary').value; updateProfileSummary(); updateEstimate(); });
  $$('.calc-panel input, .calc-panel select').forEach((input) => input.addEventListener('input', updateEstimate));
  $$('.calc-panel input, .calc-panel select').forEach((input) => input.addEventListener('change', updateEstimate));
  const syncHardwareOptions = () => {
    const isRfid = $('#subscription-type').value === 'rfid';
    $('#qr-hardware-choice').hidden = isRfid;
    $('#rfid-hardware-choice').hidden = !isRfid;
    $('#rfid-tag-choice').hidden = !(isRfid && $('#rfid-hardware').checked);
  };
  $('#subscription-type').addEventListener('change', () => { syncHardwareOptions(); updateEstimate(); });
  $('#rfid-hardware').addEventListener('change', syncHardwareOptions);
  $('#result-gate').addEventListener('click', () => { $('#lead-error').hidden = true; dialog.showModal(); $('#simulator-lead-form [name="name"]').focus(); });
  $('[data-close-lead]').addEventListener('click', () => dialog.close());
  $('#simulator-lead-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    state.lead = Object.fromEntries(form.entries());
    state.profile = getProfile();
    state.features = selectedFeatures();
    state.painPoints = $$('[name="pain_point"]:checked').map((input) => input.value);
    const saved = JSON.parse(localStorage.getItem('asetaDraftLeads') || '[]');
    saved.push({ ...state.lead, profile: state.profile, painPoints: state.painPoints, enterpriseFeatures: state.features, readinessScore: calculateScore(), estimate: state.estimate, savedAt: new Date().toISOString() });
    localStorage.setItem('asetaDraftLeads', JSON.stringify(saved));
    dialog.close();
    renderResults();
  });
  $('#download-result').addEventListener('click', () => {
    const text = ['Ringkasan Simulasi Aseta (Draft)', `Readiness score: ${state.score}`, `Rekomendasi: ${$('#recommendation-plan').textContent}`, `Rentang aset: ${assetRanges[state.profile.assetRange]?.label || '—'}`, `Fitur Enterprise: ${state.features.map((id) => enterpriseFeatureLabels[id]).join(', ') || 'Tidak ada'}`, `Estimasi biaya: ${$('#investment-output').textContent}`, `Potensi biaya terhindarkan: ${$('#saving-result').textContent}`].join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'aseta-ringkasan-draft.txt'; link.click(); URL.revokeObjectURL(link.href);
  });
  $('#whatsapp-result').addEventListener('click', () => {
    const message = `Halo tim Aseta, saya sudah mengisi simulasi. Readiness score: ${state.score}. Rekomendasi: ${$('#recommendation-plan').textContent}. Rentang aset: ${assetRanges[state.profile.assetRange]?.label || '—'}. Fitur: ${state.features.map((id) => enterpriseFeatureLabels[id]).join(', ') || 'belum dipilih'}.`;
    window.open(`https://wa.me/6281217984959?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  });
  syncHardwareOptions(); updateEstimate(); updateProfileSummary();
})();
