/**
 * invoices.js — LexLedger Invoices View
 * Displays invoice history with filters; manual add modal;
 * PDF dropzone is in the HTML (wired in import.js).
 */

const Invoices = (() => {

  let _filterYear   = new Date().getFullYear();
  let _filterClient = '';

  // ── Init ───────────────────────────────────────────────
  async function init() {
    await UI.populateYearSelect('invoice-filter-year', _filterYear);
    await UI.populateClientSelect('invoice-filter-client', true);

    document.getElementById('invoice-filter-year').addEventListener('change', async (e) => {
      _filterYear = parseInt(e.target.value, 10);
      await render();
    });

    document.getElementById('invoice-filter-client').addEventListener('change', async (e) => {
      _filterClient = e.target.value;
      await render();
    });

    document.getElementById('btn-add-invoice').addEventListener('click', () => openInvoiceModal());

    await render();
  }

  // ── Render table ───────────────────────────────────────
  async function render() {
    const tbody = document.getElementById('invoices-tbody');
    if (!tbody) return;

    const [invoices, allCases, allClients] = await Promise.all([
      DB.invoices.getByYear(_filterYear),
      DB.cases.getAll(),
      DB.clients.getAll(),
    ]);

    const clientMap = {};
    allClients.forEach(c => { clientMap[c.id] = c.name; });
    const caseMap   = {};
    allCases.forEach(c => { caseMap[c.id] = c; });

    let filtered = invoices;
    if (_filterClient) {
      const caseIds = allCases
        .filter(c => c.clientId == _filterClient)
        .map(c => c.id);
      filtered = invoices.filter(i => caseIds.includes(i.caseId));
    }

    // Sort: year desc, month desc
    filtered.sort((a, b) => b.year - a.year || b.month - a.month);

    if (!filtered.length) {
      tbody.innerHTML = UI.emptyRow(9, 'אין חשבוניות להצגה');
      return;
    }

    let rows = '';
    let totalAmt = 0, totalComm = 0;

    filtered.forEach(inv => {
      const c       = caseMap[inv.caseId];
      const client  = c ? clientMap[c.clientId] : '—';
      totalAmt  += inv.amount;
      totalComm += inv.commission;

      rows += `<tr>
        <td>${escHtml(client)}</td>
        <td style="font-family:var(--font-mono);font-size:0.82rem;color:var(--text-muted)">${c ? escHtml(c.caseNumber) : '—'}</td>
        <td>${UI.monthName(inv.month)}</td>
        <td style="font-family:var(--font-mono)">${inv.year}</td>
        <td class="num">${UI.formatNumber(inv.amount)}</td>
        <td class="num" style="color:var(--text-secondary)">${UI.formatPct(inv.commissionRate)}</td>
        <td class="num text-gold">${UI.formatNumber(inv.commission)}</td>
        <td>${UI.sourceBadge(inv.source)}</td>
        <td>
          <button class="btn-icon" onclick="Invoices.openInvoiceModal(${inv.id})" title="ערוך">✎</button>
          <button class="btn-icon" style="color:var(--color-negative)" onclick="Invoices.deleteInvoice(${inv.id})" title="מחק">✕</button>
        </td>
      </tr>`;
    });

    rows += `<tr class="summary-row">
      <td colspan="4">סה"כ (${filtered.length} חשבוניות)</td>
      <td class="num">${UI.formatNumber(totalAmt)}</td>
      <td></td>
      <td class="num">${UI.formatNumber(totalComm)}</td>
      <td colspan="2"></td>
    </tr>`;

    tbody.innerHTML = rows;
  }

  // ── Invoice Modal (add / edit) ─────────────────────────
  async function openInvoiceModal(invoiceId = null) {
    let inv     = null;
    let caseRec = null;
    if (invoiceId) {
      inv     = await DB.invoices.get(invoiceId);
      caseRec = inv ? await DB.cases.get(inv.caseId) : null;
    }

    const clients = await DB.clients.getAll();
    const allCases = await DB.cases.getAll();

    const clientOptions = [
      { value: '', label: 'בחר לקוח…' },
      ...clients.map(c => ({ value: c.id, label: c.name })),
    ];

    // Build client + case selects in the form
    // We'll do a custom bodyHTML here for the cascading select
    const bodyHTML = `
      <div class="form-group">
        <label class="form-label" for="f-inv-client">לקוח *</label>
        <select id="f-inv-client" class="form-input">
          ${clientOptions.map(o => `<option value="${o.value}" ${inv && caseRec && caseRec.clientId == o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-inv-case">תיק *</label>
        <select id="f-inv-case" class="form-input" onchange="Invoices._onCaseChange()">
          <option value="">בחר תיק…</option>
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label" for="f-inv-month">חודש *</label>
          <select id="f-inv-month" class="form-input">
            ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${inv && inv.month==i+1?'selected':''}>${UI.monthName(i+1)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="f-inv-year">שנה *</label>
          <input type="number" id="f-inv-year" class="form-input" value="${inv ? inv.year : new Date().getFullYear()}" min="2000" max="2100" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-inv-amount">סכום חשבונית (₪) *</label>
        <input type="number" id="f-inv-amount" class="form-input" value="${inv ? inv.amount : ''}" step="0.01" min="0" oninput="Invoices._onAmountChange()" />
      </div>
      <div class="form-group">
        <label class="form-label" for="f-inv-rate">שיעור עמלה (%)</label>
        <input type="number" id="f-inv-rate" class="form-input" value="${inv ? inv.commissionRate : ''}" step="0.5" min="0" max="100" oninput="Invoices._onAmountChange()" />
        <small style="color:var(--text-muted);font-size:0.75rem;margin-top:4px">ממולא אוטומטית מהתיק; ניתן לשינוי ידני</small>
      </div>
      <div class="commission-preview">
        <span class="commission-label">עמלה מחושבת</span>
        <span class="commission-value" id="f-inv-commission-preview">—</span>
      </div>
      <div class="form-group mt-sm">
        <label class="form-label" for="f-inv-notes">הערות</label>
        <input type="text" id="f-inv-notes" class="form-input" value="${inv ? escHtml(inv.notes) : ''}" />
      </div>`;

    UI.openModal({
      title:        invoiceId ? 'עריכת חשבונית' : 'חשבונית חדשה',
      bodyHTML,
      confirmLabel: invoiceId ? 'שמור שינויים' : 'שמור חשבונית',
      onConfirm: async () => {
        const caseId = parseInt(document.getElementById('f-inv-case').value);
        const month  = parseInt(document.getElementById('f-inv-month').value);
        const year   = parseInt(document.getElementById('f-inv-year').value);
        const amount = parseFloat(document.getElementById('f-inv-amount').value);
        const rate   = parseFloat(document.getElementById('f-inv-rate').value);
        const notes  = document.getElementById('f-inv-notes').value.trim();

        if (!caseId)       throw new Error('יש לבחור תיק');
        if (!month||!year) throw new Error('יש לבחור חודש ושנה');
        if (!amount||amount<=0) throw new Error('יש להזין סכום תקין');
        if (isNaN(rate))   throw new Error('יש להזין שיעור עמלה');

        if (invoiceId) {
          const commission = +(amount * rate / 100).toFixed(2);
          await DB.invoices.update({ ...inv, caseId, month, year, amount, commissionRate: rate, commission, notes });
          UI.toast('חשבונית עודכנה', 'success');
        } else {
          // Duplicate check
          const existing = await DB.invoices.getByCase(caseId);
          const dup = existing.find(i => i.month === month && i.year === year && Math.abs(i.amount - amount) < 0.01);
          if (dup) {
            throw new Error(`חשבונית זהה כבר קיימת לחודש זה (${UI.formatCurrency(dup.amount)}). לשמירה בכל זאת, שנה את הסכום או בטל.`);
          }
          await DB.invoices.add({ caseId, month, year, amount, commissionRate: rate, notes, source: 'manual' });
          UI.toast('חשבונית נשמרה', 'success');
        }
        UI.closeModal();
        await render();
      },
    });

    // After modal renders, populate cascade
    setTimeout(async () => {
      const clientSel = document.getElementById('f-inv-client');
      if (!clientSel) return;

      // Populate cases for initial client
      const populate = async (clientId) => {
        const caseList = clientId
          ? allCases.filter(c => c.clientId == clientId)
          : allCases;
        const sel = document.getElementById('f-inv-case');
        if (!sel) return;
        sel.innerHTML = '<option value="">בחר תיק…</option>' +
          caseList.map(c => `<option value="${c.id}" data-rate="${c.commissionRate}" ${inv && inv.caseId==c.id?'selected':''}>${c.caseNumber} — ${c.description}</option>`).join('');
        _onAmountChange();
      };

      await populate(clientSel.value);
      clientSel.addEventListener('change', (e) => populate(e.target.value));
    }, 80);
  }

  function _onCaseChange() {
    const caseEl = document.getElementById('f-inv-case');
    const rateEl = document.getElementById('f-inv-rate');
    if (!caseEl || !rateEl) return;
    const rate = parseFloat(caseEl.selectedOptions[0]?.dataset?.rate);
    if (!isNaN(rate)) rateEl.value = rate;
    _onAmountChange();
  }

  function _onAmountChange() {
    const amount = parseFloat(document.getElementById('f-inv-amount')?.value) || 0;
    const rate   = parseFloat(document.getElementById('f-inv-rate')?.value)   || 0;
    const prev   = document.getElementById('f-inv-commission-preview');
    if (prev) prev.textContent = amount > 0 ? UI.formatCurrency(+(amount*rate/100).toFixed(2)) : '—';
  }

  // ── Delete Invoice ─────────────────────────────────────
  function deleteInvoice(invoiceId) {
    UI.confirm('האם למחוק חשבונית זו?', async () => {
      await DB.invoices.delete(invoiceId);
      UI.toast('חשבונית נמחקה', 'info');
      UI.closeModal();
      await render();
    });
  }

  function escHtml(str) { return UI.esc(str); }

  return { init, render, openInvoiceModal, deleteInvoice, _onCaseChange, _onAmountChange };
})();

window.Invoices = Invoices;
