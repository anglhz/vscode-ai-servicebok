import bidiFactory from "bidi-js";
const bidi = bidiFactory();

// Keep each directional run logical for Fontkit's shaping. Only reorder runs,
// not Arabic letters: Fontkit supplies connected forms and RTL glyph order.
export function visualRuns(text:string,direction?:"ltr"|"rtl") {
  const embedding = bidi.getEmbeddingLevels(text,direction);
  const indices = Array.from({length:text.length},(_,i)=>i);
  for (const [start,end] of bidi.getReorderSegments(text,embedding)) {
    indices.splice(start,end-start+1,...indices.slice(start,end+1).reverse());
  }
  const visualIndex = new Map(indices.map((index,position)=>[index,position]));
  const mirrored = bidi.getMirroredCharactersMap(text,embedding);
  const runs:{text:string;position:number}[]=[];
  for (let start=0;start<text.length;) {
    let end=start+1;
    while(end<text.length && embedding.levels[end]===embedding.levels[start])end++;
    const positions=Array.from({length:end-start},(_,i)=>visualIndex.get(start+i)!);
    const value=text.slice(start,end).split("").map((char,i)=>mirrored.get(start+i) ?? char).join("");
    runs.push({text:value,position:Math.min(...positions)});start=end;
  }
  return runs.sort((a,b)=>a.position-b.position).map(run=>run.text);
}

export function drawBidiText(doc:PDFKit.PDFDocument,value:string,left:number,width:number,bottom:number) {
  let direction:"ltr"|"rtl"="ltr";
  const measure=(text:string)=>visualRuns(text,direction).reduce((sum,run)=>sum+doc.widthOfString(run,{features:[]}),0);
  const lineHeight=doc.currentLineHeight(true)+3;
  const line=(text:string)=>{
    if(doc.y+lineHeight>bottom)doc.addPage();
    const y=doc.y;let x=left;
    for(const run of visualRuns(text,direction)) {
      doc.text(run,x,y,{lineBreak:false,features:[]});x+=doc.widthOfString(run,{features:[]});
    }
    doc.x=left;doc.y=y+lineHeight;
  };
  for(const paragraph of value.split("\n")) {
    direction=(bidi.getEmbeddingLevels(paragraph).paragraphs[0]?.level ?? 0)%2 ? "rtl" : "ltr";
    let current="";
    for(const word of paragraph.match(/\S+\s*|\s+/gu) ?? []) {
      if(current && measure(current+word)>width){line(current.trimEnd());current="";}
      if(measure(word)<=width){current+=word;continue;}
      // Grapheme boundaries preserve combining marks/surrogate pairs in long words.
      for(const {segment} of new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(word)) {
        if(current && measure(current+segment)>width){line(current);current="";}
        current+=segment;
      }
    }
    line(current.trimEnd());
  }
}
