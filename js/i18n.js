(function () {
  var STORAGE_KEY = 'ingatlan-lang';
  var defaultLang = 'zh';
  var supported = ['zh', 'en', 'hu'];

  function getLang() {
    var stored = localStorage.getItem(STORAGE_KEY);
    return supported.indexOf(stored) >= 0 ? stored : defaultLang;
  }

  function setLang(lang) {
    if (supported.indexOf(lang) < 0) return;
    localStorage.setItem(STORAGE_KEY, lang);
    window.__ingatlanLang = lang;
    applyTranslations();
    if (document.documentElement) document.documentElement.lang = lang === 'zh' ? 'zh-CN' : (lang === 'hu' ? 'hu' : 'en');
  }

  function t(key, params) {
    var tr = window.TRANSLATIONS && window.TRANSLATIONS[getLang()];
    var str = (tr && tr[key]) || key;
    if (params) {
      Object.keys(params).forEach(function (k) {
        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
      });
    }
    return str;
  }

  function applyTranslations() {
    if (!window.TRANSLATIONS) return;
    var lang = getLang();
    var tr = window.TRANSLATIONS[lang];
    if (!tr) return;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var val = tr[key];
      if (val != null) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      var val = tr[key];
      if (val != null) el.placeholder = val;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-title');
      var val = tr[key];
      if (val != null) el.setAttribute('title', val);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-aria-label');
      var val = tr[key];
      if (val != null) el.setAttribute('aria-label', val);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      var val = tr[key];
      if (val != null) el.innerHTML = val;
    });
    document.querySelectorAll('[data-i18n-subtitle]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-subtitle');
      var val = tr[key];
      if (val != null) el.textContent = (val + '').replace(/\{count\}/g, el.dataset.count || '0');
    });

    var langSwitcher = document.querySelector('.lang-switcher');
    if (langSwitcher) {
      langSwitcher.innerHTML = supported.map(function (l) {
        var label = (window.TRANSLATIONS[l] && window.TRANSLATIONS[l].langName) || l;
        return '<button type="button" class="lang-btn' + (l === lang ? ' active' : '') + '" data-lang="' + l + '">' + label + '</button>';
      }).join('');
      langSwitcher.querySelectorAll('.lang-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          setLang(btn.getAttribute('data-lang'));
        });
      });
    }
  }

  window.__ingatlanLang = getLang();
  window.i18n = { getLang: getLang, setLang: setLang, t: t, apply: applyTranslations };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : (getLang() === 'hu' ? 'hu' : 'en');
      applyTranslations();
    });
  } else {
    document.documentElement.lang = getLang() === 'zh' ? 'zh-CN' : (getLang() === 'hu' ? 'hu' : 'en');
    applyTranslations();
  }
})();
