// Settings of the overlay. Edit and reload the overlay in tosu.
//
// Each one can also be given in the overlay's URL, e.g.
//   .../osuskillsgraph/index.html?goosu=http://127.0.0.1:3000&window=250
window.OSUSKILLSGRAPH_CONFIG = {
  // Where go-osu listens (http.port in its config.yml).
  goosu: 'http://127.0.0.1:3000',
  // The curves are thinned to the strongest point per this many milliseconds.
  window: 400,
  // Where tosu's websocket is. Empty: the host the overlay itself is served from.
  tosu: '',
}
