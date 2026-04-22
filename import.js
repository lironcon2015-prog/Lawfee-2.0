/**
 * import.js — LexLedger Data Import
 *
 * 1. Excel import  — reads the user's historical spreadsheet,
 *    builds Clients → Cases → Invoices → Payments → Balances
 *    using the known column layout.
 *
 * 2. PDF extraction — uses PDF.js to pull text, then runs
 *    regex patterns to detect case number, date, amount.
 *    Shows a confirm modal before saving.
 */

const Importer = (() => {

  // ── Hebrew month map ───────────────────────────────────
  const HE_MONTH = {
    'ינו': 1, 'ינואר': 1,
    'פבר': 2, 'פברואר': 2,
    'מרץ': 3,
    'אפר': 4, 'אפריל': 4,
    'מאי': 5,
    'יונ': 6, 'יוני': 6,
    'יול': 7, 'יולי': 7,
    'אוג': 8, 'אוגוסט': 8,
    'ספט': 9, 'ספטמבר': 9,
    'אוק': 10, 'אוקטובר': 10,
    'נוב': 11, 'נובמבר': 11,
    'דצמ': 12, 'דצמבר': 12,
  };

  // Column headers that mark monthly income columns (short form like "ינו-25")
  const MONTH_COL_RE = /^([א-ת]{2,5})['\-–](\d{2})$/;

  // ────────────────────────────────────────────────────────
  // EXCEL IMPORT
  // ────────────────────────────────────────────────────────

  let _pendingImportData = null; // holds parsed data awaiting confirmation

  function initExcelImport() {
    const dropzone  = document.getElementById('excel-dropzone');
    const fileInput = document.getElementById('input-excel-file');
    const btnConfirm = document.getElementById('btn-import-confirm');
    const btnCancel  = document.getElementById('btn-import-cancel');

    if (!dropzone) return;

    // Drag events
    ['dragenter','dragover'].forEach(ev =>
      dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('drag-over'); }));
    ['dragleave','drop'].forEach(ev =>
      dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('drag-over'); }));

    dropzone.addEventListener('drop', e => {
      const file = e.dataTransfer.files[0];
      if (file) handleExcelFile(file);
    });

    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleExcelFile(fileInput.files[0]);
    });

    btnConfirm && btnConfirm.addEventListener('click', confirmImport);
    btnCancel  && btnCancel.addEventListener('click',  cancelImport);
  }

  async function handleExcelFile(file) {
    try {
      UI.toast('קורא קובץ…', 'info', 2000);
      const data = await readExcelFile(file);
      _pendingImportData = data;
      renderImportPreview(data);
    } catch(err) {
      console.error(err);
      UI.toast('שגיאה בקריאת הקובץ: ' + err.message, 'error');
    }
  }

  function readExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb    = XLSX.read(e.target.result, { type: 'array' });
          const rows  = parseWorkbook(wb);
          resolve(rows);
        } catch(err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('קריאת קובץ נכשלה'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Parse workbook: supports either one sheet with multiple year blocks,
   * or separate sheets per year (we iterate all sheets).
   *
   * Expected columns (RTL order in Excel, but SheetJS gives A→Z):
   *   שם לקוח | מספר תיק | סוג תיק | שיעור עמלה | ינו-YY | פבר-YY | ... | מצטבר | סוג הסדר
   *
   * Returns: { years: { 2025: [...rows], 2026: [...rows] }, payments, openingBalances }
   */
  function parseWorkbook(wb) {
    const result = { years: {}, payments: [], openingBalances: {} };

    wb.SheetNames.forEach(sheetName => {
      const ws   = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
      if (!json.length) return;

      parseSheet(json, result);
    });

    return result;
  }

  function parseSheet(rows, result) {
    // Find the header row — it must contain "שם לקוח" or "מספר תיק"
    let headerRowIdx = -1;
    let headerRow    = null;

    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const r = rows[i];
      if (!r) continue;
      const joined = r.map(c => (c || '').toString()).join('|');
      if (joined.includes('שם לקוח') || joined.includes('מספר תיק')) {
        headerRowIdx = i;
        headerRow    = r;
        break;
      }
    }

    if (headerRowIdx < 0 || !headerRow) return; // no recognisable header

    // Map column indices
    const colIdx = {};
    const monthCols = []; // { col, month, year }

    headerRow.forEach((cell, i) => {
      const val = (cell || '').toString().trim();
      if (val.includes('שם לקוח'))    colIdx.clientName   = i;
      if (val.includes('מספר תיק'))   colIdx.caseNumber    = i;
      if (val.includes('סוג תיק'))    colIdx.caseType      = i;
      if (val.includes('שיעור עמלה')) colIdx.commissionRate = i;
      if (val.includes('סוג הסדר'))   colIdx.arrangementType = i;

      const mMatch = val.match(MONTH_COL_RE);
      if (mMatch) {
        const heMonth = HE_MONTH[mMatch[1]];
        const yr      = parseInt('20' + mMatch[2], 10);
        if (heMonth && yr) monthCols.push({ col: i, month: heMonth, year: yr });
      }
    });

    if (colIdx.clientName === undefined || !monthCols.length) return;

    // Determine the year(s) from month columns
    const yearsInSheet = [...new Set(monthCols.map(m => m.year))];

    // Parse data rows
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const clientName = (row[colIdx.clientName] || '').toString().trim();
      const caseNumber = colIdx.caseNumber !== undefined
        ? (row[colIdx.caseNumber] || '').toString().trim() : '';
      const caseType   = colIdx.caseType !== undefined
        ? (row[colIdx.caseType] || '').toString().trim() : 'שוטף';
      const arrType    = colIdx.arrangementType !== undefined
        ? (row[colIdx.arrangementType] || '').toString().trim() : '';

      // Skip aggregate / summary rows
      if (!clientName || clientName.startsWith('סכום') || clientName.startsWith('עמלה')
          || clientName.startsWith('יתרת') || clientName.startsWith('תשלומים')) {

        // But extract balance/payment metadata from these rows
        _extractMetaRow(row, headerRow, clientName, result, yearsInSheet, monthCols);
        continue;
      }

      if (!caseNumber) continue;

      // Commission rate
      let commRate = 0;
      if (colIdx.commissionRate !== undefined) {
        const rVal = (row[colIdx.commissionRate] || '').toString().replace('%','').trim();
        commRate = parseFloat(rVal) || 0;
      }

      // Monthly amounts
      monthCols.forEach(mc => {
        const rawVal = row[mc.col];
        if (rawVal === null || rawVal === undefined || rawVal === '') return;
        const amount = parseCleanNumber(rawVal.toString());
        if (!amount || amount === 0) return;

        const yr = mc.year;
        if (!result.years[yr]) result.years[yr] = [];
        result.years[yr].push({
          clientName,
          caseNumber,
          caseType:        normalizeCaseType(caseType),
          commissionRate:  commRate,
          arrangementType: arrType,
          month:           mc.month,
          year:            yr,
          amount,
          commission:      +(amount * commRate / 100).toFixed(2),
        });
      });
    }
  }

  function _extractMetaRow(row, headerRow, label, result, yearsInSheet, monthCols) {
    // יתרת פתיחה
    if (label.includes('יתרת פתיחה')) {
      yearsInSheet.forEach(yr => {
        // look for a numeric value anywhere in the row
        row.forEach((cell, i) => {
          const n = parseCleanNumber((cell || '').toString());
          if (n && n > 0 && !result.openingBalances[yr]) {
            result.openingBalances[yr] = n;
          }
        });
      });
    }

    // תשלומים — detect "month: amount" pattern in the row or description
    if (label.includes('תשלומים')) {
      // Scan row for numeric values associated with month columns
      monthCols.forEach(mc => {
        const rawVal = row[mc.col];
        if (!rawVal) return;
        const amount = parseCleanNumber(rawVal.toString());
        if (!amount || amount === 0) return;
        result.payments.push({ year: mc.year, month: mc.month, amount });
      });

      // Also check if label itself has "חודש: סכום" patterns (text-based)
      // e.g. "דצמבר: 5,257, ספטמבר: 12,936"
      const textContent = row.map(c => (c || '').toString()).join(' ');
      _parsePaymentsFromText(textContent, yearsInSheet, result);
    }
  }

  function _parsePaymentsFromText(text, years, result) {
    // Match patterns like "דצמבר: 5,257" or "דצמבר - 5,257"
    const re = new RegExp(`(${Object.keys(HE_MONTH).join('|')})[:\\s\\-–]+([\\d,\\.]+)`, 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      const month  = HE_MONTH[m[1]];
      const amount = parseCleanNumber(m[2]);
      if (!month || !amount) continue;
      // Assign to the most recent year in this sheet
      const yr = years[years.length - 1] || new Date().getFullYear();
      // Don't duplicate
      const exists = result.payments.find(p => p.year === yr && p.month === month && Math.abs(p.amount - amount) < 1);
      if (!exists) result.payments.push({ year: yr, month, amount });
    }
  }

  function normalizeCaseType(raw) {
    if (!raw) return 'שוטף';
    if (raw.includes('ליטיגציה') || raw.includes('תביעה')) return 'ליטיגציה';
    if (raw.includes('עסקה')) return 'עסקה';
    return 'שוטף';
  }

  function parseCleanNumber(str) {
    if (!str) return 0;
    const cleaned = str.replace(/[,\s₪]/g, '').replace(/[^\d.]/g, '');
    return parseFloat(cleaned) || 0;
  }

  // ── Render preview table ───────────────────────────────
  function renderImportPreview(data) {
    const preview = document.getElementById('excel-preview');
    const actions = document.getElementById('excel-confirm-actions');
    if (!preview) return;

    const years = Object.keys(data.years).sort();
    let html = '';

    years.forEach(yr => {
      const rows = data.years[yr];
      html += `<p class="preview-title">שנת ${yr} — ${rows.length} רשומות</p>`;
      html += `<div class="preview-scroll"><table class="preview-table">
        <thead><tr>
          <th>לקוח</th><th>מספר תיק</th><th>סוג</th>
          <th>% עמלה</th><th>חודש</th><th>סכום</th><th>עמלה</th>
        </tr></thead><tbody>`;

      rows.slice(0, 20).forEach(r => {
        html += `<tr>
          <td>${r.clientName}</td>
          <td style="font-family:var(--font-mono)">${r.caseNumber}</td>
          <td>${r.caseType}</td>
          <td style="font-family:var(--font-mono)">${r.commissionRate}%</td>
          <td>${UI.monthName(r.month, true)}</td>
          <td style="font-family:var(--font-mono)">${UI.formatNumber(r.amount)}</td>
          <td style="font-family:var(--font-mono);color:var(--gold-400)">${UI.formatNumber(r.commission)}</td>
        </tr>`;
      });

      if (rows.length > 20) {
        html += `<tr><td colspan="7" class="empty-state">… ועוד ${rows.length - 20} רשומות</td></tr>`;
      }
      html += '</tbody></table></div>';
    });

    if (data.payments.length) {
      html += `<p class="preview-title mt-md">תשלומים שהתקבלו — ${data.payments.length} רשומות</p>`;
    }
    if (Object.keys(data.openingBalances).length) {
      const bStr = Object.entries(data.openingBalances)
        .map(([y, v]) => `${y}: ${UI.formatCurrency(v)}`).join(' | ');
      html += `<p class="preview-title mt-sm">יתרות פתיחה: ${bStr}</p>`;
    }

    preview.innerHTML = html;
    preview.classList.remove('hidden');
    actions && actions.classList.remove('hidden');
  }

  // ── Commit import to DB ────────────────────────────────
  async function confirmImport() {
    if (!_pendingImportData) return;

    const btn = document.getElementById('btn-import-confirm');
    if (btn) { btn.disabled = true; btn.textContent = 'מייבא…'; }

    try {
      const data     = _pendingImportData;
      const clientMap = {}; // clientName → id
      const caseMap   = {}; // caseNumber → id

      // 1. Upsert clients
      const existingClients = await DB.clients.getAll();
      existingClients.forEach(c => { clientMap[c.name] = c.id; });

      const allRows = Object.values(data.years).flat();
      const uniqueClients = [...new Set(allRows.map(r => r.clientName))];

      for (const name of uniqueClients) {
        if (!clientMap[name]) {
          const id = await DB.clients.add(name);
          clientMap[name] = id;
        }
      }

      // 2. Upsert cases  (case number is the unique key)
      const existingCases = await DB.cases.getAll();
      existingCases.forEach(c => { caseMap[c.caseNumber] = c.id; });

      // Build unique case definitions (last row wins for rate/type)
      const casesDef = {};
      allRows.forEach(r => {
        casesDef[r.caseNumber] = {
          clientId:        clientMap[r.clientName],
          caseNumber:      r.caseNumber,
          description:     r.caseNumber,  // use number as description if no separate field
          caseType:        r.caseType,
          commissionRate:  r.commissionRate,
          arrangementType: r.arrangementType,
          openDate:        null,
        };
      });

      for (const [num, def] of Object.entries(casesDef)) {
        if (!caseMap[num]) {
          const id = await DB.cases.add(def);
          caseMap[num] = id;
        }
        // Note: we do NOT overwrite existing cases to preserve manual edits
      }

      // 3. Insert invoices (skip duplicates: same caseId + month + year + amount)
      const existingInvoices = await DB.invoices.getAll();
      const invSet = new Set(existingInvoices.map(i => `${i.caseId}-${i.month}-${i.year}-${i.amount}`));

      let invoiceCount = 0;
      for (const rows of Object.values(data.years)) {
        for (const r of rows) {
          const caseId = caseMap[r.caseNumber];
          if (!caseId) continue;
          const key = `${caseId}-${r.month}-${r.year}-${r.amount}`;
          if (invSet.has(key)) continue;
          await DB.invoices.add({
            caseId, month: r.month, year: r.year,
            amount: r.amount, commissionRate: r.commissionRate,
            commission: r.commission, source: 'import',
          });
          invSet.add(key);
          invoiceCount++;
        }
      }

      // 4. Insert payments
      let paymentCount = 0;
      const existingPayments = await DB.payments.getAll();
      const paySet = new Set(existingPayments.map(p => `${p.year}-${p.month}-${p.amount}`));

      for (const p of data.payments) {
        const key = `${p.year}-${p.month}-${p.amount}`;
        if (paySet.has(key)) continue;
        await DB.payments.add({ year: p.year, month: p.month, amount: p.amount, notes: 'ייבוא' });
        paySet.add(key);
        paymentCount++;
      }

      // 5. Opening balances
      for (const [yr, val] of Object.entries(data.openingBalances)) {
        await DB.balances.set(parseInt(yr), val);
      }

      UI.toast(
        `ייבוא הושלם! ${uniqueClients.length} לקוחות, ${Object.keys(casesDef).length} תיקים, ${invoiceCount} חשבוניות, ${paymentCount} תשלומים`,
        'success', 5000
      );

      _pendingImportData = null;
      document.getElementById('excel-preview').classList.add('hidden');
      document.getElementById('excel-confirm-actions').classList.add('hidden');

      // Refresh views
      if (window.App) App.refreshCurrentView();

    } catch(err) {
      console.error(err);
      UI.toast('שגיאה בייבוא: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✔ אשר ייבוא'; }
    }
  }

  function cancelImport() {
    _pendingImportData = null;
    const preview = document.getElementById('excel-preview');
    const actions = document.getElementById('excel-confirm-actions');
    if (preview) preview.classList.add('hidden');
    if (actions) actions.classList.add('hidden');
    document.getElementById('input-excel-file').value = '';
  }

  // ── Opening Balance Save ───────────────────────────────
  function initBalanceForm() {
    const btn = document.getElementById('btn-save-balance');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const yr  = parseInt(document.getElementById('balance-year').value, 10);
      const amt = parseFloat(document.getElementById('balance-amount').value);
      if (!yr || isNaN(amt)) {
        UI.toast('הזן שנה וסכום תקינים', 'warning');
        return;
      }
      await DB.balances.set(yr, amt);
      UI.toast(`יתרת פתיחה לשנת ${yr} נשמרה: ${UI.formatCurrency(amt)}`, 'success');
      if (window.App) App.refreshCurrentView();
    });
  }

  // ────────────────────────────────────────────────────────
  // PDF EXTRACTION
  // ────────────────────────────────────────────────────────

  function initPdfImport() {
    const dropzone  = document.getElementById('pdf-dropzone');
    const fileInput = document.getElementById('input-pdf-file');
    if (!dropzone) return;

    ['dragenter','dragover'].forEach(ev =>
      dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('drag-over'); }));
    ['dragleave','drop'].forEach(ev =>
      dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('drag-over'); }));

    dropzone.addEventListener('drop', e => {
      const file = e.dataTransfer.files[0];
      if (file && file.type === 'application/pdf') processPdf(file);
      else UI.toast('יש לגרור קובץ PDF בלבד', 'warning');
    });

    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) processPdf(fileInput.files[0]);
    });
  }

  async function processPdf(file) {
    UI.toast('מחלץ טקסט מ-PDF…', 'info', 3000);
    try {
      const text     = await extractPdfText(file);
      const extracted = parseInvoiceFromText(text);
      extracted._rawText = text;
      showPdfConfirmModal(extracted);
    } catch(err) {
      console.error(err);
      UI.toast('שגיאה בחילוץ PDF: ' + err.message, 'error');
    }
  }

  async function extractPdfText(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText      = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n';
    }
    return fullText;
  }

  /**
   * Regex patterns to extract from invoice PDF text.
   * These are heuristic — the user can override in the modal.
   */
  function parseInvoiceFromText(text) {
    const result = {
      caseNumber: null,
      month:      null,
      year:       null,
      amount:     null,
    };

    // Case number patterns: 30340\0, 6967/15, 5088-1
    const caseRe = /(\d{4,6}[\\\/\-]\d{1,3})/g;
    const caseMatches = [...text.matchAll(caseRe)];
    if (caseMatches.length) result.caseNumber = caseMatches[0][1].replace(/\//g, '\\');

    // Date: look for month/year combos
    // Hebrew months
    const heMonthNames = Object.keys(HE_MONTH).join('|');
    const dateRe1 = new RegExp(`(${heMonthNames})\\s+(20\\d{2})`, 'i');
    const dateRe2 = /(\d{1,2})[\/\.\-](\d{2,4})/;
    const dateRe3 = /(20\d{2})/;

    const m1 = text.match(dateRe1);
    if (m1) {
      result.month = HE_MONTH[m1[1]];
      result.year  = parseInt(m1[2], 10);
    } else {
      const m2 = text.match(dateRe2);
      if (m2) {
        result.month = parseInt(m2[1], 10);
        result.year  = m2[3] ? parseInt(m2[3], 10) : (parseInt(m2[2], 10) < 100 ? 2000 + parseInt(m2[2], 10) : parseInt(m2[2], 10));
      } else {
        const m3 = text.match(dateRe3);
        if (m3) result.year = parseInt(m3[1], 10);
      }
    }

    // Amount: largest number in the text that looks like an invoice total
    // Patterns: "סה"כ 23,137" or "לתשלום 8,225.00" or just the biggest ₪ number
    const amountRe = /(?:סה"כ|לתשלום|סכום|total)[:\s]*([0-9,]+(?:\.\d{1,2})?)/gi;
    const amountMatches = [...text.matchAll(amountRe)];
    if (amountMatches.length) {
      const best = amountMatches
        .map(m => parseCleanNumber(m[1]))
        .filter(n => n > 0)
        .sort((a, b) => b - a)[0];
      if (best) result.amount = best;
    }

    // Fallback: find all numbers > 100, take the largest-looking "total"
    if (!result.amount) {
      const numRe = /\b([0-9]{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{4,7}(?:\.\d{1,2})?)\b/g;
      const nums = [...text.matchAll(numRe)]
        .map(m => parseCleanNumber(m[1]))
        .filter(n => n >= 100)
        .sort((a, b) => b - a);
      if (nums.length) result.amount = nums[0];
    }

    return result;
  }

  function parseCleanNumber(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/,/g, '').replace(/[^\d.]/g, '')) || 0;
  }

  // ── PDF Confirm Modal ──────────────────────────────────
  async function showPdfConfirmModal(extracted) {
    const cases   = await DB.cases.getAll();
    const clients = await DB.clients.getAll();
    const clientMap = {};
    clients.forEach(c => { clientMap[c.id] = c.name; });

    // Try to match caseNumber
    let matchedCase = null;
    if (extracted.caseNumber) {
      matchedCase = cases.find(c =>
        c.caseNumber === extracted.caseNumber ||
        c.caseNumber.replace(/\\/g, '/') === extracted.caseNumber.replace(/\\/g, '/')
      );
    }

    const caseOptions = cases.map(c =>
      `<option value="${c.id}" data-rate="${c.commissionRate}" ${matchedCase && matchedCase.id === c.id ? 'selected' : ''}>
        ${c.caseNumber} — ${clientMap[c.clientId] || '?'}
      </option>`
    ).join('');

    const monthOptions = Array.from({length:12}, (_,i) =>
      `<option value="${i+1}" ${(i+1) === extracted.month ? 'selected' : ''}>${UI.monthName(i+1)}</option>`
    ).join('');

    const yearNow = new Date().getFullYear();
    const yearOptions = [yearNow-1, yearNow, yearNow+1].map(y =>
      `<option value="${y}" ${y === extracted.year ? 'selected' : ''}>${y}</option>`
    ).join('');

    const bodyHTML = `
      <div class="pdf-confirm-grid">
        <div class="extracted-field" style="grid-column:1/-1">
          <div class="extracted-label">מספר תיק מזוהה</div>
          <div class="extracted-value">${extracted.caseNumber || '—'}</div>
        </div>
        <div class="form-group">
          <label class="form-label">תיק</label>
          <select id="pdf-case-id" class="form-input" onchange="Importer._updateCommissionPreview()">
            <option value="">בחר תיק…</option>${caseOptions}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">חודש</label>
          <select id="pdf-month" class="form-input">${monthOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label">שנה</label>
          <select id="pdf-year" class="form-input">${yearOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label">סכום חשבונית (₪)</label>
          <input type="number" id="pdf-amount" class="form-input" value="${extracted.amount || ''}"
            step="0.01" min="0" oninput="Importer._updateCommissionPreview()" />
        </div>
        <div class="commission-preview">
          <span class="commission-label">עמלה מחושבת (<span id="pdf-rate-label">${matchedCase ? matchedCase.commissionRate : 0}%</span>)</span>
          <span class="commission-value" id="pdf-commission-preview">
            ${matchedCase && extracted.amount
              ? UI.formatCurrency(+(extracted.amount * matchedCase.commissionRate / 100).toFixed(2))
              : '—'}
          </span>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label class="form-label">הערות</label>
          <input type="text" id="pdf-notes" class="form-input" placeholder="הערה אופציונלית…" />
        </div>
      </div>`;

    const overlay = document.getElementById('pdf-modal-overlay');
    document.getElementById('pdf-modal-body').innerHTML = bodyHTML;
    overlay.classList.remove('hidden');

    document.getElementById('pdf-modal-close').onclick  = () => overlay.classList.add('hidden');
    document.getElementById('pdf-modal-cancel').onclick = () => overlay.classList.add('hidden');
    overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };

    document.getElementById('pdf-modal-save').onclick = async () => {
      await savePdfInvoice();
      overlay.classList.add('hidden');
    };
  }

  function _updateCommissionPreview() {
    const caseEl  = document.getElementById('pdf-case-id');
    const amtEl   = document.getElementById('pdf-amount');
    const rateLabel = document.getElementById('pdf-rate-label');
    const preview = document.getElementById('pdf-commission-preview');
    if (!caseEl || !amtEl || !preview) return;

    const rate   = parseFloat(caseEl.selectedOptions[0]?.dataset?.rate) || 0;
    const amount = parseFloat(amtEl.value) || 0;
    const comm   = +(amount * rate / 100).toFixed(2);

    if (rateLabel) rateLabel.textContent = rate + '%';
    preview.textContent = amount > 0 ? UI.formatCurrency(comm) : '—';
  }

  async function savePdfInvoice() {
    const caseId = parseInt(document.getElementById('pdf-case-id').value);
    const month  = parseInt(document.getElementById('pdf-month').value);
    const year   = parseInt(document.getElementById('pdf-year').value);
    const amount = parseFloat(document.getElementById('pdf-amount').value);
    const notes  = document.getElementById('pdf-notes').value.trim();

    if (!caseId) { UI.toast('יש לבחור תיק', 'warning'); return; }
    if (!month || !year) { UI.toast('יש לבחור חודש ושנה', 'warning'); return; }
    if (!amount || amount <= 0) { UI.toast('יש להזין סכום תקין', 'warning'); return; }

    const caseRec = await DB.cases.get(caseId);
    if (!caseRec) { UI.toast('תיק לא נמצא', 'error'); return; }

    await DB.invoices.add({
      caseId, month, year, amount,
      commissionRate: caseRec.commissionRate,
      notes, source: 'pdf',
    });

    UI.toast('חשבונית נשמרה בהצלחה!', 'success');
    if (window.App) App.refreshCurrentView();
  }

  // ── Init ───────────────────────────────────────────────
  function init() {
    initExcelImport();
    initPdfImport();
    initBalanceForm();
  }

  return {
    init,
    _updateCommissionPreview,
    _parsePaymentsFromText,
  };
})();

window.Importer = Importer;
