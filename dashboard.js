/**
 * dashboard.js — LexLedger Dashboard View (redesigned)
 * Hero KPI, monthly bar chart, client donut, breakdown tables.
 */

const Dashboard = (() => {

  let _year = new Date().getFullYear();
  let _donutMetric = 'commission';

  // ── Init ───────────────────────────────────────────────
  async function init() {
    await UI.populateYearSelect('dashboard-year', _year);

    document.getElementById('dashboard-year').addEventListener('change', async (e) => {
      _year = parseInt(e.target.value, 10);
      await render();
    });

    document.getElementById('toggle-client-monthly-metric')?.addEventListener('click', async () => {
      _clientMonthlyMetric = _clientMonthlyMetric === 'commission' ? 'amount' : 'commission';
      await renderClientMonthlyTable();
    });

    document.getElementById('toggle-donut-metric')?.addEventListener('click', async () => {
      _donutMetric = _donutMetric === 'commission' ? 'amount' : 'commission';
      await renderClientDonut();
    });

    await render();
  }

  // ── Render ─────────────────────────────────────────────
  async function render() {
    await Promise.all([
      renderKPIs(),
      renderMonthlyChart(),
      renderClientDonut(),
      renderMonthlyTable(),
      renderClientBreakdown(),
      renderClientMonthlyTable(),
    ]);
  }

  // ── KPI Cards ──────────────────────────────────────────
  async function renderKPIs() {
    const [ledger, totalRevenue] = await Promise.all([
      DB.balances.computeLedger(_year),
      DB.invoices.totalAmountForYear(_year),
    ]);

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = UI.formatNumber(val);
    };

    set('kpi-opening',     ledger.openingBalance);
    set('kpi-revenue',     totalRevenue);
    set('kpi-commissions', ledger.totalCommissions);
    set('kpi-payments',    ledger.totalPayments);

    const balEl = document.getElementById('kpi-balance');
    if (balEl) balEl.textContent = UI.formatNumber(ledger.closingBalance);

    const meta = document.getElementById('hero-meta');
    if (meta) {
      const unpaid = ledger.totalCommissions - ledger.totalPayments;
      meta.textContent = `עמלות ${UI.formatNumber(ledger.totalCommissions)} − תשלומים ${UI.formatNumber(ledger.totalPayments)} = ${UI.formatNumber(unpaid)}`;
    }
  }

  // ── Monthly Bar Chart (HTML/Tailwind Based) ─────────────
  async function renderMonthlyChart() {
    const host = document.getElementById('monthly-chart');
    if (!host) return;

    const [invByMonth, payByMonth] = await Promise.all([
      DB.invoices.byMonthForYear(_year),
      DB.payments.byMonthForYear(_year),
    ]);

    const months = Array.from({length:12}, (_,i) => {
      const inv = invByMonth[i+1] || { amount: 0, commission: 0 };
      const pay = payByMonth[i+1] || 0;
      return { m: i+1, amount: inv.amount, commission: inv.commission, payment: pay };
    });

    const hasData = months.some(x => x.amount > 0 || x.commission > 0);
    if (!hasData) {
      host.innerHTML = `<div class="chart-empty absolute inset-0 flex items-center justify-center">אין נתונים לשנת ${_year}</div>`;
      return;
    }

    const maxVal = Math.max(...months.map(x => Math.max(x.amount, x.commission))) || 1;
    const niceMax = niceCeil(maxVal);

    // Grid lines (horizontal)
    const gridLines = `
      <div class="absolute inset-0 flex flex-col justify-between pb-8 pointer-events-none">
        <div class="w-full h-px bg-neutral-100 relative"><span class="absolute right-0 -translate-y-1/2 bg-white px-1 text-[10px] text-neutral-400 font-mono">${formatAxis(niceMax)}</span></div>
        <div class="w-full h-px bg-neutral-100 relative"><span class="absolute right-0 -translate-y-1/2 bg-white px-1 text-[10px] text-neutral-400 font-mono">${formatAxis(niceMax * 0.75)}</span></div>
        <div class="w-full h-px bg-neutral-100 relative"><span class="absolute right-0 -translate-y-1/2 bg-white px-1 text-[10px] text-neutral-400 font-mono">${formatAxis(niceMax * 0.5)}</span></div>
        <div class="w-full h-px bg-neutral-100 relative"><span class="absolute right-0 -translate-y-1/2 bg-white px-1 text-[10px] text-neutral-400 font-mono">${formatAxis(niceMax * 0.25)}</span></div>
        <div class="w-full h-px bg-neutral-200"></div>
      </div>
    `;

    // Render bars
    const currentMonth = _year === new Date().getFullYear() ? new Date().getMonth() + 1 : 12;
    
    const barsHTML = months.map(mo => {
      const isCurrent = _year === new Date().getFullYear() && mo.m === currentMonth;
      const isPastOrPresent = _year < new Date().getFullYear() || mo.m <= currentMonth;
      
      const revPct  = mo.amount > 0 ? Math.max(2, (mo.amount / niceMax) * 100) : 0;
      const commPct = mo.commission > 0 ? Math.max(2, (mo.commission / niceMax) * 100) : 0;

      const title = `חודש ${UI.monthName(mo.m)}&#10;הכנסות: ${UI.formatNumber(mo.amount)} ₪&#10;עמלות: ${UI.formatNumber(mo.commission)} ₪`;

      if (!isPastOrPresent && mo.amount === 0 && mo.commission === 0) {
        return `
          <div class="flex flex-col items-center justify-end h-full">
            <div class="w-full h-full pb-2"></div>
            <span class="text-sm font-medium text-neutral-400 mt-1" dir="rtl">${UI.monthName(mo.m, true)}</span>
          </div>`;
      }

      return `
        <div class="flex flex-col items-center justify-end h-full group cursor-pointer" title="${title}">
          <div class="flex items-end justify-center gap-[2px] w-full h-full pb-2">
            ${mo.amount > 0 ? `<div class="w-[35%] max-w-[14px] bg-[#4f46e5] rounded-t-sm transition-opacity group-hover:opacity-80" style="height: ${revPct}%"></div>` : '<div class="w-[35%] max-w-[14px]"></div>'}
            ${mo.commission > 0 ? `<div class="w-[35%] max-w-[14px] bg-[#10b981] rounded-t-sm transition-opacity group-hover:opacity-80" style="height: ${commPct}%"></div>` : '<div class="w-[35%] max-w-[14px]"></div>'}
          </div>
          <span class="text-sm ${isCurrent ? 'font-bold text-neutral-900' : 'font-medium text-neutral-500'} mt-1" dir="rtl">${UI.monthName(mo.m, true)}</span>
        </div>`;
    }).join('');

    host.innerHTML = `
      ${gridLines}
      <div dir="ltr" class="relative z-10 w-full h-[220px] grid grid-cols-12 gap-1 px-1">
        ${barsHTML}
      </div>
    `;
  }

  function niceCeil(v) {
    if (v <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / pow;
    let mult;
    if (n <= 1) mult = 1;
    else if (n <= 2) mult = 2;
    else if (n <= 2.5) mult = 2.5;
    else if (n <= 5) mult = 5;
    else mult = 10;
    return mult * pow;
  }

  function formatAxis(v) {
    if (v >= 1_000_000) return (v/1_000_000).toFixed(v>=10_000_000?0:1) + 'M';
    if (v >= 1_000)     return Math.round(v/1000) + 'K';
    return Math.round(v).toString();
  }

  // ── Client Donut ────────────────────────────────────────
  async function renderClientDonut() {
    const host = document.getElementById('client-donut');
    if (!host) return;

    const [allInvoices, allCases, allClients] = await Promise.all([
      DB.invoices.getByYear(_year),
      DB.cases.getAll(),
      DB.clients.getAll(),
    ]);

    if (!allInvoices.length) {
      host.innerHTML = `<div class="chart-empty w-full text-center py-8">אין נתונים לשנת ${_year}</div>`;
      return;
    }

    const clientMap = {};
    allClients.forEach(c => { clientMap[c.id] = c.name; });
    const caseMap = {};
    allCases.forEach(c => { caseMap[c.id] = c; });

    const metric = _donutMetric;
    const toggleBtn  = document.getElementById('toggle-donut-metric');
    const titleEl    = document.getElementById('donut-title');
    if (toggleBtn) toggleBtn.textContent = metric === 'commission' ? 'הצג הכנסות' : 'הצג עמלות';
    if (titleEl)   titleEl.textContent   = metric === 'commission' ? 'פילוח עמלות לפי לקוח' : 'פילוח הכנסות לפי לקוח';

    const byClient = {};
    allInvoices.forEach(inv => {
      const c = caseMap[inv.caseId];
      if (!c) return;
      byClient[c.clientId] = (byClient[c.clientId] || 0) + (metric === 'commission' ? inv.commission : inv.amount);
    });

    let rows = Object.entries(byClient)
      .map(([cid, v]) => ({ name: clientMap[parseInt(cid)] || '—', val: v }))
      .sort((a,b) => b.val - a.val)
      .filter(r => r.val > 0);

    const total = rows.reduce((s,r) => s + r.val, 0);

    if (total === 0) {
      host.innerHTML = `<div class="chart-empty w-full text-center py-8">אין ${metric === 'commission' ? 'עמלות' : 'הכנסות'} לשנת ${_year}</div>`;
      return;
    }

    if (rows.length > 5) {
      const top = rows.slice(0, 5);
      const rest = rows.slice(5);
      const othersVal = rest.reduce((s,r) => s + r.val, 0);
      rows = [...top, { name: `${rest.length} אחרים`, val: othersVal, isOthers: true }];
    }

    const palette = [
      '#4f46e5', // indigo-600
      '#10b981', // emerald-500
      '#f59e0b', // amber-500
      '#0ea5e9', // sky-500
      '#ec4899', // pink-500
      '#cbd5e1', // slate-300
    ];
    rows.forEach((r,i) => r.color = palette[i] || '#cbd5e1');

    const size = 160, strokeW = 20;
    const cx = size/2, cy = size/2;
    const r = (size - strokeW) / 2;
    const circ = 2 * Math.PI * r;

    let offset = 0;
    const segs = rows.map(row => {
      const frac = total > 0 ? (row.val / total) : 0;
      const len = frac * circ;
      const seg = `<circle
        cx="${cx}" cy="${cy}" r="${r}"
        fill="none" stroke="${row.color}" stroke-width="${strokeW}"
        stroke-dasharray="${len} ${circ - len}"
        stroke-dashoffset="${-offset}"
        transform="rotate(-90 ${cx} ${cy})" />`;
      offset += len;
      return seg;
    }).join('');

    const legend = rows.map(r => {
      const pct = total > 0 ? ((r.val/total) * 100).toFixed(1) : '0.0';
      return `
        <div class="flex items-center justify-between text-sm group cursor-default" title="${r.name} - ${UI.formatNumber(r.val)} ₪">
          <div class="flex items-center gap-3 truncate">
            <span class="w-3.5 h-3.5 rounded flex-shrink-0 shadow-sm" style="background:${r.color}"></span>
            <span class="truncate text-neutral-700 font-medium group-hover:text-neutral-900 transition-colors">${r.name}</span>
          </div>
          <span class="font-mono text-neutral-500 font-semibold mr-3">${pct}%</span>
        </div>`;
    }).join('');

    host.innerHTML = `
      <div class="w-[160px] h-[160px] rounded-full flex items-center justify-center flex-shrink-0 relative shadow-sm bg-white">
        <svg class="w-full h-full absolute inset-0" viewBox="0 0 ${size} ${size}">
          ${segs}
        </svg>
        <div class="text-center mt-1 z-10">
          <div class="text-[11px] text-neutral-400 font-bold uppercase tracking-wider">סה"כ</div>
          <div class="font-mono font-bold text-xl text-neutral-800">${formatAxis(total)}</div>
        </div>
      </div>
      <div class="flex flex-col gap-4 flex-1 max-w-[200px] w-full sm:w-auto">
        ${legend}
      </div>`;
  }

  // ── Monthly Breakdown Table ────────────────────────────
  async function renderMonthlyTable() {
    const tbody = document.getElementById('monthly-tbody');
    if (!tbody) return;

    const [invByMonth, payByMonth, ledger] = await Promise.all([
      DB.invoices.byMonthForYear(_year),
      DB.payments.byMonthForYear(_year),
      DB.balances.computeLedger(_year),
    ]);

    let runningBalance = ledger.openingBalance;
    let totalAmt = 0, totalComm = 0, totalPay = 0;
    let rows = '';

    const now = new Date();
    const maxMonth = _year === now.getFullYear() ? now.getMonth() + 1 : 12;

    for (let m = 1; m <= maxMonth; m++) {
      const inv = invByMonth[m] || { amount: 0, commission: 0 };
      const pay = payByMonth[m]  || 0;
      runningBalance += inv.commission - pay;
      totalAmt  += inv.amount;
      totalComm += inv.commission;
      totalPay  += pay;

      const hasData = inv.amount > 0 || pay > 0;
      rows += `<tr class="${!hasData ? 'text-muted' : ''}">
        <td class="month-label">${UI.monthName(m)}</td>
        <td class="num">${inv.amount  > 0 ? UI.formatNumber(inv.amount)     : '—'}</td>
        <td class="num text-gold">${inv.commission > 0 ? UI.formatNumber(inv.commission) : '—'}</td>
        <td class="num positive">${pay > 0 ? UI.formatNumber(pay) : '—'}</td>
        <td class="num ${runningBalance >= 0 ? '' : 'negative'}">${UI.formatNumber(runningBalance)}</td>
      </tr>`;
    }

    const unknownPay = payByMonth[0] || 0;
    if (unknownPay > 0) {
      runningBalance -= unknownPay;
      totalPay += unknownPay;
      rows += `<tr class="text-muted">
        <td class="month-label" style="font-style:italic">ללא חודש</td>
        <td class="num">—</td>
        <td class="num">—</td>
        <td class="num positive">${UI.formatNumber(unknownPay)}</td>
        <td class="num ${runningBalance >= 0 ? '' : 'negative'}">${UI.formatNumber(runningBalance)}</td>
      </tr>`;
    }

    rows += `<tr class="summary-row">
      <td>סה"כ</td>
      <td class="num">${UI.formatNumber(totalAmt)}</td>
      <td class="num">${UI.formatNumber(totalComm)}</td>
      <td class="num">${UI.formatNumber(totalPay)}</td>
      <td class="num">${UI.formatNumber(ledger.closingBalance)}</td>
    </tr>`;

    tbody.innerHTML = rows;
  }

  function _statusBadge(caseType) {
    const map = {
      'שוטף':     { cls: 'bg-emerald-100 text-emerald-700', label: 'פעיל' },
      'ליטיגציה': { cls: 'bg-red-100 text-red-700',         label: 'ליטיגציה' },
      'עסקה':     { cls: 'bg-neutral-100 text-neutral-600', label: 'סגור' },
    };
    const s = map[caseType] || { cls: 'bg-neutral-100 text-neutral-500', label: caseType || '—' };
    return `<span class="px-3 py-1 rounded-full text-xs font-bold ${s.cls}">${s.label}</span>`;
  }

  // ── Per-Client Breakdown ────────────────────────────────
  async function renderClientBreakdown() {
    const tbody = document.getElementById('client-breakdown-tbody');
    if (!tbody) return;

    const [allInvoices, allCases, allClients] = await Promise.all([
      DB.invoices.getByYear(_year),
      DB.cases.getAll(),
      DB.clients.getAll(),
    ]);

    if (!allInvoices.length) {
      tbody.innerHTML = UI.emptyRow(6, 'אין נתוני חשבוניות לשנה זו');
      return;
    }

    const clientMap = {};
    allClients.forEach(c => { clientMap[c.id] = c.name; });
    const caseMap = {};
    allCases.forEach(c => { caseMap[c.id] = c; });

    const caseAgg = {};
    allInvoices.forEach(inv => {
      if (!caseAgg[inv.caseId]) caseAgg[inv.caseId] = { amount: 0, commission: 0 };
      caseAgg[inv.caseId].amount     += inv.amount;
      caseAgg[inv.caseId].commission += inv.commission;
    });

    const clientAgg = {};
    Object.entries(caseAgg).forEach(([caseId, agg]) => {
      const c = caseMap[parseInt(caseId)];
      if (!c) return;
      const cid = c.clientId;
      if (!clientAgg[cid]) clientAgg[cid] = { amount: 0, commission: 0, cases: [] };
      clientAgg[cid].amount     += agg.amount;
      clientAgg[cid].commission += agg.commission;
      clientAgg[cid].cases.push({ ...agg, caseRec: c });
    });

    const sortedClients = Object.entries(clientAgg)
      .sort((a, b) => b[1].commission - a[1].commission);

    let totalAmt = 0, totalComm = 0;
    let rows = '';
    sortedClients.forEach(([cid, data]) => {
      totalAmt  += data.amount;
      totalComm += data.commission;
      data.cases.sort((a, b) => b.commission - a.commission);

      rows += `<tr class="client-row hover:bg-neutral-50/50 transition-colors cursor-pointer" data-client-id="${cid}">
        <td class="font-semibold text-neutral-800">
          <span class="inline-flex items-center gap-2">
            <span class="material-symbols-outlined text-neutral-400 text-[18px] chevron transition-transform">chevron_left</span>
            ${clientMap[cid] || '—'}
          </span>
        </td>
        <td class="text-neutral-500">${data.cases.length} תיקים</td>
        <td class="num text-neutral-400">—</td>
        <td class="num">${UI.formatNumber(data.amount)}</td>
        <td class="num font-bold text-neutral-900">${UI.formatNumber(data.commission)}</td>
        <td class="text-center text-neutral-400">—</td>
      </tr>`;

      data.cases.forEach(r => {
        const c = r.caseRec;
        rows += `<tr class="case-row hover:bg-neutral-50/50 transition-colors" data-parent-client="${cid}" hidden>
          <td></td>
          <td>
            <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--text-muted)">${c.caseNumber}</span>
            ${c.description && c.description !== c.caseNumber ? ` <span class="text-neutral-500">${c.description}</span>` : ''}
          </td>
          <td class="num">${UI.formatPct(c.commissionRate)}</td>
          <td class="num">${UI.formatNumber(r.amount)}</td>
          <td class="num font-bold text-neutral-900">${UI.formatNumber(r.commission)}</td>
          <td class="text-center">${_statusBadge(c.caseType)}</td>
        </tr>`;
      });
    });

    rows += `<tr class="summary-row">
      <td colspan="3">סה"כ</td>
      <td class="num">${UI.formatNumber(totalAmt)}</td>
      <td class="num">${UI.formatNumber(totalComm)}</td>
      <td></td>
    </tr>`;

    tbody.innerHTML = rows;

    if (!tbody._expandWired) {
      tbody.addEventListener('click', (e) => {
        const row = e.target.closest('tr.client-row');
        if (!row) return;
        const cid = row.dataset.clientId;
        const chev = row.querySelector('.chevron');
        const isOpen = row.classList.toggle('expanded');
        if (chev) chev.style.transform = isOpen ? 'rotate(-90deg)' : '';
        tbody.querySelectorAll(`tr.case-row[data-parent-client="${cid}"]`).forEach(c => {
          c.hidden = !isOpen;
        });
      });
      tbody._expandWired = true;
    }
  }

  // ── Per-Client Monthly Breakdown ───────────────────────
  let _clientMonthlyMetric = 'commission';

  async function renderClientMonthlyTable() {
    const thead = document.getElementById('client-monthly-thead');
    const tbody = document.getElementById('client-monthly-tbody');
    const toggleMetricBtn = document.getElementById('toggle-client-monthly-metric');
    if (!thead || !tbody) return;

    if (toggleMetricBtn) toggleMetricBtn.textContent = _clientMonthlyMetric === 'commission' ? 'הצג הכנסות' : 'הצג עמלות';

    const [allInvoices, allCases, allClients] = await Promise.all([
      DB.invoices.getByYear(_year),
      DB.cases.getAll(),
      DB.clients.getAll(),
    ]);

    if (!allInvoices.length) {
      thead.innerHTML = '';
      tbody.innerHTML = UI.emptyRow(14, 'אין נתוני חשבוניות לשנה זו');
      return;
    }

    const clientMap = {};
    allClients.forEach(c => { clientMap[c.id] = c.name; });
    const caseMap = {};
    allCases.forEach(c => { caseMap[c.id] = c; });

    const metric = _clientMonthlyMetric;
    const clients = {};

    allInvoices.forEach(inv => {
      const c = caseMap[inv.caseId];
      if (!c) return;
      const cid = c.clientId;
      if (!clients[cid]) clients[cid] = { months: {}, cases: {} };
      if (!clients[cid].months[inv.month]) clients[cid].months[inv.month] = { amount: 0, commission: 0 };
      clients[cid].months[inv.month].amount     += inv.amount;
      clients[cid].months[inv.month].commission += inv.commission;

      if (!clients[cid].cases[inv.caseId]) clients[cid].cases[inv.caseId] = { months: {}, caseRec: c };
      if (!clients[cid].cases[inv.caseId].months[inv.month]) clients[cid].cases[inv.caseId].months[inv.month] = { amount: 0, commission: 0 };
      clients[cid].cases[inv.caseId].months[inv.month].amount     += inv.amount;
      clients[cid].cases[inv.caseId].months[inv.month].commission += inv.commission;
    });

    const sortedClientIds = Object.keys(clients).sort((a, b) =>
      (clientMap[a] || '').localeCompare(clientMap[b] || '', 'he'));

    const now = new Date();
    const maxMonth = _year === now.getFullYear() ? now.getMonth() + 1 : 12;

    const monthHeaders = Array.from({length:maxMonth}, (_,i) =>
      `<th class="num py-4 px-4 font-bold">${UI.monthName(i+1, true)}</th>`
    ).join('');
    thead.innerHTML = `<tr>
      <th class="py-4 px-4 text-right font-bold">לקוח</th>
      ${monthHeaders}
      <th class="num py-4 px-4 font-bold text-left">סה"כ</th>
    </tr>`;

    const monthTotals = {};
    let grandTotal = 0;
    let rows = '';

    const renderMonthCells = (months) => {
      let total = 0, html = '';
      for (let m = 1; m <= maxMonth; m++) {
        const val = (months[m] || {})[metric] || 0;
        total += val;
        html += `<td class="num py-4 px-4">${val > 0 ? UI.formatNumber(val) : '<span style="color:var(--text-muted)">—</span>'}</td>`;
      }
      return { html, total };
    };

    sortedClientIds.forEach(cid => {
      const data = clients[cid];
      const { html: clientCells, total: clientTotal } = renderMonthCells(data.months);
      for (let m = 1; m <= maxMonth; m++) {
        monthTotals[m] = (monthTotals[m] || 0) + ((data.months[m] || {})[metric] || 0);
      }
      grandTotal += clientTotal;

      rows += `<tr class="client-row hover:bg-neutral-50/50 transition-colors cursor-pointer" data-client-id="${cid}">
        <td class="py-4 px-4 font-semibold text-neutral-800" style="white-space:nowrap">
          <span class="inline-flex items-center gap-2">
            <span class="material-symbols-outlined text-neutral-400 text-[18px] chevron transition-transform">chevron_left</span>
            ${clientMap[cid] || '—'}
          </span>
        </td>
        ${clientCells}
        <td class="num py-4 px-4 font-bold ${metric === 'commission' ? 'text-midnight-600' : ''}">${UI.formatNumber(clientTotal)}</td>
      </tr>`;

      const sortedCaseIds = Object.keys(data.cases).sort((a, b) =>
        data.cases[a].caseRec.caseNumber.localeCompare(data.cases[b].caseRec.caseNumber));
      sortedCaseIds.forEach(caseId => {
        const cd = data.cases[caseId];
        const { html: caseCells, total: caseTotal } = renderMonthCells(cd.months);
        const c = cd.caseRec;
        rows += `<tr class="case-row hover:bg-neutral-50/50 transition-colors" data-parent-client="${cid}" hidden>
          <td class="py-4 px-4">
            <div style="font-family:var(--font-mono);font-size:0.85rem;color:var(--text-muted);padding-right:26px">
              ${c.caseNumber}${c.description && c.description !== c.caseNumber ? ' — ' + c.description : ''}
            </div>
          </td>
          ${caseCells}
          <td class="num py-4 px-4 font-bold">${UI.formatNumber(caseTotal)}</td>
        </tr>`;
      });
    });

    const totalCells = Array.from({length:maxMonth}, (_,i) => {
      const v = monthTotals[i+1] || 0;
      return `<td class="num py-5 px-4 font-bold text-neutral-900">${v > 0 ? UI.formatNumber(v) : '—'}</td>`;
    }).join('');
    rows += `<tr style="background:rgba(79,70,229,0.04);border-top:2px solid rgba(79,70,229,0.15)">
      <td class="py-5 px-4 font-bold text-midnight-600">סה"כ חודשי</td>
      ${totalCells}
      <td class="num py-5 px-4 font-black text-midnight-600">${UI.formatNumber(grandTotal)}</td>
    </tr>`;

    tbody.innerHTML = rows;

    if (!tbody._expandWired) {
      tbody.addEventListener('click', (e) => {
        const row = e.target.closest('tr.client-row');
        if (!row) return;
        const cid = row.dataset.clientId;
        const chev = row.querySelector('.chevron');
        const isOpen = row.classList.toggle('expanded');
        if (chev) chev.style.transform = isOpen ? 'rotate(-90deg)' : '';
        tbody.querySelectorAll(`tr.case-row[data-parent-client="${cid}"]`).forEach(c => {
          c.hidden = !isOpen;
        });
      });
      tbody._expandWired = true;
    }
  }

  return { init, render };
})();

window.Dashboard = Dashboard;
