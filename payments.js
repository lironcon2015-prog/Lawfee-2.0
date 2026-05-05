/**
 * payments.js — LexLedger Payments View
 * Records payments received; filters by year.
 */

const Payments = (() => {

  let _filterYear = new Date().getFullYear();

  // ── Init ───────────────────────────────────────────────
  async function init() {
    await UI.populateYearSelect('payments-filter-year', _filterYear);

    document.getElementById('payments-filter-year').addEventListener('change', async (e) => {
      _filterYear = parseInt(e.target.value, 10);
      await render();
    });

    document.getElementById('btn-add-payment').addEventListener('click', () => openPaymentModal());
    await render();
  }

  // ── Render ─────────────────────────────────────────────
  async function render() {
    const tbody = document.getElementById('payments-tbody');
    if (!tbody) return;

    const payments = await DB.payments.getByYear(_filterYear);
    payments.sort((a, b) => (b.month || 0) - (a.month || 0));

    if (!payments.length) {
      tbody.innerHTML = UI.emptyRow(5, 'אין תשלומים רשומים לשנה זו');
      return;
    }

    let total = 0;
    let rows  = '';

    payments.forEach(p => {
      total += p.amount;
      rows += `<tr onmouseover="this.querySelectorAll('td').forEach(td=>td.style.background='#F9FAFB')" onmouseout="this.querySelectorAll('td').forEach(td=>td.style.background='')">
        <td style="color:#374151;">${p.month ? UI.monthName(p.month) : '—'}</td>
        <td style="font-family:'Inter',sans-serif;font-size:0.8rem;color:#9CA3AF;">${p.year}</td>
        <td class="num" style="color:#047857;font-weight:600;">${UI.formatNumber(p.amount)}</td>
        <td style="font-size:0.82rem;color:#9CA3AF;">${p.notes || '—'}</td>
        <td style="text-align:left;">
          <button style="color:#9CA3AF;background:none;border:none;cursor:pointer;padding:4px;border-radius:6px;transition:all 0.15s;" onmouseover="this.style.color='#1D4ED8';this.style.background='rgba(29,78,216,0.06)'" onmouseout="this.style.color='#9CA3AF';this.style.background='none'" onclick="Payments.openPaymentModal(${p.id})" title="ערוך"><span class="material-symbols-outlined" style="font-size:16px;">edit</span></button>
          <button style="color:#9CA3AF;background:none;border:none;cursor:pointer;padding:4px;border-radius:6px;transition:all 0.15s;" onmouseover="this.style.color='#be123c';this.style.background='rgba(190,18,60,0.06)'" onmouseout="this.style.color='#9CA3AF';this.style.background='none'" onclick="Payments.deletePayment(${p.id})" title="מחק"><span class="material-symbols-outlined" style="font-size:16px;">delete</span></button>
        </td>
      </tr>`;
    });

    rows += `<tr class="summary-row">
      <td colspan="2" style="font-size:0.8rem;">סה"כ תשלומים</td>
      <td class="num" style="color:#047857;">${UI.formatNumber(total)}</td>
      <td colspan="2"></td>
    </tr>`;

    tbody.innerHTML = rows;
  }

  // ── Payment Modal ──────────────────────────────────────
  async function openPaymentModal(paymentId = null) {
    let pay = null;
    if (paymentId) pay = await DB.payments.get(paymentId);

    const monthOptions = [
      '<option value="">— חודש לא ידוע —</option>',
      ...Array.from({length:12}, (_,i) =>
        `<option value="${i+1}" ${pay && pay.month==i+1?'selected':''}>${UI.monthName(i+1)}</option>`)
    ].join('');

    const bodyHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label class="form-label" for="f-pay-month">חודש</label>
          <select id="f-pay-month" class="form-input">${monthOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label" for="f-pay-year">שנה *</label>
          <input type="number" id="f-pay-year" class="form-input"
            value="${pay ? pay.year : _filterYear}" min="2000" max="2100" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-pay-amount">סכום שהתקבל (₪) *</label>
        <input type="number" id="f-pay-amount" class="form-input"
          value="${pay ? pay.amount : ''}" step="0.01" min="0" />
      </div>
      <div class="form-group">
        <label class="form-label" for="f-pay-notes">הערות</label>
        <input type="text" id="f-pay-notes" class="form-input"
          value="${pay ? (pay.notes || '') : ''}" placeholder="לדוגמה: העברה בנקאית" />
      </div>`;

    UI.openModal({
      title:        paymentId ? 'עריכת תשלום' : 'תשלום חדש',
      bodyHTML,
      confirmLabel: paymentId ? 'שמור שינויים' : 'שמור תשלום',
      onConfirm: async () => {
        const month  = parseInt(document.getElementById('f-pay-month').value) || null;
        const year   = parseInt(document.getElementById('f-pay-year').value);
        const amount = parseFloat(document.getElementById('f-pay-amount').value);
        const notes  = document.getElementById('f-pay-notes').value.trim();

        if (!year)           throw new Error('יש להזין שנה');
        if (!amount||amount<=0) throw new Error('יש להזין סכום תקין');

        if (paymentId) {
          await DB.payments.update({ ...pay, month, year, amount, notes });
          UI.toast('תשלום עודכן', 'success');
        } else {
          await DB.payments.add({ month, year, amount, notes });
          UI.toast('תשלום נרשם', 'success');
        }
        UI.closeModal();
        await render();
      },
    });

    setTimeout(() => document.getElementById('f-pay-amount')?.focus(), 60);
  }

  // ── Delete Payment ─────────────────────────────────────
  function deletePayment(paymentId) {
    UI.confirm('האם למחוק תשלום זה?', async () => {
      await DB.payments.delete(paymentId);
      UI.toast('תשלום נמחק', 'info');
      UI.closeModal();
      await render();
    });
  }

  return { init, render, openPaymentModal, deletePayment };
})();

window.Payments = Payments;
