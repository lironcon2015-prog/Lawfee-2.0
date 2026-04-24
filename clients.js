/**
 * clients.js — LexLedger Clients & Cases View
 * Accordion-style client cards, inline cases table,
 * CRUD for both clients and cases.
 */

const Clients = (() => {

  // ── buildForm helper (UI.formField wrapper for arrays) ──
  function buildForm(fields) {
    return fields.map(f => {
      const esc = s => (s || '').toString().replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (f.type === 'select') {
        const opts = (f.options || []).map(o =>
          `<option value="${esc(o.value)}" ${String(f.value) === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`
        ).join('');
        return `<div class="form-group">
          <label class="form-label" for="${f.id}">${f.label}${f.required ? ' *' : ''}</label>
          <select id="${f.id}" class="form-input">${opts}</select>
        </div>`;
      }
      return `<div class="form-group">
        <label class="form-label" for="${f.id}">${f.label}${f.required ? ' *' : ''}</label>
        <input type="${f.type || 'text'}" id="${f.id}" class="form-input"
          value="${esc(f.value?.toString() ?? '')}"
          ${f.required ? 'required' : ''}
          ${f.step  !== undefined ? `step="${f.step}"` : ''}
          ${f.min   !== undefined ? `min="${f.min}"`   : ''}
          ${f.max   !== undefined ? `max="${f.max}"`   : ''}
          ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} />
      </div>`;
    }).join('');
  }

  // ── Init ───────────────────────────────────────────────
  function init() {
    document.getElementById('btn-add-client').addEventListener('click', () => openClientModal());
    document.getElementById('btn-merge-clients').addEventListener('click', () => openMergeModal());

    // Live search
    document.getElementById('clients-search')?.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      document.querySelectorAll('#clients-list [data-client-id]').forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = !q || text.includes(q) ? '' : 'none';
      });
    });

    render();
  }

  // ── Render ─────────────────────────────────────────────
  async function render() {
    const container = document.getElementById('clients-list');
    if (!container) return;

    const [clients, allCases] = await Promise.all([
      DB.clients.getAll(),
      DB.cases.getAll(),
    ]);

    if (!clients.length) {
      container.innerHTML = `
        <div class="onboarding-hint">
          <span class="oh-icon">◉</span>
          <p class="oh-title">אין לקוחות עדיין</p>
          <p>התחל בייבוא קובץ Excel או הוסף לקוח ידנית.</p>
          <button class="btn-primary oh-action" onclick="App.navigate('import')">מעבר לייבוא</button>
        </div>`;
      return;
    }

    // Group cases by clientId
    const casesByClient = {};
    allCases.forEach(c => {
      if (!casesByClient[c.clientId]) casesByClient[c.clientId] = [];
      casesByClient[c.clientId].push(c);
    });

    container.innerHTML = clients.map(client => {
      const cases = casesByClient[client.id] || [];
      return buildClientCard(client, cases);
    }).join('');
    // Note: accordion toggle is handled natively by <details>/<summary> elements.
    // No JS click wiring needed.
  }

  // ── Case type badge ────────────────────────────────────
  const CASE_TYPE_BADGE = {
    'ליטיגציה': 'bg-red-100 text-red-800',
    'עסקה':     'bg-purple-100 text-purple-800',
    'שוטף':     'bg-blue-100 text-blue-800',
  };

  function caseTypeBadge(type) {
    const cls = CASE_TYPE_BADGE[type] || 'bg-neutral-100 text-neutral-700';
    return `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${cls}">${escHtml(type || '—')}</span>`;
  }

  // ── Avatar initials + color ────────────────────────────
  const AVATAR_COLORS = [
    'bg-blue-50 text-blue-600 border-blue-100',
    'bg-emerald-50 text-emerald-600 border-emerald-100',
    'bg-orange-50 text-orange-600 border-orange-100',
    'bg-purple-50 text-purple-600 border-purple-100',
    'bg-pink-50 text-pink-600 border-pink-100',
    'bg-teal-50 text-teal-600 border-teal-100',
  ];

  function avatarCls(name) {
    const idx = (name.charCodeAt(0) || 0) % AVATAR_COLORS.length;
    return AVATAR_COLORS[idx];
  }

  // ── Build Client Card HTML ─────────────────────────────
  function buildClientCard(client, cases) {
    const initial = (client.name || '?')[0].toUpperCase();
    const activeCases = cases.length;

    const casesHTML = cases.length
      ? `<div class="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table class="w-full text-right text-neutral-600 data-table">
            <thead class="bg-neutral-50 text-neutral-500 border-b border-neutral-200">
              <tr>
                <th class="px-6 py-4" scope="col">מספר תיק</th>
                <th class="px-6 py-4" scope="col">תיאור</th>
                <th class="px-6 py-4" scope="col">סוג</th>
                <th class="px-6 py-4" scope="col">% עמלה</th>
                <th class="px-6 py-4" scope="col">הסדר</th>
                <th class="px-6 py-4" scope="col">תאריך פתיחה</th>
                <th class="px-6 py-4 text-left" scope="col">פעולות</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-100 font-medium">
              ${cases.map(c => buildCaseRow(c)).join('')}
            </tbody>
          </table>
        </div>
        <div class="mt-4 flex justify-between items-center">
          <button onclick="Clients.openClientModal(${client.id})"
            class="text-sm font-medium text-neutral-500 hover:text-neutral-700 flex items-center gap-1 transition-colors">
            <span class="material-symbols-outlined text-[18px]">edit</span> ערוך לקוח
          </button>
          <div class="flex items-center gap-3">
            <button onclick="Clients.deleteClient(${client.id}, '${escHtml(client.name)}')"
              class="text-sm font-medium text-red-400 hover:text-red-600 flex items-center gap-1 transition-colors">
              <span class="material-symbols-outlined text-[18px]">delete</span> מחק
            </button>
            <button onclick="Clients.openCaseModal(${client.id})"
              class="text-sm font-semibold text-midnight-600 hover:text-midnight-800 flex items-center gap-1 transition-colors">
              <span class="material-symbols-outlined text-[18px]">add</span> הוסף תיק
            </button>
          </div>
        </div>`
      : `<p class="text-sm text-neutral-400 py-4">אין תיקים ללקוח זה.</p>
         <div class="mt-3 flex justify-between items-center">
          <button onclick="Clients.openClientModal(${client.id})"
            class="text-sm font-medium text-neutral-500 hover:text-neutral-700 flex items-center gap-1">
            <span class="material-symbols-outlined text-[18px]">edit</span> ערוך לקוח
          </button>
          <button onclick="Clients.openCaseModal(${client.id})"
            class="text-sm font-semibold text-midnight-600 hover:text-midnight-800 flex items-center gap-1">
            <span class="material-symbols-outlined text-[18px]">add</span> הוסף תיק
          </button>
        </div>`;

    return `
      <details class="group bg-white rounded-3xl shadow-sm border border-neutral-200 overflow-hidden" data-client-id="${client.id}">
        <summary class="flex items-center justify-between cursor-pointer p-6 hover:bg-neutral-50 transition-colors select-none list-none [&::-webkit-details-marker]:hidden">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg border ${avatarCls(client.name)}">
              ${initial}
            </div>
            <div>
              <h3 class="text-lg font-bold font-heading text-neutral-900">${escHtml(client.name)}</h3>
              <p class="text-sm text-neutral-500 font-medium">${activeCases} תיקים</p>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <span class="material-symbols-outlined text-neutral-400 group-open:rotate-180 transition-transform duration-200">expand_more</span>
          </div>
        </summary>
        <div class="border-t border-neutral-100 bg-neutral-50/50 p-6">
          ${casesHTML}
        </div>
      </details>`;
  }

  function buildCaseRow(c) {
    return `<tr class="hover:bg-neutral-50 transition-colors" data-case-id="${c.id}">
      <td class="px-6 py-4 font-mono text-sm text-neutral-900">${escHtml(c.caseNumber)}</td>
      <td class="px-6 py-4">${escHtml(c.description)}</td>
      <td class="px-6 py-4">${caseTypeBadge(c.caseType)}</td>
      <td class="px-6 py-4">${UI.formatPct(c.commissionRate)}</td>
      <td class="px-6 py-4">${escHtml(c.arrangementType)}</td>
      <td class="px-6 py-4">${c.openDate || '—'}</td>
      <td class="px-6 py-4 text-left">
        <div class="flex items-center gap-2 justify-end">
          <button onclick="Clients.openCaseModal(${c.clientId}, ${c.id})"
            class="text-neutral-400 hover:text-midnight-600 transition-colors" title="ערוך תיק">
            <span class="material-symbols-outlined text-[20px]">edit</span>
          </button>
          <button onclick="Clients.deleteCase(${c.id}, '${escHtml(c.caseNumber)}')"
            class="text-neutral-400 hover:text-red-500 transition-colors" title="מחק תיק">
            <span class="material-symbols-outlined text-[20px]">delete</span>
          </button>
        </div>
      </td>
    </tr>`;
  }

  // ── Client Modal ───────────────────────────────────────
  async function openClientModal(clientId = null) {
    let client = null;
    if (clientId) client = await DB.clients.get(clientId);

    const bodyHTML = buildForm([
      {
        id: 'f-client-name', label: 'שם לקוח', type: 'text',
        value: client ? client.name : '', required: true,
      },
    ]);

    UI.openModal({
      title:        clientId ? 'עריכת לקוח' : 'לקוח חדש',
      bodyHTML,
      confirmLabel: clientId ? 'שמור שינויים' : 'צור לקוח',
      onConfirm: async () => {
        const name = document.getElementById('f-client-name').value.trim();
        if (!name) throw new Error('יש להזין שם לקוח');

        if (clientId) {
          await DB.clients.update({ ...client, name });
          UI.toast('לקוח עודכן', 'success');
        } else {
          await DB.clients.add(name);
          UI.toast('לקוח נוצר', 'success');
        }
        UI.closeModal();
        await render();
      },
    });

    setTimeout(() => document.getElementById('f-client-name')?.focus(), 60);
  }

  // ── Delete Client ──────────────────────────────────────
  function deleteClient(clientId, name) {
    UI.confirm(
      `האם למחוק את הלקוח <strong>${name}</strong> וכל התיקים המשויכים?<br><small style="color:var(--color-negative)">פעולה זו אינה הפיכה.</small>`,
      async () => {
        // Delete all cases + their invoices
        const cases = await DB.cases.getByClient(clientId);
        for (const c of cases) {
          const invs = await DB.invoices.getByCase(c.id);
          for (const inv of invs) await DB.invoices.delete(inv.id);
          await DB.cases.delete(c.id);
        }
        await DB.clients.delete(clientId);
        UI.toast('לקוח נמחק', 'info');
        UI.closeModal();
        await render();
      }
    );
  }

  // ── Case Modal ─────────────────────────────────────────
  async function openCaseModal(clientId, caseId = null) {
    let caseRec = null;
    if (caseId) caseRec = await DB.cases.get(caseId);

    const bodyHTML = buildForm([
      {
        id: 'f-case-number', label: 'מספר תיק', type: 'text',
        value: caseRec ? caseRec.caseNumber : '', required: true,
      },
      {
        id: 'f-case-desc', label: 'תיאור / שם התיק', type: 'text',
        value: caseRec ? caseRec.description : '',
      },
      {
        id: 'f-case-type', label: 'סוג תיק', type: 'select',
        value: caseRec ? caseRec.caseType : 'שוטף',
        options: [
          { value: 'שוטף',     label: 'שוטף' },
          { value: 'ליטיגציה', label: 'ליטיגציה' },
          { value: 'עסקה',     label: 'עסקה' },
        ],
      },
      {
        id: 'f-case-rate', label: 'שיעור עמלה (%)', type: 'number',
        value: caseRec ? caseRec.commissionRate : '', required: true,
        step: '0.5', min: '0', max: '100',
      },
      {
        id: 'f-case-arrangement', label: 'סוג הסדר', type: 'text',
        value: caseRec ? caseRec.arrangementType : '',
      },
      {
        id: 'f-case-opendate', label: 'תאריך פתיחה', type: 'date',
        value: caseRec ? (caseRec.openDate || '') : '',
      },
    ]);

    UI.openModal({
      title:        caseId ? 'עריכת תיק' : 'תיק חדש',
      bodyHTML,
      confirmLabel: caseId ? 'שמור שינויים' : 'צור תיק',
      onConfirm: async () => {
        const caseNumber = document.getElementById('f-case-number').value.trim();
        const desc       = document.getElementById('f-case-desc').value.trim();
        const caseType   = document.getElementById('f-case-type').value;
        const rate       = parseFloat(document.getElementById('f-case-rate').value);
        const arrType    = document.getElementById('f-case-arrangement').value.trim();
        const openDate   = document.getElementById('f-case-opendate').value || null;

        if (!caseNumber)   throw new Error('יש להזין מספר תיק');
        if (isNaN(rate))   throw new Error('יש להזין שיעור עמלה תקין');

        if (caseId) {
          await DB.cases.update({
            ...caseRec,
            caseNumber, description: desc, caseType,
            commissionRate: rate, arrangementType: arrType, openDate,
          });
          UI.toast('תיק עודכן', 'success');
        } else {
          await DB.cases.add({
            clientId, caseNumber, description: desc, caseType,
            commissionRate: rate, arrangementType: arrType, openDate,
          });
          UI.toast('תיק נוצר', 'success');
        }
        UI.closeModal();
        await render();
      },
    });

    setTimeout(() => document.getElementById('f-case-number')?.focus(), 60);
  }

  // ── Delete Case ────────────────────────────────────────
  function deleteCase(caseId, caseNumber) {
    UI.confirm(
      `האם למחוק את התיק <strong>${caseNumber}</strong>?<br><small style="color:var(--color-negative)">כל החשבוניות של תיק זה יימחקו.</small>`,
      async () => {
        const invs = await DB.invoices.getByCase(caseId);
        for (const inv of invs) await DB.invoices.delete(inv.id);
        await DB.cases.delete(caseId);
        UI.toast('תיק נמחק', 'info');
        UI.closeModal();
        await render();
      }
    );
  }

  // ── Merge Clients Modal ────────────────────────────────
  async function openMergeModal() {
    const allClients = await DB.clients.getAll();

    if (allClients.length < 2) {
      UI.toast('נדרשים לפחות שני לקוחות למיזוג', 'warning');
      return;
    }

    const checkboxes = allClients.map(c => `
      <label class="merge-client-option" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;">
        <input type="checkbox" name="merge-client" value="${c.id}" style="width:16px;height:16px;accent-color:var(--color-gold);cursor:pointer;" />
        <span style="font-size:0.92rem">${escHtml(c.name)}</span>
      </label>`
    ).join('');

    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">בחר לקוחות למיזוג *</label>
        <div id="merge-clients-list" style="border:1px solid var(--border-color);border-radius:8px;padding:8px;max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;background:var(--bg-secondary);">
          ${checkboxes}
        </div>
        <small style="color:var(--text-muted);font-size:0.75rem;margin-top:6px;display:block">
          כל התיקים של הלקוחות הנבחרים יועברו ללקוח המאוחד. הלקוחות הישנים יימחקו.
        </small>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-merge-name">שם הלקוח המאוחד *</label>
        <input type="text" id="f-merge-name" class="form-input" placeholder="לדוגמה: ישראל ישראלי" />
      </div>
      <div id="merge-preview" style="display:none;background:var(--bg-secondary);border-radius:8px;padding:12px;margin-top:4px;font-size:0.83rem;color:var(--text-secondary);border:1px solid var(--border-color)">
        <strong style="color:var(--text-primary);display:block;margin-bottom:6px">תצוגה מקדימה:</strong>
        <div id="merge-preview-content"></div>
      </div>`;

    UI.openModal({
      title: 'מיזוג לקוחות',
      bodyHTML,
      confirmLabel: 'בצע מיזוג',
      wide: true,
      onConfirm: async () => {
        const selected = [...document.querySelectorAll('input[name="merge-client"]:checked')]
          .map(el => parseInt(el.value));
        const newName = document.getElementById('f-merge-name').value.trim();

        if (selected.length < 2) throw new Error('יש לבחור לפחות 2 לקוחות למיזוג');
        if (!newName)             throw new Error('יש להזין שם ללקוח המאוחד');

        await performMerge(selected, newName);
      },
    });

    // Wire live preview
    setTimeout(() => {
      const updatePreview = () => {
        const selected = [...document.querySelectorAll('input[name="merge-client"]:checked')]
          .map(el => parseInt(el.value));
        const preview  = document.getElementById('merge-preview');
        const content  = document.getElementById('merge-preview-content');
        const newName  = document.getElementById('f-merge-name')?.value.trim();
        if (!preview || !content) return;

        if (selected.length >= 2) {
          const names = selected.map(id => {
            const c = allClients.find(x => x.id === id);
            return c ? escHtml(c.name) : '?';
          });
          preview.style.display = 'block';
          content.innerHTML = `
            <div style="margin-bottom:4px">${names.join(' &nbsp;+&nbsp; ')}</div>
            <div style="margin:4px 0;color:var(--text-muted)">↓</div>
            <div style="color:var(--color-gold);font-weight:600">${escHtml(newName) || '(שם לקוח חדש)'}</div>`;
        } else {
          preview.style.display = 'none';
        }
      };

      document.querySelectorAll('input[name="merge-client"]').forEach(el =>
        el.addEventListener('change', updatePreview)
      );
      document.getElementById('f-merge-name')?.addEventListener('input', updatePreview);
      document.getElementById('f-merge-name')?.focus();
    }, 80);
  }

  async function performMerge(clientIds, newClientName) {
    // 1. Create new merged client
    const newClientId = await DB.clients.add(newClientName);

    // 2. Reassign all cases from selected clients to new client
    const allCases = await DB.cases.getAll();
    for (const c of allCases) {
      if (clientIds.includes(c.clientId)) {
        await DB.cases.update({ ...c, clientId: newClientId });
      }
    }

    // 3. Delete the old clients
    for (const id of clientIds) {
      await DB.clients.delete(id);
    }

    UI.toast(`${clientIds.length} לקוחות אוחדו בהצלחה תחת "${newClientName}"`, 'success');
    UI.closeModal();
    await render();
  }

  function escHtml(str) { return UI.esc(str); }

  return { init, render, openClientModal, openCaseModal, deleteClient, deleteCase, openMergeModal };
})();

window.Clients = Clients;
