"""Builds MY WORLD geographic reference data from Natural Earth (public domain).

Outputs (committed, so CI never needs the network):
  src/data/countries.json      – country reference: ids, Russian/English names, region, UN flag, label point
  public/data/countries.geojson – country polygons (only an `id` property, coordinates rounded)
  public/data/cities.json      – populated places with Russian names, coordinates, population
  public/flags/<id>.svg        – flags copied from the flag-icons package (MIT)

Usage: python3 scripts/build_geodata.py [cache_dir]
Natural Earth files are downloaded into cache_dir when missing.
"""
import json
import os
import shutil
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(APP, '.ne-cache')
NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'
FLAGS = os.path.join(APP, 'node_modules', 'flag-icons', 'flags', '4x3')

# 193 UN member states (ISO 3166-1 alpha-2). Observers VA and PS are added for the default 195 methodology.
UN193 = set('''AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD
CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT
HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX
FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA
SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN
YE ZM ZW'''.split())
OBSERVERS = {'VA', 'PS'}
assert len(UN193) == 193, len(UN193)

CONTINENT_RU = {
    'Africa': 'Африка', 'Asia': 'Азия', 'Europe': 'Европа', 'North America': 'Северная Америка',
    'South America': 'Южная Америка', 'Oceania': 'Океания', 'Antarctica': 'Антарктида',
    'Seven seas (open ocean)': 'Океания',
}
# Russian names that read better than the Natural Earth defaults.
NAME_FIX = {
    'US': 'США', 'GB': 'Великобритания', 'CD': 'ДР Конго', 'CG': 'Республика Конго', 'KP': 'КНДР',
    'KR': 'Южная Корея', 'CZ': 'Чехия', 'MK': 'Северная Македония', 'SZ': 'Эсватини', 'CI': "Кот-д'Ивуар",
    'TL': 'Восточный Тимор', 'VA': 'Ватикан', 'PS': 'Палестина', 'FM': 'Микронезия', 'BA': 'Босния и Герцеговина',
    'AE': 'ОАЭ', 'XK': 'Косово', 'IM': 'Остров Мэн', 'KY': 'Острова Кайман', 'CYN': 'Северный Кипр', 'CF': 'ЦАР', 'DO': 'Доминиканская Республика', 'MH': 'Маршалловы Острова', 'SB': 'Соломоновы Острова',
}


def fetch(name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name + '.geojson')
    if not os.path.exists(path):
        print('download', name)
        urllib.request.urlretrieve(NE + name + '.geojson', path)
    with open(path, encoding='utf-8') as f:
        return json.load(f)['features']


def rnd(coords, nd=3):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], nd), round(coords[1], nd)]
    out = [rnd(c, nd) for c in coords]
    if out and isinstance(out[0][0], (int, float)):  # ring: drop consecutive duplicates after rounding
        ring = [out[0]]
        for p in out[1:]:
            if p != ring[-1]:
                ring.append(p)
        if len(ring) < 4:
            return None
        return ring
    return [c for c in out if c is not None]


def bbox(geom):
    xs, ys = [], []

    def walk(c):
        if isinstance(c[0], (int, float)):
            xs.append(c[0]); ys.append(c[1])
        else:
            for x in c:
                walk(x)
    walk(geom['coordinates'])
    return [min(xs), min(ys), max(xs), max(ys)]


def clean(v):
    return None if v in (None, '', '-99', -99) else v


def main():
    feats = fetch('ne_50m_admin_0_countries')
    feats10 = {f['properties']['ADM0_A3']: f for f in fetch('ne_10m_admin_0_countries')}
    # Pick a stable id per feature: ISO alpha-2 when it is unique, otherwise the Natural Earth ADM0_A3 code.
    iso_owner, iso_count = {}, {}
    for f in feats:
        iso = clean(f['properties']['ISO_A2_EH'])
        if iso:
            iso_count[iso] = iso_count.get(iso, 0) + 1
    for f in feats:
        p = f['properties']
        iso = clean(p['ISO_A2_EH'])
        if iso and (p['ADM0_A3'] == p['ISO_A3_EH'] or iso_count[iso] == 1):
            iso_owner.setdefault(iso, p['ADM0_A3'])
    ids = {}
    for f in feats:
        p = f['properties']
        iso = clean(p['ISO_A2_EH'])
        ids[p['ADM0_A3']] = iso if iso and iso_owner.get(iso) == p['ADM0_A3'] else p['ADM0_A3']

    # Countries of the 195 list that the 50 m layer lacks come from the 10 m layer.
    have = set(ids.values())
    for code in sorted((UN193 | OBSERVERS) - have):
        match = [f for f in feats10.values() if clean(f['properties']['ISO_A2_EH']) == code]
        if match:
            f = match[0]
            feats.append(f)
            ids[f['properties']['ADM0_A3']] = code
            print('added from 10m:', code)
        else:
            print('MISSING geometry:', code)

    countries, out_feats = [], []
    for f in feats:
        p = f['properties']
        cid = ids[p['ADM0_A3']]
        geom = {'type': f['geometry']['type'], 'coordinates': rnd(f['geometry']['coordinates'])}
        b = bbox(geom)
        iso2 = cid if len(cid) == 2 else None
        sov = clean(p['SOV_A3'])
        sov_id = next((ids[k] for k in ids if k == sov), None) if sov else None
        area = (b[2] - b[0]) * (b[3] - b[1])
        countries.append({
            'id': cid,
            'iso2': iso2,
            'iso3': clean(p['ISO_A3_EH']) or p['ADM0_A3'],
            'ru': NAME_FIX.get(cid) or p['NAME_RU'] or p['NAME'],
            'en': p['NAME'],
            'continent': CONTINENT_RU.get(p['CONTINENT'], p['CONTINENT']),
            'subregion': p['SUBREGION'],
            'type': p['TYPE'],
            'sovereign': sov_id if sov_id and sov_id != cid else None,
            'un': cid in UN193,
            'm195': cid in UN193 or cid in OBSERVERS,
            'label': [round(p['LABEL_X'], 3), round(p['LABEL_Y'], 3)],
            'bbox': [round(x, 2) for x in b],
            'small': area < 1.2,
            'flag': bool(iso2 and os.path.exists(os.path.join(FLAGS, iso2.lower() + '.svg'))) or cid == 'XK',
        })
        out_feats.append({'type': 'Feature', 'properties': {'id': cid}, 'geometry': geom})

    countries.sort(key=lambda c: c['ru'])
    n195 = sum(c['m195'] for c in countries)
    print('countries:', len(countries), 'in 195-list:', n195, 'UN:', sum(c['un'] for c in countries))
    assert n195 == 195, n195

    os.makedirs(os.path.join(APP, 'src', 'data'), exist_ok=True)
    os.makedirs(os.path.join(APP, 'public', 'data'), exist_ok=True)
    with open(os.path.join(APP, 'src', 'data', 'countries.json'), 'w', encoding='utf-8') as f:
        json.dump(countries, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(APP, 'public', 'data', 'countries.geojson'), 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': out_feats}, f, separators=(',', ':'))

    # Cities: Natural Earth populated places (10 m) carry Russian names, coordinates and population.
    by_a3 = dict(ids)
    iso_to_id = {c['iso2']: c['id'] for c in countries if c['iso2']}
    cities, seen = [], set()
    for f in fetch('ne_10m_populated_places'):
        p = f['properties']
        cid = by_a3.get(p['ADM0_A3']) or iso_to_id.get(clean(p['ISO_A2']))
        if not cid:
            continue
        key = p['NE_ID']
        if key in seen:
            continue
        seen.add(key)
        ru = p.get('NAME_RU') or p['NAME']
        en = p.get('NAME_EN') or p['NAME']
        cities.append([
            str(key), ru, en if en != ru else '', cid,
            round(p['LATITUDE'], 4), round(p['LONGITUDE'], 4),
            int(p['POP_MAX'] or 0), p.get('ADM1NAME') or '',
            1 if p['FEATURECLA'] == 'Admin-0 capital' else 0,
        ])
    cities.sort(key=lambda c: -c[6])
    with open(os.path.join(APP, 'public', 'data', 'cities.json'), 'w', encoding='utf-8') as f:
        json.dump({'fields': ['id', 'ru', 'en', 'country', 'lat', 'lon', 'pop', 'adm1', 'capital'], 'rows': cities},
                  f, ensure_ascii=False, separators=(',', ':'))
    print('cities:', len(cities))

    # Flags (flag-icons, MIT).
    dst = os.path.join(APP, 'public', 'flags')
    os.makedirs(dst, exist_ok=True)
    n = 0
    for c in countries:
        code = (c['iso2'] or ('xk' if c['id'] == 'XK' else '')).lower()
        src = os.path.join(FLAGS, code + '.svg')
        if code and os.path.exists(src):
            shutil.copy(src, os.path.join(dst, c['id'].lower() + '.svg'))
            n += 1
    print('flags:', n)


if __name__ == '__main__':
    main()
