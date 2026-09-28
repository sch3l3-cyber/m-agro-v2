/**
 * Evalscripti (portano iz v1 magro-wms, 2026-09).
 * Novo u v2: SCL maska — oblaci (8, 9), cirus (10) i sjena oblaka (3) su "nema podatka",
 * pa statistika računa samo čiste piksele, a na slici su oblaci prozirni umjesto lažno niskog NDVI-ja.
 */
const MASKA = `function cist(s){return s.dataMask===1&&[3,8,9,10].indexOf(s.SCL)<0;}`;

export const STATS_EVALSCRIPT = `//VERSION=3
function setup(){return{input:[{bands:["B04","B08","SCL","dataMask"]}],output:[{id:"ndvi",bands:1,sampleType:"FLOAT32"},{id:"dataMask",bands:1}]};}
${MASKA}
function evaluatePixel(s){var ok=cist(s);return{ndvi:[ok?(s.B08-s.B04)/(s.B08+s.B04):0],dataMask:[ok?1:0]};}`;

/** Paleta iz v1 (user-friendly zelena, brief 02 §3) */
const NDVI = `//VERSION=3
function setup(){return{input:[{bands:["B04","B08","SCL","dataMask"]}],output:{bands:4,sampleType:"UINT8"}}}
${MASKA}
function evaluatePixel(s){
  if(!cist(s))return[0,0,0,0];
  var n=(s.B08-s.B04)/(s.B08+s.B04);
  if(n<0)return[69,117,180,255];
  if(n<0.1)return[166,98,24,255];
  if(n<0.2)return[223,194,125,255];
  if(n<0.35)return[255,230,100,255];
  if(n<0.5)return[161,215,106,255];
  if(n<0.65)return[77,172,38,255];
  return[0,104,55,255];
}`;

const PRAVE_BOJE = `//VERSION=3
function setup(){return{input:[{bands:["B04","B03","B02","dataMask"]}],output:{bands:4,sampleType:"UINT8"}}}
function evaluatePixel(s){
  if(s.dataMask===0)return[0,0,0,0];
  return[Math.min(255,s.B04*3.5*255),Math.min(255,s.B03*3.5*255),Math.min(255,s.B02*3.5*255),255];
}`;

/** Sezonski kontrast (v1 getStretchForContrasted): raspon = percentili te čestice na taj datum */
export function kontrastEvalscript(min: number, max: number): string {
  const MIN = Math.max(-0.2, Math.min(0.95, min));
  const MAX = Math.max(MIN + 0.05, Math.min(0.99, max));
  return `//VERSION=3
function setup(){return{input:[{bands:["B04","B08","SCL","dataMask"]}],output:{bands:4,sampleType:"UINT8"}}}
${MASKA}
function evaluatePixel(s){
  if(!cist(s))return[0,0,0,0];
  var n=(s.B08-s.B04)/(s.B08+s.B04);
  var v=Math.max(0,Math.min(1,(n-${MIN.toFixed(4)})/(${MAX.toFixed(4)}-${MIN.toFixed(4)})));
  if(v<0.15)return[215,48,39,255];
  if(v<0.30)return[244,109,67,255];
  if(v<0.45)return[253,174,97,255];
  if(v<0.55)return[254,224,139,255];
  if(v<0.70)return[166,217,106,255];
  if(v<0.85)return[102,189,99,255];
  return[26,152,80,255];
}`;
}

/**
 * NDMI (vlaga u biljci): (B08−B11)/(B08+B11). Divergentna paleta suho (smeđe) → vlažno (plavozeleno).
 * B11 je 20 m — na slici su pikseli krupniji nego kod NDVI-ja.
 */
const NDMI = `//VERSION=3
function setup(){return{input:[{bands:["B08","B11","SCL","dataMask"]}],output:{bands:4,sampleType:"UINT8"}}}
${MASKA}
function evaluatePixel(s){
  if(!cist(s))return[0,0,0,0];
  var n=(s.B08-s.B11)/(s.B08+s.B11);
  if(n<-0.2)return[140,81,10,255];
  if(n<0)return[216,179,101,255];
  if(n<0.2)return[246,232,195,255];
  if(n<0.3)return[199,234,229,255];
  if(n<0.4)return[90,180,172,255];
  return[1,102,94,255];
}`;

/**
 * NDRE (red-edge, klorofil/dušik): (B08−B05)/(B08+B05). Osjetljiviji od NDVI-ja kad je usjev gust
 * (NDVI se "zasiti" iznad ~0.8). Sekvencijalna zelena paleta. B05 je 20 m.
 */
const NDRE = `//VERSION=3
function setup(){return{input:[{bands:["B05","B08","SCL","dataMask"]}],output:{bands:4,sampleType:"UINT8"}}}
${MASKA}
function evaluatePixel(s){
  if(!cist(s))return[0,0,0,0];
  var n=(s.B08-s.B05)/(s.B08+s.B05);
  if(n<0.1)return[255,255,204,255];
  if(n<0.2)return[217,240,163,255];
  if(n<0.3)return[173,221,142,255];
  if(n<0.4)return[120,198,121,255];
  if(n<0.5)return[49,163,84,255];
  return[0,104,55,255];
}`;

/**
 * Sirovi NDVI za VRA (lekcija #12: zone se računaju u pregledniku iz ISTIH piksela koji se crtaju).
 * UINT8 siva: 0 = nema podatka (oblak/sjena/izvan čestice), 1..255 ↔ NDVI −0.2…1.0.
 * MORA odgovarati `kodirajNdvi` u packages/domain/src/vra.ts (test to provjerava).
 */
const NDVI_SIROVO = `//VERSION=3
function setup(){return{input:[{bands:["B04","B08","SCL","dataMask"]}],output:{bands:1,sampleType:"UINT8"}}}
${MASKA}
function evaluatePixel(s){
  if(!cist(s))return[0];
  var n=(s.B08-s.B04)/(s.B08+s.B04);
  n=Math.min(1,Math.max(-0.2,n));
  return[1+Math.round((n+0.2)/1.2*254)];
}`;

export const SLOJEVI = ['ndvi', 'kontrast', 'prave_boje', 'ndmi', 'ndre', 'ndvi_sirovo'] as const;
export type Sloj = (typeof SLOJEVI)[number];

const EVALSCRIPTI: Record<Exclude<Sloj, 'kontrast'>, string> = { ndvi: NDVI, prave_boje: PRAVE_BOJE, ndmi: NDMI, ndre: NDRE, ndvi_sirovo: NDVI_SIROVO };

export function evalscriptZaSloj(sloj: Exclude<Sloj, 'kontrast'>): string {
  return EVALSCRIPTI[sloj];
}
