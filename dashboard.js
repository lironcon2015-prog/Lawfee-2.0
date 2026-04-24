/**
 * dashboard.js — LexLedger Dashboard View (redesigned)
 * Hero KPI, monthly bar chart, client donut, breakdown tables.
 */

const Dashboard = (() => {

  let _year = new Date().getFullYear();

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

    document.getElementById('toggle-client-monthly-group')?.addEventListener('click', async () => {
      _clientMonthlyGroup = _clientMonthlyGroup === 'client' ? 'case' : 'client';
      await renderClientMonthlyTable();
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

  // ── Monthly Bar Chart (SVG) ────────────────────────────
  async function renderMonthlyChart() {
    const host = document.getElementById('monthly-chart');
    if (!host) return;

    const [invByMonth, payByMonth] = await Promise.all([
      DB.invoices.byMonthForYear(_year),
      DB.payments.byMonthForYear(_year),
    ]);

    const months = Array.from({length:12}, (_,i) => {
      const inv = invByMonth[i+1] || { amount: 0, commission: 0 };
      const pay = payByMonth[i+1]  || 0;
      return { m: i+1, amount: inv.amount, commission: inv.commission, payment: pay };
    });

    const hasData = months.some(x => x.amount > 0 || x.commission > 0);
    if (!hasData) {
      host.innerHTML = `<div class="chart-empty">אין נתונים לשנת ${_year}</div>`;
      return;
    }

    const maxVal = Math.max(...months.map(x => Math.max(x.amount, x.commission))) || 1;
    const niceMax = niceCeil(maxVal);

    const W = 720, H = 260;
    const padL = 48, padR = 12, padT = 16, padB = 30;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const groupW = plotW / 12;
    const barW = Math.min(14, groupW / 3);

    const gridLines = [];
    const gridLabels = [];
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH * i / 4);
      const v = niceMax * (1 - i/4);
      gridLines.push(`<line class="grid-line" x1="${padL}" x2="${W-padR}" y1="${y}" y2="${y}" />`);
      gridLabels.push(`<text class="axis-label" x="${padL - 8}" y="${y + 3}" text-anchor="end">${formatAxis(v)}</text>`);
    }

    const bars = [];
    const xLabels = [];
    months.forEach((mo, idx) => {
      // LTR order: idx=0 (January) starts at padL, idx=11 (December) at the right
      const groupLeft  = padL + (idx * groupW);
      const groupRight = groupLeft + groupW;
      const cx = (groupLeft + groupRight) / 2;

      const revH  = (mo.amount     / niceMax) * plotH;
      const commH = (mo.commission / niceMax) * plotH;
      const revY  = padT + plotH - revH;
      const commY = padT + plotH - commH;
      const revX  = cx - barW - 1;
      const commX = cx + 1;

      const tip = `חודש ${UI.monthName(mo.m)} — הכנסות ${UI.formatNumber(mo.amount)} · עמלות ${UI.formatNumber(mo.commission)}`;
      bars.push(`<g class="bar-grp" data-tip="${tip}" data-cx="${cx}">
        ${mo.amount > 0 ? `<rect x="${revX}" y="${revY}" width="${barW}" height="${Math.max(1,revH)}" rx="2" fill="var(--accent)"/>` : ''}
        ${mo.commission > 0 ? `<rect x="${commX}" y="${commY}" width="${barW}" height="${Math.max(1,commH)}" rx="2" fill="var(--color-positive)"/>` : ''}
      </g>`);
      xLabels.push(`<text class="x-label" x="${cx}" y="${H - 10}">${UI.monthName(mo.m, true)}</text>`);
    });

    host.style.position = 'relative';
    host.innerHTML = `
      <svg class="bars-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        ${gridLines.join('')}
        ${gridLabels.join('')}
        ${bars.join('')}
        ${xLabels.join('')}
      </svg>
      <div class="bar-tip" id="bar-tip"></div>`;

    const tip = host.querySelector('#bar-tip');
    host.querySelectorAll('.bar-grp').forEach(g => {
      g.addEventListener('mouseenter', () => {
        tip.textContent = g.dataset.tip;
        tip.classList.add('on');
      });
      g.addEventListener('mousemove', (e) => {
        const r = host.getBoundingClientRect();
        tip.style.left = (e.clientX - r.left + 10) + 'px';
        tip.style.top  = (e.clientY - r.top - 28) + 'px';
      });
      g.addEventListener('mouseleave', () => tip.classList.remove('on'));
    });
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
      host.innerHTML = `<div class="chart-empty">אין נתונים לשנת ${_year}</div>`;
      return;
    }

    const clientMap = {};
    allClients.forEach(c => { clientMap[c.id] = c.name; });
    const caseMap = {};
    allCases.forEach(c => { caseMap[c.id] = c; });

    const byClient = {};
    allInvoices.forEach(inv => {
      const c = caseMap[inv.caseId];
      if (!c) return;
      byClient[c.clientId] = (byClient[c.clientId] || 0) + inv.amount;
    });

    let rows = Object.entries(byClient)
      .map(([cid, v]) => ({ name: clientMap[parseInt(cid)] || '—', val: v }))
      .sort((a,b) => b.val - a.val);

    const total = rows.reduce((s,r) => s + r.val, 0);

    if (rows.length > 5) {
      const top = rows.slice(0, 5);
      const rest = rows.slice(5);
      const othersVal = rest.reduce((s,r) => s + r.val, 0);
      rows = [...top, { name: `${rest.length} אחרים`, val: othersVal, isOthers: true }];
    }

    const palette = [
      'var(--accent)',
      'oklch(0.58 0.14 155)',
      'oklch(0.66 0.14 75)',
      'oklch(0.56 0.18 25)',
      'oklch(0.55 0.14 210)',
      'var(--n-300)',
    ];
    rows.forEach((r,i) => r.color = palette[i] || 'var(--n-300)');

    const size = 170, strokeW = 22;
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
      return `<div class="dl-row">
        <span class="dl-dot" style="background:${r.color}"></span>
        <span class="dl-name" title="${r.name}">${r.name}</span>
        <span class="dl-val">${pct}%</span>
      </div>`;
    }).join('');

    host.innerHTML = `
      <svg class="donut-svg" viewBox="0 0 ${size} ${size}">
        ${segs}
        <text class="donut-center-label" x="${cx}" y="${cy - 6}">סה״כ</text>
        <text class="donut-center" x="${cx}" y="${cy + 14}">${formatAxis(total)}</text>
      </svg>
      <div class="donut-legend">${legend}</div>`;
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

    // Payments with no month assigned (key 0) — deduct from balance but show separately
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

  // ── Status Badge Helper ────────────────────────────────
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

    // Aggregate per case, then group under client
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

    // Click-to-expand (event delegation, attached once)
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
  let _clientMonthlyGroup  = 'client';

  async function renderClientMonthlyTable() {
    const thead = document.getElementById('client-monthly-thead');
    const tbody = document.getElementById('client-monthly-tbody');
    const toggleMetricBtn = document.getElementById('toggle-client-monthly-metric');
    const toggleGroupBtn  = document.getElementById('toggle-client-monthly-group');
    if (!thead || !tbody) return;

    if (toggleMetricBtn) toggleMetricBtn.textContent = _clientMonthlyMetric === 'commission' ? 'הצג הכנסות' : 'הצג עמלות';
    if (toggleGroupBtn)  toggleGroupBtn.textContent  = _clientMonthlyGroup === 'client' ? 'פירוט לפי תיק' : 'קיבוץ לפי לקוח';

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
    const byCase = _clientMonthlyGroup === 'case';

    const matrix = {};
    const rowMeta = {};

    allInvoices.forEach(inv => {
      const c = caseMap[inv.caseId];
      if (!c) return;
      const rowKey = byCase ? `case_${inv.caseId}` : `client_${c.clientId}`;
      if (!matrix[rowKey]) {
        matrix[rowKey] = {};
        rowMeta[rowKey] = byCase
          ? { label: clientMap[c.clientId] || '—', subLabel: c.caseNumber + (c.description ? ' — ' + c.description : ''), sortKey: (clientMap[c.clientId] || '') + c.caseNumber }
          : { label: clientMap[c.clientId] || '—', subLabel: null, sortKey: clientMap[c.clientId] || '' };
      }
      if (!matrix[rowKey][inv.month]) matrix[rowKey][inv.month] = { amount: 0, commission: 0 };
      matrix[rowKey][inv.month].amount     += inv.amount;
      matrix[rowKey][inv.month].commission += inv.commission;
    });

    const sortedKeys = Object.keys(matrix).sort((a, b) => rowMeta[a].sortKey.localeCompare(rowMeta[b].sortKey, 'he'));

    const now = new Date();
    const maxMonth = _year === now.getFullYear() ? now.getMonth() + 1 : 12;

    const monthHeaders = Array.from({length:maxMonth}, (_,i) =>
      `<th class="num py-4 px-4 font-bold">${UI.monthName(i+1, true)}</th>`
    ).join('');
    thead.innerHTML = `<tr>
      <th class="py-4 px-4 text-right font-bold">${byCase ? 'לקוח / תיק' : 'לקוח'}</th>
      ${monthHeaders}
      <th class="num py-4 px-4 font-bold text-left">סה"כ</th>
    </tr>`;

    const monthTotals = {};
    let grandTotal = 0;
    let rows = '';

    sortedKeys.forEach(rowKey => {
      const meta = rowMeta[rowKey];
      const months = matrix[rowKey] || {};
      let rowTotal = 0;
      let cells = '';
      for (let m = 1; m <= maxMonth; m++) {
        const val = (months[m] || {})[metric] || 0;
        rowTotal += val;
        monthTotals[m] = (monthTotals[m] || 0) + val;
        cells += `<td class="num py-4 px-4">${val > 0 ? UI.formatNumber(val) : '<span style="color:var(--text-muted)">—</span>'}</td>`;
      }
      grandTotal += rowTotal;

      const labelCell = byCase
        ? `<td class="py-4 px-4"><div style="font-weight:500">${meta.label}</div><div style="font-family:var(--font-mono);font-size:0.8rem;color:var(--text-muted);margin-top:2px">${meta.subLabel}</div></td>`
        : `<td class="py-4 px-4 font-semibold text-neutral-800" style="white-space:nowrap">${meta.label}</td>`;

      rows += `<tr class="hover:bg-neutral-50/50 transition-colors">${labelCell}${cells}<td class="num py-4 px-4 font-bold ${metric === 'commission' ? 'text-midnight-600' : ''}">${UI.formatNumber(rowTotal)}</td></tr>`;
    });

    // Styled total row — indigo tint, matching the design
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
  }

  return { init, render };
})();

window.Dashboard = Dashboard;
