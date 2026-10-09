"""usage: python tools/contact.py <out.png> <cols> img1 img2 ... (labels = file stems)"""
import sys,os
from PIL import Image,ImageDraw
out,cols,files=sys.argv[1],int(sys.argv[2]),sys.argv[3:]
ims=[Image.open(f).convert('RGB') for f in files];w,h=640,360
sheet=Image.new('RGB',(w*cols,h*((len(ims)+cols-1)//cols)),'black');d=ImageDraw.Draw(sheet)
for i,(f,im) in enumerate(zip(files,ims)):
    x,y=(i%cols)*w,(i//cols)*h;sheet.paste(im.resize((w,h)),(x,y));d.rectangle([x,y,x+180,y+18],fill='black');d.text((x+4,y+3),os.path.splitext(os.path.basename(f))[0],fill='yellow')
sheet.save(out);print(out,sheet.size)
