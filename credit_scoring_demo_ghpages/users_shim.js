// Preview only: imitates the account pages' server actions in the browser.
(function () {
  var REQ = 'dss-preview-requests';
  function readReqs() { try { return JSON.parse(sessionStorage.getItem(REQ)) || []; } catch (e) { return []; } }
  function writeReqs(v) { try { sessionStorage.setItem(REQ, JSON.stringify(v)); } catch (e) { /* preview only */ } }
  var nextId = 100;

  function check(form, needRole) {
    var v = {
      full_name: form.full_name.value.trim().replace(/\s+/g, ' '),
      username: form.username.value.trim(),
      password: form.password.value,
      confirm: form.confirm.value,
      role: form.role ? form.role.value : 'officer'
    }, e = {};
    if (!v.full_name) e.full_name = 'Enter the full name.';
    if (!/^[A-Za-z0-9._-]{3,50}$/.test(v.username)) e.username = '3–50 characters: letters, numbers, dot, dash or underscore.';
    if (v.password.length < 8) e.password = 'Use at least 8 characters.';
    else if (v.password !== v.confirm) e.confirm = 'The passwords do not match.';
    var taken = Array.from(document.querySelectorAll('.font-mono')).some(function (el) { return el.textContent.trim().split(' ')[0] === v.username; })
      || v.username === 'admin' || readReqs().some(function (r) { return r.username === v.username; });
    if (!e.username && taken) e.username = 'That username is already taken.';
    form.querySelectorAll('.preview-err').forEach(function (n) { n.remove(); });
    form.querySelectorAll('.input-invalid').forEach(function (n) { n.classList.remove('input-invalid'); });
    Object.keys(e).forEach(function (k) {
      var input = form[k]; input.classList.add('input-invalid');
      var s = document.createElement('small'); s.className = 'field-error preview-err'; s.textContent = e[k];
      input.insertAdjacentElement('afterend', s);
    });
    return Object.keys(e).length ? null : v;
  }

  function flash(msg, isError) {
    var box = document.querySelector('main .grid.gap-2');
    if (!box) return;
    var p = document.createElement('p');
    p.className = isError ? 'alert' : 'notice-info';
    p.setAttribute('role', 'alert');
    p.textContent = msg;
    box.replaceChildren(p);
    box.scrollIntoView({ block: 'nearest' });
  }

  // ---------------- Request an account page
  var reg = document.querySelector('[data-preview-register]');
  if (reg) {
    reg.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = check(reg);
      if (!v) return;
      var list = readReqs();
      list.push({ full_name: v.full_name, username: v.username, at: new Date().toISOString() });
      writeReqs(list);
      var done = document.createElement('div');
      done.className = 'notice-info mt-4';
      done.innerHTML = 'Request sent for <b></b>. You can sign in once an administrator approves it. ' +
        '<br><span class="text-xs">In this preview, sign in as admin (password admin) and open <b>Users</b> to see the request.</span>';
      done.querySelector('b').textContent = v.username;
      reg.replaceWith(done);
    });
    return;
  }

  // ---------------- Users page
  var cards = document.querySelector('main ul.grid.gap-3');
  var reqSection = document.querySelectorAll('main section')[1];
  var tbody = document.querySelector('.users-table tbody');
  var csrf = (document.querySelector('input[name=csrf_token]') || {}).value || '';

  function actionForm(id, name, label, cls) {
    return '<form method="post" action="/users/' + id + '/' + name + '"><input type="hidden" name="csrf_token" value="' + csrf +
      '"><button type="submit" class="' + (cls || 'btn-ghost') + ' btn-sm">' + label + '</button></form>';
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function addRow(id, name, username, role, status) {
    var tr = document.createElement('tr');
    tr.innerHTML = '<td><span class="block">' + esc(name) + '</span><span class="block text-xs text-slate-500 font-mono">' + esc(username) + '</span></td>' +
      '<td>' + (role === 'admin' ? 'Administrator' : 'Loan officer') + '</td>' +
      '<td><span class="pill pill-low">' + status + '</span></td><td>Never</td>' +
      '<td><div class="flex flex-wrap gap-2 justify-end items-start">' + actionForm(id, 'disable', 'Disable') +
      '<details class="reset"><summary class="btn-ghost btn-sm">Reset password</summary><form method="post" action="/users/' + id +
      '/password" class="reset-form"><input type="hidden" name="csrf_token" value="' + csrf + '"><input name="password" type="text" class="input" minlength="8" placeholder="New password (8+ characters)" required autocomplete="off"><button type="submit" class="btn-primary btn-sm">Save</button></form></details></div></td>';
    tbody.appendChild(tr);
  }
  function ensureList() {
    if (!cards) {
      cards = document.createElement('ul');
      cards.className = 'grid gap-3 mt-4';
      var empty = reqSection.querySelector('p');
      if (empty) empty.replaceWith(cards); else reqSection.appendChild(cards);
    }
    return cards;
  }
  function addCard(id, name, username, when) {
    var li = document.createElement('li');
    li.className = 'card p-4 flex flex-wrap items-center justify-between gap-3 request-card';
    li.innerHTML = '<div class="min-w-0"><p class="font-semibold">' + esc(name) + '</p><p class="text-sm text-slate-500"><span class="font-mono">' +
      esc(username) + '</span> · requested ' + when + '</p></div><div class="flex gap-2">' + actionForm(id, 'approve', 'Approve', 'btn-primary') +
      actionForm(id, 'reject', 'Reject') + '</div>';
    li.dataset.previewUser = username;
    ensureList().appendChild(li);
  }
  function syncBadge() {
    var n = cards ? cards.children.length : 0, link = document.querySelector('a[href="users.html"]');
    var badge = link && link.querySelector('.badge');
    if (!n && badge) badge.remove();
    else if (n) { if (!badge) { badge = document.createElement('span'); badge.className = 'badge'; link.appendChild(badge); } badge.textContent = n; }
    if (cards && !n) {
      var p = document.createElement('p');
      p.className = 'text-sm text-slate-500 mt-3';
      p.innerHTML = 'No requests right now. New loan officers can use <b>Request an account</b> on the sign-in page.';
      cards.replaceWith(p); cards = null;
    }
  }

  readReqs().forEach(function (r) {
    addCard(nextId++, r.full_name, r.username, new Date(r.at).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }));
  });
  syncBadge();

  document.addEventListener('submit', function (ev) {
    var form = ev.target, action = form.getAttribute('action') || '';
    if (action === '/logout') return;
    ev.preventDefault();
    var m = action.match(/\/users\/(\d+)\/(\w+)/);
    if (!m) {                                   // Add an account
      var v = check(form, true);
      if (!v) return;
      addRow(nextId++, v.full_name, v.username, v.role, 'active');
      form.reset();
      flash('Created account "' + v.username + '". They can sign in now.');
      return;
    }
    var id = m[1], act = m[2], holder = form.closest('li, tr');
    if (act === 'approve' || act === 'reject') {
      var name = holder.querySelector('.font-semibold').textContent, username = holder.querySelector('.font-mono').textContent;
      writeReqs(readReqs().filter(function (r) { return r.username !== username; }));
      holder.remove();
      if (act === 'approve') { addRow(id, name, username, 'officer', 'active'); flash('Account activated.'); }
      else flash('Request rejected and removed.');
      syncBadge();
    } else if (act === 'disable' || act === 'enable') {
      var pill = holder.querySelector('.pill'), on = act === 'enable';
      pill.className = 'pill ' + (on ? 'pill-low' : 'pill-high');
      pill.textContent = on ? 'active' : 'disabled';
      form.outerHTML = on ? actionForm(id, 'disable', 'Disable') : actionForm(id, 'enable', 'Enable', 'btn-primary');
      flash(on ? 'Account activated.' : 'Account disabled. That person can no longer sign in.');
    } else if (act === 'password') {
      if (form.password.value.length < 8) { flash('New password must be at least 8 characters.', true); return; }
      form.closest('details').open = false; form.reset();
      flash('Password changed. Give the new password to the account owner.');
    }
  });
})();
