'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useRef } from 'react';
import { addProtocol, GeolocateControl, Map as MlMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type LngLatBoundsLike, type MapLayerMouseEvent, type MapMouseEvent, type StyleSpecification } from 'maplibre-gl';
import type { Cestica } from '@/lib/db';
import { useMapStore, type Overlay } from '@/stores/mapStore';
import { bojaCestice } from '../boje';
import { version as MAPLIBRE_VERZIJA } from 'maplibre-gl/package.json';

// Worker se poslužuje iz public/ (scripts/kopiraj-maplibre-worker.mjs) — bundler ga ne kopira sam
if (typeof window !== 'undefined') {
  setWorkerUrl(`${window.location.origin}/maplibre/${MAPLIBRE_VERZIJA}/maplibre-gl-worker.mjs`);
  // Pločice se dohvaćaju u GLAVNOJ niti (addProtocol), ne u MapLibre workeru — samo tako ih service worker
  // vidi i sprema, pa satelitska podloga polja koja si gledao radi i bez signala (Faza 3.2).
  addProtocol('plocica', async (params, abort) => {
    const r = await fetch(params.url.replace('plocica://', 'https://'), { signal: abort.signal });
    if (!r.ok) throw new Error(`pločica ${r.status}`);
    return { data: await r.arrayBuffer() };
  });
}

// Satelitska podloga kao u v1 (Esri World Imagery) + nazivi mjesta (Esri Reference)
const STIL: StyleSpecification = {
  version: 8,
  sources: {
    satelit: {
      type: 'raster',
      tiles: ['plocica://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      // Esri za Slavoniju ima snimke do z18; z19 je siva pločica "Map data not yet available".
      // maxzoom 18 → MapLibre dalje uvećava z18 (mutnije, ali prava snimka).
      maxzoom: 18,
      attribution: 'Snimke i nazivi © Esri, Maxar, Earthstar Geographics',
    },
    // Carto je uveo API ključ (vodeni žig "API KEY REQUIRED") — Esri referentni sloj je besplatan uz atribuciju
    nazivi: {
      type: 'raster',
      tiles: ['plocica://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'satelit', type: 'raster', source: 'satelit' },
    { id: 'nazivi', type: 'raster', source: 'nazivi', paint: { 'raster-opacity': 0.9 } },
  ],
};

function granice(cestice: Cestica[]): LngLatBoundsLike | null {
  let [minX, minY, maxX, maxY] = [180, 90, -180, -90];
  for (const c of cestice)
    for (const poly of c.geom.coordinates)
      for (const ring of poly)
        for (const [x, y] of ring) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
  return minX > maxX ? null : [minX, minY, maxX, maxY];
}

/** Snimka (NDVI ili VRA zone, blob: PNG) preko čestice — ispod obruba, iznad satelita. */
function primijeniOverlay(map: MlMap, o: Overlay | null) {
  if (map.getLayer('ndvi-sloj')) map.removeLayer('ndvi-sloj');
  if (map.getSource('ndvi')) map.removeSource('ndvi');
  // odabrana čestica bez ispune dok se prikazuje snimka (da boja ne prekrije snimku)
  map.setPaintProperty('cestice-fill', 'fill-opacity', ['case', ['boolean', ['feature-state', 'odabrana'], false], o ? 0 : 0.55, 0.35]);
  if (!o) return;
  const [w, s, e, n] = o.bbox;
  map.addSource('ndvi', {
    type: 'image',
    url: o.url,
    coordinates: [
      [w, n],
      [e, n],
      [e, s],
      [w, s],
    ],
  });
  // 'nearest' — prikaz stvarnih 10 m piksela, bez lažnog zaglađivanja
  map.addLayer({ id: 'ndvi-sloj', type: 'raster', source: 'ndvi', paint: { 'raster-resampling': 'nearest', 'raster-opacity': 0.95 } }, 'cestice-obrub');
}

function uFeatureCollection(cestice: Cestica[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cestice.map((c, i) => ({
      type: 'Feature',
      id: i + 1, // MapLibre feature-state traži numerički id
      properties: { cid: c.id, naziv: c.naziv, boja: bojaCestice(c.landUseId) },
      geometry: c.geom,
    })),
  };
}

export default function Karta({ cestice }: { cestice: Cestica[] }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const idPoCid = useRef(new Map<string, number>());
  const prethodna = useRef<number | null>(null);
  const zadnjeCestice = useRef(cestice);
  const prikazano = useRef(false);
  const odaberi = useMapStore((s) => s.odaberi);

  // Inicijalizacija — jednom
  useEffect(() => {
    if (!el.current) return; // lekcija #4: nikad bez null-checka
    const map = new MlMap({
      container: el.current,
      style: STIL,
      center: [18.36, 45.36],
      zoom: 12,
      maxZoom: 20, // dalje od z20 (4× uvećana z18 pločica) nema korisne slike
      attributionControl: { compact: true },
      dragRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new GeolocateControl({ trackUserLocation: true }), 'top-right');
    mapRef.current = map;
    (window as unknown as { __mAgroMapa?: MlMap }).__mAgroMapa = map; // dijagnostika u konzoli

    map.on('load', () => {
      map.addSource('cestice', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'cestice-fill',
        type: 'fill',
        source: 'cestice',
        paint: {
          'fill-color': ['get', 'boja'],
          'fill-opacity': ['case', ['boolean', ['feature-state', 'odabrana'], false], 0.55, 0.35],
        },
      });
      map.addLayer({
        id: 'cestice-obrub',
        type: 'line',
        source: 'cestice',
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'odabrana'], false], '#ffeb3b', '#ffffff'],
          'line-width': ['case', ['boolean', ['feature-state', 'odabrana'], false], 4, 1.5],
        },
      });
      // Pregled ARKOD čestice koja se nudi za dodavanje (narančasti obrub)
      map.addSource('arkod-pregled', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'arkod-pregled-fill', type: 'fill', source: 'arkod-pregled', paint: { 'fill-color': '#f97316', 'fill-opacity': 0.25 } });
      map.addLayer({ id: 'arkod-pregled-obrub', type: 'line', source: 'arkod-pregled', paint: { 'line-color': '#f97316', 'line-width': 3 } });

      map.on('click', 'cestice-fill', (e: MapLayerMouseEvent) => {
        if (useMapStore.getState().dodavanje) return; // obrađuje opći klik ispod
        const cid = e.features?.[0]?.properties?.cid;
        if (typeof cid === 'string') odaberi(cid, 'karta');
        // VRA prikaz: dodir pokazuje zonu i dozu tog mjesta (piksel iz istog niza kao tablica)
        const st = useMapStore.getState();
        const v = st.vraInfo;
        if (st.aktivni !== 'vra' || !v || cid !== st.odabranaId) return;
        const [w, s, ee, n] = v.bbox;
        const px = Math.floor(((e.lngLat.lng - w) / (ee - w)) * v.w);
        const py = Math.floor(((n - e.lngLat.lat) / (n - s)) * v.h);
        if (px < 0 || py < 0 || px >= v.w || py >= v.h) return;
        const z = v.zone[py * v.w + px] ?? -1;
        if (z < 0) return;
        const doza = (v.doze[z] ?? 0).toLocaleString('hr-HR', { maximumFractionDigits: 1 });
        const el = document.createElement('div');
        el.style.font = '600 13px system-ui';
        el.textContent = `Zona ${z + 1} · ${v.gnojivo || 'gnojivo'} ${doza} kg/ha`;
        new Popup({ closeButton: false, offset: 8 }).setLngLat(e.lngLat).setDOMContent(el).addTo(map);
      });
      map.on('click', (e: MapMouseEvent) => {
        const st = useMapStore.getState();
        if (st.dodavanje) return st.postaviDodir(e.lngLat.lng, e.lngLat.lat);
        if (map.queryRenderedFeatures(e.point, { layers: ['cestice-fill'] }).length === 0) odaberi(null, 'karta');
      });
      map.on('mouseenter', 'cestice-fill', () => (map.getCanvas().style.cursor = useMapStore.getState().dodavanje ? 'crosshair' : 'pointer'));
      map.on('mouseleave', 'cestice-fill', () => (map.getCanvas().style.cursor = useMapStore.getState().dodavanje ? 'crosshair' : ''));
      postaviPodatke(map, zadnjeCestice.current);
      // Odabir/snimka mogli su stići PRIJE nego je karta bila spremna (brz klik nakon otvaranja) → preuzmi stanje
      const st = useMapStore.getState();
      const fid = st.odabranaId ? idPoCid.current.get(st.odabranaId) : undefined;
      if (fid !== undefined) {
        map.setFeatureState({ source: 'cestice', id: fid }, { odabrana: true });
        prethodna.current = fid;
        if (st.izvor === 'lista') prikaziCesticuRef.current?.(map, st.odabranaId, 0);
      }
      primijeniOverlay(map, st.overlay);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [odaberi]);

  // Podaci — kad se promijene čestice (npr. nakon uvoza). fitBounds samo prvi put (lekcija #7).
  function postaviPodatke(map: MlMap, lista: Cestica[]) {
    const src = map.getSource('cestice') as GeoJSONSource | undefined;
    if (!src) return; // stil još nije učitan — 'load' handler će pozvati ponovo
    idPoCid.current = new Map(lista.map((c, i) => [c.id, i + 1]));
    prethodna.current = null;
    src.setData(uFeatureCollection(lista));
    const b = granice(lista);
    if (b && !prikazano.current) map.fitBounds(b, { padding: 40, duration: 0, maxZoom: 16 });
    prikazano.current = true;
  }

  useEffect(() => {
    zadnjeCestice.current = cestice;
    if (mapRef.current) postaviPodatke(mapRef.current, cestice);
  }, [cestice]);

  // Let do čestice tako da je vidljiva IZNAD mobilne ploče (donjiRub)
  const prikaziCesticu = useCallback(
    (map: MlMap, id: string | null, duration: number) => {
      const c = cestice.find((x) => x.id === id);
      const b = c && granice([c]);
      if (!b) return;
      const rub = useMapStore.getState().donjiRub;
      const h = map.getContainer().clientHeight;
      if (h === 0) return;
      // premala vidljiva visina (npr. ploča raširena) → ne diraj kartu
      if (h - rub < 120) return;
      map.fitBounds(b, { padding: { top: 40, left: 40, right: 40, bottom: 40 + rub }, maxZoom: 17, duration });
    },
    [cestice],
  );

  const prikaziCesticuRef = useRef(prikaziCesticu);
  prikaziCesticuRef.current = prikaziCesticu;

  // Kontejner mijenja veličinu bez window resize (mobilni tab Karta/Lista, desni stupac) → map.resize()
  // Ako je karta bila skrivena (mobilni tab Lista) dok je čestica odabrana, zumiraj kad postane vidljiva.
  useEffect(() => {
    const el = mapRef.current?.getContainer();
    if (!el) return;
    let prosla = el.clientHeight;
    const ro = new ResizeObserver(() => {
      const map = mapRef.current;
      if (!map) return;
      map.resize();
      const sada = el.clientHeight;
      const { odabranaId } = useMapStore.getState();
      if (prosla === 0 && sada > 0 && odabranaId) prikaziCesticu(map, odabranaId, 0);
      prosla = sada;
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  // Mobilna ploča promijenila visinu → zadrži odabranu česticu vidljivom
  useEffect(
    () =>
      useMapStore.subscribe((st, prev) => {
        const map = mapRef.current;
        if (!map || st.donjiRub === prev.donjiRub || !st.odabranaId) return;
        prikaziCesticu(map, st.odabranaId, 300);
      }),
    [prikaziCesticu],
  );

  // Odabir iz liste/karte → highlight (+ let do čestice samo kad je odabrana u listi)
  useEffect(
    () =>
      useMapStore.subscribe(({ odabranaId, izvor }) => {
        const map = mapRef.current;
        if (!map || !map.getSource('cestice')) return;
        if (prethodna.current !== null) map.setFeatureState({ source: 'cestice', id: prethodna.current }, { odabrana: false });
        const fid = odabranaId ? idPoCid.current.get(odabranaId) : undefined;
        prethodna.current = fid ?? null;
        if (fid === undefined) return;
        map.setFeatureState({ source: 'cestice', id: fid }, { odabrana: true });
        if (izvor === 'lista') prikaziCesticu(map, odabranaId, 600);
      }),
    [prikaziCesticu],
  );

  // NDVI snimka odabrane čestice (blob: PNG) — ispod obruba, iznad satelita
  useEffect(
    () =>
      useMapStore.subscribe((st, prev) => {
        if (st.overlay === prev.overlay) return;
        const map = mapRef.current;
        if (!map || !map.getSource('cestice')) return;
        primijeniOverlay(map, st.overlay);
      }),
    [],
  );

  // „Dodaj čestice”: obris ponuđene ARKOD čestice + križić kao pokazivač
  useEffect(
    () =>
      useMapStore.subscribe((st, prev) => {
        const map = mapRef.current;
        if (!map || !map.getSource('arkod-pregled')) return;
        if (st.pregledArkod !== prev.pregledArkod) {
          const src = map.getSource('arkod-pregled') as GeoJSONSource;
          src.setData(st.pregledArkod ? { type: 'Feature', properties: {}, geometry: st.pregledArkod } : { type: 'FeatureCollection', features: [] });
        }
        if (st.dodavanje !== prev.dodavanje) map.getCanvas().style.cursor = st.dodavanje ? 'crosshair' : '';
      }),
    [],
  );

  return <div ref={el} className="h-full w-full" aria-label="Karta čestica" role="region" />;
}
