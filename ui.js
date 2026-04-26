/**
 * ui.js — LexLedger UI Helpers
 * Design system: Tailwind + midnight/neutral/gold palette.
 * RTL Hebrew. No frameworks.
 *
 * Public API:
 *   UI.init()
 *   UI.toast(msg, type, duration)
 *   UI.confirm(msg, onConfirm)
 *   UI.openModal({ title, bodyHTML, confirmLabel, onConfirm, wide })
 *   UI.closeModal()
 *   UI.populateYearSelect(selectId, selectedYear)
 *   UI.populateClientSelect(selectId, withAll)
 *   UI.emptyRow(colspan, msg)
 *   UI.monthName(n)            // 1–12 → Hebrew
 *   UI.formatNumber(n)         // 1,234
 *   UI.formatCurrency(n)       // ₪1,234.56
 *   UI.formatPct(n)            // 25%
 *   UI.sourceBadge(source)     // HTML badge
 */

const UI = (() => {

  // ─── Month names ────────────────────────────────────────
  const MONTHS = [
    '', 'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
    'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
  ];
  const MONTHS_SHORT = [
    '', 'ינו','פבר','מרץ','אפר','מאי','יוני',
    'יול','אוג','ספט','אוק','נוב','דצמ',
  ];

  // short=true → ינו, פבר … (3-4 chars); short=false (default) → ינואר, פברואר …
  function monthName(n, short = false) {
    return (short ? MONTHS_SHORT[n] : MONTHS[n]) || String(n);
  }

  // ─── Formatters ──────────────────────────────────────────
  function formatNumber(n) {
    if (n == null || isNaN(n)) return '—';
    return Math.round(n).toLocaleString('he-IL');
  }

  function formatCurrency(n) {
    if (n == null || isNaN(n)) return '—';
    return '₪\u202F' + n.toLocaleString('he-IL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatPct(n) {
    if (n == null || isNaN(n)) return '—';
    return n + '%';
  }

  // ─── Source Badge ────────────────────────────────────────
  const SOURCE_META = {
    pdf:    { label: 'PDF',    cls: 'bg-blue-50 text-blue-700 border-blue-100',    icon: 'picture_as_pdf' },
    manual: { label: 'ידני',  cls: 'bg-neutral-100 text-neutral-600 border-neutral-200', icon: 'edit_note' },
    import: { label: 'ייבוא', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100',  icon: 'upload_file' },
  };

  function sourceBadge(source) {
    const m = SOURCE_META[source] || SOURCE_META.manual;
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold border ${m.cls}">
      <span class="material-symbols-outlined" style="font-size:13px;font-variation-settings:'FILL' 1">${m.icon}</span>
      ${m.label}
    </span>`;
  }

  // ─── Empty Row ───────────────────────────────────────────
  function emptyRow(colspan, msg = 'אין נתונים להצגה') {
    return `<tr>
      <td colspan="${colspan}" class="py-16 text-center">
        <div class="flex flex-col items-center gap-3 text-neutral-400">
          <span class="material-symbols-outlined text-5xl text-neutral-300"
            style="font-variation-settings:'wght' 300">inbox</span>
          <span class="text-sm font-medium">${msg}</span>
        </div>
      </td>
    </tr>`;
  }

  // ─── Populate Year Select ────────────────────────────────
  async function populateYearSelect(selectId, selectedYear) {
    const el = document.getElementById(selectId);
    if (!el) return;

    let years = [];
    try { years = await DB.settings.getKnownYears(); } catch (_) {}

    const current = new Date().getFullYear();
    if (!years.includes(current))     years.unshift(current);
    if (!years.includes(current - 1)) years.push(current - 1);
    years = [...new Set(years)].sort((a, b) => b - a);

    el.innerHTML = years
      .map(y => `<option value="${y}" ${y == selectedYear ? 'selected' : ''}>${y}</option>`)
      .join('');
  }

  // ─── Populate Client Select ──────────────────────────────
  async function populateClientSelect(selectId, withAll = false) {
    const el = document.getElementById(selectId);
    if (!el) return;

    let clients = [];
    try { clients = await DB.clients.getAll(); } catch (_) {}

    const placeholder = withAll ? '<option value="">כל הלקוחות</option>' : '<option value="">בחר לקוח…</option>';
    el.innerHTML = placeholder + clients
      .map(c => `<option value="${c.id}">${_esc(c.name)}</option>`)
      .join('');
  }

  // ─── Toast ───────────────────────────────────────────────
  const TOAST_ICONS = {
    success: { icon: 'check_circle',      cls: 'bg-emerald-50 border-emerald-200 text-emerald-800', iconCls: 'text-emerald-500' },
    error:   { icon: 'error',             cls: 'bg-red-50 border-red-200 text-red-800',             iconCls: 'text-red-500'     },
    info:    { icon: 'info',              cls: 'bg-blue-50 border-blue-200 text-blue-800',          iconCls: 'text-blue-500'    },
    warning: { icon: 'warning',           cls: 'bg-amber-50 border-amber-200 text-amber-800',       iconCls: 'text-amber-500'   },
  };

  function toast(msg, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const meta = TOAST_ICONS[type] || TOAST_ICONS.info;
    const id   = 'toast-' + Date.now();

    const el = document.createElement('div');
    el.id = id;
    el.className = `
      flex items-start gap-3 px-5 py-4 rounded-2xl border shadow-lg
      text-sm font-medium max-w-sm w-full
      translate-y-2 opacity-0 transition-all duration-300
      ${meta.cls}
    `.replace(/\s+/g, ' ').trim();

    el.innerHTML = `
      <span class="material-symbols-outlined text-xl flex-shrink-0 mt-0.5 ${meta.iconCls}"
        style="font-variation-settings:'FILL' 1">${meta.icon}</span>
      <span class="flex-1 leading-snug">${msg}</span>
      <button onclick="document.getElementById('${id}')?.remove()"
        class="text-neutral-400 hover:text-neutral-600 transition-colors flex-shrink-0 mt-0.5">
        <span class="material-symbols-outlined text-lg">close</span>
      </button>
    `;

    container.appendChild(el);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.remove('translate-y-2', 'opacity-0');
        el.classList.add('translate-y-0', 'opacity-100');
      });
    });

    // Auto-dismiss
    setTimeout(() => {
      el.classList.add('opacity-0', 'translate-y-1');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    }, duration);
  }

  // ─── Modal ───────────────────────────────────────────────
  let _onConfirmFn = null;

  /**
   * openModal({ title, bodyHTML, confirmLabel, onConfirm, wide })
   *   wide: bool — use max-w-2xl instead of max-w-md
   */
  function openModal({ title, bodyHTML = '', confirmLabel = 'שמור', onConfirm = null, wide = false } = {}) {
    const overlay = document.getElementById('modal-overlay');
    const modal   = document.getElementById('modal');
    const titleEl = document.getElementById('modal-title');
    const bodyEl  = document.getElementById('modal-body');
    const confirmBtn = document.getElementById('modal-confirm');

    if (!overlay || !modal) return;

    // Inject content
    titleEl.textContent = title || '';
    bodyEl.innerHTML    = bodyHTML;
    confirmBtn.textContent = confirmLabel;
    confirmBtn.disabled    = false;

    // Reset confirm button to default (midnight) style — in case a previous
    // UI.confirm() call styled it red (destructive). Always start fresh.
    confirmBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
    confirmBtn.classList.add('bg-midnight-600', 'hover:bg-midnight-700');

    // Wide variant
    modal.classList.toggle('max-w-2xl', !!wide);
    modal.classList.toggle('max-w-md',  !wide);

    // Store callback
    _onConfirmFn = onConfirm;

    // Show
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        modal.classList.remove('scale-95', 'opacity-0');
        modal.classList.add('scale-100', 'opacity-100');
      });
    });

    // Focus first input after a beat
    setTimeout(() => {
      const first = modal.querySelector('input:not([type=hidden]),select,textarea');
      first?.focus();
    }, 120);
  }

  function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    const modal   = document.getElementById('modal');
    if (!overlay) return;

    modal?.classList.add('scale-95', 'opacity-0');
    modal?.classList.remove('scale-100', 'opacity-100');

    setTimeout(() => {
      overlay.classList.add('hidden');
      _onConfirmFn = null;
    }, 200);
  }

  // ─── Confirm dialog (reuses generic modal) ───────────────
  function confirm(msg, onConfirm) {
    openModal({
      title: 'אישור פעולה',
      bodyHTML: `
        <div class="flex items-start gap-4 py-2">
          <div class="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-2xl text-amber-500"
              style="font-variation-settings:'FILL' 1">warning</span>
          </div>
          <p class="text-neutral-700 font-medium leading-relaxed text-base pt-2">${msg}</p>
        </div>`,
      confirmLabel: 'אשר',
      onConfirm,
    });

    // Style confirm button as destructive (openModal resets it to midnight on next open)
    const btn = document.getElementById('modal-confirm');
    if (btn) {
      btn.classList.remove('bg-midnight-600', 'hover:bg-midnight-700');
      btn.classList.add('bg-red-600', 'hover:bg-red-700');
    }
  }

  // ─── Wire modal buttons ───────────────────────────────────
  function _wireModal() {
    // Close
    document.getElementById('modal-close')?.addEventListener('click', closeModal);
    document.getElementById('modal-cancel')?.addEventListener('click', closeModal);

    // Click outside
    document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    // Confirm
    document.getElementById('modal-confirm')?.addEventListener('click', async () => {
      if (!_onConfirmFn) { closeModal(); return; }
      const btn = document.getElementById('modal-confirm');
      try {
        btn.disabled    = true;
        btn.textContent = '⏳ שומר…';
        await _onConfirmFn();
      } catch (err) {
        toast(err.message || 'שגיאה בשמירה', 'error');
      } finally {
        if (btn) {
          btn.disabled    = false;
          btn.textContent = btn.dataset.label || 'שמור';
        }
      }
    });

    // Keep original confirm label for error recovery
    const confirmBtn = document.getElementById('modal-confirm');
    if (confirmBtn) {
      const obs = new MutationObserver(() => {
        if (confirmBtn.textContent && confirmBtn.textContent !== '⏳ שומר…') {
          confirmBtn.dataset.label = confirmBtn.textContent;
        }
      });
      obs.observe(confirmBtn, { childList: true, characterData: true, subtree: true });
    }

    // PDF modal close
    document.getElementById('pdf-modal-close')?.addEventListener('click', _closePdfModal);
    document.getElementById('pdf-modal-cancel')?.addEventListener('click', _closePdfModal);
    document.getElementById('pdf-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) _closePdfModal();
    });

    // Keyboard: Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const pdfVisible = !document.getElementById('pdf-modal-overlay')?.classList.contains('hidden');
        if (pdfVisible) { _closePdfModal(); return; }
        const modalVisible = !document.getElementById('modal-overlay')?.classList.contains('hidden');
        if (modalVisible) closeModal();
      }
    });
  }

  function _closePdfModal() {
    const overlay = document.getElementById('pdf-modal-overlay');
    const modal   = document.getElementById('pdf-modal');
    if (!overlay) return;
    modal?.classList.add('scale-95', 'opacity-0');
    modal?.classList.remove('scale-100', 'opacity-100');
    setTimeout(() => overlay.classList.add('hidden'), 200);
  }

  // ─── Shared HTML snippet: form row ───────────────────────
  /**
   * Build a labelled form field HTML string.
   * type: 'text' | 'number' | 'select' | 'textarea'
   * opts.options: [{ value, label }] for select
   * opts.hint: small helper text
   */
  function formField({ id, label, type = 'text', value = '', required = false, opts = {} }) {
    const baseInput = `
      block w-full rounded-xl border border-neutral-200 bg-neutral-50
      px-4 py-2.5 text-sm font-medium text-neutral-900
      placeholder-neutral-400
      focus:border-midnight-500 focus:outline-none focus:ring-2 focus:ring-midnight-500/20
      transition-colors hover:border-neutral-300 hover:bg-white
    `.replace(/\s+/g, ' ').trim();

    let input;
    if (type === 'select') {
      const options = (opts.options || [])
        .map(o => `<option value="${_esc(o.value)}" ${o.value == value ? 'selected' : ''}>${_esc(o.label)}</option>`)
        .join('');
      input = `<select id="${id}" class="${baseInput} cursor-pointer">${options}</select>`;
    } else if (type === 'textarea') {
      input = `<textarea id="${id}" class="${baseInput} resize-none" rows="3">${_esc(value)}</textarea>`;
    } else {
      const extra = type === 'number'
        ? `step="${opts.step || 'any'}" min="${opts.min ?? ''}" max="${opts.max ?? ''}"`
        : '';
      input = `<input type="${type}" id="${id}" class="${baseInput}" value="${_esc(value)}"
        placeholder="${_esc(opts.placeholder || '')}" ${extra} />`;
    }

    const hint = opts.hint
      ? `<p class="mt-1.5 text-xs text-neutral-400 leading-relaxed">${opts.hint}</p>`
      : '';

    return `
      <div class="form-group flex flex-col gap-1.5">
        <label for="${id}" class="text-xs font-bold text-neutral-500 uppercase tracking-wider">
          ${label}${required ? ' <span class="text-red-400">*</span>' : ''}
        </label>
        ${input}
        ${hint}
      </div>`;
  }

  // ─── Table helpers ────────────────────────────────────────

  /** Standard <td> for monetary values */
  function tdNum(val, { positive = false, gold = false, negative = false } = {}) {
    let cls = 'px-7 py-4 text-left font-mono text-sm font-semibold tabular-nums';
    if (positive)  cls += ' text-emerald-600';
    else if (gold) cls += ' text-amber-700';
    else if (negative) cls += ' text-red-500';
    else           cls += ' text-neutral-800';
    return `<td class="${cls}">${val}</td>`;
  }

  /** Standard <td> for regular text */
  function tdText(val, cls = '') {
    return `<td class="px-7 py-4 text-sm font-medium text-neutral-700 ${cls}">${val}</td>`;
  }

  /** Summary/total row */
  function summaryRow(cells) {
    const tds = cells.map((c, i) => {
      const num = typeof c === 'object' && c.num;
      const v   = typeof c === 'object' ? c.v : c;
      return num
        ? `<td class="px-7 py-4 text-left font-mono text-sm font-black text-neutral-900 tabular-nums">${v}</td>`
        : `<td class="px-7 py-4 text-sm font-black text-neutral-900">${v}</td>`;
    }).join('');
    return `<tr class="bg-neutral-50 border-t-2 border-neutral-200">${tds}</tr>`;
  }

  // ─── Escape HTML ──────────────────────────────────────────
  function _esc(str) {
    return (str ?? '').toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── Init ─────────────────────────────────────────────────
  function init() {
    _wireModal();
  }

  // ─── Public ───────────────────────────────────────────────
  return {
    init,
    // Formatters
    monthName,
    formatNumber,
    formatCurrency,
    formatPct,
    // Badges & rows
    sourceBadge,
    emptyRow,
    tdNum,
    tdText,
    summaryRow,
    formField,
    // Selects
    populateYearSelect,
    populateClientSelect,
    // Toast & modals
    toast,
    confirm,
    openModal,
    closeModal,
    // HTML escaping (shared — avoids duplicate escHtml in every module)
    esc: _esc,
  };

})();

window.UI = UI;
