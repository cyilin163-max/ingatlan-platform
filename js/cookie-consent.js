(function () {
  var KEY = 'ingatlan_cookie_consent';
  var bar = document.getElementById('cookie-consent');
  var acceptBtn = document.getElementById('cookie-accept');
  var settingsBtn = document.getElementById('cookie-settings');

  function hasConsent() {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function setConsent() {
    try {
      localStorage.setItem(KEY, '1');
    } catch (e) {}
    if (bar) bar.hidden = true;
  }

  if (!bar) return;
  if (hasConsent()) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;

  if (acceptBtn) acceptBtn.addEventListener('click', setConsent);
  if (settingsBtn) {
    settingsBtn.addEventListener('click', function () {
      setConsent();
    });
  }
})();
