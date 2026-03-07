(function () {
  var toggle = document.querySelector('.nav-toggle');
  if (!toggle) return;
  function open() {
    document.body.classList.add('menu-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.textContent = '✕';
  }
  function close() {
    document.body.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = '☰';
  }
  toggle.addEventListener('click', function () {
    if (document.body.classList.contains('menu-open')) close();
    else open();
  });
  document.querySelectorAll('.site-header .nav-main a, .site-header .nav-actions a').forEach(function (a) {
    a.addEventListener('click', close);
  });
})();
