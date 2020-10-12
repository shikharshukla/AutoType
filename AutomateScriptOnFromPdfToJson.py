#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Created on Tue Apr 30 21:10:36 2019

@author: shikhar
"""

import numpy as np
import cv2
import PossibleChar
import Preprocess
import pytesseract
import argparse
import os
import json
import glob
import os
import pdf2image
import base64

config = ('-l eng --oem 1 --psm 6')


def convert(size,x,y,w,h):
    x = x*size[1]
    y = y*size[0]
    w = w*size[1]
    h = h*size[0]
    b0 = (2*x-w)/2
    b1 = (2*x+w)/2
    b2 = (2*y-h)/2
    b3 = (2*y+h)/2
    return (int(b0),int(b1),int(b2),int(b3))


def RemoveOverlapping(ContourList):
    ResultList = []
    Size = len(ContourList)
    add = 1
    for i  in range(0,Size,1):
        add = True
        x,y,w,h = ContourList[i].boundingRect
        x1,y1,x2,y2 = x,y,x+w,y+h
        for j in range(0,Size,1):
            xr,yr,wr,hr = ContourList[j].boundingRect
            xr1,yr1,xr2,yr2 = xr,yr,xr+wr,yr+hr
            if (((x2 < xr1) or (x1 > xr2)) == False and ((y1 > yr2) or (y2 < yr1)) == False):
                if ContourList[i].intBoundingRectArea < ContourList[j].intBoundingRectArea:
                    add = add and False
        if add:
            ResultList.append(ContourList[i])
            
    return ResultList

def GetLatex(img):
    return ' '


def ProcessText(img,size,box,annotations):
    #print(img.shape,box[1],box[3],box[0],box[2])
    Region = img[box[1]:box[3],box[0]:box[2]]
    IncludedLatex = []
    for latex in annotations:
        #print(len(latex[1:]))
        x,y,w,h = map(float,latex[1:])
        x1,x2,y1,y2 = convert(size,x,y,w,h)
        if (((x1>box[2]) or (box[0]>x2))==False and ((y1>box[3]) or (box[1]>y2))==False):
            Region[y1 - box[1]:y2 - box[1],x1 - box[0]:x2 - box[0]] = 255
            IncludedLatex.append(latex)
    gray = cv2.cvtColor(Region, cv2.COLOR_BGR2GRAY)
    th, threshed = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY_INV|cv2.THRESH_OTSU)
    
    row_sum = cv2.reduce(threshed,1,cv2.REDUCE_AVG,dtype=cv2.CV_32F)
    
    Lines = []
    index = 0
    recorded = False
    h,W,_ = Region.shape
    for h in range(h):
        if row_sum[h] != 0 and recorded == False:
            Lines.append((index+h)/2)
            recorded = True
        elif recorded == True and row_sum[h] == 0:
            index = h
            recorded = False
    Lines.append(h)
    TextLinesCoords = [(0,W,int(Lines[i]),int(Lines[i+1])) for i in range(len(Lines)-1)]
    TextLines = [Region[int(Lines[i]):int(Lines[i+1]),:,:] for i in range(len(Lines)-1)]
    LinesText = []
    TextLinesTemp = TextLines.copy()
    TextLinesCoordsTemp = TextLinesCoords.copy()
    # Break in words
    for clip,clipcoord in zip(TextLinesTemp,TextLinesCoordsTemp):    
        gray = cv2.cvtColor(clip, cv2.COLOR_BGR2GRAY)
        th, threshed = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY_INV|cv2.THRESH_OTSU)
        """
        cv2.imshow('image',Region[clipcoord[2]:clipcoord[3],clipcoord[0]:clipcoord[1],:])
        cv2.waitKey(0)
        cv2.destroyAllWindows()
        """
        col_sum = cv2.reduce(threshed,0,cv2.REDUCE_SUM,dtype=cv2.CV_32F).flatten()
        
        Words = []
        index = 0
        recorded = False
        h,W,_ = clip.shape
        for w in range(W-16):
            if col_sum[w:w+10].sum() != 0 and recorded == False:
                Words.append(w)
                recorded = True
            elif recorded == True and col_sum[w:w+10].sum() == 0:
                index = w
                recorded = False
        
        Words.append(W)
        LineStr = []
        LineLatex = []
        for latex in IncludedLatex:
            x,y,w,h = map(float,latex[1:])
            x1,x2,y1,y2 = convert(size,x,y,w,h)
            if (((x1>clipcoord[1]) or (clipcoord[0]>x2))==False and ((y1>clipcoord[2]) or (clipcoord[3]>y2))==False):
                LineLatex.append(latex)
        WordsLines = [clip[:,int(Words[i]):int(Words[i+1]),:] for i in range(len(Words)-1)]
        #print(clipcoord)
        WordsCoords = [(int(Words[i]),int(Words[i+1]),clipcoord[2],clipcoord[3]) for i in range(len(Words)-1)]
        for word,wordcoord in zip(WordsLines,WordsCoords):
            text = pytesseract.image_to_string(word,config=config)
            for latex in LineLatex:
                x,y,w,h = map(float,latex[1:])
                x1,x2,y1,y2 = convert(size,x,y,w,h)
                if (((x1>wordcoord[1]) or (wordcoord[0]>x2))==False and ((y1>wordcoord[2]) or (wordcoord[3]>y2))==False): 
                    LatexText = GetLatex(latex)
                    text = LatexText + ' ' + text
                    break
            LineStr.append(text)
        LinesText.append(' '.join(LineStr))
    return TextLinesCoords,LinesText
    
    

def detector(filename):
    imgOriginal = cv2.imread(filename)
    size = imgOriginal.shape
    DirName = os.path.dirname(filename)
    fn,ext = os.path.splitext(os.path.basename(filename))
    if os.path.exists(os.path.join(DirName,'%s.txt'%(fn))) == True: 
        AnnotationFile = os.path.join(DirName,'%s.txt'%(fn))
        annotations = open(AnnotationFile).read().split('\n')
        annotations = [a.split(' ') for a in annotations]
    else:
        annotations = []
    _,img = Preprocess.preprocess(imgOriginal)
    kernel = np.ones((9,9),np.uint8)
    img_dilated = cv2.dilate(img,kernel,iterations = 2)
    """
    cv2.imshow('image',img_dilated)
    cv2.waitKey(0)
    cv2.destroyAllWindows()
    """
    _,con,_ = cv2.findContours(img_dilated,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    
    ContourList = []
    for c in con:
        ContourList.append(PossibleChar.PossibleChar(c))
    
    ContourList = RemoveOverlapping(ContourList)
    fn,ext = os.path.splitext(os.path.basename(filename))
    i = 0
    result = []
    for c in ContourList:
        x,y,w,h = c.boundingRect
        Divs = []
        i+=1
        x1,y1,x2,y2 = x,y,x+w,y+h
        imgC = imgOriginal.copy()
        text = pytesseract.image_to_string(imgC[y1:y2,x1:x2],config=config)
        c.string = text
        if text == '':
            c.Category = "img"
            cv2.imwrite("%s_%d.png"%(c.Category,i),imgC[y1:y2,x1:x2])
            ImageString = "data:image/jpg;base64," + str(base64.b64encode(open("%s_%d.png"%(c.Category,i), "rb").read()))
            Divs.append(str({"Image":ImageString,"ObjectType":c.Category[0],"x1":x1,"x2":x2,"y1":y1,"y2":y2, "Content":text}))
            os.remove("%s_%d.png"%(c.Category,i))
        else:
            c.Category = "txt" 
            LineCoords,LineText = ProcessText(imgC,size,(x1,y1,x2,y2),annotations)
            for i1,obj in enumerate(zip(LineCoords,LineText)):
                #print(imgC.shape,obj)
                cv2.imwrite("%s_%d_Line-%d.png"%(c.Category,i,i1),imgC[y1:y2,x1:x2][obj[0][2]:obj[0][3],obj[0][0]:obj[0][1]])
                ImageString = "data:image/jpg;base64," + str(base64.b64encode(open("%s_%d_Line-%d.png"%(c.Category,i,i1), "rb").read()))
                Divs.append({"FilePath":ImageString,"font":"1.7em arial, sans-serif","ObjectType":c.Category[0],"x1":x1+obj[0][0],"x2":x1+obj[0][1],"y1":y1+obj[0][2],"y2":y1+obj[0][3], "Content":obj[1]})
                os.remove("%s_%d_Line-%d.png"%(c.Category,i,i1))
        result.extend(Divs)
    
    #fp = open('%s/response.json'%(fn),'w')
    #s= ','.join(result)
    #s = s.replace('\"','"')
    #print(s,json.dumps("[{}]".format(s))[1:-1])
    return result

def Processor(filename):
    fn,ext = os.path.splitext(filename)
    if os.path.exists(fn) == False:
        os.mkdir(fn)
    pdf2image.convert_from_bytes(open(filename,'rb').read(),output_folder=fn,fmt='png')
    os.chdir(fn)
    ResultJsons = {}
    i = 0
    for f in glob.glob('*.png'):
        ResultJsons['Page-%d'%(i)] = detector(f)
        i+=1
    print(os.getcwd())
    fp = open('{}.json'.format(fn),'w')
    print(ResultJsons)
    json.dump(ResultJsons,fp,ensure_ascii=False,indent=1)
    #fp.write(json.dumps(ResultJsons,ensure_ascii=False,indent=1))
    fp.close()


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument("-f", "--filename", required=True,help="path to input dataset (i.e., directory of images)")
    args = ap.parse_args()
    os.chdir(args.filename)
    WorkingDir = os.getcwd()
    for f in glob.glob('*.pdf'):
        os.chdir(WorkingDir)
        Processor(f)
