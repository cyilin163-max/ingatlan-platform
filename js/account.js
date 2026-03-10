// Tab switching: show panel by hash, update nav active state
function hashFromHref(href) {
  if (!href) return '';
  var idx = href.indexOf('#');
  return idx === -1 ? '' : href.slice(idx + 1);
}

function showPanel(id) {
  document.querySelectorAll('.account-panel').forEach(function (p) {
    p.classList.toggle('active', p.id === id);
  });
  document.querySelectorAll('.account-nav a').forEach(function (a) {
    var idFromLink = hashFromHref(a.getAttribute('href'));
    a.classList.toggle('active', idFromLink === id);
  });
}

var VALID_PANELS = ['listings', 'favorites', 'manage', 'admin'];

function init() {
  var hash = window.location.hash.slice(1) || 'listings';
  if (VALID_PANELS.indexOf(hash) === -1 || !document.getElementById(hash)) {
    hash = 'listings';
  }
  showPanel(hash);
  window.addEventListener('hashchange', function () {
    var id = window.location.hash.slice(1) || 'listings';
    if (VALID_PANELS.indexOf(id) === -1 || !document.getElementById(id)) {
      id = 'listings';
    }
    showPanel(id);
  });
  document.querySelectorAll('.account-nav a').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var href = this.getAttribute('href');
      var id = hashFromHref(href);
      if (id && document.getElementById(id)) {
        showPanel(id);
      }
    });
  });
}
init();
