// Preview only: answers the app's /api/* calls inside the browser with the exported model,
// so the Flask pages work without a server. Mirrors routes/ml_routes.py and model/tree_predictor.py.
(function () {
  const realFetch = window.fetch.bind(window);
  let modelPromise = null;
  const loadModel = () => (modelPromise ||= realFetch('model.json').then((r) => r.json()).then(prepare));

  function prepare(M) {
    const P = M.prep, owner = [...P.num_cols];
    P.cat_cols.forEach((c, i) => P.cats[i].forEach(() => owner.push(c)));
    const trees = M.models.random_forest.trees;
    M._owner = owner;
    M._fields = P.num_cols.concat(P.cat_cols);
    M._base = trees.reduce((s, t) => s + t.p[0], 0) / trees.length;
    return M;
  }

  function vectorize(M, rec) {
    const P = M.prep, z = [];
    P.num_cols.forEach((c, i) => z.push(Math.fround((Number(rec[c]) - P.mean[i]) / P.scale[i])));
    P.cat_cols.forEach((c, i) => P.cats[i].forEach((v) => z.push(Number(rec[c]) === v ? 1 : 0)));
    return z;
  }
  function walk(M, t, z, contrib) {
    let n = 0;
    while (t.l[n] !== -1) {
      const nx = z[t.f[n]] <= t.th[n] ? t.l[n] : t.r[n];
      if (contrib) contrib[M._owner[t.f[n]]] += t.p[nx] - t.p[n];
      n = nx;
    }
    return t.p[n];
  }
  function predict(M, rec) {
    const z = vectorize(M, rec), trees = M.models.random_forest.trees;
    const contrib = Object.fromEntries(M._fields.map((f) => [f, 0]));
    let s = 0;
    trees.forEach((t) => (s += walk(M, t, z, contrib)));
    const p = s / trees.length;
    M._fields.forEach((f) => (contrib[f] /= trees.length));
    const lr = M.models.logistic_regression;
    const lrp = 1 / (1 + Math.exp(-(lr.intercept + z.reduce((a, v, i) => a + v * lr.coef[i], 0))));
    const b = M.meta.risk_bands;
    const [level, rec2] = p < b.low_below ? ['Low', 'Approve'] : p < b.high_from ? ['Medium', 'Refer for manual review'] : ['High', 'Reject'];
    const factors = Object.entries(contrib).sort((a, c) => Math.abs(c[1]) - Math.abs(a[1])).slice(0, 5)
      .map(([f, v]) => ({ field: f, name: M.field_names[f] || f, effect: Math.round(v * 1e4) / 1e4,
                          direction: v > 0 ? 'raises risk' : 'lowers risk' }));
    return { probability: p, risk_score: Math.round((1 - p) * 100), risk_level: level, recommendation: rec2,
             base_rate: M._base, factors,
             probabilities: { random_forest: p, logistic_regression: lrp, decision_tree: walk(M, M.models.decision_tree.tree, z) } };
  }

  function installment(amount, rate, term, mode) {
    amount = Number(amount); rate = Number(rate); term = Math.trunc(Number(term));
    if (!(term > 0)) throw new Error('term');
    if ([2, 3].includes(Number(mode))) return Math.round(((amount + amount * rate / 100 * term / 12) / term) * 100) / 100;
    const i = rate / 1200;
    return Math.round((i === 0 ? amount / term : amount * i / (1 - Math.pow(1 + i, -term))) * 100) / 100;
  }

  const RULES = { age: [18, 100], monthly_income: [1, 1e7], credit_amount: [1, 1e7], term_months: [1, 120],
                  interest_rate_pa: [0, 100], monthly_payment: [0, 1e7], current_debt: [0, 1e8],
                  missed_payments_count: [0, 120], late_payment_penalty: [0, 1e7] };
  function validate(M, d) {
    const rec = {}, errors = {};
    Object.entries(RULES).forEach(([f, [lo, hi]]) => {
      if (f === 'monthly_payment' && (d[f] === '' || d[f] == null)) return;
      const v = Number(d[f]);
      if (d[f] === '' || d[f] == null || !isFinite(v)) { errors[f] = 'Enter a number.'; return; }
      if (v < lo || v > hi) errors[f] = `Must be between ${lo.toLocaleString()} and ${hi.toLocaleString()}.`;
      rec[f] = v;
    });
    M.prep.cat_cols.forEach((f, i) => {
      const v = Number(d[f]);
      if (!M.prep.cats[i].includes(v)) errors[f] = 'Choose an option from the list.';
      rec[f] = v;
    });
    if (!Object.keys(errors).length && rec.monthly_payment === undefined)
      rec.monthly_payment = installment(rec.credit_amount, rec.interest_rate_pa, rec.term_months, rec.computation_mode);
    return [rec, errors];
  }

  // Saved assessments stand in for the MySQL tables during the preview
  const KEY = 'dss-preview-assessments';
  const readStore = () => { try { return JSON.parse(sessionStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const writeStore = (v) => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* preview only */ } };
  let memory = readStore();

  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  window.fetch = async function (input, init) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const path = url.pathname.slice(url.pathname.lastIndexOf('/api/'));
    if (!url.pathname.includes('/api/')) return realFetch(input, init);
    const M = await loadModel();
    if (path === '/api/installment') {
      try {
        const q = url.searchParams;
        return json({ ok: true, monthly_payment: installment(q.get('amount'), q.get('rate'), q.get('term'), q.get('mode')) });
      } catch (e) { return json({ ok: false, error: 'Provide amount, rate, term and mode.' }, 400); }
    }
    if (path === '/api/predict') {
      const data = JSON.parse(init.body);
      const [rec, errors] = validate(M, data);
      if (Object.keys(errors).length) return json({ ok: false, errors }, 400);
      rec.dti = rec.monthly_payment / rec.monthly_income;
      const out = predict(M, rec), alerts = [];
      if (rec.dti > 0.4) alerts.push(`Installment takes ${Math.round(rec.dti * 100)}% of monthly income (above the 40% guideline).`);
      if (rec.missed_payments_count >= 3) alerts.push(`${rec.missed_payments_count} missed payments on record.`);
      const id = (memory[0]?.id || 0) + 1;
      const d = new Date(), pad = (n) => String(n).padStart(2, '0');
      memory.unshift({ id, applicant_name: (data.applicant_name || '').trim() || null, product_name: data.product_name || null,
                       credit_amount: rec.credit_amount, term_months: rec.term_months, dti: rec.dti,
                       rf_probability: out.probability, risk_level: out.risk_level, recommendation: out.recommendation,
                       officer: 'System Administrator', created_at: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` });
      memory = memory.slice(0, 50); writeStore(memory);
      return json({ ok: true, application_id: id, saved: true, monthly_payment: rec.monthly_payment, dti: rec.dti, alerts, ...out });
    }
    if (path === '/api/assessments') {
      const limit = Number(url.searchParams.get('limit') || 10);
      return json({ ok: true, saved: true, items: memory.slice(0, limit) });
    }
    return json({ ok: false, error: 'Not found' }, 404);
  };

  // Product links use #ID in the preview (the Flask app uses ?product=ID)
  const pick = decodeURIComponent(location.hash.slice(1));
  const sel = document.getElementById('product_id');
  if (sel && pick && [...sel.options].some((o) => o.value === pick)) sel.value = pick;
})();
