import { describe, expect, it } from "vitest";
import { kronorToOre, oreToKronorInput } from "@/lib/utils/money";
import { serviceEventFormSchema } from "@/lib/validation/service-event";

const valid = { category:"service",title:" Service ",event_date:"2024-02-29",mileage:"",cost:"",description:"",provider_name:"",notes:"" };
describe("service form validation and money", () => {
  it.each([["4295",429500],["0,29",29],["0.01",1],["1,2",120],["21474836,47",2147483647],["0",0],["",null]])("converts %s exactly to öre", (value, amount) => {
    expect(kronorToOre(String(value))).toBe(amount);
    if (typeof amount === "number") expect(kronorToOre(oreToKronorInput(amount))).toBe(amount);
  });
  it.each(["-1","1,234","1e3","NaN","21474836,48","1.000,50"]) ("rejects invalid cost %s", value => { expect(() => kronorToOre(value)).toThrow(); });
  it("normalizes optional fields, trims title and strips client attribution", () => {
    expect(serviceEventFormSchema.parse({...valid,user_id:"other",source_type:"system"})).toEqual({category:"service",title:"Service",event_date:"2024-02-29",mileage:null,cost:null,description:null,provider_name:null,notes:null});
  });
  it.each([["title"," "],["category","bad"],["event_date","2023-02-29"],["event_date","2025-02-30"],["mileage","-1"],["mileage","1.5"],["mileage","2147483648"],["cost","3,123"],["provider_name","x".repeat(151)],["notes","x".repeat(5001)]])("rejects invalid %s", (field,value) => {
    expect(serviceEventFormSchema.safeParse({...valid,[field]:value}).success).toBe(false);
  });
  it("allows historical and future dates, and zero readings/costs", () => {
    for(const date of ["1886-01-01","2100-12-31"]) expect(serviceEventFormSchema.parse({...valid,event_date:date,mileage:"0",cost:"0"})).toMatchObject({event_date:date,mileage:0,cost:0});
  });
});
