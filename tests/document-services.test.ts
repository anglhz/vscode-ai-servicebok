import { beforeEach,describe,it,expect,vi } from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({access:vi.fn(),rpc:vi.fn(),from:vi.fn(),remove:vi.fn(),signUpload:vi.fn(),signDownload:vi.fn()}));
vi.mock("@/lib/permissions/vehicle",()=>({requireVehicleAccess:mocks.access}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:mocks.rpc,storage:{from:()=>({remove:mocks.remove,createSignedUploadUrl:mocks.signUpload,createSignedUrl:mocks.signDownload})}})}));
import {createDocument,finalizeDocument,softDeleteDocument,createDocumentDownloadUrl,cleanupDocuments,getDocumentsForVehicle,getDocumentsForEvent} from "@/services/documents";
const v="11111111-1111-4111-8111-111111111111",id="22222222-2222-4222-8222-222222222222";
const path=`${v}/${id}/original`;
const input={file_name:"kvitto.pdf",mime_type:"application/pdf",file_size_bytes:100,document_type:"receipt"};
function query(data:unknown){
  const q={select:vi.fn(),eq:vi.fn(),is:vi.fn(),maybeSingle:vi.fn()};
  q.select.mockReturnValue(q);q.eq.mockReturnValue(q);q.is.mockReturnValue(q);q.maybeSingle.mockResolvedValue({data,error:null});return q;
}
beforeEach(()=>{
  vi.resetAllMocks();mocks.access.mockResolvedValue({supabase:{from:mocks.from,storage:{from:()=>({createSignedUrl:mocks.signDownload})}}});
  mocks.rpc.mockImplementation(async(name:string)=>({data:name==="document_cleanup_candidates"?[]:name==="create_document"?[{id,storage_path:path}]:name==="soft_delete_document"?path:id,error:null}));
  mocks.remove.mockResolvedValue({error:null});mocks.signUpload.mockResolvedValue({data:{token:"temporary-token"},error:null});
  mocks.signDownload.mockResolvedValue({data:{signedUrl:"https://storage.example/short-lived"},error:null});
});
describe("document services",()=>{
  it("requires vehicle access before metadata, storage or signing access",async()=>{
    mocks.access.mockRejectedValue(new Error("denied"));
    for(const operation of [()=>createDocument(v,null,input),()=>finalizeDocument(v,id),()=>softDeleteDocument(v,id),()=>createDocumentDownloadUrl(v,id),()=>getDocumentsForVehicle(v),()=>getDocumentsForEvent(v,id)])await expect(operation()).rejects.toThrow("denied");
    expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.signDownload).not.toHaveBeenCalled();expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("validates server metadata before reserving or uploading",async()=>{
    await expect(createDocument(v,null,{...input,mime_type:"text/html"})).rejects.toThrow();
    await expect(createDocument(v,null,{...input,file_size_bytes:15728641})).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.signUpload).not.toHaveBeenCalled();
  });
  it("reserves without client identity and signs exactly the database-generated path without upsert",async()=>{
    expect(await createDocument(v,id,{...input,user_id:"other",storage_path:"../evil"})).toEqual({id,path,token:"temporary-token"});
    expect(mocks.rpc).toHaveBeenCalledWith("create_document",{p_vehicle_id:v,p_event_id:id,p_file_name:"kvitto.pdf",p_mime_type:"application/pdf",p_file_size_bytes:100,p_document_type:"receipt"});
    expect(mocks.signUpload).toHaveBeenCalledWith(path,{upsert:false});
  });
  it("does not upload on metadata failure and discards pending metadata on signing failure",async()=>{
    mocks.rpc.mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({error:{message:"private details"}});
    await expect(createDocument(v,null,input)).rejects.toThrow("Dokumentet kunde inte förberedas.");expect(mocks.signUpload).not.toHaveBeenCalled();
    mocks.signUpload.mockResolvedValue({error:{message:"private details"}});
    await expect(createDocument(v,null,input)).rejects.toThrow();
    expect(mocks.rpc).toHaveBeenCalledWith("soft_delete_document",{p_vehicle_id:v,p_document_id:id,p_pending_only:true});
  });
  it("uses database finalization rather than trusting browser success",async()=>{
    await finalizeDocument(v,id);expect(mocks.rpc).toHaveBeenCalledWith("finalize_document",{p_vehicle_id:v,p_document_id:id});
    mocks.rpc.mockResolvedValue({error:{message:"raw storage error"}});
    await expect(finalizeDocument(v,id)).rejects.toThrow("Dokumentet kunde inte bekräftas.");
  });
  it("signs a single ready, nondeleted document for five minutes with attachment disposition",async()=>{
    const q=query({storage_path:path,file_name:"kvitto.pdf"});mocks.from.mockReturnValue(q);
    expect(await createDocumentDownloadUrl(v,id)).toBe("https://storage.example/short-lived");
    expect(q.eq).toHaveBeenCalledWith("vehicle_id",v);expect(q.eq).toHaveBeenCalledWith("upload_status","ready");expect(q.is).toHaveBeenCalledWith("deleted_at",null);
    expect(mocks.signDownload).toHaveBeenCalledWith(path,300,{download:"kvitto.pdf"});
  });
  it("does not sign unavailable/soft deleted metadata",async()=>{
    mocks.from.mockReturnValue(query(null));await expect(createDocumentDownloadUrl(v,id)).rejects.toThrow("Dokumentet kunde inte öppnas.");expect(mocks.signDownload).not.toHaveBeenCalled();
  });
  it("hides metadata before physical removal and leaves failed removals retryable",async()=>{
    mocks.remove.mockImplementation(async()=>{expect(mocks.rpc).toHaveBeenCalledWith("soft_delete_document",{p_vehicle_id:v,p_document_id:id,p_pending_only:false});return {error:{message:"storage offline"}};});
    await softDeleteDocument(v,id);expect(mocks.remove).toHaveBeenCalledWith([path]);
    mocks.rpc.mockResolvedValue({data:[{id,storage_path:path}],error:null});
    await cleanupDocuments(v);expect(mocks.rpc).not.toHaveBeenCalledWith("complete_document_cleanup",expect.anything());
  });
  it("acknowledges cleanup only after Storage remove succeeds",async()=>{
    mocks.rpc.mockResolvedValue({data:[{id,storage_path:path}],error:null});await cleanupDocuments(v);
    expect(mocks.rpc).toHaveBeenCalledWith("complete_document_cleanup",{p_vehicle_id:v,p_document_id:id});
  });
});
