#!/usr/bin/env python3
"""Rebuild approximate curb display geometry from an audited schematic transcription.
No network, no residential-area polygon. See data/sources/west-end-plateau.md.
"""
import bisect
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = 'https://vancouver.ca/files/cov/west-end-plateau-residential-permit-parking-map.pdf'
X = [257, 418, 582, 704, 827, 973, 1135, 1362, 1564]
Y = [224, 337, 448, 560, 672, 787, 895]
grid = json.loads((ROOT / 'data/sources/west-end-street-grid.json').read_text())

# Each row: road/lane, side, schematic y, and [x-start, x-end, category].
# p = solid/full-time permit; 1 = stippled/1h; 2 = diagonal/2h.
# Paid hatching is intentionally excluded; existing meter data owns paid parking.
H = [
 ('Lane between Robson and Haro','south',293,[(300,400,'p'),(428,565,'p'),(593,688,'p'),(716,812,'p'),(839,953,'p'),(982,1118,'p'),(1145,1343,'p')]),
 ('Haro','north',319,[(1013,1118,'p')]),
 ('Haro','south',353,[(300,348,'p'),(348,400,'1'),(429,500,'p'),(517,565,'p'),(594,638,'2'),(638,688,'p'),(716,812,'p'),(839,953,'p'),(982,1078,'p'),(1078,1124,'2'),(1145,1268,'p'),(1268,1337,'2')]),
 ('Lane between Haro and Barclay','north',380,[(520,565,'p'),(594,688,'p'),(839,953,'p'),(982,1124,'p'),(1145,1343,'p')]),
 ('Lane between Haro and Barclay','south',403,[(506,565,'p'),(594,688,'p'),(839,953,'p'),(982,1115,'p'),(1145,1337,'p')]),
 ('Barclay','south',465,[(266,300,'1'),(300,402,'p'),(429,476,'p'),(520,566,'p'),(594,683,'p'),(716,812,'p'),(839,894,'p'),(982,1073,'p'),(1145,1268,'p'),(1268,1337,'2'),(1372,1464,'p'),(1477,1505,'p')]),
 ('Lane between Barclay and Nelson','north',493,[(301,402,'p'),(429,566,'p'),(594,689,'p'),(716,812,'p'),(1372,1513,'p')]),
 ('Lane between Barclay and Nelson','south',518,[(301,396,'p'),(429,566,'p'),(594,683,'p'),(716,812,'p'),(839,953,'p'),(982,1118,'p'),(1145,1337,'p'),(1372,1513,'p')]),
 ('Nelson','north',545,[(429,566,'p'),(594,683,'p'),(716,812,'p')]),
 ('Nelson','south',578,[(742,767,'p'),(839,953,'p')]),
 ('Lane between Nelson and Comox','north',606,[(373,402,'p'),(429,566,'p'),(594,689,'p'),(716,812,'p'),(839,953,'p'),(982,1118,'p'),(1378,1513,'p')]),
 ('Lane between Nelson and Comox','south',628,[(429,566,'p'),(594,689,'p'),(716,812,'p'),(839,953,'p'),(1378,1473,'p')]),
 ('Comox','north',657,[(362,407,'p'),(429,482,'p'),(522,566,'p'),(716,758,'2'),(758,812,'p'),(875,953,'p'),(982,1118,'p')]),
 ('Comox','south',688,[(594,689,'p'),(1158,1337,'p')]),
 ('Lane between Comox and Pendrell','north',718,[(301,402,'p'),(594,689,'p'),(716,812,'p'),(839,949,'p'),(982,1124,'p')]),
 ('Lane between Comox and Pendrell','south',740,[(301,396,'p'),(601,683,'p'),(716,812,'p'),(839,953,'p'),(982,1124,'p')]),
 ('Pendrell','north',767,[(982,1048,'p'),(1048,1124,'2')]),
 ('Pendrell','south',802,[(301,408,'p'),(439,492,'p'),(594,695,'p'),(716,817,'p'),(845,900,'p'),(900,949,'2'),(1148,1188,'p'),(1188,1239,'2'),(1239,1337,'p')]),
 ('Lane between Pendrell and Davie','north',830,[(301,408,'p'),(439,560,'p'),(594,695,'p'),(716,817,'p'),(845,954,'p'),(982,1118,'p'),(1148,1337,'p')]),
 ('Lane between Pendrell and Davie','south',852,[(594,689,'p'),(716,817,'p'),(845,950,'p'),(1013,1066,'p')]),
 ('Davie','north',880,[(596,694,'2'),(718,818,'2'),(850,950,'2')]),
]
# Vertical curbs are split at lanes as well as changes in regulation.
V = [
 ('Bidwell','west',402,[(239,276,'2'),(294,327,'p'),(466,493,'p'),(513,550,'2'),(579,606,'p'),(624,650,'2'),(651,662,'p'),(685,718,'p')]),
 ('Cardero','west',566,[(294,327,'p'),(355,387,'p'),(406,438,'p'),(466,493,'p'),(519,550,'p'),(573,606,'p'),(630,660,'p'),(803,829,'p')]),
 ('Cardero','east',599,[(741,774,'p')]),
 ('Nicola','west',689,[(294,327,'p'),(353,380,'p'),(406,438,'p'),(460,478,'2'),(523,550,'2'),(573,606,'p'),(630,661,'p'),(689,718,'p'),(737,774,'2'),(853,877,'p')]),
 ('Broughton','west',812,[(294,327,'p'),(355,387,'p'),(466,493,'p'),(519,550,'p'),(630,657,'p'),(685,718,'p'),(741,774,'p')]),
 ('Jervis','west',954,[(294,326,'p'),(355,387,'p'),(405,437,'p'),(467,495,'p'),(519,550,'p'),(575,606,'p'),(630,657,'p'),(683,720,'2'),(741,774,'p'),(803,830,'p')]),
 ('Bute','west',1118,[(294,318,'p'),(399,436,'2'),(466,495,'p'),(517,548,'p'),(571,606,'p'),(636,657,'p'),(801,830,'p')]),
 ('Bute','east',1152,[(683,722,'2'),(736,773,'p')]),
 ('Thurlow','west',1343,[(290,326,'p'),(351,380,'p'),(465,494,'p')]),
 ('Thurlow','east',1378,[(573,605,'p'),(627,660,'p')]),
]

def locate(v, axis):
 i = max(0,min(len(axis)-2,bisect.bisect_right(axis,v)-1))
 return i,(v-axis[i])/(axis[i+1]-axis[i])

def geo(x,y):
 col,u=locate(x,X);row,v=locate(y,Y)
 corners=[grid['intersections'][row][col],grid['intersections'][row][col+1],grid['intersections'][row+1][col],grid['intersections'][row+1][col+1]]
 weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v]
 assert all(point is not None or weight == 0 for point,weight in zip(corners,weights)), 'Unlocated street intersection'
 return [round(sum(point[j]*weight for point,weight in zip(corners,weights) if weight),6) for j in (0,1)]

def curb_geometry(street, side, trace, orientation):
 # Place a symbolic curb beside the street, not on parcel edges from the diagram.
 # Lane centrelines are only midpoint estimates; all geometry stays approximate.
 lane = street.startswith('Lane between ')
 if orientation == 'h':
  if lane:
   names = street.removeprefix('Lane between ').upper().split(' AND ')
   row = grid['rows'].index(names[0]); centre = (Y[row] + Y[row+1]) / 2
  else:
   centre = Y[grid['rows'].index(street.upper())]
  points = [geo(x, centre) for x, _ in trace]
  sign = 1 if side == 'north' else -1
 else:
  centre = X[grid['columns'].index(street.upper())]
  points = [geo(centre, y) for _, y in trace]
  sign = 1 if side == 'east' else -1
 dx = (points[1][0]-points[0][0])*math.cos(math.radians(49.285))*111320
 dy = (points[1][1]-points[0][1])*111320
 length = math.hypot(dx,dy); offset = (3 if lane else 6)*sign
 return [[round(lon-dy/length*offset/(111320*math.cos(math.radians(lat))),6),
          round(lat+dx/length*offset/111320,6)] for lon,lat in points]

records=[]
for orientation,rows in [('h',H),('v',V)]:
 for street,side,fixed,segments in rows:
  for start,end,cat in segments:
   trace=[[start,fixed],[end,fixed]] if orientation=='h' else [[fixed,start],[fixed,end]]
   idx,_=locate((start+end)/2,X if orientation=='h' else Y)
   between=(grid['columns'] if orientation=='h' else grid['rows'])[idx:idx+2]
   key=f'{street}-{side}-{start}-{end}-{fixed}-{cat}'
   ident='wep-'+hashlib.sha256(key.encode()).hexdigest()[:12]
   schedule={'days':[0,1,2,3,4,5,6],'start':0,'end':1440} if cat=='p' else {'days':[1,2,3,4,5,6] if cat=='2' else None,'start':540,'end':1200 if cat=='2' else 1080}
   checks=[]
   if street=='Barclay' and side=='south' and cat=='1':
    schedule['days']=[1,2,3,4,5,6]
    checks=[{'status':'user-reported-sign-check','imageryDate':'2024-08','location':'South side just east of Denman','finding':'1 hour, 9am–6pm, Mon–Sat. PDF omits days.','url':None,'scope':'Local sign only; exact sign limits and current restrictions unverified.'}]
   if street=='Bidwell' and side=='west' and start==513:
    checks=[{'status':'user-reported-tentative-match','imageryDate':'2024-08','location':'West side just north of Nelson','finding':'Appears to match 2 hours, 9am–8pm, Mon–Sat.','url':None,'scope':'Local sign only; tentative observation, not current field verification.'}]
   records.append({'id':ident,'street':street,'side':side,'between':[x.title() for x in between],'category':'permit' if cat=='p' else 'time-limited','limitMinutes':None if cat=='p' else int(cat)*60,'schedule':schedule,'pdfSchedule':{'days':None if cat=='1' else schedule['days'],'start':schedule['start'],'end':schedule['end']},'outsideSchedule':'unknown' if cat!='p' else 'not-applicable','verification':'historical-spot-check' if checks else 'pdf-only','spotChecks':checks,'schematicTrace':trace,'geometry':{'type':'LineString','coordinates':curb_geometry(street,side,trace,orientation)},'geometryStatus':'approximate-schematic','sourceIds':['city-pdf','city-streets']})
out={'version':1,'sources':{'city-pdf':{'url':SOURCE,'title':'City of Vancouver West End Plateau parking guide','publicationDate':None,'sha256':'b616f0cd4370dbe8d21fca1060f97caaa01bd5d61b71f2ace4acc31145df2341','retrieved':'2026-09-22'},'city-streets':{'url':grid['source'],'title':'City of Vancouver public streets (location reference only)','retrieved':grid['retrieved']}},'geometryNote':'Approximate schematic sections, not surveyed curb or sign boundaries. Line lengths, lane positions and endpoints are illustrative. Check posted signs for exact extent, driveways and other restrictions.','restrictionNote':'The PDF is a guide only. No current field verification. Missing days and rules outside listed hours remain unknown; no permit exemptions or unrestricted hours are inferred.','sections':records}
header = json.dumps({k:v for k,v in out.items() if k != 'sections'}, indent=2)[:-2]
(ROOT/'data/west-end-plateau.json').write_text(header + ',\n  \"sections\": [\n' + ',\n'.join('    '+json.dumps(r,separators=(',', ':')) for r in records) + '\n  ]\n}\n')
print(f'Wrote {len(records)} approximate sections')
