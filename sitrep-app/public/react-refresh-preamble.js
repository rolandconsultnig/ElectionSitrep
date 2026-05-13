/* Ensures React Fast Refresh globals exist before any .tsx module runs (avoids race with Vite’s injected preamble). */
;(function () {
  if (typeof window === 'undefined') return
  if (!window.$RefreshReg$) window.$RefreshReg$ = function () {}
  if (!window.$RefreshSig$) window.$RefreshSig$ = function () { return function (type) { return type } }
})()
