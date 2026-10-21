const sb = supabase.createClient('https://rlaxqsuxemawtiizvicq.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsYXhxc3V4ZW1hd3RpaXp2aWNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NzI1MjIsImV4cCI6MjEwNjM0ODUyMn0.Ksk2OUtHzACWDOpl6FD26zmR-hnJfiPZCotQCGMpb0Y');
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CO');
const fecha = (d) => d ? new Date(d).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' }) : '—';
const ESTADO = { awaiting_payment: 'Esperando pago', pending: 'Pendiente', preparing: 'En preparación', ready: 'Listo para recoger', on_way: 'En camino', delivered: 'Entregado', cancelled: 'Cancelado' };
const ROL = { cliente: 'Cliente', comercio: 'Comercio', repartidor: 'Repartidor', admin: 'Administrador' };
const MOTIVO = { missing_item: 'Falta un producto', bad_condition: 'Mal estado', wrong_order: 'Pedido equivocado', not_received: 'No le llegó', other: 'Otro' };
const AUD = {
  payment_created: 'Pago creado', payment_approved: 'Pago aprobado (Wompi)', payment_declined: 'Pago rechazado', payment_failed: 'Pago fallido', payment_cancelled: 'Pago anulado',
  payment_amount_mismatch: 'El monto no coincide', payment_event_after_approved: 'Aviso posterior a pago aprobado', payment_approved_after_cancel: 'Pago recibido de un pedido cancelado',
  order_delivered_ledger: 'Pedido entregado: dinero registrado', order_cancelled: 'Pedido cancelado', settlement_created: 'Liquidación creada', settlement_approved: 'Liquidación aprobada',
  payout_paid: 'Pago al beneficiario confirmado', settlement_closed: 'Liquidación cerrada', settlement_cancelled: 'Liquidación cancelada', refund_confirmed: 'Reembolso confirmado',
  claim_created: 'Reclamo creado', claim_approved: 'Reclamo aprobado', claim_rejected: 'Reclamo rechazado', settings_changed: 'Tarifas o reglas cambiadas',
  admin_role_assigned: 'Rol de administrador asignado', account_deleted: 'Cuenta eliminada', terms_accepted: 'Términos aceptados',
};
let tabActual = 'resumen';
const cache = {};

function aviso(t, mal) {
  const a = $('#aviso'); a.textContent = t; a.className = 'aviso ' + (mal ? 'mal' : 'ok'); a.hidden = false;
  clearTimeout(aviso.t); aviso.t = setTimeout(() => { a.hidden = true; }, 4500);
}
async function rpc(n, a) { const { data, error } = await sb.rpc(n, a); if (error) throw error; return data; }
const tabla = (cols, rows, vacio) => rows && rows.length
  ? `<div class="tw"><table><thead><tr>${cols.map((c) => `<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  : `<p class="mut">${vacio || 'Sin datos.'}</p>`;
const kpi = (t, v, s) => `<div class="kpi"><div class="v">${v}</div><div class="t">${esc(t)}</div>${s ? `<div class="s">${esc(s)}</div>` : ''}</div>`;
const quien = (x) => esc(x.name && x.name.trim() ? `${x.name} (${x.email || ''})` : x.email || '—');

function barras(rows) {
  const max = Math.max(1, ...rows.map((r) => Number(r.sales)));
  const w = 700, h = 170, bw = w / rows.length;
  return `<div class="tw" style="padding:12px"><svg viewBox="0 0 ${w} ${h + 26}" width="100%">${rows.map((r, i) => {
    const bh = Math.round((Number(r.sales) / max) * h), d = String(r.day);
    return `<g><title>${esc(d)}: ${money(r.sales)} · ${r.orders} pedidos</title><rect x="${i * bw + 6}" y="${h - bh}" width="${bw - 12}" height="${bh}" rx="4" fill="#1DB954"/><text x="${i * bw + bw / 2}" y="${h + 16}" text-anchor="middle" font-size="10" fill="#667">${d.slice(8, 10)}/${d.slice(5, 7)}</text></g>`;
  }).join('')}</svg></div>`;
}
function csv(nombre, cols, rows) {
  const t = [cols.map((c) => c[0]).join(',')].concat(rows.map((r) => cols.map((c) => '"' + String(c[1](r) ?? '').replace(/"/g, '""') + '"').join(','))).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + t], { type: 'text/csv;charset=utf-8' })); a.download = nombre; a.click();
}
const COLS_PED = [
  ['Fecha', (r) => fecha(r.created_at)], ['Comercio', (r) => esc(r.store_name)], ['Cliente', (r) => esc(r.customer_email)],
  ['Repartidor', (r) => esc(r.courier_email || '—')], ['Estado', (r) => esc(ESTADO[r.status] || r.status)],
  ['Pago', (r) => (r.payment_method === 'cash' ? 'Efectivo' : 'Electrónico')], ['Productos', (r) => money(r.subtotal)],
  ['Domicilio', (r) => money(r.delivery_fee)], ['Comisión', (r) => money(r.commission_amount)], ['Total', (r) => `<b>${money(r.total)}</b>`],
];
function filtrarPedidos() {
  const q = ($('#q') ? $('#q').value : '').toLowerCase(), e = $('#fe') ? $('#fe').value : '';
  return (cache.pedidos || []).filter((r) => (!e || r.status === e) && (!q || `${r.store_name} ${r.customer_email} ${r.courier_email || ''}`.toLowerCase().includes(q)));
}

const VISTAS = {
  async resumen() {
    const [s, dias, est] = await Promise.all([rpc('admin_summary'), rpc('admin_daily_sales', { p_days: 14 }), rpc('admin_status_counts')]);
    if (!s) throw new Error('Esta cuenta no es administradora.');
    const tot = dias.reduce((a, d) => a + Number(d.sales), 0), n = dias.reduce((a, d) => a + Number(d.orders), 0);
    return `<h2>Resumen</h2><div class="kpis">${kpi('Ingresos de Cerquita', money(s.cerquita_revenue))}${kpi('Ventas totales', money(s.sales_total))}${kpi('Pedidos entregados', s.orders_delivered)}${kpi('Efectivo en la calle', money(s.cash_pending), 'por conciliar con repartidores')}${kpi('Por pagar a repartidores', money(s.couriers_pending))}${kpi('Por pagar a comercios', money(s.merchants_pending))}</div>
<h3>Ventas de los últimos 14 días <small class="h">(${money(tot)} · ${n} pedidos)</small></h3>${barras(dias)}
<h3>Pedidos por estado</h3><div class="chips">${est.length ? est.map((e) => `<span class="chip">${esc(ESTADO[e.status] || e.status)}: <b>${e.n}</b></span>`).join('') : '<span class="mut">Sin pedidos todavía.</span>'}</div>`;
  },
  async pedidos() {
    cache.pedidos = await rpc('admin_orders', { p_limit: 300 });
    return `<h2>Pedidos <small class="h">(los 300 más recientes)</small></h2><div class="barra"><input id="q" placeholder="Buscar comercio o correo…"><select id="fe"><option value="">Todos los estados</option>${Object.entries(ESTADO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><button class="nv" data-a="csvPedidos">Descargar CSV</button></div><div id="tp">${tabla(COLS_PED, cache.pedidos)}</div>`;
  },
  async dinero() {
    const [pend, sets, refs] = await Promise.all([rpc('admin_pending'), rpc('admin_settlements'), rpc('admin_refunds')]);
    const rp = refs.filter((r) => r.status === 'PENDING');
    const acc = (x) => {
      let h = '';
      if (x.status === 'CALCULADA') h = `<button data-a="aprobar" data-id="${x.id}">Aprobar</button> <button class="rj" data-a="cancelarLiq" data-id="${x.id}">Cancelar</button>`;
      if (x.status === 'APROBADA') {
        if (x.payout_status === 'PENDING') h += `<button data-a="pagar" data-p="${x.payout_id}">Confirmar pago</button> `;
        if (Number(x.net_amount) <= 0) h += `<button data-a="cerrar" data-id="${x.id}">Cerrar (efectivo recibido)</button> `;
        h += `<button class="rj" data-a="cancelarLiq" data-id="${x.id}">Cancelar</button>`;
      }
      return h;
    };
    return `<h2>Dinero</h2><div class="card fila"><div><label>Referencia del pago o comprobante (opcional)</label><input id="ref" placeholder="Ej: transferencia 0001"></div><span class="mut">Se usa al confirmar pagos, cerrar liquidaciones y confirmar reembolsos.</span></div>
<h3>Pendiente por liquidar</h3>${tabla([
      ['Persona', (r) => quien(r)], ['Rol', (r) => esc(ROL[r.role] || r.role)],
      ['Ganancias o ventas', (r) => money(r.role === 'repartidor' ? r.earnings_pending : r.merchant_pending)], ['Efectivo pendiente', (r) => money(r.cash_pending)],
      ['Neto', (r) => `<b>${money(r.role === 'repartidor' ? Number(r.earnings_pending) - Number(r.cash_pending) : r.merchant_pending)}</b>`],
      ['', (r) => `<button data-a="liq" data-id="${r.party_id}" data-t="${r.role === 'repartidor' ? 'courier' : 'merchant'}">Crear liquidación</button>`],
    ], pend, 'No hay movimientos pendientes por liquidar.')}
<h3>Reembolsos pendientes</h3>${tabla([
      ['Fecha', (r) => fecha(r.created_at)], ['Cliente', (r) => esc(r.email)], ['Monto', (r) => `<b>${money(r.amount)}</b>`], ['Motivo', (r) => esc(r.reason)], ['Referencia Wompi', (r) => esc(r.reference)],
      ['', (r) => `<button data-a="reembolso" data-id="${r.id}">Ya reembolsé: confirmar</button>`],
    ], rp, 'No hay reembolsos pendientes.')}
<h3>Liquidaciones</h3>${tabla([
      ['Fecha', (r) => fecha(r.created_at)], ['Persona', (r) => quien(r)], ['Tipo', (r) => (r.party_type === 'courier' ? 'Repartidor' : 'Comercio')],
      ['Bruto', (r) => money(r.gross_amount)], ['Efectivo', (r) => money(r.cash_applied)], ['Neto', (r) => `<b>${money(r.net_amount)}</b>`], ['Estado', (r) => esc(r.status)], ['', acc],
    ], sets, 'Aún no hay liquidaciones.')}`;
  },
  async reclamos() {
    const cl = await rpc('admin_claims');
    if (!cl.length) return '<h2>Reclamos</h2><p class="mut">No hay reclamos.</p>';
    return `<h2>Reclamos</h2>${cl.map((c) => `<div class="card"><div class="fila" style="justify-content:space-between"><b>${esc(MOTIVO[c.reason] || c.reason)}</b><span>${c.status === 'OPEN' ? '🟠 ABIERTO' : c.status === 'APPROVED' ? '🟢 APROBADO' : '⚪ RECHAZADO'}</span></div>
<p>${esc(c.store_name)} · cliente ${esc(c.email)} · pedido ${money(c.order_total)}${c.courier_email ? ' · repartidor ' + esc(c.courier_email) : ''}</p>${c.description ? `<p>“${esc(c.description)}”</p>` : ''}<p class="mut">${fecha(c.created_at)}</p>
${c.status !== 'OPEN' ? `<p class="mut">Reembolso ${money(c.refund_amount)} · asume: ${esc(c.fault)}${c.admin_note ? ' · ' + esc(c.admin_note) : ''}</p>` : `<div class="fila">
<div><label>Valor a reembolsar (0 = rechazar)</label><input id="m-${c.id}" type="number" min="0" max="${c.order_total}" value="${c.order_total}"></div>
<div><label>¿Quién asume el costo?</label><select id="f-${c.id}"><option value="merchant">Comercio</option><option value="courier">Repartidor</option><option value="cerquita">Cerquita</option></select></div>
<div><label>Nota</label><input id="n-${c.id}" placeholder="Opcional"></div><button data-a="resolver" data-id="${c.id}">Guardar decisión</button></div>`}</div>`).join('')}`;
  },
  async gente() {
    const [us, st] = await Promise.all([rpc('admin_users'), rpc('admin_stores')]);
    return `<h2>Usuarios <small class="h">(${us.length})</small></h2>${tabla([
      ['Correo', (r) => esc(r.email || '(eliminado)')], ['Nombre', (r) => esc(r.name)], ['Rol', (r) => esc(ROL[r.role] || r.role)], ['Creado', (r) => fecha(r.created_at)], ['Último ingreso', (r) => fecha(r.last_sign_in_at)], ['Estado', (r) => (r.deleted_at ? 'Eliminada' : 'Activa')],
    ], us)}<h3>Comercios <small class="h">(${st.length})</small></h3>${tabla([
      ['Nombre', (r) => esc(r.name)], ['Categoría', (r) => esc(r.category)], ['Dueño', (r) => esc(r.owner_email || '—')], ['Abierto', (r) => (r.is_open ? 'Sí' : 'No')], ['Productos', (r) => r.products], ['Pedidos', (r) => r.orders], ['Calificación', (r) => (r.rating ? '★ ' + r.rating : '—')], ['Estado', (r) => (r.deleted_at ? 'Eliminado' : 'Activo')],
    ], st)}`;
  },
  async ajustes() {
    const { data: f, error } = await sb.from('finance_settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    return `<h2>Ajustes</h2><div class="card"><h3 style="margin-top:0">Tarifas</h3><div class="fila">
<div><label>Comisión sobre productos (%)</label><input id="s-com" type="number" step="0.01" value="${esc(f.commission_pct)}"></div>
<div><label>Valor del domicilio ($)</label><input id="s-fee" type="number" value="${esc(f.courier_fee)}"></div><button data-a="tarifas">Guardar tarifas</button></div>
<p class="mut">Solo aplican a pedidos nuevos.</p></div>
<div class="card"><h3 style="margin-top:0">Reglas de cancelación</h3><div class="fila">
<div><label>Minutos para que el comercio acepte</label><input id="s-acc" type="number" value="${esc(f.accept_timeout_minutes)}"></div>
<div><label>Minutos para completar el pago</label><input id="s-pay" type="number" value="${esc(f.payment_timeout_minutes)}"></div>
<div><label>Minutos para conseguir repartidor</label><input id="s-cou" type="number" value="${esc(f.courier_timeout_minutes)}"></div>
<div><label>Minutos de gracia tras aceptar</label><input id="s-gra" type="number" value="${esc(f.cancel_grace_minutes)}"></div>
<div><label>El cliente cancela tras aceptar</label><select id="s-aft"><option value="false" ${f.client_cancel_after_accept ? '' : 'selected'}>No</option><option value="true" ${f.client_cancel_after_accept ? 'selected' : ''}>Sí</option></select></div>
<button data-a="reglas">Guardar reglas</button></div></div>`;
  },
  async auditoria() {
    const { data, error } = await sb.from('audit_log').select('*').order('id', { ascending: false }).limit(200);
    if (error) throw error;
    return `<h2>Auditoría <small class="h">(últimos 200 movimientos)</small></h2>${tabla([
      ['Fecha', (r) => fecha(r.at)], ['Acción', (r) => `<b>${esc(AUD[r.action] || r.action)}</b>`], ['Entidad', (r) => esc(r.entity || '')], ['Detalle', (r) => `<span class="mut">${esc(JSON.stringify(r.detail || {}).slice(0, 140))}</span>`],
    ], data || [])}`;
  },
};
const TABS = [['resumen', 'Resumen'], ['pedidos', 'Pedidos'], ['dinero', 'Dinero'], ['reclamos', 'Reclamos'], ['gente', 'Usuarios y comercios'], ['ajustes', 'Ajustes'], ['auditoria', 'Auditoría']];

async function cargar(k) {
  tabActual = k;
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.t === k));
  const v = $('#vista'); v.innerHTML = '<p class="mut">Cargando…</p>';
  try { v.innerHTML = await VISTAS[k](); } catch (e) { v.innerHTML = `<p class="err">${esc(e.message || e)}</p>`; }
}
async function hacer(p, ok) {
  try { await p; aviso(ok); await cargar(tabActual); } catch (e) { aviso(e.message || String(e), true); }
}
const refTxt = () => ($('#ref') && $('#ref').value.trim()) || 'manual';
const A = {
  csvPedidos() { csv('pedidos-cerquita.csv', COLS_PED.map((c) => [c[0], (r) => String(c[1](r)).replace(/<[^>]*>/g, '')]), filtrarPedidos()); },
  liq(d) { if (confirm('¿Crear la liquidación de esta persona?')) hacer(rpc('create_settlement', { p_party: d.id, p_type: d.t }), 'Liquidación creada'); },
  aprobar(d) { if (confirm('¿Aprobar esta liquidación?')) hacer(rpc('approve_settlement', { p_id: d.id }), 'Liquidación aprobada'); },
  cancelarLiq(d) { if (confirm('¿Cancelar esta liquidación? Los movimientos quedan libres para liquidarse otra vez.')) hacer(rpc('cancel_settlement', { p_id: d.id }), 'Liquidación cancelada'); },
  pagar(d) { if (confirm('¿Confirmas que el pago ya se hizo?')) hacer(rpc('confirm_payout', { p_payout: d.p, p_ref: refTxt() }), 'Pago confirmado'); },
  cerrar(d) { if (confirm('¿Confirmas que ya recibiste el efectivo?')) hacer(rpc('close_settlement', { p_id: d.id, p_ref: refTxt() }), 'Liquidación cerrada'); },
  reembolso(d) { if (confirm('¿Confirmas que ya devolviste este dinero al cliente?')) hacer(rpc('confirm_refund', { p_refund: d.id, p_ref: refTxt() }), 'Reembolso registrado'); },
  resolver(d) {
    const m = parseInt($('#m-' + d.id).value, 10) || 0;
    if (!confirm(m > 0 ? `¿Aprobar un reembolso de ${money(m)}?` : '¿Rechazar este reclamo?')) return;
    hacer(rpc('resolve_claim', { p_claim: d.id, p_refund: m, p_fault: m > 0 ? $('#f-' + d.id).value : 'none', p_note: $('#n-' + d.id).value.trim() || null }), 'Decisión guardada');
  },
  tarifas() { if (confirm('¿Cambiar las tarifas?')) hacer(rpc('set_finance_settings', { p_commission: parseFloat($('#s-com').value), p_fee: parseInt($('#s-fee').value, 10) }), 'Tarifas actualizadas'); },
  reglas() {
    if (!confirm('¿Cambiar las reglas de cancelación?')) return;
    hacer(rpc('set_cancel_settings', { p_accept: parseInt($('#s-acc').value, 10), p_payment: parseInt($('#s-pay').value, 10), p_courier: parseInt($('#s-cou').value, 10), p_grace: parseInt($('#s-gra').value, 10) || 0, p_after: $('#s-aft').value === 'true' }), 'Reglas actualizadas');
  },
};
document.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && A[b.dataset.a]) A[b.dataset.a](b.dataset); });
document.addEventListener('input', (e) => { if (e.target.id === 'q' || e.target.id === 'fe') $('#tp').innerHTML = tabla(COLS_PED, filtrarPedidos(), 'Nada coincide con la búsqueda.'); });

function mostrarLogin(msg) { $('#app').hidden = true; $('#login').hidden = false; $('#le').textContent = msg || ''; }
async function iniciar() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return mostrarLogin();
  const { data: p } = await sb.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
  if (!p || p.role !== 'admin') { await sb.auth.signOut(); return mostrarLogin('Esta cuenta no tiene permisos de administrador.'); }
  $('#login').hidden = true; $('#app').hidden = false; $('#quien').textContent = session.user.email;
  $('#tabs').innerHTML = TABS.map(([k, t]) => `<a data-t="${k}">${t}</a>`).join('');
  document.querySelectorAll('nav a').forEach((a) => { a.onclick = () => cargar(a.dataset.t); });
  cargar('resumen');
}
$('#fl').addEventListener('submit', async (e) => {
  e.preventDefault(); $('#le').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: $('#em').value.trim(), password: $('#pw').value });
  if (error) { $('#le').textContent = 'Correo o contraseña incorrectos.'; return; }
  iniciar();
});
$('#salir').addEventListener('click', async () => { await sb.auth.signOut(); mostrarLogin(); });
iniciar();
