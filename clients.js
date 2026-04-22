/**
 * clients.js — LexLedger Clients & Cases View
 * Accordion-style client cards, inline cases table,
 * CRUD for both clients and cases.
 */

const Clients = (() => {

  // ── Init ───────────────────────────────────────────────
  function init() {
    document.getElementById('btn-add-client').addEventListener('click', () => openClientModal());
    document.getElementById('btn-merge-clients').addEventListener('click', () => openMergeModal());
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

    // Wire toggle + buttons
    container.querySelectorAll('.client-card-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const card = header.closest('.client-card');
        card.classList.toggle('expanded');
      });
    });
  }

  // ── Build Client Card HTML ─────────────────────────────
  function buildClientCard(client, cases) {
    const casesHTML = cases.length
      ? `<div class="table-wrap cases-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>מספר תיק</th>
                <th>תיאור</th>
                <th>סוג</th>
                <th class="num">% עמלה</th>
                <th>סוג הסדר</th>
                <th>תאריך פתיחה</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${cases.map(c => buildCaseRow(c)).join('')}
            </tbody>
          </table>
        </div>`
      : `<p style="padding:16px 20px;color:var(--text-muted);font-size:0.85rem">אין תיקים ללקוח זה.</p>`;

    return `
      <div class="client-card" data-client-id="${client.id}">
        <div class="client-card-header">
          <div class="client-name">
            ${client.name}
            <span class="client-case-count">${cases.length} תיקים</span>
          </div>
          <div class="client-actions">
            <button class="btn-ghost btn-sm" onclick="Clients.openCaseModal(${client.id})" title="הוסף תיק">+ תיק</button>
            <button class="btn-ghost btn-sm" onclick="Clients.openClientModal(${client.id})" title="ערוך לקוח">✎</button>
            <button class="btn-danger btn-sm" onclick="Clients.deleteClient(${client.id}, '${escHtml(client.name)}')" title="מחק לקוח">✕</button>
          </div>
        </div>
        <div class="client-cases">
          ${casesHTML}
          <div style="padding:8px 20px 16px;text-align:left">
            <button class="btn-ghost btn-sm" onclick="Clients.openCaseModal(${client.id})">+ הוסף תיק</button>
          </div>
        </div>
      </div>`;
  }

  function buildCaseRow(c) {
    return `<tr data-case-id="${c.id}">
      <td style="font-family:var(--font-mono);font-size:0.85rem">${escHtml(c.caseNumber)}</td>
      <td>${escHtml(c.description)}</td>
      <td>${UI.caseTypeBadge(c.caseType)}</td>
      <td class="num">${UI.formatPct(c.commissionRate)}</td>
      <td style="color:var(--text-secondary);font-size:0.82rem">${escHtml(c.arrangementType)}</td>
      <td style="color:var(--text-muted);font-size:0.82rem">${c.openDate || '—'}</td>
      <td>
        <button class="btn-icon" onclick="Clients.openCaseModal(${c.clientId}, ${c.id})" title="ערוך תיק">✎</button>
        <button class="btn-icon" style="color:var(--color-negative)" onclick="Clients.deleteCase(${c.id}, '${escHtml(c.caseNumber)}')" title="מחק תיק">✕</button>
      </td>
    </tr>`;
  }

  // ── Client Modal ───────────────────────────────────────
  async function openClientModal(clientId = null) {
    let client = null;
    if (clientId) client = await DB.clients.get(clientId);

    const bodyHTML = UI.buildForm([
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

    const bodyHTML = UI.buildForm([
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

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  return { init, render, openClientModal, openCaseModal, deleteClient, deleteCase, openMergeModal };
})();

window.Clients = Clients;
