// Runtime settings. The mobile build (scripts/build-app.mjs) rewrites this file.
export const CONFIG = {
  // Where the SelokBelok server lives. '' means the same origin as this page.
  // null means no server: search and routing go straight to the public map
  // services, and reports are kept on this device only.
  apiUrl: '',
  tileUrl: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
};
