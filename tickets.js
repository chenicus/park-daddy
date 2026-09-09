// Ticket history layer (Vancouver only) — where enforcement actually lands.
//
// Three years of citations tell you something the meter feed can't: two blocks at the same
// rate are not the same bet. This paints each block by how hard it gets ticketed, so the
// $2 curb that gets written up 2,600 times a year stops looking like a bargain.
//
// Deliberately a SEPARATE lens, not another thing on the price map. Turning it on quiets
// the price layer, because a map answering two questions at once answers neither. Prices
// are still a tap away on any pill.
//
// Data: build-vancouver-tickets.py -> data/vancouver-tickets.json (~260 KB gzipped), so
// it's fetched the first time the layer is switched on, never on boot.

const SRC_LINES = 'ticket-lines';
const SRC_POINTS = 'ticket-points';
const LYR_LINES = 'ticket-lines';
const LYR_SEL = 'ticket-sel';
const LYR_HEAT = 'ticket-heat';

// ---- the ramp ---------------------------------------------------------------
// ONE hue, light->dark. The first version of this ran slate -> indigo -> purple -> fuchsia
// -> pink, which is a rainbow: it spends HUE on magnitude, and four adjacent hues at the
// same lightness read as four unordered categories rather than a scale. At 2-4px stroke
// widths hue is the weakest channel there is and lightness is the strongest, so the map
// came out uniformly violet and you couldn't pick the hot block out of its neighbours.
//
// Hue ~305 (muted purple), and the two numbers that decide it are chroma and distance from
// red. A first pass at 325 with full chroma validated fine on paper and read as BLOOD on the
// actual map — a wine-dark line over a city grid is alarming in a way parking data has no
// business being. Backing the chroma off and rotating away from red gives an aubergine that
// still ramps cleanly but stops shouting. Every step passes monotone lightness, step-gap and
// surface-contrast in its own mode, and clears the price ramp's red by deltaE >= 18.
//
// (Cross-palette collision used to constrain this hard — violet ~290 at full chroma landed on
// the FREE blue at deltaE 12.8. It matters less now: the price markers go MONOCHROME while the
// lens is on, so there is no competing hue on screen to collide with.)
//
// Dark is a SEPARATE ramp with the anchor flipped — light means more against a dark
// basemap — not an inversion of the light one. Both were validated independently.
const RAMP = {
  light: ['#ece2ef', '#c69cd2', '#9c6cae', '#714888', '#472b5c'],
  dark: ['#2a2130', '#5b4166', '#86668f', '#b193ba', '#dcc6e2'],
};
// Width and opacity climb with the band too, so intensity survives greyscale, colour-vision
// deficiency, and a phone in sunlight — the colour is not carrying this alone.
const BAND_WIDTH = [1.2, 1.7, 2.4, 3.2, 4.2];
const BAND_OPACITY = [0.55, 0.6, 0.72, 0.84, 0.95];

// Band 0 is 65% of the city and says only "we have data here, it's quiet". Painting 5,000
// of those across every residential street is what made the whole map look covered. It is
// the near-zero step, so it recedes to the surface — and it only appears once you're
// inspecting a single street, where "quiet" is worth knowing.
const QUIET_Z = 16;

// Below this the lines are hairlines on a city-wide view and the shape is better told as
// a blur; above it the blur is a smear and you want the actual curb. They overlap by a
// zoom level so the handover is a crossfade, not a swap.
const HEAT_MAX_Z = 15.2;
const LINE_MIN_Z = 14.2;

// w0 sentinels. -1 = in force round the clock; -2 = set by a posted sign we can't read.
const WIN_ALWAYS = -1;
const WIN_SIGN = -2;

const EMPTY = { type: 'FeatureCollection', features: [] };

// step through the five bands off the `b` property the build script bakes in
const byBand = (values) => {
  const out = ['step', ['get', 'b'], values[0]];
  for (let i = 1; i < values.length; i++) out.push(i, values[i]);
  return out;
};

export function createTicketLayer(map, { url, onTap, onLoadError }) {
  let data = null;          // parsed json, once fetched
  let lines = EMPTY, points = EMPTY;
  let on = false;
  let loading = null;       // in-flight fetch, so a double-tap doesn't fetch twice
  let selected = null;      // block name ('h') of the open card
  let available = false;    // is this city covered?
  // Minutes past midnight the map is currently showing — the app's arrival time, not the
  // wall clock, so a planned 8pm trip re-lights the map for 8pm. 720 until app.js says.
  let clock = 720;

  function toFeatures(json) {
    const ln = [], pt = [];
    for (const b of json.blocks) {
      // w0/w1 absent means "depends on a posted sign" — a real answer, not missing data,
      // so it gets its own sentinel rather than being folded in with the 24/7 blocks.
      const props = {
        h: b.h, n: b.n, d: b.d, b: b.b, r: b.r || '',
        w0: b.w0 ?? WIN_SIGN, w1: b.w1 ?? WIN_SIGN,
        dw: b.dw ? b.dw.join(',') : '', mo: b.mo ? b.mo.join(',') : '',
      };
      ln.push({ type: 'Feature', properties: props,
        geometry: { type: 'MultiLineString', coordinates: b.g } });
      // One weighted point per block feeds the zoomed-out blur — but only blocks that
      // actually run hot. Feeding it all 8,000 blocks paints the whole city magenta:
      // "rarely ticketed" is most of Vancouver, and a blur sums its neighbours, so the
      // quiet majority drowns out the thing the layer exists to show.
      if (b.b > 0) {
        pt.push({ type: 'Feature', properties: { d: b.d, w0: b.w0 ?? WIN_SIGN, w1: b.w1 ?? WIN_SIGN },
          geometry: { type: 'Point', coordinates: b.c } });
      }
    }
    return [{ type: 'FeatureCollection', features: ln },
            { type: 'FeatureCollection', features: pt }];
  }

  async function load() {
    if (data) return data;
    if (loading) return loading;
    loading = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((json) => {
        data = json;
        [lines, points] = toFeatures(json);
        push();
        return json;
      })
      .catch((e) => { loading = null; onLoadError?.(e); throw e; });
    return loading;
  }

  function push() {
    map.getSource(SRC_LINES)?.setData(lines);
    map.getSource(SRC_POINTS)?.setData(points);
  }

  /** Which ramp the basemap wants. Read fresh on every install, because a theme swap
   *  reloads the style and re-runs install anyway. */
  const ramp = () => RAMP[document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'];

  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  // Is this block's rule capable of being enforced at `clock`?
  //
  // This is the honest substitute for the thing that can't be built. The citation feed has
  // no time of day and enforcement rosters aren't published, so "when do they ticket" is
  // unanswerable — but a ticket can only be WRITTEN while the rule it cites is in force,
  // and we know each block's dominant rule. An expired meter is impossible at 3am.
  //
  // Unknown (WIN_SIGN) stays lit: not knowing a window is not evidence there isn't one,
  // and dimming on that basis would be a claim we can't support.
  // to-number is not decoration: this same expression is used as a LAYER FILTER on the heat
  // layer, and a filter type-checks harder than paint does — comparing a raw ['get'] (type
  // `value`) against a number throws at addLayer and takes the whole boot down with it.
  const W0 = ['to-number', ['get', 'w0']];
  const W1 = ['to-number', ['get', 'w1']];
  const inForce = () => ['any',
    ['<', W0, 0],                                              // always-on, or sign-unknown
    ['all', ['<', W0, W1],                                     // ordinary daytime window
      ['>=', clock, W0], ['<', clock, W1]],
    ['all', ['>', W0, W1],                                     // wraps midnight (10pm-6am)
      ['any', ['>=', clock, W0], ['<', clock, W1]]],
  ];
  // Asleep right now: drawn, because the block still exists and still has a history, but
  // demoted out of the ramp so it can't be mistaken for a live risk.
  const DORMANT_OPACITY = 0.26;
  const live = (expr) => ['case', inForce(), expr, DORMANT_OPACITY];

  // Full band opacity, but band 0 held at zero until you're inspecting one street, and
  // everything faded out at the bottom of the range where the blur takes over.
  //
  // Has to be ONE top-level interpolate on zoom: MapLibre rejects a `zoom` expression
  // nested inside anything else ("may only be used as input to a top-level step or
  // interpolate"). So zoom drives the stops and the per-band decision rides in the
  // OUTPUTS, which are allowed to be data expressions.
  const opacityExpr = () => {
    const full = live(byBand(BAND_OPACITY));
    const withoutQuiet = ['case', ['==', ['get', 'b'], 0], 0, full];
    return ['interpolate', ['linear'], ['zoom'],
      LINE_MIN_Z, 0,
      HEAT_MAX_Z, withoutQuiet,
      QUIET_Z - 0.3, withoutQuiet,
      QUIET_Z + 0.2, full,
    ];
  };
  // Dormant blocks fall out of the ramp entirely and wear the quiet step, so the map at
  // 11pm reads "these are the ones that still bite" rather than a dimmer version of noon.
  const colorExpr = (C) => ['case', inForce(), byBand(C), C[0]];

  // Re-run on every style load: a theme swap wipes custom sources and layers, exactly
  // like the price layers in app.js.
  /** Where the basemap's label stack begins. We insert BELOW it, so street and place names
   *  stay legible on top of the wash — a map you can't read the street names on has stopped
   *  telling you where anything is.
   *
   *  NOT simply "the first symbol layer": Positron puts a lone `waterway_label` at index 13,
   *  ahead of fifty-odd road layers, so anchoring there drops the lines UNDERNEATH every road
   *  fill and they vanish. The labels that matter are the contiguous run at the END of the
   *  style, so we walk back from the bottom instead.
   *
   *  Our own layers are skipped by source type — everything the app adds is geojson, every
   *  basemap layer is vector — because installLayers() has already appended a couple of ours
   *  past the end by the time this runs, which would break the walk-back. */
  function labelAnchor() {
    const style = map.getStyle();
    if (!style) return undefined;
    const layers = style.layers.filter((l) => style.sources?.[l.source]?.type !== 'geojson');
    let i = layers.length;
    while (i > 0 && layers[i - 1].type === 'symbol') i--;
    return layers[i]?.id;
  }

  function install() {
    const beforeLabels = labelAnchor();
    if (!map.getSource(SRC_LINES)) map.addSource(SRC_LINES, { type: 'geojson', data: lines });
    if (!map.getSource(SRC_POINTS)) map.addSource(SRC_POINTS, { type: 'geojson', data: points });
    const C = ramp();

    if (!map.getLayer(LYR_HEAT)) map.addLayer({
      id: LYR_HEAT, type: 'heatmap', source: SRC_POINTS, maxzoom: HEAT_MAX_Z + 0.5,
      layout: { visibility: on ? 'visible' : 'none' },
      filter: inForce(),        // the blur and the lines have to agree about "now"

      paint: {
        // Density spans three orders of magnitude, so the stops climb like a log scale —
        // a linear ramp leaves everything but downtown at zero. Weights stay small
        // because a blur ADDS overlapping points: give each one a fair-looking 0.3 and
        // any ordinary commercial strip saturates to full red.
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'd'],
          10, 0.03, 50, 0.12, 200, 0.4, 800, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 15, 1.15],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 11, 15, 30],
        // Same four steps as the lines, so zooming in doesn't change what the colour
        // means — only how precisely it's placed. Transparent at the bottom so the map
        // keeps reading through: a wash over streets, not a replacement for them.
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
          0, rgba(C[1], 0), 0.25, rgba(C[1], 0.3),
          0.5, rgba(C[2], 0.48), 0.75, rgba(C[3], 0.62),
          1, rgba(C[4], 0.78)],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], HEAT_MAX_Z - 1.5, 0.95, HEAT_MAX_Z + 0.4, 0],
      },
    }, beforeLabels);

    if (!map.getLayer(LYR_LINES)) map.addLayer({
      id: LYR_LINES, type: 'line', source: SRC_LINES, minzoom: LINE_MIN_Z,
      layout: { visibility: on ? 'visible' : 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': colorExpr(C),
        'line-width': ['interpolate', ['linear'], ['zoom'],
          LINE_MIN_Z, ['*', byBand(BAND_WIDTH), 0.75],
          16, byBand(BAND_WIDTH),
          18, ['*', byBand(BAND_WIDTH), 1.35]],
        'line-opacity': opacityExpr(),
      },
    }, beforeLabels);

    // The tapped block, redrawn on top as a solid casing. Its own layer rather than a
    // paint override so the ramp above stays one readable expression.
    if (!map.getLayer(LYR_SEL)) map.addLayer({
      id: LYR_SEL, type: 'line', source: SRC_LINES, minzoom: LINE_MIN_Z,
      layout: { visibility: on ? 'visible' : 'none', 'line-cap': 'round', 'line-join': 'round' },
      filter: ['==', ['get', 'h'], selected ?? ' '],
      paint: {
        'line-color': byBand(C),
        'line-width': ['interpolate', ['linear'], ['zoom'],
          LINE_MIN_Z, ['+', byBand(BAND_WIDTH), 2],
          18, ['+', ['*', byBand(BAND_WIDTH), 1.6], 3]],
        'line-opacity': 1,
      },
    }, beforeLabels);
  }

  /** Re-light the map for a different time. Rebuilds the paint expressions with the
   *  minute baked in as a literal — MapLibre expressions can't read an outside variable,
   *  but re-issuing them is cheap: no setData, no re-upload of 8,000 features. */
  function setClock(mins) {
    if (mins === clock) return;
    clock = mins;
    if (!map.getLayer(LYR_LINES)) return;
    const C = ramp();
    map.setPaintProperty(LYR_LINES, 'line-color', colorExpr(C));
    map.setPaintProperty(LYR_LINES, 'line-opacity', opacityExpr());
    if (map.getLayer(LYR_HEAT)) map.setFilter(LYR_HEAT, inForce());
  }

  function setVisible(v) {
    for (const id of [LYR_HEAT, LYR_LINES, LYR_SEL]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none');
    }
  }

  function applySelection() {
    if (map.getLayer(LYR_SEL)) {
      map.setFilter(LYR_SEL, ['==', ['get', 'h'], selected ?? ' ']);
    }
  }

  // A tap anywhere near a line, not dead on it — these are 2-6px strokes on a phone.
  const PAD = 8;
  function hit(e) {
    if (!on || map.getZoom() < LINE_MIN_Z || !map.getLayer(LYR_LINES)) return null;
    const { x, y } = e.point;
    const f = map.queryRenderedFeatures(
      [[x - PAD, y - PAD], [x + PAD, y + PAD]], { layers: [LYR_LINES] });
    return f.length ? f[0].properties : null;
  }

  function onClick(e) {
    if (!on) return;
    // Price pills are HTML markers living inside the canvas container, so their clicks bubble
    // up and MapLibre reports them as map clicks too. A pill tap is a question about price;
    // it isn't ours to answer, and answering it would fight showSpotCard for the screen.
    if (e.originalEvent?.target?.closest?.('.maplibregl-marker')) return;
    const p = hit(e);
    selected = p ? p.h : null;
    applySelection();
    // A miss is a real answer: tapping the map away from any line dismisses the card, the
    // same gesture that dismisses every other sheet in the app.
    onTap?.(p);
  }

  map.on('click', onClick);
  // A pointer over a tappable line should say so on desktop. Layer-scoped rather than a
  // bare 'mousemove' + hit test: MapLibre resolves these off the render tree it already
  // has, instead of running a fresh 8,000-feature query on every pixel of pointer travel.
  const cursor = (v) => { map.getCanvas().style.cursor = v; };
  map.on('mouseenter', LYR_LINES, () => { if (on) cursor('pointer'); });
  map.on('mouseleave', LYR_LINES, () => cursor(''));

  return {
    install,
    setClock,
    /** Vancouver is the only city with the citation feed — the chip hides elsewhere. */
    setAvailable(v) {
      available = v;
      if (!v && on) this.set(false);
    },
    isAvailable: () => available,
    isOn: () => on,
    /** Turn the lens on/off. Returns a promise that settles once data is on screen. */
    async set(v) {
      on = !!v && available;
      document.body.classList.toggle('tickets', on);
      setVisible(on);
      if (!on) { this.clearSelection(); return; }
      try { await load(); } catch { on = false; document.body.classList.remove('tickets'); setVisible(false); }
    },
    clearSelection() { selected = null; applySelection(); },
    /** meta from the data file, once loaded — used for the "based on…" footnote */
    meta: () => data?.meta || null,
  };
}
