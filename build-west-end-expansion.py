#!/usr/bin/env python3
"""Build three additional curb guides; see data/sources/west-end-expansion.md.
All traced extents are illustrative. Missing street anchors remain unmapped.
"""
import bisect
import hashlib
import heapq
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SNAPSHOT = json.loads((ROOT/'data/sources/west-end-expansion-streets.json').read_text())
# Traces use 1780-pixel long-edge PDF renders. Davie-Beach is rotated upright.
# p: solid full-time permit; 2: diagonal 2h 09-20 Mon-Sat;
# e: circle pattern 2h 09-15 Mon-Sat (Davie-Beach only).
# H rows: street (or pair around a lane), side, source y, [x0,x1,category].
# V rows: street, side, source x, [y0,y1,category].
MAPS = {
 'davie-beach': {
  'url':'https://vancouver.ca/files/cov/davie-beach-residential-permit-parking-map.pdf',
  'sha256':'6ccfa6d7081673325a4a9a8c9f3dad958d899319fc38773453c33829f0056604',
  'size':[1780,1376], 'rotation':-90,
  'columns':['Denman','Bidwell','Cardero','Nicola','Broughton','Jervis','Bute','Thurlow','Burrard'],
  'x':[110,277,484,637,788,966,1172,1452,1714],
  'rows':['Davie','Burnaby','Harwood','Pacific','Beach'], 'y':[222,363,504,643,797],
  'excludeInferredBlocks':['1100 Burnaby St','1300 Broughton St'],
  'H':[
   ('Davie','south',245,[(495,606,'2'),(647,759,'2'),(801,951,'2')]),
   (('Davie','Burnaby'),'north',280,[(128,255,'p'),(290,468,'p'),(495,615,'p'),(648,768,'p'),(801,951,'p')]),
   (('Davie','Burnaby'),'south',309,[(128,255,'p'),(290,468,'p'),(495,606,'p'),(648,768,'p'),(801,951,'p'),(987,1151,'p'),(1185,1431,'p'),(1473,1645,'p')]),
   ('Burnaby','north',343,[(128,255,'p'),(495,606,'p'),(648,768,'p'),(997,1056,'2'),(1056,1151,'p'),(1286,1431,'p'),(1483,1528,'2'),(1528,1606,'p'),(1606,1645,'2')]),
   ('Burnaby','south',385,[(290,463,'p'),(801,951,'p')]),
   (('Burnaby','Harwood'),'north',420,[(290,463,'p'),(495,615,'p'),(648,759,'p'),(801,951,'p'),(988,1151,'p'),(1185,1431,'p'),(1473,1645,'p')]),
   (('Burnaby','Harwood'),'south',448,[(290,454,'p'),(495,615,'p'),(648,768,'p'),(801,951,'p'),(988,1151,'p'),(1185,1431,'p'),(1473,1645,'p')]),
   ('Harwood','north',484,[(290,454,'p'),(495,552,'p'),(552,606,'2'),(648,768,'p'),(801,951,'p'),(980,1056,'2'),(1056,1151,'p'),(1286,1431,'p')]),
   ('Harwood','south',523,[(648,768,'p'),(801,875,'p'),(988,1151,'p'),(1185,1431,'p'),(1543,1645,'p')]),
   (('Harwood','Beach'),'north',560,[(495,615,'p'),(648,768,'p'),(801,945,'p')]),
   (('Harwood','Pacific'),'north',560,[(988,1151,'p'),(1185,1431,'p'),(1473,1645,'p')]),
   (('Harwood','Beach'),'south',588,[(495,622,'p'),(648,768,'p'),(801,945,'p')]),
   (('Harwood','Pacific'),'south',588,[(988,1151,'p'),(1185,1431,'p'),(1473,1670,'p')]),
   ('Pacific','north',621,[(980,1143,'e')]),
   ('Beach','north',[[980,661],[1151,698]],[(980,1151,'p')]),
   ('Beach','north',[[1193,699],[1433,752]],[(1193,1433,'p')]),
   ('Beach','north',[[1468,758],[1710,808]],[(1468,1710,'p')]),
  ],
  'V':[
   ('Bidwell','west',255,[(310,346,'p'),(380,440,'2'),(440,515,'p')]),
   ('Cardero','west',463,[(385,420,'p'),(444,489,'2'),(520,600,'p')]),
   ('Nicola','west',615,[(240,280,'p'),(380,420,'p'),(449,489,'p'),(520,560,'p')]),
   ('Broughton','west',768,[(240,280,'p'),(309,346,'p'),(449,489,'p'),(523,560,'p'),(588,628,'p')]),
   ('Jervis','west',945,[(520,560,'p'),(588,628,'p')]),
   ('Jervis','east',987,[(238,285,'p'),(310,346,'p'),(443,489,'p')]),
   ('Bute','west',1151,[(309,346,'p'),(385,420,'p'),(523,560,'p'),(588,628,'p'),(656,691,'p')]),
   ('Bute','east',1193,[(658,693,'p')]),
   ('Thurlow','west',1431,[(309,346,'p'),(379,420,'p'),(449,489,'p'),(520,560,'p'),(588,612,'p'),(656,693,'p'),(704,746,'p')]),
   ('Thurlow','east',1473,[(310,339,'p'),(443,489,'p'),(519,560,'p'),(588,628,'p')]),
  ],
 },
 'denman-west': {
  'url':'https://vancouver.ca/files/cov/denman-west-residential-permit-parking-map.pdf',
  'sha256':'afad86bc589d3cd1f4f5dd782447ea514a87d0830bc35ab311c72fccd996b596',
  'size':[1376,1780], 'rotation':0,
  'columns':['Lagoon Drive','Chilco','Gilford','Denman'], 'x':[430,670,910,1175],
  'rows':['Alberni','Robson','Haro','Barclay','Nelson','Comox','Pendrell','Beach'],
  'y':[361,545,733,918,1103,1290,1479,1580],
  'H':[
   ('Alberni','south',385,[(708,891,'p'),(946,1131,'p')]),
   (('Alberni','Robson'),'north',431,[(697,891,'p'),(946,1131,'p')]),
   (('Alberni','Robson'),'south',468,[(688,891,'p'),(936,1098,'p')]),
   ('Robson','north',517,[(688,891,'p'),(1046,1098,'p')]),
   (('Robson','Haro'),'north',618,[(620,652,'p'),(708,882,'p'),(927,1131,'p')]),
   (('Robson','Haro'),'south',656,[(604,652,'p'),(698,891,'p'),(927,1131,'p')]),
   ('Haro','north',703,[(698,791,'p'),(791,891,'2'),(1046,1131,'p')]),
   (('Haro','Barclay'),'north',804,[(508,634,'p'),(689,757,'p'),(928,1131,'p')]),
   (('Haro','Barclay'),'south',841,[(490,645,'p'),(689,891,'p'),(938,1131,'p')]),
   ('Barclay','south',944,[(520,635,'p'),(691,792,'p'),(949,1073,'2'),(1073,1131,'p')]),
   (('Barclay','Nelson'),'north',991,[(441,634,'p'),(691,891,'p'),(939,1131,'p')]),
   (('Barclay','Nelson'),'south',1028,[(441,645,'p'),(691,891,'p'),(939,1131,'p')]),
   ('Nelson','south',1130,[(441,645,'p'),(692,892,'p')]),
   (('Nelson','Comox'),'north',1177,[(441,645,'p'),(692,892,'p'),(940,1132,'p')]),
   (('Nelson','Comox'),'south',1216,[(441,654,'p'),(692,892,'p'),(940,1132,'p')]),
   ('Comox','south',1317,[(442,554,'p'),(730,893,'p'),(950,1073,'2'),(1073,1133,'p')]),
   (('Comox','Pendrell'),'north',1365,[(442,646,'p'),(940,1133,'p')]),
   (('Comox','Pendrell'),'south',1402,[(442,646,'p'),(693,894,'p'),(940,1091,'p')]),
   ('Pendrell','north',1448,[(950,1048,'2'),(1048,1098,'p')]),
   ('Pendrell','south',1504,[(468,636,'p'),(693,798,'p')]),
  ],
  'V':[
   ('Chilco','east',697,[(378,439,'2'),(563,626,'2'),(654,704,'p')]),
   ('Chilco','west',645,[(750,813,'2'),(842,898,'p'),(964,998,'2'),(1029,1084,'p'),(1132,1179,'p'),(1309,1368,'p'),(1403,1457,'p')]),
   ('Gilford','west',882,[(563,626,'p')]),
   ('Gilford','east',936,[(378,439,'2'),(469,525,'p'),(841,898,'p'),(936,998,'p'),(1029,1084,'p'),(1122,1177,'p'),(1207,1270,'p'),(1309,1370,'p'),(1401,1457,'p')]),
  ],
 },
 'robson-north': {
  'url':'https://vancouver.ca/files/cov/residential-permit-parking-robson-north.pdf',
  'sha256':'73de3b54a6f5fcffa084912368425d7ea87560810e198f75737846ad7b8f8646',
  'size':[1780,1376], 'rotation':0,
  'columns':['Denman','Bidwell','Cardero','Nicola','Broughton','Jervis','Bute','Thurlow','Burrard'],
  'x':[175,356,539,673,808,967,1150,1399,1630],
  'rows':['Melville','W Georgia','Alberni','Robson'], 'y':[356,486,560,686],
  'H':[
   ('Melville','south',374,[(988,1028,'p'),(1082,1126,'p')]),
   (('W Pender','W Georgia'),'north',407,[(823,861,'p'),(928,953,'p')]),
   (('Melville','W Georgia'),'north',407,[(988,1098,'p')]),
   (('W Pender','W Georgia'),'south',430,[(833,866,'p'),(924,955,'p')]),
   (('Melville','W Georgia'),'south',430,[(1039,1093,'p')]),
   ('Alberni','north',544,[(368,423,'p'),(696,751,'p'),(1025,1137,'p')]),
   ('Alberni','south',579,[(282,338,'p')]),
   (('Alberni','Robson'),'north',612,[(220,338,'p'),(368,423,'p'),(604,660,'p'),(752,793,'p'),(828,860,'p'),(920,956,'p'),(1065,1125,'p')]),
   (('Alberni','Robson'),'south',634,[(368,524,'p'),(693,714,'p')]),
  ],
  'V':[
   ('Jervis','east',985,[(375,408,'p')]),
   ('Broughton','west',793,[(507,546,'p'),(579,612,'p')]),
   ('Bidwell','west',338,[(580,612,'p')]),
   ('Nicola','west',656,[(574,587,'p')]),
  ],
 }
}

# Reconstruct paths from the City's street centreline snapshot. Six-decimal
# snapping joins coincident endpoints; it does not claim curb-level accuracy.
COS=math.cos(math.radians(49.285))
def distance(a,b): return math.hypot((a[0]-b[0])*COS,a[1]-b[1])*111320

def road_name(block):
 words=block.split()[1:]
 return ' '.join(words).removesuffix(' ST').removesuffix(' AV').title()

ROADS={}
for rec in SNAPSHOT['records']:
 ROADS.setdefault(road_name(rec['block']),[]).append(rec['coordinates'])

def points(road): return [tuple(round(c,6) for c in p) for line in ROADS.get(road,[]) for p in line]

def crossing(road,cross):
 pairs=((a,b) for a in points(road) for b in points(cross))
 try: a,b=min(pairs,key=lambda ab:distance(*ab))
 except ValueError: raise ValueError(f'No street geometry: {road} / {cross}')
 if distance(a,b)>3: raise ValueError(f'No matching intersection: {road} / {cross}')
 return a

PATHS={}
def path(road,cross1,cross2):
 key=(road,cross1,cross2)
 if key in PATHS:return PATHS[key]
 start=crossing(road,cross1);end=crossing(road,cross2)
 graph={}
 for line in ROADS.get(road,[]):
  coords=[tuple(round(c,6) for c in p) for p in line]
  for a,b in zip(coords,coords[1:]):
   graph.setdefault(a,[]).append((b,distance(a,b)))
   graph.setdefault(b,[]).append((a,distance(a,b)))
 queue=[(0,start,[start])];seen=set()
 while queue:
  cost,node,route=heapq.heappop(queue)
  if node in seen:continue
  if node==end:
   PATHS[key]=route;return route
  seen.add(node)
  for nxt,d in graph.get(node,[]):
   if nxt not in seen:heapq.heappush(queue,(cost+d,nxt,route+[nxt]))
 raise ValueError(f'Disconnected centreline: {road}, {cross1}–{cross2}')

def along(line,t):
 lengths=[distance(a,b) for a,b in zip(line,line[1:])];target=sum(lengths)*t
 for i,length in enumerate(lengths):
  if target<=length or i==len(lengths)-1:
   ratio=target/length if length else 0
   return [line[i][k]+(line[i+1][k]-line[i][k])*ratio for k in (0,1)]
  target-=length
 raise ValueError('Empty street path')

def locate(value,axis):
 i=max(0,min(len(axis)-2,bisect.bisect_right(axis,value)-1));return i

def geometry(road,side,between,t0,t1,horizontal):
 roads=road if isinstance(road,tuple) else (road,)
 paths=[path(r,*between) for r in roads]
 # Include intermediate points to follow a curved street instead of its chord.
 sampled=[]
 for i in range(9):
  t=t0+(t1-t0)*i/8
  pp=[along(p,t) for p in paths]
  sampled.append([sum(p[j] for p in pp)/len(pp) for j in (0,1)])
 sign=1 if side in ('north','east') else -1
 offset=sign*(3 if len(roads)==2 else 6)
 out=[]
 for i,p in enumerate(sampled):
  a=sampled[max(0,i-1)];b=sampled[min(len(sampled)-1,i+1)]
  dx=(b[0]-a[0])*COS;dy=b[1]-a[1];norm=math.hypot(dx,dy)
  if norm==0:raise ValueError('Zero-length section')
  out.append([round(p[0]-dy/norm*offset/(111320*COS),6),round(p[1]+dx/norm*offset/111320,6)])
 return {'type':'LineString','coordinates':out}

def build(key,config):
 sections=[];unmapped=[]
 for orient in ('H','V'):
  for street,side,fixed,segments in config[orient]:
   for start,end,cat in segments:
    axis=config['x'] if orient=='H' else config['y']
    names=config['columns'] if orient=='H' else config['rows']
    if key=='davie-beach' and orient=='V':
     if street=='Bidwell':axis=[222,363,535];names=['Davie','Burnaby','Beach']
     elif street in ('Cardero','Nicola','Broughton'):axis=[222,363,504,643];names=['Davie','Burnaby','Harwood','Beach']
    idx=locate((start+end)/2,axis);between=names[idx:idx+2]
    t0=(start-axis[idx])/(axis[idx+1]-axis[idx]);t1=(end-axis[idx])/(axis[idx+1]-axis[idx])
    trace=fixed if isinstance(fixed,list) else ([[start,fixed],[end,fixed]] if orient=='H' else [[fixed,start],[fixed,end]])
    display='Lane between '+' and '.join(street) if isinstance(street,tuple) else street
    ident=key+'-'+hashlib.sha256(json.dumps([street,side,trace,cat]).encode()).hexdigest()[:12]
    schedule={'days':list(range(7)) if cat=='p' else [1,2,3,4,5,6],'start':0 if cat=='p' else 540,'end':1440 if cat=='p' else 900 if cat=='e' else 1200}
    row={'id':ident,'area':key,'street':display,'side':side,'between':between,'category':'permit' if cat=='p' else 'time-limited','limitMinutes':None if cat=='p' else 120,'schedule':schedule,'pdfSchedule':schedule.copy(),'outsideSchedule':'not-applicable' if cat=='p' else 'unknown','verification':'pdf-only','spotChecks':[],'schematicTrace':trace,'geometryStatus':'approximate-schematic','sourceIds':[key,'city-streets']}
    try:
     if not 0<=t0<t1<=1:raise ValueError('Trace crosses a reference street; needs splitting')
     row['geometry']=geometry(street,side,between,t0,t1,orient=='H');sections.append(row)
    except ValueError as e:
     row['geometry']=None;row['geometryStatus']='unresolved';row['unresolvedReason']=str(e);unmapped.append(row)
 output={'version':1,'area':key,'sources':{key:{'url':config['url'],'title':key.replace('-',' ').title()+' City parking guide','publicationDate':None,'retrieved':'2026-09-22','sha256':config['sha256'],'traceImageSize':config['size'],'traceRotationDegrees':config['rotation']},'city-streets':{'url':SNAPSHOT['source'],'title':'City of Vancouver public streets (location reference only)','retrieved':SNAPSHOT['retrieved']}},'geometryNote':'Schematic extents and symbolic curb offsets are approximate, not surveyed sign boundaries. Lane centre positions are interpolated. Check posted signs.','restrictionNote':'PDF guide only; no current sign verification. Unlisted periods, exemptions and other restrictions remain unknown.','excludeInferredBlocks':config.get('excludeInferredBlocks',[]),'sections':sections,'unmappedSections':unmapped}
 header=json.dumps({k:v for k,v in output.items() if k not in ('sections','unmappedSections')},indent=2)[:-2]
 text=header+',\n  "sections": [\n'+',\n'.join('    '+json.dumps(s,separators=(',',':')) for s in sections)+'\n  ],\n  "unmappedSections": [\n'+',\n'.join('    '+json.dumps(s,separators=(',',':')) for s in unmapped)+'\n  ]\n}\n'
 (ROOT/f'data/{key}.json').write_text(text)
 print(key, len(sections),'mapped;',len(unmapped),'unresolved')
 for row in unmapped:print(' ',row['street'],row['side'],row['schematicTrace'],row['unresolvedReason'])

if __name__=='__main__':
 for key,config in MAPS.items():build(key,config)
