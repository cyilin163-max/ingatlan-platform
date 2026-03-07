/**
 * 全站头部登录态：根据 /api/me 切换「登录」与「我的账户 + 退出」
 */
(function () {
  var api = window.INGATLAN_API;
  var navActions = document.querySelector('.site-header .nav-actions');
  if (!navActions) return;
  var publishCta = navActions.querySelector('a[data-i18n="navPostAd"], a[data-i18n="navPostAdPending"]');

  var guestEls = navActions.querySelectorAll('[data-auth="guest"]');
  var userEls = navActions.querySelectorAll('[data-auth="user"]');
  if (!guestEls.length || !userEls.length) return;

  var apiBase = (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '3000')) ? 'http://localhost:3000' : '';
  var defaultPublishHref = publishCta ? publishCta.getAttribute('href') : '';
  var publishUrl = (apiBase || '') + '/publish.html';

  function t(key, fallback) {
    return (window.i18n && window.i18n.t) ? window.i18n.t(key) : (fallback || key);
  }

  function setPublishCtaState(key, text, href, title) {
    if (!publishCta) return;
    publishCta.setAttribute('data-i18n', key);
    publishCta.textContent = text;
    publishCta.setAttribute('href', href);
    if (title) publishCta.setAttribute('title', title);
    else publishCta.removeAttribute('title');
  }

  function showGuest() {
    guestEls.forEach(function (el) { el.style.display = ''; });
    userEls.forEach(function (el) { el.style.display = 'none'; });
    setPublishCtaState('navPostAd', t('navPostAd', '发布房源'), defaultPublishHref || ((apiBase || '') + '/account.html#publish'));
  }
  function showUser() {
    guestEls.forEach(function (el) { el.style.display = 'none'; });
    userEls.forEach(function (el) { el.style.display = ''; });
  }

  userEls.forEach(function (el) { el.style.display = 'none'; });

  fetch(apiBase + '/api/me', { credentials: 'include' })
    .then(function (r) {
      if (r.ok) {
        return r.json().then(function (data) {
          if (api && api.setCurrentUser && data && data.user) api.setCurrentUser(data.user);
          showUser();
          if (publishCta) {
            if (data && data.user && data.user.canPublish) {
              setPublishCtaState('navPostAd', t('navPostAd', '发布房源'), publishUrl);
            } else {
              setPublishCtaState('navPostAdPending', t('navPostAdPending', '等待审批'), publishUrl, t('publishApprovalRequired', '你的账号已注册，等待管理员批准后才能发布房源。'));
            }
          }
          var logoutBtn = navActions.querySelector('#header-logout-btn');
          if (logoutBtn && !logoutBtn._bound) {
            logoutBtn._bound = true;
            logoutBtn.addEventListener('click', function () {
              fetch(apiBase + '/api/logout', { method: 'POST', credentials: 'include' })
                .then(function () {
                  if (api && api.clearCurrentUser) api.clearCurrentUser();
                  window.location.href = (apiBase || '') + '/index.html';
                })
                .catch(function () {
                  if (api && api.clearCurrentUser) api.clearCurrentUser();
                  window.location.href = (apiBase || '') + '/index.html';
                });
            });
          }
        });
      } else {
        if (api && api.clearCurrentUser) api.clearCurrentUser();
        showGuest();
      }
    })
    .catch(function () { showGuest(); });
})();
