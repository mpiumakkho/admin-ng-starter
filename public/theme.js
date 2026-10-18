// Run by index.html before anything else is drawn, as a file rather than inline so the Content-Security-Policy
// can allow scripts from the app's own files only (deploy/nginx.conf).
// Pick the theme before the first paint: the saved choice, else the system setting
(function () {
  var theme = null;
  try { theme = localStorage.getItem('theme'); } catch (e) { /* storage unavailable */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  if (theme === 'dark') {
    document.body.classList.replace('theme-light', 'theme-dark');
    document.documentElement.style.colorScheme = 'dark';
  }
  // The accessible view (UiAccessibleViewService), also before the first paint
  var accessible = null;
  try { accessible = localStorage.getItem('accessible-view'); } catch (e) { /* storage unavailable */ }
  if (accessible === '1') {
    document.body.classList.add('ui-aaa');
  }
  // The size of the whole UI (UiScaleService), also before the first paint
  var scale = null;
  try { scale = localStorage.getItem('ui-scale'); } catch (e) { /* storage unavailable */ }
  if (scale === '1.1' || scale === '1.25') {
    document.documentElement.style.setProperty('--ui-zoom', scale);
  }
  // Someone signed in last time, opening a page of the app: its frame stands in for the spinner while the
  // session and the data load (AppComponent keeps the flag)
  var signedIn = null;
  try { signedIn = localStorage.getItem('app-signed-in'); } catch (e) { /* storage unavailable */ }
  var plainPages = /^\/(login|forgot-password|activate|reset-password|setup-two-factor|error-pages)(\/|$)/;
  if (signedIn === '1' && !plainPages.test(location.pathname)) {
    document.body.classList.add('booting-signed-in');
  }
})();
