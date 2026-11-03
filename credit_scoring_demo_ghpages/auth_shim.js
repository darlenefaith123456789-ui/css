// Preview only: stands in for Flask's sign-in and My account page, since this page has no server.
(function () {
  var KEY = 'dss-preview-user', PROFILE = 'dss-preview-profile';
  var store = null;
  try { store = window.sessionStorage; store.getItem(KEY); } catch (e) { store = null; }
  var get = function (k) { try { return store && store.getItem(k); } catch (e) { return null; } };
  var set = function (k, v) { try { store && store.setItem(k, v); } catch (e) { /* preview only */ } };
  var profile = (function () {
    try { return JSON.parse(get(PROFILE)) || null; } catch (e) { return null; }
  })() || { username: 'admin', password: 'admin', full_name: 'Administrator' };
  var saveProfile = function () { set(PROFILE, JSON.stringify(profile)); };

  var signedIn = function () { return !store || get(KEY) === '1'; };
  var isLogin = !!window.PREVIEW_LOGIN_PAGE;
  if (!isLogin && !signedIn()) { location.replace('index.html'); return; }
  if (isLogin && store && get(KEY) === '1') { location.replace('home.html'); return; }

  function flash(msg, isError) {
    var box = document.querySelector('main .grid.gap-2');
    if (!box) return;
    var p = document.createElement('p');
    p.className = isError ? 'alert' : 'notice-info';
    p.setAttribute('role', 'alert');
    p.textContent = msg;
    box.querySelectorAll('.notice-info, .preview-flash').forEach(function (n) { n.remove(); });
    p.classList.add('preview-flash');
    box.prepend(p);
  }
  function fieldErrors(form, errors) {
    form.querySelectorAll('.preview-err').forEach(function (n) { n.remove(); });
    form.querySelectorAll('.input-invalid').forEach(function (n) { n.classList.remove('input-invalid'); });
    Object.keys(errors).forEach(function (k) {
      var input = form.elements[k];
      input.classList.add('input-invalid');
      var s = document.createElement('small');
      s.className = 'field-error preview-err';
      s.textContent = errors[k];
      input.insertAdjacentElement('afterend', s);
    });
    return Object.keys(errors).length === 0;
  }
  function applyProfile() {
    var nav = document.querySelector('.account-link .font-semibold');
    if (nav) nav.textContent = profile.full_name;
    if (profile.password !== 'admin') {
      document.querySelectorAll('.default-pw-bar, .card-attention').forEach(function (n) {
        if (n.classList.contains('card-attention')) n.classList.remove('card-attention'); else n.remove();
      });
      document.querySelectorAll('main .alert').forEach(function (n) { if (/default password/.test(n.textContent)) n.remove(); });
    }
    var f = document.querySelector('input[name=section][value=profile]');
    if (f) { f.form.full_name.value = profile.full_name; f.form.username.value = profile.username; }
  }

  document.addEventListener('DOMContentLoaded', function () {
    applyProfile();

    var login = document.querySelector('[data-preview-login]');
    if (login) {
      login.addEventListener('submit', function (e) {
        e.preventDefault();
        var u = login.username.value.trim(), p = login.password.value;
        var box = document.getElementById('preview-error');
        if (u === profile.username && p === profile.password) {
          set(KEY, '1');
          location.href = 'home.html';
        } else {
          box.textContent = !u || !p ? 'Enter your username and password.' : 'Incorrect username or password.';
          box.hidden = false;
        }
      });
    }

    document.querySelectorAll('form').forEach(function (f) {
      if (f.getAttribute('action') === '/logout') {
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          try { store && store.removeItem(KEY); } catch (err) { /* preview only */ }
          location.href = 'index.html';
        });
      }
      var section = f.querySelector('input[name=section]');
      if (!section) return;
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var errors = {};
        if (section.value === 'profile') {
          var name = f.full_name.value.trim().replace(/\s+/g, ' '), user = f.username.value.trim();
          if (!name) errors.full_name = 'Enter your full name.';
          if (!/^[A-Za-z0-9._-]{3,50}$/.test(user)) errors.username = '3–50 characters: letters, numbers, dot, dash or underscore.';
          if (!fieldErrors(f, errors)) return;
          profile.full_name = name; profile.username = user; saveProfile(); applyProfile();
          flash('Your name and username were updated. Use the new username next time you sign in.');
        } else {
          var cur = f.current_password.value, nw = f.new_password.value, cf = f.confirm_password.value;
          if (cur !== profile.password) errors.current_password = 'This is not your current password.';
          if (nw.length < 8) errors.new_password = 'Use at least 8 characters.';
          else if (nw === cur) errors.new_password = 'Choose a password different from the current one.';
          else if (nw !== cf) errors.confirm_password = 'The passwords do not match.';
          if (!fieldErrors(f, errors)) return;
          profile.password = nw; saveProfile(); f.reset(); applyProfile();
          flash('Password changed. Use the new password next time you sign in.');
        }
      });
    });
  });
})();
