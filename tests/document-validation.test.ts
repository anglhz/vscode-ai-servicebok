import { describe,it,expect } from "vitest";
import { documentUploadSchema, sanitizeFileName, MAX_DOCUMENT_BYTES } from "@/lib/validation/document";
const valid={file_name:"Kvitto.pdf",mime_type:"application/pdf",file_size_bytes:100,document_type:"receipt"};
describe("document validation",()=>{
  it("allows PDF/JPEG/PNG and the exact size boundary",()=>{
    for(const mime_type of ["application/pdf","image/jpeg","image/png"])expect(documentUploadSchema.safeParse({...valid,mime_type,file_size_bytes:MAX_DOCUMENT_BYTES}).success).toBe(true);
  });
  it.each([{mime_type:"text/html"},{mime_type:"image/svg+xml"},{mime_type:"image/heic"},{file_size_bytes:MAX_DOCUMENT_BYTES+1},{file_size_bytes:0},{file_name:"x".repeat(181)},{document_type:"bad"}])("rejects unsupported file metadata %j",value=>{
    expect(documentUploadSchema.safeParse({...valid,...value}).success).toBe(false);
  });
  it("sanitizes dangerous filename characters but preserves the readable filename",()=>{
    expect(sanitizeFileName(" /tmp\\kvitto\u0000\u202e.pdf ")).toBe("_tmp_kvitto.pdf");
    expect(documentUploadSchema.parse({...valid,uploaded_by_user_id:"other"})).toEqual(valid);
  });
});
