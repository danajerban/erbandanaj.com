// Controls the pre-React #app-loader splash in index.html. The splash exists
// before React mounts, so this bridge is imperative DOM, not React state.

const MIN_DISPLAY_MS = 500;
// covers the 0.2s transition delay + 0.45s fade if transitionend never fires
// (e.g. tab backgrounded mid-fade)
const REMOVE_FALLBACK_MS = 900;
// backstop so the splash can never trap a visitor if the first-frame signal
// is lost (WebGL init failure outside React, permanently hung asset)
const FAILSAFE_MS = 15000;

let hideRequested = false;

export function hideInitialLoader() {
  if (hideRequested) return;
  hideRequested = true;

  const loader = document.getElementById("app-loader");
  if (!loader) return;

  // performance.now() counts from navigation start, which is when the splash
  // first painted — so it doubles as "time shown so far"
  const delay = Math.max(0, MIN_DISPLAY_MS - performance.now());
  window.setTimeout(() => {
    const remove = () => loader.remove();
    loader.addEventListener("transitionend", remove, { once: true });
    window.setTimeout(remove, REMOVE_FALLBACK_MS);
    loader.classList.add("app-loader--hidden");
  }, delay);
}

window.setTimeout(hideInitialLoader, FAILSAFE_MS);

// Live regions don't announce content that already exists at parse time —
// re-populating the label once JS runs is the mutation that makes screen
// readers actually speak the loading state.
const srLabel = document.querySelector("#app-loader .app-loader__sr");
if (srLabel) srLabel.textContent = "Loading 3D scene…";
