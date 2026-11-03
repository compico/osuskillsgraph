// Settings of the overlay. Edit and reload the overlay in tosu.
//
// Each one can also be given in the overlay's URL, e.g.
//   .../osuskillsgraph/index.html?goosu=http://127.0.0.1:3000&window=250
window.OSUSKILLSGRAPH_CONFIG = {
  // Where go-osu listens (http.port in its config.yml).
  goosu: 'http://127.0.0.1:3000',
  // Width in milliseconds of the windows the curves are made of: each window is
  // one point, the hardest moment in it. Smaller is noisier.
  window: 5000,
  // Where tosu's websocket is. Empty: the host the overlay itself is served from.
  tosu: '',
}
