# Generates palette-{day,dusk,night}.png: 16x16, 1 pixel = 1 slot, slot (col,row). Same layout for all moods.
from PIL import Image
SLOTS=[ # (row,col,name)
 (0,0,'grass'),(0,1,'grass_light'),(0,2,'grass_warm'),(0,3,'path'),(0,4,'dirt'),(0,5,'rock'),(0,6,'rock_dark'),(0,7,'cliff'),(0,8,'water'),(0,9,'water_deep'),(0,10,'foam'),
 (1,0,'wall_cream'),(1,1,'wall_peach'),(1,2,'wall_white'),(1,3,'roof_teal'),(1,4,'roof_teal_dark'),(1,5,'roof_red'),(1,6,'roof_brown'),(1,7,'door_wood'),(1,8,'window_glass'),(1,9,'window_frame'),(1,10,'chimney'),(1,11,'fence_wood'),
 (2,0,'trunk'),(2,1,'leaf'),(2,2,'leaf_light'),(2,3,'leaf_dark'),(2,4,'flower_red'),(2,5,'flower_yellow'),(2,6,'flower_white'),(2,7,'bush'),
 (3,0,'raincoat'),(3,1,'scarf'),(3,2,'skin'),(3,3,'boots'),(3,4,'bag'),(3,5,'envelope'),(3,6,'hat'),
 (4,0,'window_light'),(4,1,'lamp_glow'),(4,2,'lamp_metal'),(4,3,'warm_glow_soft'),(4,4,'star'),
 (5,0,'sky_top'),(5,1,'sky_horizon'),(5,2,'fog_near'),(5,3,'fog_far'),(5,4,'cloud'),(5,5,'outline'),(5,6,'hemi_sky'),(5,7,'hemi_ground'),(5,8,'sun_light'),
]
day=dict(grass='#7fae55',grass_light='#a3c46a',grass_warm='#b3b45a',path='#e3cf9c',dirt='#a9825a',rock='#9a958c',rock_dark='#6e6a66',cliff='#8a7660',water='#4fa3c7',water_deep='#2f7aa6',foam='#e6f3f2',
 wall_cream='#efe2c2',wall_peach='#e3b08c',wall_white='#f5eedd',roof_teal='#3f8a96',roof_teal_dark='#2c6574',roof_red='#b8574a',roof_brown='#8a5e44',door_wood='#7a5236',window_glass='#5f7f94',window_frame='#d9cfb5',chimney='#a38a78',fence_wood='#9a7350',
 trunk='#7a5a3e',leaf='#5f9a4c',leaf_light='#86b55a',leaf_dark='#3f7448',flower_red='#d4594e',flower_yellow='#f0cc5a',flower_white='#f4efe2',bush='#4f8a4a',
 raincoat='#e0aa36',scarf='#c8403a',skin='#f0c9a4',boots='#5b4636',bag='#8c5a3a',envelope='#f6efdc',hat='#d39a2c',
 window_light='#7f9cae',lamp_glow='#e8dcb0',lamp_metal='#4b4f52',warm_glow_soft='#d8cfa8',star='#ffffff',
 sky_top='#6fb8c4',sky_horizon='#bfe0dc',fog_near='#a8cfd2',fog_far='#c4e0de',cloud='#f6f4ec',outline='#373f42',hemi_sky='#c4dde6',hemi_ground='#7a6a50',sun_light='#fff2dd')
dusk=dict(day,grass='#7d9450',grass_light='#a2a85e',grass_warm='#b89a52',path='#e6b98c',dirt='#9a6a4c',rock='#9a8580',rock_dark='#665656',cliff='#86625a',water='#5a7fb0',water_deep='#3c5688',foam='#f0d6c8',
 wall_cream='#f2d2ae',wall_peach='#e89f80',wall_white='#f6dcc4',roof_teal='#3d7686',roof_teal_dark='#2b5464',roof_red='#b84a44',roof_brown='#7e5040',door_wood='#6e4430',window_glass='#e9b25e',window_frame='#d8b89c',chimney='#9a786c',fence_wood='#8e6248',
 trunk='#6a4836',leaf='#5c8046',leaf_light='#8a9a52',leaf_dark='#2f6048',bush='#4a7a46',flower_yellow='#f2b850',
 raincoat='#e39e34',scarf='#cc3a38',skin='#f0b892',boots='#4e3a30',hat='#d08a2c',
 window_light='#ffc867',lamp_glow='#ffd27a',warm_glow_soft='#f0a860',
 sky_top='#6a5a8e',sky_horizon='#f29a6a',fog_near='#d8a090',fog_far='#e6b096',cloud='#f4b8a0',hemi_sky='#e0b8a0',hemi_ground='#5a5a3a',sun_light='#ffbe8a')
night=dict(day,grass='#2e5a4e',grass_light='#3a6a58',grass_warm='#46604c',path='#c4baa4',dirt='#6a5a52',rock='#6e7484',rock_dark='#4a5060',cliff='#5a5a64',water='#2c62c0',water_deep='#173e88',foam='#b8d4f0',
 wall_cream='#ece4d0',wall_peach='#dcbcaa',wall_white='#f2eee4',roof_teal='#2f6a7a',roof_teal_dark='#204a5a',roof_red='#8a4a52',roof_brown='#5e4a48',door_wood='#5a4038',window_glass='#ffcf6a',window_frame='#a8a49a',chimney='#706870',fence_wood='#6a5448',
 trunk='#4e4040',leaf='#28503f',leaf_light='#31594a',leaf_dark='#1e4038',bush='#2a4c46',flower_red='#a84a5a',flower_yellow='#d8c070',flower_white='#c8d0d8',
 raincoat='#f0b840',scarf='#e04850',skin='#f4cdb0',boots='#4e4248',bag='#8a5e48',envelope='#f6f0dc',hat='#dca440',
 window_light='#ffcf6a',lamp_glow='#ffe08a',lamp_metal='#3a3e48',warm_glow_soft='#f0a850',star='#fff6d8',
 sky_top='#1a2350',sky_horizon='#3a4f8a',fog_near='#3a4a78',fog_far='#465a8a',cloud='#56628e',hemi_sky='#4a5a8c',hemi_ground='#34344a',sun_light='#5a6aa0')
def hx(s):return tuple(int(s[i:i+2],16) for i in (1,3,5))
for n,p in [('day',day),('dusk',dusk),('night',night)]:
  im=Image.new('RGB',(16,16),(255,0,255))  # magenta = unused slot
  for r,c,k in SLOTS: im.putpixel((c,r),hx(p[k]))
  im.save(f'palette-{n}.png')
  big=im.resize((512,512),Image.NEAREST); big.save(f'palette-{n}-x32.png')
import json;json.dump({k:[c,r] for r,c,k in SLOTS},open('slots.json','w'),indent=0)
