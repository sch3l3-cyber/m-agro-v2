"""
Tjedni punjač ARKOD sažetka (ADR-0011). Pokreće ga .github/workflows/arkod.yml.

Ulaz: javni land_parcels.gpkg (APPRRR). Izlaz: CSV za private.arkod_cestice
(arkod_id, nositelj, lon, lat, ha, land_use_id, naziv) — samo istočna Hrvatska.

PRIVATNOST (repo i logovi su JAVNI):
- jpaid se pretvara u interni broj nositelja (gusti indeks, drukčiji pri svakom punjenju) i ODMAH odbacuje;
- ispisuju se samo brojevi (koliko čestica/nositelja) i nazivi stupaca — nikad vrijednosti.
"""
import csv
import sys

import numpy as np
import pyogrio
import shapely
from pyogrio.raw import read
from pyproj import Transformer

GPKG, IZLAZ = sys.argv[1], sys.argv[2]
# istočna Hrvatska (Slavonija, Baranja, Srijem + rub Moslavine) — proširiti kad dođu korisnici s drugih područja
LON_MIN, LAT_MIN, LON_MAX, LAT_MAX = 16.9, 44.8, 19.5, 46.0
POTREBNO = ["id", "jpaid", "land_use_id", "home_name", "area"]

slojevi = [s for s, tip in pyogrio.list_layers(GPKG) if tip and "Polygon" in str(tip)]
if not slojevi:
    sys.exit("Nema poligonskog sloja u GPKG-u")
sloj = slojevi[0]
info = pyogrio.read_info(GPKG, layer=sloj)
polja = list(info["fields"])
print(f"sloj: {sloj}, CRS: {info['crs']}, stupci: {', '.join(polja)}")
nedostaje = [p for p in POTREBNO if p not in polja]
if nedostaje:
    sys.exit(f"Nedostaju stupci: {nedostaje}")

do_3765 = Transformer.from_crs(4326, 3765, always_xy=True)
x1, y1 = do_3765.transform(LON_MIN, LAT_MIN)
x2, y2 = do_3765.transform(LON_MAX, LAT_MAX)
meta, _, wkb, vrijednosti = read(GPKG, layer=sloj, columns=POTREBNO, bbox=(min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)))
stupci = dict(zip(meta["fields"], vrijednosti))

geom = shapely.from_wkb(wkb)
tocke = shapely.point_on_surface(shapely.make_valid(geom))
xs, ys = shapely.get_x(tocke), shapely.get_y(tocke)
u_wgs = Transformer.from_crs(meta["crs"] or "EPSG:3765", 4326, always_xy=True)
lon, lat = u_wgs.transform(xs, ys)

jpaid = np.asarray(stupci["jpaid"]).astype(str)
valjano = (jpaid != "") & (jpaid != "None") & np.isfinite(lon) & np.isfinite(lat)
_, nositelj = np.unique(jpaid, return_inverse=True)
del jpaid, stupci["jpaid"]  # od ovdje nadalje jpaid ne postoji

ids = np.asarray(stupci["id"])
lu = np.asarray(stupci["land_use_id"])
naziv = np.asarray(stupci["home_name"])
area = np.asarray(stupci["area"], dtype=float)

n = 0
with open(IZLAZ, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    for i in np.flatnonzero(valjano):
        ha = area[i] / 10000 if np.isfinite(area[i]) else ""
        nz = (str(naziv[i]).strip()[:200] if naziv[i] is not None else "") or ""
        luv = "" if lu[i] is None or (isinstance(lu[i], float) and not np.isfinite(lu[i])) else int(lu[i])
        w.writerow([int(ids[i]), int(nositelj[i]), f"{lon[i]:.6f}", f"{lat[i]:.6f}", f"{ha:.4f}" if ha != "" else "", luv, nz])
        n += 1

print(f"čestica: {n}, nositelja: {len(np.unique(nositelj[valjano]))}")
if n < 1000:
    sys.exit("Premalo čestica — nešto nije u redu s izvorom, ne punim bazu")
