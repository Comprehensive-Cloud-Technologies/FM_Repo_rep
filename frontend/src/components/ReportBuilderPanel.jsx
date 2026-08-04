/**
 * ReportBuilderPanel.jsx  (v2 — User-Friendly Redesign)
 *
 * Layout:
 *  ┌── TOP TOOLBAR: Module tabs | View | Search | Actions ─────────────────┐
 *  ├── FILTER BAR:  Active chips + [+ Add Filter] + [Clear All] ───────────┤
 *  │   ↳ inline expandable add-filter row                                  │
 *  ├── TABLE CONTROLS: Columns | Group By | Sort | Format | Row count ─────┤
 *  │   ↳ collapsible Column Picker / Group Panel / CF panel                │
 *  ├── DATA TABLE (sticky header, zebra rows, click-to-sort, resize) ──────┤
 *  │   ↳ Σ totals footer row for numeric columns                          │
 *  └── PAGINATION footer ──────────────────────────────────────────────────┘
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { getApiBaseUrl } from "../utils/runtimeConfig";

const BASE = getApiBaseUrl();

async function apiFetch(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json().catch(() => null);
}

/* ─────────────────────────────────────────────────────────────────────────────
   MODULE REGISTRY
   ─────────────────────────────────────────────────────────────────────────── */
const MODULE_REGISTRY = {
  assets: {
    label: "Assets", icon: "🏥", color: "#2563eb",
    apiPath: "/api/company-portal/assets",
    transform: (raw) => {
      const rows = Array.isArray(raw) ? raw : (raw?.data ?? []);
      const now = Date.now();
      return rows.map((a) => {
        const m = typeof a.metadata === "string" ? JSON.parse(a.metadata) : (a.metadata || {});
        const mt = m.maintenanceTypes || {};
        const leg = (m.maintenanceType || "").toLowerCase();
        const maint = [
          (mt.warranty || leg==="warranty") && "Warranty",
          (mt.amc || leg==="amc") && "AMC",
          (mt.cmc || leg==="cmc") && "CMC",
          (mt.inHouse || leg==="in house") && "In House",
          (mt.catalyst || leg==="catalyst") && "Catalyst",
          (mt.highEnd || leg==="high end") && "High End",
          (mt.rented || leg==="rented") && "Rented",
        ].filter(Boolean).join(", ");
        const instDate = m.installationDate ? new Date(m.installationDate) : null;
        const ageYrs = instDate ? Math.round(((now - instDate.getTime()) / (1000*60*60*24*365.25))*10)/10 : null;
        const wEnd = m.warranty?.endDate || m.warrantyEnd || "";
        const wDaysLeft = wEnd ? Math.ceil((new Date(wEnd)-now)/(1000*60*60*24)) : null;
        const rawCrit = m.criticality || a.criticality || "";
        const category = rawCrit.toLowerCase().replace(/[_-]/g,"") === "critical" ? "Critical" : "Non-Critical";
        return {
          id: a.id,
          assetId:         a.generatedAssetId || a.assetUniqueId || "",
          equipmentName:   m.equipmentName || a.assetName || "",
          category,
          make:            m.make || m.manufacturer || "",
          model:           m.model || "",
          serialNo:        m.serialNo || "",
          department:      a.departmentName || "",
          building:        a.building || "",
          floor:           a.floor || "",
          room:            a.room || "",
          accessories:     m.accessories || "",
          maintenance:     maint,
          purchaseDate:    m.purchaseDate || "",
          installationDate:m.installationDate || "",
          warrantyStart:   m.warranty?.startDate || m.warrantyStart || "",
          warrantyEnd:     wEnd,
          amcStart:        m.amc?.startDate || m.amcStart || "",
          amcEnd:          m.amc?.endDate || m.amcEnd || "",
          dealer:          m.dealer || m.distributor || "",
          invoiceNo:       m.invoiceNo || "",
          mfgYear:         m.mfgYear || m.manufacturingYear || "",
          purchaseCost:    m.purchaseCost != null && m.purchaseCost !== "" ? (Number(m.purchaseCost)||0) : "",
          workingStatus:   m.workingStatus || a.workingStatus || "Working",
          approvedStatus:  (Number(a.isVerified)===1 || a.isVerified===true) ? "Verified" : "Unverified",
          rber:            m.rber ? "Yes" : "No",
          assignedTo:      a.assignedToName || "",
          taggedBy:        a.createdByName || "",
          taggedAt:        a.createdAt || "",
          remarks:         m.remarks || "",
          assetAgeYears:   ageYrs != null ? ageYrs : "",
          warrantyDaysLeft:wDaysLeft != null ? wDaysLeft : "",
          _raw: a,
        };
      });
    },
    fields: [
      { key:"assetId",         label:"Asset ID",             type:"text",    group:"Identity" },
      { key:"equipmentName",   label:"Equipment Name",       type:"text",    group:"Identity" },
      { key:"category",        label:"Category",             type:"select",  group:"Identity",    options:["Critical","Non-Critical"] },
      { key:"make",            label:"Make / Brand",         type:"text",    group:"Identity" },
      { key:"model",           label:"Model",                type:"text",    group:"Identity" },
      { key:"serialNo",        label:"Serial Number",        type:"text",    group:"Identity" },
      { key:"department",      label:"Department",           type:"text",    group:"Location" },
      { key:"building",        label:"Building",             type:"text",    group:"Location" },
      { key:"floor",           label:"Floor",                type:"text",    group:"Location" },
      { key:"room",            label:"Room",                 type:"text",    group:"Location" },
      { key:"accessories",     label:"Accessories",          type:"text",    group:"Details" },
      { key:"maintenance",     label:"Maintenance Type",     type:"text",    group:"Maintenance" },
      { key:"purchaseDate",    label:"Purchase Date",        type:"date",    group:"Financials" },
      { key:"installationDate",label:"Installation Date",    type:"date",    group:"Details" },
      { key:"warrantyStart",   label:"Warranty Start",       type:"date",    group:"Maintenance" },
      { key:"warrantyEnd",     label:"Warranty End",         type:"date",    group:"Maintenance" },
      { key:"amcStart",        label:"AMC Start",            type:"date",    group:"Maintenance" },
      { key:"amcEnd",          label:"AMC End",              type:"date",    group:"Maintenance" },
      { key:"dealer",          label:"Dealer / Distributor", type:"text",    group:"Financials" },
      { key:"invoiceNo",       label:"Invoice No.",          type:"text",    group:"Financials" },
      { key:"mfgYear",         label:"Mfg. Year",            type:"text",    group:"Details" },
      { key:"purchaseCost",    label:"Purchase Cost (₹)",    type:"number",  group:"Financials" },
      { key:"workingStatus",   label:"Working Status",       type:"select",  group:"Status", options:["Working","Active","HNF","WIP","Not Working","Inactive","RBER","Condemned"] },
      { key:"approvedStatus",  label:"Approved Status",      type:"select",  group:"Status", options:["Verified","Unverified"] },
      { key:"rber",            label:"RBER",                 type:"select",  group:"Status", options:["Yes","No"] },
      { key:"assignedTo",      label:"Assigned Engineer",    type:"text",    group:"Status" },
      { key:"taggedBy",        label:"Tagged By",            type:"text",    group:"Status" },
      { key:"taggedAt",        label:"Tagged Date",          type:"datetime",group:"Status" },
      { key:"remarks",         label:"Remarks",              type:"text",    group:"Details" },
      { key:"assetAgeYears",   label:"Asset Age (yrs)",      type:"number",  group:"Calculated", calc:true },
      { key:"warrantyDaysLeft",label:"Warranty Days Left",   type:"number",  group:"Calculated", calc:true },
    ],
    defaultFields:["assetId","equipmentName","category","make","model","department","building","workingStatus","maintenance","purchaseCost"],
  },

  tickets: {
    label:"Ticket Master", icon:"🔧", color:"#7c3aed",
    apiPath:"/api/company-portal/work-orders?limit=500",
    transform: (raw) => {
      const rows = raw?.data ?? (Array.isArray(raw) ? raw : []);
      return rows.map((w) => {
        const c=w.createdAt?new Date(w.createdAt):null, wi=w.wipAt?new Date(w.wipAt):null,
              cl=w.closedAt?new Date(w.closedAt):null, re=w.resolutionAt?new Date(w.resolutionAt):null;
        return {
          id:w.id,
          woNumber:      w.workOrderNumber||`WO-${w.id}`,
          assetName:     w.assetName||"",
          description:   w.issueDescription||"",
          priority:      w.priority||"",
          status:        (w.status||"").replace(/_/g," "),
          source:        w.issueSource||"manual",
          raisedBy:      w.createdByName||"",
          assignedTo:    w.assignedToName||"",
          createdAt:     w.createdAt||"",
          wipAt:         w.wipAt||"",
          resolutionAt:  w.resolutionAt||"",
          closedAt:      w.closedAt||"",
          escalationLevel:Number(w.escalationLevel)||0,
          responseMins:  (c&&wi)  ? Math.max(0,Math.round((wi-c)/60000))  : "",
          tatMins:       (c&&cl)  ? Math.max(0,Math.round((cl-c)/60000))  : "",
          downtimeMins:  (wi&&re) ? Math.max(0,Math.round((re-wi)/60000)) : "",
          _raw:w,
        };
      });
    },
    fields:[
      {key:"woNumber",      label:"WO Number",           type:"text",   group:"Identity"},
      {key:"assetName",     label:"Asset",               type:"text",   group:"Identity"},
      {key:"description",   label:"Description",         type:"text",   group:"Details"},
      {key:"priority",      label:"Priority",            type:"select", group:"Details", options:["critical","high","medium","low"]},
      {key:"status",        label:"Status",              type:"select", group:"Status",  options:["open","in progress","assigned","on hold","completed","closed","escalated"]},
      {key:"source",        label:"Source",              type:"select", group:"Details", options:["manual","flag","logsheet","checklist"]},
      {key:"raisedBy",      label:"Raised By",           type:"text",   group:"People"},
      {key:"assignedTo",    label:"Assigned To",         type:"text",   group:"People"},
      {key:"createdAt",     label:"Logged At",           type:"datetime",group:"Time"},
      {key:"wipAt",         label:"WIP Date",            type:"datetime",group:"Time"},
      {key:"resolutionAt",  label:"Resolution Date",     type:"datetime",group:"Time"},
      {key:"closedAt",      label:"Closed At",           type:"datetime",group:"Time"},
      {key:"responseMins",  label:"Response Time (mins)",type:"number", group:"Calculated",calc:true},
      {key:"tatMins",       label:"TAT (mins)",          type:"number", group:"Calculated",calc:true},
      {key:"downtimeMins",  label:"Downtime (mins)",     type:"number", group:"Calculated",calc:true},
      {key:"escalationLevel",label:"Escalation Level",  type:"number", group:"Details"},
    ],
    defaultFields:["woNumber","assetName","priority","status","raisedBy","assignedTo","createdAt","responseMins","tatMins"],
  },

  departments: {
    label:"Departments", icon:"🏢", color:"#16a34a",
    apiPath:"/api/company-portal/departments",
    transform:(raw)=>(Array.isArray(raw)?raw:[]).map(d=>({id:d.id,departmentName:d.departmentName||d.name||"",description:d.description||"",status:d.status||"Active",_raw:d})),
    fields:[
      {key:"departmentName",label:"Department Name",type:"text",  group:"Identity"},
      {key:"description",   label:"Description",   type:"text",  group:"Details"},
      {key:"status",        label:"Status",        type:"select",group:"Status",options:["Active","Inactive"]},
    ],
    defaultFields:["departmentName","description","status"],
  },

  employees: {
    label:"Employees", icon:"👤", color:"#0891b2",
    apiPath:"/api/company-portal/employees",
    transform:(raw)=>(Array.isArray(raw)?raw:[]).map(e=>({
      id:e.id,
      fullName:e.fullName||e.full_name||"",
      username:e.username||"",
      role:e.role||"",
      designation:e.designation||"",
      department:e.departmentName||e.department_name||"",
      email:e.email||"",
      phone:e.phone||"",
      shift:e.shift||"",
      status:e.status||"Active",
      serviceDomain:e.serviceDomain||e.service_domain||"",
      createdAt:e.createdAt||e.created_at||"",
      _raw:e,
    })),
    fields:[
      {key:"fullName",     label:"Full Name",      type:"text",   group:"Identity"},
      {key:"username",     label:"Username",       type:"text",   group:"Identity"},
      {key:"role",         label:"Role",           type:"select", group:"Identity", options:["admin","supervisor","engineer","doctor","nurse","ward_boy","department_head"]},
      {key:"designation",  label:"Designation",    type:"text",   group:"Identity"},
      {key:"department",   label:"Department",     type:"text",   group:"Location"},
      {key:"email",        label:"Email",          type:"text",   group:"Contact"},
      {key:"phone",        label:"Phone",          type:"text",   group:"Contact"},
      {key:"shift",        label:"Shift",          type:"text",   group:"Details"},
      {key:"serviceDomain",label:"Service Domain", type:"text",   group:"Details"},
      {key:"status",       label:"Status",         type:"select", group:"Status",  options:["Active","Inactive"]},
      {key:"createdAt",    label:"Added On",       type:"datetime",group:"Details"},
    ],
    defaultFields:["fullName","role","designation","department","shift","status"],
  },

  transfers: {
    label:"Asset Transfers", icon:"↗", color:"#c2410c",
    apiPath:"/api/company-portal/assets/transfer/company-history?limit=500",
    transform:(raw)=>(raw?.rows||[]).map(r=>({
      id:r.id,
      reference:r.transfer_reference||"",
      assetName:r.assetName||"",
      assetCode:r.assetCode||"",
      fromCompany:r.from_company_name||"",
      toCompany:r.to_company_name||"",
      fromDept:r.from_department_name||"",
      toDept:r.to_department_name||"",
      transferredBy:r.transferred_by_name||"",
      transferredAt:r.transferred_at||"",
      direction:r.direction||"",
      reason:r.reason||"",
      remarks:r.remarks||"",
      status:r.status||"completed",
      _raw:r,
    })),
    fields:[
      {key:"reference",    label:"Transfer Ref",     type:"text",    group:"Identity"},
      {key:"assetName",    label:"Asset Name",        type:"text",    group:"Asset"},
      {key:"assetCode",    label:"Asset ID",          type:"text",    group:"Asset"},
      {key:"fromCompany",  label:"From Company",      type:"text",    group:"Transfer"},
      {key:"toCompany",    label:"To Company",        type:"text",    group:"Transfer"},
      {key:"fromDept",     label:"From Department",   type:"text",    group:"Transfer"},
      {key:"toDept",       label:"To Department",     type:"text",    group:"Transfer"},
      {key:"direction",    label:"Direction",         type:"select",  group:"Transfer", options:["in","out"]},
      {key:"transferredBy",label:"Transferred By",   type:"text",    group:"People"},
      {key:"transferredAt",label:"Transferred On",   type:"datetime",group:"Time"},
      {key:"reason",       label:"Reason",            type:"text",    group:"Details"},
      {key:"remarks",      label:"Remarks",           type:"text",    group:"Details"},
      {key:"status",       label:"Status",            type:"select",  group:"Status", options:["completed","pending","cancelled"]},
    ],
    defaultFields:["reference","assetName","assetCode","fromCompany","toCompany","direction","transferredBy","transferredAt"],
  },

  pms: {
    label:"PMS", icon:"🔩", color:"#0d9488",
    apiPath:"/api/company-portal/pms/reports",
    transform:(raw)=>(Array.isArray(raw)?raw:[]).map(r=>({
      id:r.assetId,
      assetName:r.assetName||"",
      assetCode:r.generatedAssetId||"",
      building:r.building||"",
      floor:r.floor||"",
      room:r.room||"",
      department:r.departmentName||"",
      totalPms:Number(r.totalPms||0),
      closedPms:Number(r.closedPms||0),
      pendingApproval:Number(r.pendingApproval||0),
      lastPmsDate:r.lastPmsDate||"",
      nextPmsDate:r.nextPmsDate||"",
      _raw:r,
    })),
    fields:[
      {key:"assetCode",      label:"Asset ID",          type:"text",    group:"Identity"},
      {key:"assetName",      label:"Asset Name",        type:"text",    group:"Identity"},
      {key:"department",     label:"Department",        type:"text",    group:"Location"},
      {key:"building",       label:"Building",          type:"text",    group:"Location"},
      {key:"floor",          label:"Floor",             type:"text",    group:"Location"},
      {key:"room",           label:"Room",              type:"text",    group:"Location"},
      {key:"totalPms",       label:"Total PMS",         type:"number",  group:"Metrics"},
      {key:"closedPms",      label:"Completed PMS",     type:"number",  group:"Metrics"},
      {key:"pendingApproval",label:"Pending Approval",  type:"number",  group:"Metrics"},
      {key:"lastPmsDate",    label:"Last PMS Date",     type:"date",    group:"Time"},
      {key:"nextPmsDate",    label:"Next PMS Date",     type:"date",    group:"Time"},
    ],
    defaultFields:["assetCode","assetName","department","totalPms","closedPms","pendingApproval","lastPmsDate","nextPmsDate"],
  },

  calibration: {
    label:"Calibration", icon:"⊙", color:"#7c3aed",
    apiPath:"/api/company-portal/calibration/records?limit=500",
    transform:(raw)=>{
      const rows=Array.isArray(raw)?raw:(raw?.data??[]);
      return rows.map(r=>({
        id:r.id,
        assetName:r.assetName||r.asset_name||"",
        assetCode:r.generatedAssetId||r.generated_asset_id||"",
        department:r.departmentName||r.department_name||"",
        calibrationDate:r.calibrationDate||r.calibration_date||"",
        nextDueDate:r.nextDueDate||r.next_due_date||"",
        vendorName:r.vendorName||r.vendor_name||"",
        calibratedBy:r.calibratedBy||r.calibrated_by||"",
        certificateNo:r.certificateNumber||r.certificate_number||"",
        status:r.status||"",
        result:r.calibrationResult||r.calibration_result||"",
        remarks:r.remarks||"",
        _raw:r,
      }));
    },
    fields:[
      {key:"assetCode",      label:"Asset ID",          type:"text",    group:"Identity"},
      {key:"assetName",      label:"Asset Name",        type:"text",    group:"Identity"},
      {key:"department",     label:"Department",        type:"text",    group:"Location"},
      {key:"calibrationDate",label:"Calibration Date",  type:"date",    group:"Time"},
      {key:"nextDueDate",    label:"Next Due Date",     type:"date",    group:"Time"},
      {key:"vendorName",     label:"Vendor",            type:"text",    group:"Details"},
      {key:"calibratedBy",   label:"Calibrated By",     type:"text",    group:"Details"},
      {key:"certificateNo",  label:"Certificate No.",   type:"text",    group:"Details"},
      {key:"result",         label:"Result",            type:"select",  group:"Status", options:["Pass","Fail","Pending","NA"]},
      {key:"status",         label:"Status",            type:"select",  group:"Status", options:["Active","Expired","Due Soon"]},
      {key:"remarks",        label:"Remarks",           type:"text",    group:"Details"},
    ],
    defaultFields:["assetCode","assetName","department","calibrationDate","nextDueDate","vendorName","certificateNo","result"],
  },

  training: {
    label:"Training", icon:"📘", color:"#ea580c",
    apiPath:"/api/company-portal/training/sessions?from=2020-01-01&to=2030-12-31&limit=500",
    transform:(raw)=>{
      const rows=Array.isArray(raw?.data)?raw.data:(Array.isArray(raw)?raw:[]);
      return rows.map(r=>({
        id:r.id,
        title:r.training_title||r.trainingTitle||"",
        employeeName:r.employee_name||r.employeeName||"",
        department:r.department_name||r.departmentName||"",
        trainerName:r.trainer_name||r.trainerName||"",
        trainingDate:r.training_date||r.trainingDate||"",
        expiryDate:r.expiry_date||r.expiryDate||"",
        status:r.status||"",
        result:r.result||"",
        durationHours:r.duration_hours!=null?Number(r.duration_hours):"",
        remarks:r.remarks||"",
        _raw:r,
      }));
    },
    fields:[
      {key:"title",         label:"Training Title",    type:"text",    group:"Identity"},
      {key:"employeeName",  label:"Employee",          type:"text",    group:"People"},
      {key:"department",    label:"Department",        type:"text",    group:"Location"},
      {key:"trainerName",   label:"Trainer",           type:"text",    group:"People"},
      {key:"trainingDate",  label:"Training Date",     type:"date",    group:"Time"},
      {key:"expiryDate",    label:"Expiry Date",       type:"date",    group:"Time"},
      {key:"durationHours", label:"Duration (hrs)",    type:"number",  group:"Metrics"},
      {key:"status",        label:"Status",            type:"select",  group:"Status", options:["scheduled","completed","overdue","cancelled"]},
      {key:"result",        label:"Result",            type:"select",  group:"Status", options:["Pass","Fail","Pending","NA"]},
      {key:"remarks",       label:"Remarks",           type:"text",    group:"Details"},
    ],
    defaultFields:["title","employeeName","department","trainerName","trainingDate","expiryDate","status","result"],
  },
};

/* ─────────────────────────────────────────────────────────────────────────────
   FILTER ENGINE
   ─────────────────────────────────────────────────────────────────────────── */
const FILTER_OPS = [
  {key:"contains", label:"Contains",         types:["text"]},
  {key:"eq",       label:"Equals",           types:["text","number","select","date","datetime"]},
  {key:"neq",      label:"Not Equals",       types:["text","number","select","date","datetime"]},
  {key:"ncontains",label:"Does Not Contain", types:["text"]},
  {key:"starts",   label:"Starts With",      types:["text"]},
  {key:"ends",     label:"Ends With",        types:["text"]},
  {key:"gt",       label:"Greater Than",     types:["number","date","datetime"]},
  {key:"lt",       label:"Less Than",        types:["number","date","datetime"]},
  {key:"gte",      label:"≥ Greater/Equal",  types:["number","date","datetime"]},
  {key:"lte",      label:"≤ Less/Equal",     types:["number","date","datetime"]},
  {key:"between",  label:"Between",          types:["number","date","datetime"]},
  {key:"empty",    label:"Is Empty",         types:["text","number","select","date","datetime"]},
  {key:"nempty",   label:"Is Not Empty",     types:["text","number","select","date","datetime"]},
  {key:"inlist",   label:"In List",          types:["text","select"]},
  {key:"ninlist",  label:"Not In List",      types:["text","select"]},
];

function matchOne(rawVal, op, fv, fv2) {
  const v = rawVal==null?"":String(rawVal).toLowerCase().trim();
  const f = fv==null?"":String(fv).toLowerCase().trim();
  if(op==="empty")    return v==="";
  if(op==="nempty")   return v!=="";
  if(op==="eq")       return v===f;
  if(op==="neq")      return v!==f;
  if(op==="contains") return v.includes(f);
  if(op==="ncontains")return !v.includes(f);
  if(op==="starts")   return v.startsWith(f);
  if(op==="ends")     return v.endsWith(f);
  if(op==="inlist")   return f.split(",").map(s=>s.trim()).some(s=>v===s);
  if(op==="ninlist")  return !f.split(",").map(s=>s.trim()).some(s=>v===s);
  const nv=parseFloat(rawVal),nf=parseFloat(fv),nf2=parseFloat(fv2);
  if(op==="gt")      return !isNaN(nv)&&!isNaN(nf)&&nv>nf;
  if(op==="lt")      return !isNaN(nv)&&!isNaN(nf)&&nv<nf;
  if(op==="gte")     return !isNaN(nv)&&!isNaN(nf)&&nv>=nf;
  if(op==="lte")     return !isNaN(nv)&&!isNaN(nf)&&nv<=nf;
  if(op==="between") return !isNaN(nv)&&nv>=nf&&nv<=nf2;
  return true;
}

function rowMatchesFilters(row, filters) {
  if(!filters.length) return true;
  let res = matchOne(row[filters[0].field], filters[0].op, filters[0].value, filters[0].value2);
  for(let i=1;i<filters.length;i++){
    const c=matchOne(row[filters[i].field],filters[i].op,filters[i].value,filters[i].value2);
    res = filters[i].logic==="OR" ? res||c : res&&c;
  }
  return res;
}

function chipLabel(fi, fieldLabel) {
  const m={eq:"=",neq:"≠",contains:"contains",ncontains:"not contains",starts:"starts",ends:"ends",gt:">",lt:"<",gte:"≥",lte:"≤",between:"between",empty:"is empty",nempty:"not empty",inlist:"in",ninlist:"not in"};
  const op=m[fi.op]||fi.op;
  if(fi.op==="empty"||fi.op==="nempty") return `${fieldLabel} ${op}`;
  if(fi.op==="between") return `${fieldLabel} ${op} ${fi.value}–${fi.value2}`;
  return `${fieldLabel} ${op} "${fi.value}"`;
}

/* ─────────────────────────────────────────────────────────────────────────────
   SORT / GROUP / PIVOT
   ─────────────────────────────────────────────────────────────────────────── */
function multiSort(rows, sorts) {
  if(!sorts.length) return rows;
  return [...rows].sort((a,b)=>{
    for(const s of sorts){
      const av=a[s.field],bv=b[s.field],na=parseFloat(av),nb=parseFloat(bv);
      const c=!isNaN(na)&&!isNaN(nb)?na-nb:String(av??"").localeCompare(String(bv??""));
      if(c!==0) return s.dir==="desc"?-c:c;
    }
    return 0;
  });
}

function buildGroupTree(rows, fields) {
  if(!fields.length) return null;
  const [head,...tail]=fields, map=new Map();
  for(const row of rows){const k=String(row[head]??"(blank)");if(!map.has(k))map.set(k,[]);map.get(k).push(row);}
  return [...map.entries()].map(([key,sub])=>({groupField:head,key,count:sub.length,rows:tail.length===0?sub:null,subGroups:tail.length>0?buildGroupTree(sub,tail):null}));
}

function computePivot(rows,cfg){
  const{rowField,colField,valueField,aggFn}=cfg;
  if(!rowField||!colField||!valueField) return null;
  const rv=[...new Set(rows.map(r=>String(r[rowField]??"")))].sort();
  const cv=[...new Set(rows.map(r=>String(r[colField]??"")))].sort();
  const agg={};
  for(const r of rows){const rk=String(r[rowField]??""),ck=String(r[colField]??"");if(!agg[rk])agg[rk]={};if(!agg[rk][ck])agg[rk][ck]=[];agg[rk][ck].push(r[valueField]);}
  const calc=vals=>{
    if(aggFn==="count") return vals.length;
    const nums=vals.filter(v=>!isNaN(parseFloat(v))).map(Number);
    if(!nums.length) return 0;
    if(aggFn==="sum") return Math.round(nums.reduce((s,n)=>s+n,0)*100)/100;
    if(aggFn==="avg") return Math.round(nums.reduce((s,n)=>s+n,0)/nums.length*100)/100;
    if(aggFn==="min") return Math.min(...nums);
    if(aggFn==="max") return Math.max(...nums);
    return vals.length;
  };
  return{rowVals:rv,colVals:cv,agg,calc};
}

/* ─────────────────────────────────────────────────────────────────────────────
   CHARTS (inline SVG)
   ─────────────────────────────────────────────────────────────────────────── */
const CC=["#2563eb","#16a34a","#dc2626","#ca8a04","#7c3aed","#ea580c","#0891b2","#be185d","#0d9488","#f59e0b"];

function BarChart({data,xKey,yKey,title}){
  if(!data.length) return <EmptyChart msg="Select a field to generate the chart"/>;
  const W=700,H=300,PX=60,PY=34,PB=64,maxV=Math.max(...data.map(d=>Number(d[yKey]||0)),1);
  const gap=(W-PX*2)/data.length,bw=Math.max(10,Math.min(48,gap-4));
  return(
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",maxWidth:W,height:"auto"}}>
      <text x={W/2} y={18} textAnchor="middle" fontSize={13} fontWeight={700} fill="#0f172a">{title}</text>
      {[0,.25,.5,.75,1].map(p=>{const y=PY+(1-p)*(H-PY-PB);return<g key={p}><line x1={PX} y1={y} x2={W-16} y2={y} stroke="#f1f5f9"/><text x={PX-6} y={y+4} textAnchor="end" fontSize={9} fill="#94a3b8">{Math.round(maxV*p)}</text></g>;})}
      {data.slice(0,16).map((d,i)=>{const val=Number(d[yKey]||0),bh=Math.max(2,(val/maxV)*(H-PY-PB)),x=PX+i*gap+(gap-bw)/2,y=PY+(H-PY-PB)-bh;return<g key={i}><rect x={x} y={y} width={bw} height={bh} fill={CC[i%10]} rx={3} opacity={0.9}/>{val>0&&<text x={x+bw/2} y={y-4} textAnchor="middle" fontSize={9} fill="#475569">{val}</text>}<text x={x+bw/2} y={H-PB+13} textAnchor="middle" fontSize={9} fill="#64748b" transform={`rotate(-38,${x+bw/2},${H-PB+13})`}>{String(d[xKey]||"").slice(0,13)}</text></g>;})}
      <line x1={PX} y1={PY} x2={PX} y2={H-PB} stroke="#e2e8f0"/><line x1={PX} y1={H-PB} x2={W-16} y2={H-PB} stroke="#e2e8f0"/>
    </svg>
  );
}

function PieChart({data,nameKey,valueKey,title}){
  const total=data.reduce((s,d)=>s+Math.max(0,Number(d[valueKey]||0)),0);
  if(!total) return <EmptyChart msg="No data for chart"/>;
  let ang=-Math.PI/2;const R=88,CX=120,CY=128;
  const slices=data.slice(0,10).map((d,i)=>{const v=Math.max(0,Number(d[valueKey]||0)),sw=(v/total)*2*Math.PI,x1=CX+R*Math.cos(ang),y1=CY+R*Math.sin(ang);ang+=sw;return{path:`M${CX},${CY}L${x1.toFixed(1)},${y1.toFixed(1)}A${R},${R} 0 ${sw>Math.PI?1:0},1 ${(CX+R*Math.cos(ang)).toFixed(1)},${(CY+R*Math.sin(ang)).toFixed(1)}Z`,color:CC[i%10],label:String(d[nameKey]||"").slice(0,16),val:v};});
  return(
    <svg viewBox="0 0 370 280" style={{width:"100%",maxWidth:380,height:"auto"}}>
      <text x={185} y={16} textAnchor="middle" fontSize={13} fontWeight={700} fill="#0f172a">{title}</text>
      {slices.map((s,i)=><path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth={2}/>)}
      {slices.map((s,i)=><g key={i}><rect x={258} y={28+i*22} width={11} height={11} fill={s.color} rx={2}/><text x={272} y={38+i*22} fontSize={10} fill="#475569">{s.label}: {s.val}</text></g>)}
    </svg>
  );
}

function EmptyChart({msg}){return<div style={{padding:"60px 24px",textAlign:"center",color:"#94a3b8"}}><div style={{fontSize:36,marginBottom:8}}>📊</div><div style={{fontSize:"14px",fontWeight:600,color:"#475569",marginBottom:4}}>No Chart Data</div><div style={{fontSize:"12px"}}>{msg}</div></div>;}

/* ─────────────────────────────────────────────────────────────────────────────
   COLUMN RESIZE HOOK
   ─────────────────────────────────────────────────────────────────────────── */
const DEF_W=140;
function useColWidths(){
  const[w,setW]=useState({});
  const start=useCallback((e,key)=>{
    e.preventDefault();e.stopPropagation();
    const sx=e.clientX,sw=w[key]||DEF_W;
    const mv=me=>setW(cw=>({...cw,[key]:Math.max(60,sw+me.clientX-sx)}));
    const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};
    document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);
  },[w]);
  return[w,start];
}

/* ─────────────────────────────────────────────────────────────────────────────
   CELL FORMATTING & BADGES
   ─────────────────────────────────────────────────────────────────────────── */
function fmtCell(val,type){
  if(val==null||val==="") return "";
  if(type==="datetime"){try{return new Date(val).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});}catch{}}
  if(type==="date"){try{return new Date(val).toLocaleDateString("en-IN");}catch{}}
  return String(val);
}

const BADGE_MAP={
  Critical:{bg:"#fef3c7",color:"#92400e"},
  "Non-Critical":{bg:"#e0f2fe",color:"#0369a1"},
  Working:{bg:"#dcfce7",color:"#166534"},
  Active:{bg:"#dcfce7",color:"#166534"},
  Condemned:{bg:"#f5f3ff",color:"#6d28d9"},
  RBER:{bg:"#fff7ed",color:"#c2410c"},
  WIP:{bg:"#fef9c3",color:"#92400e"},
  HNF:{bg:"#dbeafe",color:"#1e40af"},
  "Not Working":{bg:"#fee2e2",color:"#991b1b"},
  Verified:{bg:"#dcfce7",color:"#166534"},
  Unverified:{bg:"#fff7ed",color:"#c2410c"},
  open:{bg:"#fee2e2",color:"#991b1b"},
  closed:{bg:"#f1f5f9",color:"#475569"},
  completed:{bg:"#dcfce7",color:"#166534"},
  "in progress":{bg:"#dbeafe",color:"#1e40af"},
  assigned:{bg:"#f5f3ff",color:"#6d28d9"},
  "on hold":{bg:"#fff7ed",color:"#c2410c"},
  critical:{bg:"#fee2e2",color:"#991b1b"},
  high:{bg:"#ffedd5",color:"#9a3412"},
  medium:{bg:"#fef9c3",color:"#92400e"},
  low:{bg:"#dcfce7",color:"#166534"},
};
const BADGE_KEYS=new Set(["category","workingStatus","approvedStatus","rber","status","priority"]);

function CellBadge({val}){
  const s=BADGE_MAP[val]||BADGE_MAP[String(val).toLowerCase()]||null;
  if(!s) return<span style={{fontSize:"12.5px"}}>{val}</span>;
  return<span style={{display:"inline-block",padding:"2px 10px",borderRadius:20,fontSize:"11.5px",fontWeight:700,background:s.bg,color:s.color,whiteSpace:"nowrap"}}>{val}</span>;
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONDITIONAL FORMATTING
   ─────────────────────────────────────────────────────────────────────────── */
const DEFAULT_CF=[
  {id:1,field:"category",       op:"eq", value:"Critical",  bg:"#fff7ed",color:"#c2410c"},
  {id:2,field:"workingStatus",  op:"eq", value:"Condemned", bg:"#f5f3ff",color:"#7c3aed"},
  {id:3,field:"warrantyDaysLeft",op:"lte",value:"0",        bg:"#fef2f2",color:"#dc2626"},
  {id:4,field:"status",         op:"eq", value:"open",      bg:"#fff1f2",color:"#be123c"},
];

function getRowBg(row,cfRules){
  for(const r of cfRules){if(matchOne(row[r.field],r.op,r.value,""))return{background:r.bg,color:r.color};}
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   EXPORT
   ─────────────────────────────────────────────────────────────────────────── */
function doXLSX(rows,defs,name="Report"){
  const ws=XLSX.utils.aoa_to_sheet([defs.map(f=>f.label),...rows.map(r=>defs.map(f=>r[f.key]??"")),]);
  ws["!cols"]=defs.map(f=>({wch:Math.max(f.label.length+2,14)}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,name);XLSX.writeFile(wb,`report-${new Date().toISOString().slice(0,10)}.xlsx`);
}
function doCSV(rows,defs){
  const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const csv=[defs.map(f=>esc(f.label)).join(","),...rows.map(r=>defs.map(f=>esc(r[f.key])).join(","))].join("\n");
  Object.assign(document.createElement("a"),{href:URL.createObjectURL(new Blob([csv],{type:"text/csv"})),download:`report-${Date.now()}.csv`}).click();
}

/* ─────────────────────────────────────────────────────────────────────────────
   MODULE DROPDOWN COMPONENT
   ─────────────────────────────────────────────────────────────────────────── */
function ModuleDropdown({ moduleKey, setModuleKey }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const mod = MODULE_REGISTRY[moduleKey];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 14px', borderRadius: 10,
          border: `2px solid ${mod.color}22`,
          background: `${mod.color}11`,
          color: mod.color, fontWeight: 700, fontSize: '13.5px',
          cursor: 'pointer', whiteSpace: 'nowrap',
          boxShadow: open ? `0 0 0 3px ${mod.color}22` : 'none',
          transition: 'all 0.15s',
          minWidth: 190,
        }}
      >
        <span style={{ fontSize: 16 }}>{mod.icon}</span>
        <span style={{ flex: 1, textAlign: 'left' }}>{mod.label}</span>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.7 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 9999,
          background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
          border: '1px solid #e2e8f0', overflow: 'hidden', minWidth: 230,
        }}>
          <div style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
            <p style={{ margin: 0, fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 6px' }}>Select Module</p>
          </div>
          {Object.entries(MODULE_REGISTRY).map(([k, v]) => (
            <button key={k}
              onClick={() => { setModuleKey(k); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '10px 14px',
                border: 'none', background: moduleKey === k ? `${v.color}10` : 'transparent',
                color: moduleKey === k ? v.color : '#374151',
                fontWeight: moduleKey === k ? 700 : 500,
                fontSize: '13px', cursor: 'pointer', textAlign: 'left',
                borderLeft: `3px solid ${moduleKey === k ? v.color : 'transparent'}`,
                transition: 'all 0.1s',
              }}
              onMouseEnter={e => { if (moduleKey !== k) e.currentTarget.style.background = '#f8fafc'; }}
              onMouseLeave={e => { if (moduleKey !== k) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>{v.icon}</span>
              <span>{v.label}</span>
              {moduleKey === k && (
                <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: v.color, flexShrink: 0 }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
   ─────────────────────────────────────────────────────────────────────────── */
const PAGE_SIZE=100;

export default function ReportBuilderPanel({token}){
  const[moduleKey,setModuleKey]=useState("assets");
  const mod=MODULE_REGISTRY[moduleKey];

  const[rawData,setRawData]=useState([]);
  const[loading,setLoading]=useState(false);
  const[loadError,setLoadError]=useState(null);
  const[lastLoaded,setLastLoaded]=useState(null);

  const[selectedFields,setSelectedFields]=useState(mod.defaultFields);
  const[fieldOrder,setFieldOrder]=useState(mod.defaultFields);
  const[hiddenCols,setHiddenCols]=useState(new Set());
  const[showColPicker,setShowColPicker]=useState(false);

  const[filters,setFilters]=useState([]);
  const[globalSearch,setGlobalSearch]=useState("");
  const[showAddFilter,setShowAddFilter]=useState(false);
  const[draft,setDraft]=useState({field:"",op:"contains",value:"",value2:"",logic:"AND"});

  const[sorts,setSorts]=useState([]);
  const[groupBy,setGroupBy]=useState([]);
  const[collapsed,setCollapsed]=useState(new Set());
  const[showGroupPanel,setShowGroupPanel]=useState(false);

  const[view,setView]=useState("table");
  const[pivotCfg,setPivotCfg]=useState({rowField:"",colField:"",valueField:"",aggFn:"count"});
  const[chartType,setChartType]=useState("bar");
  const[chartX,setChartX]=useState("");
  const[chartY,setChartY]=useState("_count");

  const[cfRules,setCfRules]=useState(DEFAULT_CF);
  const[showCF,setShowCF]=useState(false);

  const[savedReports,setSavedReports]=useState(()=>{try{return JSON.parse(localStorage.getItem("fm_rb_saved")||"[]");}catch{return[];}});
  const[showSave,setShowSave]=useState(false);
  const[showLoad,setShowLoad]=useState(false);
  const[saveName,setSaveName]=useState("");

  const[page,setPage]=useState(1);
  const[colWidths,startResize]=useColWidths();
  const dragRef=useRef(null);

  // Reset on module change
  useEffect(()=>{
    const d=MODULE_REGISTRY[moduleKey];
    setSelectedFields(d.defaultFields);setFieldOrder(d.defaultFields);setHiddenCols(new Set());
    setFilters([]);setSorts([]);setGroupBy([]);setCollapsed(new Set());setPage(1);
    setRawData([]);setLoadError(null);setGlobalSearch("");
    setDraft({field:d.fields[0]?.key||"",op:"contains",value:"",value2:"",logic:"AND"});
    setChartX(d.defaultFields[0]||"");setPivotCfg({rowField:"",colField:"",valueField:"",aggFn:"count"});
  },[moduleKey]);

  const loadData=useCallback(async()=>{
    if(!token) return;
    setLoading(true);setLoadError(null);
    try{
      const raw=await apiFetch(MODULE_REGISTRY[moduleKey].apiPath,token);
      setRawData(MODULE_REGISTRY[moduleKey].transform(raw));
      setLastLoaded(new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}));
    }catch(e){setLoadError(e.message);}finally{setLoading(false);}
  },[moduleKey,token]);

  useEffect(()=>{loadData();},[loadData]);

  const visibleFields=useMemo(()=>fieldOrder.filter(k=>selectedFields.includes(k)&&!hiddenCols.has(k)).map(k=>mod.fields.find(f=>f.key===k)).filter(Boolean),[fieldOrder,selectedFields,hiddenCols,mod]);

  const processedData=useMemo(()=>{
    const vk=visibleFields.map(f=>f.key);
    let data=rawData.filter(row=>{
      if(!rowMatchesFilters(row,filters)) return false;
      if(globalSearch.trim()){const q=globalSearch.toLowerCase();return vk.some(k=>String(row[k]??"").toLowerCase().includes(q));}
      return true;
    });
    return multiSort(data,sorts);
  },[rawData,filters,globalSearch,visibleFields,sorts]);

  const groups=useMemo(()=>groupBy.length?buildGroupTree(processedData,groupBy):null,[processedData,groupBy]);
  const pivot=useMemo(()=>computePivot(processedData,pivotCfg),[processedData,pivotCfg]);
  const chartData=useMemo(()=>{
    if(!chartX) return[];
    const map=new Map();
    for(const r of processedData){const k=String(r[chartX]??"(blank)");if(!map.has(k))map.set(k,{[chartX]:k,_count:0});const e=map.get(k);e._count++;if(chartY!=="___count"&&chartY!=="___")e[chartY]=(e[chartY]||0)+(parseFloat(r[chartY])||0);}
    return[...map.values()].sort((a,b)=>b._count-a._count).slice(0,18);
  },[processedData,chartX,chartY]);

  const summary=useMemo(()=>{
    const s={};
    for(const f of visibleFields){if(f.type==="number"){const nums=processedData.map(r=>parseFloat(r[f.key])).filter(n=>!isNaN(n));s[f.key]={sum:Math.round(nums.reduce((a,b)=>a+b,0)*100)/100,avg:nums.length?Math.round(nums.reduce((a,b)=>a+b,0)/nums.length*100)/100:0};}}
    return s;
  },[processedData,visibleFields]);

  const totalPages=Math.max(1,Math.ceil(processedData.length/PAGE_SIZE));
  const pagedRows=useMemo(()=>processedData.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE),[processedData,page]);

  const fdef=key=>mod.fields.find(f=>f.key===key);
  const flabel=key=>fdef(key)?.label||key;

  // Draft op reset when field changes
  useEffect(()=>{
    const fd=fdef(draft.field);if(!fd) return;
    const ops=FILTER_OPS.filter(o=>o.types.includes(fd.type));
    if(ops.length&&!ops.find(o=>o.key===draft.op)) setDraft(d=>({...d,op:ops[0].key}));
  },[draft.field]); // eslint-disable-line

  const commitFilter=()=>{
    if(!draft.field) return;
    if(!["empty","nempty"].includes(draft.op)&&!draft.value.trim()) return;
    setFilters(f=>[...f,{...draft,id:Date.now()}]);
    setDraft(d=>({...d,value:"",value2:"",logic:"AND"}));
    setShowAddFilter(false);setPage(1);
  };
  const removeFilter=id=>{setFilters(f=>f.filter(fi=>fi.id!==id));setPage(1);};
  const clearAll=()=>{setFilters([]);setGlobalSearch("");setPage(1);};

  const toggleSort=key=>{
    setSorts(ss=>{const ex=ss.find(s=>s.field===key);if(!ex) return[{id:Date.now(),field:key,dir:"asc"}];if(ex.dir==="asc") return ss.map(s=>s.field===key?{...s,dir:"desc"}:s);return ss.filter(s=>s.field!==key);});setPage(1);
  };

  const onDragStart=(e,key)=>{dragRef.current=key;e.dataTransfer.effectAllowed="move";};
  const onDrop=(e,targetKey)=>{e.preventDefault();const src=dragRef.current;if(!src||src===targetKey) return;setFieldOrder(ord=>{const a=[...ord],si=a.indexOf(src),ti=a.indexOf(targetKey);if(si<0||ti<0) return a;a.splice(si,1);a.splice(ti,0,src);return a;});};

  const toggleCollapse=id=>setCollapsed(s=>{const n=new Set(s);n.has(id)?n.delete(id):n.add(id);return n;});

  const doSave=()=>{
    if(!saveName.trim()) return;
    const cfg={id:Date.now(),name:saveName.trim(),moduleKey,selectedFields,fieldOrder,filters,sorts,groupBy,pivotCfg,cfRules,hiddenCols:[...hiddenCols],createdAt:new Date().toISOString()};
    const upd=[...savedReports.filter(r=>r.name!==cfg.name),cfg];
    setSavedReports(upd);localStorage.setItem("fm_rb_saved",JSON.stringify(upd));setShowSave(false);setSaveName("");
  };
  const doLoad=cfg=>{
    setModuleKey(cfg.moduleKey);
    setTimeout(()=>{setSelectedFields(cfg.selectedFields||[]);setFieldOrder(cfg.fieldOrder||cfg.selectedFields||[]);setFilters(cfg.filters||[]);setSorts(cfg.sorts||[]);setGroupBy(cfg.groupBy||[]);setPivotCfg(cfg.pivotCfg||{rowField:"",colField:"",valueField:"",aggFn:"count"});setCfRules(cfg.cfRules||DEFAULT_CF);setHiddenCols(new Set(cfg.hiddenCols||[]));},60);
    setShowLoad(false);
  };
  const doDelete=id=>{const upd=savedReports.filter(r=>r.id!==id);setSavedReports(upd);localStorage.setItem("fm_rb_saved",JSON.stringify(upd));};

  useEffect(()=>{
    const h=e=>{if((e.ctrlKey||e.metaKey)&&e.key==="f"){e.preventDefault();document.getElementById("rb-s")?.focus();}};
    document.addEventListener("keydown",h);return()=>document.removeEventListener("keydown",h);
  },[]);

  // GROUP ROWS
  const renderGroups=(gs,depth=0)=>gs.flatMap(g=>{
    const gid=`${g.groupField}::${g.key}::${depth}`;
    const isC=collapsed.has(gid);
    const bgs=["#eff6ff","#f0fdf4","#f5f3ff","#fff7ed"];
    return[
      <tr key={gid} style={{background:bgs[depth%4],cursor:"pointer"}} onClick={()=>toggleCollapse(gid)}>
        <td colSpan={visibleFields.length+1} style={{padding:"9px 16px",fontWeight:700,paddingLeft:16+depth*20,fontSize:"13px",borderBottom:"1px solid #e2e8f0"}}>
          <span style={{color:"#94a3b8",marginRight:6}}>{isC?"▶":"▼"}</span>
          <span style={{fontSize:"10px",fontWeight:800,color:"#94a3b8",textTransform:"uppercase",marginRight:4}}>{flabel(g.groupField)}:</span>
          <span style={{color:"#0f172a"}}>{g.key||"(blank)"}</span>
          <span style={{marginLeft:8,background:"#dbeafe",color:"#1d4ed8",fontSize:"10px",fontWeight:700,padding:"2px 8px",borderRadius:12}}>{g.count}</span>
        </td>
      </tr>,
      ...(!isC?(g.subGroups?renderGroups(g.subGroups,depth+1):(g.rows||[]).map((row,ri)=>renderRow(row,ri,depth))):[]  ),
    ];
  });

  const renderRow=(row,ri,depth=0)=>{
    const cf=getRowBg(row,cfRules);
    const zebraBase=ri%2===0?"#ffffff":"#f9fafb";
    return(
      <tr key={row.id??ri} style={{background:cf?.background||zebraBase,transition:"background 0.1s"}}
        onMouseEnter={e=>{if(!cf)e.currentTarget.style.background="#eff6ff";}}
        onMouseLeave={e=>{if(!cf)e.currentTarget.style.background=cf?.background||zebraBase;}}>
        <td style={{padding:"8px 12px",color:"#c0c8d4",fontSize:"11.5px",textAlign:"center",borderRight:"1px solid #f0f4f8",width:42,userSelect:"none"}}>{(page-1)*PAGE_SIZE+ri+1}</td>
        {visibleFields.map(f=>{
          const val=row[f.key];
          const disp=fmtCell(val,f.type);
          return(
            <td key={f.key} style={{padding:"8px 12px",borderRight:"1px solid #f0f4f8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:"12.5px",color:cf?.color||"#374151",maxWidth:colWidths[f.key]||DEF_W,width:colWidths[f.key]||DEF_W}}
              title={disp||undefined}
              onContextMenu={e=>{e.preventDefault();navigator.clipboard?.writeText(String(val??""));}}>
              {BADGE_KEYS.has(f.key)&&disp?<CellBadge val={disp}/>:disp||<span style={{color:"#d1d5db"}}>—</span>}
            </td>
          );
        })}
      </tr>
    );
  };

  const activeCount=filters.length+(globalSearch.trim()?1:0);
  const draftFd=fdef(draft.field)||mod.fields[0];
  const draftOps=FILTER_OPS.filter(o=>draftFd&&o.types.includes(draftFd.type));

  /* ────────────────────────────────────────────────────────────────────────
     RENDER
  ──────────────────────────────────────────────────────────────────────── */
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:"#f1f5f9",fontFamily:"'Inter',system-ui,-apple-system,sans-serif"}}>

      {/* ══ TOP TOOLBAR — Row 1: Module Selector + Actions ══════════════════ */}
      <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"10px 20px",display:"flex",alignItems:"center",gap:8,flexShrink:0,flexWrap:"wrap"}}>

        {/* Module dropdown */}
        <ModuleDropdown moduleKey={moduleKey} setModuleKey={setModuleKey} />

        {/* Active module color accent bar */}
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:8,background:`${mod.color}09`,border:`1px solid ${mod.color}22`,flexShrink:0}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:mod.color,flexShrink:0}}/>
          <span style={{fontSize:"11.5px",fontWeight:700,color:mod.color}}>{rawData.length.toLocaleString("en-IN")} records</span>
        </div>

        <div style={{flex:1}}/>

        {/* Right actions */}
        <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
          <button onClick={loadData} disabled={loading}
            style={{padding:"7px 13px",border:"1px solid #e2e8f0",borderRadius:8,background:"#f8fafc",color:"#475569",fontSize:"12.5px",cursor:"pointer",display:"flex",alignItems:"center",gap:5,fontWeight:500,transition:"all 0.15s"}}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            {loading?"Loading…":"Refresh"}
          </button>
          <div style={{width:1,height:24,background:"#e2e8f0",flexShrink:0}}/>
          <button onClick={()=>doXLSX(processedData,visibleFields,mod.label)}
            style={{padding:"7px 13px",border:"1px solid #bbf7d0",borderRadius:8,background:"#f0fdf4",color:"#16a34a",fontSize:"12.5px",fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><polyline points="9 15 12 18 15 15"/></svg>
            Excel
          </button>
          <button onClick={()=>doCSV(processedData,visibleFields)} style={{padding:"7px 11px",border:"1px solid #e2e8f0",borderRadius:8,background:"#f8fafc",color:"#475569",fontSize:"12.5px",cursor:"pointer",fontWeight:500}}>CSV</button>
          <button onClick={()=>window.print()} style={{padding:"7px 11px",border:"1px solid #e2e8f0",borderRadius:8,background:"#f8fafc",color:"#475569",fontSize:"12.5px",cursor:"pointer"}}>🖨</button>
          <div style={{width:1,height:24,background:"#e2e8f0",flexShrink:0}}/>
          <button onClick={()=>setShowSave(true)} style={{padding:"7px 13px",border:"1px solid #e2e8f0",borderRadius:8,background:"#f8fafc",color:"#374151",fontSize:"12.5px",fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Save
          </button>
          <button onClick={()=>setShowLoad(true)}
            style={{padding:"7px 13px",border:savedReports.length>0?"1px solid #bfdbfe":"1px solid #e2e8f0",borderRadius:8,background:savedReports.length>0?"#eff6ff":"#f8fafc",color:savedReports.length>0?"#2563eb":"#374151",fontSize:"12.5px",fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Reports
            {savedReports.length>0&&<span style={{background:"#2563eb",color:"#fff",borderRadius:10,fontSize:"10px",fontWeight:700,padding:"1px 6px",minWidth:16,textAlign:"center"}}>{savedReports.length}</span>}
          </button>
        </div>
      </div>

      {/* ══ TOP TOOLBAR — Row 2: View Toggle + Search ════════════════════════ */}
      <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"8px 20px",display:"flex",alignItems:"center",gap:10,flexShrink:0,flexWrap:"wrap"}}>

        {/* View toggle */}
        <div style={{display:"flex",background:"#f1f5f9",borderRadius:9,padding:3,gap:2}}>
          {[["table","⊞","Table"],["pivot","↔","Pivot"],["chart","📊","Chart"],["kpi","🎯","KPI"]].map(([v,ico,lbl])=>(
            <button key={v} onClick={()=>setView(v)}
              style={{padding:"6px 14px",borderRadius:7,border:"none",background:view===v?"#fff":"transparent",color:view===v?"#2563eb":"#64748b",fontWeight:view===v?700:500,fontSize:"12.5px",cursor:"pointer",boxShadow:view===v?"0 1px 4px rgba(0,0,0,0.10)":"none",display:"flex",alignItems:"center",gap:5,transition:"all 0.15s",whiteSpace:"nowrap"}}>
              <span>{ico}</span> {lbl}
            </button>
          ))}
        </div>

        <div style={{flex:1}}/>

        {/* Search */}
        <div style={{position:"relative",width:260}}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2.5} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input id="rb-s" type="text" placeholder="Quick search… (Ctrl+F)" value={globalSearch} onChange={e=>{setGlobalSearch(e.target.value);setPage(1);}}
            style={{width:"100%",padding:"8px 30px 8px 30px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:"12.5px",outline:"none",background:"#f8fafc",boxSizing:"border-box",transition:"border-color 0.15s"}}
            onFocus={e=>e.target.style.borderColor="#2563eb"} onBlur={e=>e.target.style.borderColor="#e2e8f0"}/>
          {globalSearch&&<button onClick={()=>setGlobalSearch("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:15,lineHeight:1,display:"flex",alignItems:"center"}}>✕</button>}
        </div>
      </div>

      {/* ══ FILTER BAR ═══════════════════════════════════════════════════════ */}
      <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"8px 20px",flexShrink:0}}>

        {/* Chips row */}
        <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:6,minHeight:32}}>
          <span style={{fontSize:"11.5px",fontWeight:700,color:"#64748b",display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap",marginRight:2}}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            Filters:
          </span>

          {filters.map((fi,idx)=>{
            const fd=fdef(fi.field);
            return(
              <span key={fi.id} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 8px 4px 10px",borderRadius:20,background:"#eff6ff",border:"1px solid #bfdbfe",fontSize:"12px",fontWeight:600,color:"#1d4ed8",whiteSpace:"nowrap",maxWidth:280}}>
                {idx>0&&<span style={{fontSize:"9px",fontWeight:800,background:"#bfdbfe",color:"#1e40af",padding:"1px 5px",borderRadius:8,marginRight:2}}>{fi.logic}</span>}
                <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{chipLabel(fi,fd?.label||fi.field)}</span>
                <button onClick={()=>removeFilter(fi.id)} style={{background:"none",border:"none",cursor:"pointer",color:"#93c5fd",fontSize:14,fontWeight:700,lineHeight:1,padding:"0 0 0 2px",display:"flex",alignItems:"center",marginLeft:1}}>×</button>
              </span>
            );
          })}

          {globalSearch.trim()&&(
            <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 8px 4px 10px",borderRadius:20,background:"#faf5ff",border:"1px solid #e9d5ff",fontSize:"12px",fontWeight:600,color:"#7c3aed",whiteSpace:"nowrap"}}>
              🔍 "{globalSearch.slice(0,20)}{globalSearch.length>20?"…":""}"
              <button onClick={()=>setGlobalSearch("")} style={{background:"none",border:"none",cursor:"pointer",color:"#c4b5fd",fontSize:14,lineHeight:1,padding:"0 0 0 2px"}}>×</button>
            </span>
          )}

          {/* Add filter button */}
          <button onClick={()=>setShowAddFilter(v=>!v)}
            style={{display:"inline-flex",alignItems:"center",gap:4,padding:"5px 12px",borderRadius:20,border:`1.5px dashed ${showAddFilter?"#2563eb":"#cbd5e1"}`,background:showAddFilter?"#eff6ff":"transparent",color:showAddFilter?"#2563eb":"#64748b",fontSize:"12px",fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",transition:"all 0.15s"}}>
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Filter
          </button>

          {activeCount>0&&(
            <button onClick={clearAll}
              style={{display:"inline-flex",alignItems:"center",gap:4,padding:"5px 12px",borderRadius:20,border:"1px solid #fecaca",background:"#fef2f2",color:"#dc2626",fontSize:"12px",fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Clear All ({activeCount})
            </button>
          )}
        </div>

        {/* Add-filter form */}
        {showAddFilter&&(
          <div style={{marginTop:10,padding:"14px 16px",background:"#f8fafc",borderRadius:10,border:"1px solid #e2e8f0",display:"flex",flexWrap:"wrap",gap:10,alignItems:"flex-end"}}>

            {filters.length>0&&(
              <div>
                <div style={{fontSize:"11px",fontWeight:700,color:"#64748b",marginBottom:5}}>Logic</div>
                <div style={{display:"flex",gap:4}}>
                  {["AND","OR"].map(l=>(
                    <button key={l} onClick={()=>setDraft(d=>({...d,logic:l}))}
                      style={{padding:"6px 14px",borderRadius:7,border:`1.5px solid ${draft.logic===l?"#2563eb":"#e2e8f0"}`,background:draft.logic===l?"#2563eb":"#fff",color:draft.logic===l?"#fff":"#374151",fontSize:"12px",fontWeight:700,cursor:"pointer"}}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div style={{fontSize:"11px",fontWeight:700,color:"#64748b",marginBottom:5}}>Column</div>
              <select value={draft.field||mod.fields[0]?.key} onChange={e=>setDraft(d=>({...d,field:e.target.value}))}
                style={{padding:"8px 10px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:"12.5px",background:"#fff",outline:"none",minWidth:170,cursor:"pointer"}}>
                {[...new Set(mod.fields.map(f=>f.group))].map(grp=>(
                  <optgroup key={grp} label={grp}>
                    {mod.fields.filter(f=>f.group===grp).map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <div style={{fontSize:"11px",fontWeight:700,color:"#64748b",marginBottom:5}}>Condition</div>
              <select value={draft.op} onChange={e=>setDraft(d=>({...d,op:e.target.value}))}
                style={{padding:"8px 10px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:"12.5px",background:"#fff",outline:"none",minWidth:150,cursor:"pointer"}}>
                {draftOps.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>

            {!["empty","nempty"].includes(draft.op)&&(
              <div>
                <div style={{fontSize:"11px",fontWeight:700,color:"#64748b",marginBottom:5}}>Value</div>
                {draftFd?.options
                  ?<select value={draft.value} onChange={e=>setDraft(d=>({...d,value:e.target.value}))} style={{padding:"8px 10px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:"12.5px",background:"#fff",outline:"none",minWidth:140,cursor:"pointer"}}>
                    <option value="">— Any —</option>
                    {draftFd.options.map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                  :<input value={draft.value} onChange={e=>setDraft(d=>({...d,value:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&commitFilter()} placeholder="Enter value…"
                    style={{padding:"8px 11px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:"12.5px",outline:"none",minWidth:160}}
                    autoFocus/>
                }
              </div>
            )}

            {draft.op==="between"&&(
              <div>
                <div style={{fontSize:"11px",fontWeight:700,color:"#64748b",marginBottom:5}}>To</div>
                <input value={draft.value2} onChange={e=>setDraft(d=>({...d,value2:e.target.value}))} placeholder="End value…"
                  style={{padding:"8px 11px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:"12.5px",outline:"none",minWidth:130}}/>
              </div>
            )}

            <div style={{display:"flex",gap:6}}>
              <button onClick={commitFilter} style={{padding:"8px 22px",borderRadius:8,border:"none",background:"#2563eb",color:"#fff",fontSize:"13px",fontWeight:700,cursor:"pointer"}}>Apply Filter</button>
              <button onClick={()=>setShowAddFilter(false)} style={{padding:"8px 14px",borderRadius:8,border:"1px solid #e2e8f0",background:"#fff",color:"#64748b",fontSize:"13px",cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* ══ TABLE CONTROLS ════════════════════════════════════════════════════ */}
      <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"7px 20px",display:"flex",alignItems:"center",gap:8,flexShrink:0,flexWrap:"wrap"}}>
        <span style={{fontSize:"12.5px",color:"#64748b"}}>
          {loading?<span style={{color:"#94a3b8"}}>⏳ Loading…</span>
            :<><b style={{color:"#0f172a"}}>{processedData.length.toLocaleString("en-IN")}</b> of {rawData.length.toLocaleString("en-IN")} records{lastLoaded&&<span style={{color:"#94a3b8",fontSize:"11px"}}> · {lastLoaded}</span>}</>
          }
        </span>
        <div style={{flex:1}}/>

        <button onClick={()=>setShowColPicker(v=>!v)}
          style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:7,border:`1px solid ${showColPicker?"#bfdbfe":"#e2e8f0"}`,background:showColPicker?"#eff6ff":"#f8fafc",color:showColPicker?"#2563eb":"#475569",fontSize:"12px",fontWeight:600,cursor:"pointer"}}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7m0-18H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7m0-18v18"/></svg>
          Columns
          {hiddenCols.size>0&&<span style={{background:"#dc2626",color:"#fff",borderRadius:10,fontSize:"10px",fontWeight:700,padding:"1px 5px"}}>{hiddenCols.size} hidden</span>}
        </button>

        <button onClick={()=>setShowGroupPanel(v=>!v)}
          style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:7,border:`1px solid ${showGroupPanel||groupBy.length?"#bbf7d0":"#e2e8f0"}`,background:showGroupPanel||groupBy.length?"#f0fdf4":"#f8fafc",color:showGroupPanel||groupBy.length?"#16a34a":"#475569",fontSize:"12px",fontWeight:600,cursor:"pointer"}}>
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          Group By{groupBy.length>0&&<span style={{background:"#16a34a",color:"#fff",borderRadius:10,fontSize:"10px",fontWeight:700,padding:"1px 5px"}}>{groupBy.length}</span>}
        </button>

        {sorts.length>0&&(
          <div style={{display:"flex",alignItems:"center",gap:5,fontSize:"12px",color:"#7c3aed",background:"#faf5ff",padding:"4px 10px",borderRadius:7,border:"1px solid #e9d5ff"}}>
            ↕ <b>{sorts.map(s=>`${flabel(s.field)} ${s.dir==="asc"?"↑":"↓"}`).join(", ")}</b>
            <button onClick={()=>setSorts([])} style={{background:"none",border:"none",cursor:"pointer",color:"#c4b5fd",fontSize:13,padding:0,marginLeft:2}}>×</button>
          </div>
        )}

        <button onClick={()=>setShowCF(v=>!v)}
          style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:7,border:`1px solid ${showCF?"#fde68a":"#e2e8f0"}`,background:showCF?"#fffbeb":"#f8fafc",color:showCF?"#92400e":"#475569",fontSize:"12px",fontWeight:600,cursor:"pointer"}}>
          🎨 Format
        </button>
      </div>

      {/* ══ COLLAPSIBLE SUB-PANELS ════════════════════════════════════════════ */}

      {/* Column Picker */}
      {showColPicker&&(
        <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"14px 20px",flexShrink:0,maxHeight:"50vh",overflowY:"auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <b style={{fontSize:"13px",color:"#0f172a"}}>⊞ Select Columns — drag headers in the table to reorder</b>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{setSelectedFields(mod.fields.map(f=>f.key));setFieldOrder(mod.fields.map(f=>f.key));setHiddenCols(new Set());}} style={{padding:"5px 12px",borderRadius:7,border:"1px solid #e2e8f0",background:"#f8fafc",color:"#374151",fontSize:"12px",cursor:"pointer"}}>All</button>
              <button onClick={()=>{setSelectedFields(mod.defaultFields);setFieldOrder(mod.defaultFields);setHiddenCols(new Set());}} style={{padding:"5px 12px",borderRadius:7,border:"1px solid #e2e8f0",background:"#f8fafc",color:"#374151",fontSize:"12px",cursor:"pointer"}}>Reset</button>
              <button onClick={()=>setShowColPicker(false)} style={{padding:"5px 10px",borderRadius:7,border:"1px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontSize:"12px",cursor:"pointer"}}>✕</button>
            </div>
          </div>
          {[...new Set(mod.fields.map(f=>f.group))].map(grp=>(
            <div key={grp} style={{marginBottom:12}}>
              <div style={{fontSize:"10px",fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>{grp}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {mod.fields.filter(f=>f.group===grp).map(f=>{
                  const on=selectedFields.includes(f.key)&&!hiddenCols.has(f.key);
                  return(
                    <label key={f.key} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,border:`1px solid ${on?"#bfdbfe":"#e2e8f0"}`,background:on?"#eff6ff":"#f8fafc",cursor:"pointer",fontSize:"12.5px",color:on?"#1d4ed8":"#374151",fontWeight:on?600:400,userSelect:"none",transition:"all 0.12s"}}>
                      <input type="checkbox" checked={on} style={{accentColor:"#2563eb"}}
                        onChange={e=>{
                          if(e.target.checked){setSelectedFields(sf=>[...sf,f.key]);setFieldOrder(fo=>fo.includes(f.key)?fo:[...fo,f.key]);setHiddenCols(s=>{const n=new Set(s);n.delete(f.key);return n;});}
                          else setSelectedFields(sf=>sf.filter(x=>x!==f.key));
                        }}/>
                      {f.label}
                      {f.calc&&<span style={{fontSize:"9px",background:"#fef9c3",color:"#92400e",padding:"1px 5px",borderRadius:4}}>calc</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Group Panel */}
      {showGroupPanel&&(
        <div style={{background:"#f0fdf4",borderBottom:"1px solid #bbf7d0",padding:"10px 20px",flexShrink:0,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontSize:"12px",fontWeight:700,color:"#166534"}}>⊕ Group By:</span>
          {groupBy.map((k,i)=>(
            <span key={k} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",borderRadius:20,background:"#dcfce7",border:"1px solid #86efac",fontSize:"12px",fontWeight:700,color:"#15803d"}}>
              {i>0&&<span style={{color:"#86efac",marginRight:2,fontSize:"9px"}}>→</span>}{flabel(k)}
              <button onClick={()=>setGroupBy(g=>g.filter(x=>x!==k))} style={{background:"none",border:"none",cursor:"pointer",color:"#86efac",fontSize:13,lineHeight:1,padding:0}}>×</button>
            </span>
          ))}
          <select value="" onChange={e=>{if(e.target.value&&!groupBy.includes(e.target.value))setGroupBy(g=>[...g,e.target.value]);e.target.value="";}}
            style={{padding:"5px 10px",border:"1.5px dashed #86efac",borderRadius:8,background:"transparent",fontSize:"12px",color:"#16a34a",fontWeight:600,cursor:"pointer",outline:"none"}}>
            <option value="">+ Add Level</option>
            {mod.fields.filter(f=>!groupBy.includes(f.key)).map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          {groupBy.length>0&&<button onClick={()=>{setGroupBy([]);setCollapsed(new Set());}} style={{padding:"4px 12px",borderRadius:20,border:"1px solid #fca5a5",background:"#fef2f2",color:"#dc2626",fontSize:"11px",fontWeight:600,cursor:"pointer"}}>Clear</button>}
        </div>
      )}

      {/* Conditional Formatting */}
      {showCF&&(
        <div style={{background:"#fffbeb",borderBottom:"1px solid #fde68a",padding:"12px 20px",flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <b style={{fontSize:"12.5px",color:"#92400e"}}>🎨 Conditional Formatting — highlight rows based on conditions</b>
            <button onClick={()=>setCfRules(r=>[...r,{id:Date.now(),field:mod.fields[0]?.key||"",op:"eq",value:"",bg:"#fef9c3",color:"#92400e"}])}
              style={{padding:"5px 12px",borderRadius:7,border:"1px solid #fde68a",background:"#fff",color:"#92400e",fontSize:"12px",fontWeight:600,cursor:"pointer"}}>+ Add Rule</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:160,overflowY:"auto"}}>
            {cfRules.map(r=>(
              <div key={r.id} style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",padding:"8px 12px",background:"#fff",borderRadius:8,border:"1px solid #fde68a"}}>
                <select value={r.field} onChange={e=>setCfRules(rr=>rr.map(ri=>ri.id===r.id?{...ri,field:e.target.value}:ri))} style={{padding:"5px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:"12px",background:"#fff",outline:"none"}}>{mod.fields.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</select>
                <select value={r.op} onChange={e=>setCfRules(rr=>rr.map(ri=>ri.id===r.id?{...ri,op:e.target.value}:ri))} style={{padding:"5px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:"12px",background:"#fff",outline:"none",minWidth:100}}>{FILTER_OPS.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}</select>
                <input value={r.value} onChange={e=>setCfRules(rr=>rr.map(ri=>ri.id===r.id?{...ri,value:e.target.value}:ri))} placeholder="Value" style={{padding:"5px 8px",border:"1px solid #e2e8f0",borderRadius:6,fontSize:"12px",outline:"none",width:90}}/>
                <label style={{fontSize:"11px",color:"#64748b",display:"flex",alignItems:"center",gap:4}}>Row BG<input type="color" value={r.bg||"#ffffff"} onChange={e=>setCfRules(rr=>rr.map(ri=>ri.id===r.id?{...ri,bg:e.target.value}:ri))} style={{width:24,height:22,border:"none",borderRadius:4,cursor:"pointer",padding:0}}/></label>
                <label style={{fontSize:"11px",color:"#64748b",display:"flex",alignItems:"center",gap:4}}>Text<input type="color" value={r.color||"#000000"} onChange={e=>setCfRules(rr=>rr.map(ri=>ri.id===r.id?{...ri,color:e.target.value}:ri))} style={{width:24,height:22,border:"none",borderRadius:4,cursor:"pointer",padding:0}}/></label>
                <button onClick={()=>setCfRules(rr=>rr.filter(ri=>ri.id!==r.id))} style={{padding:"4px 8px",borderRadius:6,border:"1px solid #fecaca",background:"#fef2f2",color:"#dc2626",fontSize:"11px",cursor:"pointer"}}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ MAIN CONTENT ══════════════════════════════════════════════════════ */}
      <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>

        {loadError&&<div style={{padding:"10px 20px",background:"#fef2f2",borderBottom:"1px solid #fecaca",color:"#dc2626",fontSize:"13px",fontWeight:600,flexShrink:0}}>⚠ {loadError} <button onClick={loadData} style={{marginLeft:10,padding:"3px 10px",borderRadius:6,border:"1px solid #fca5a5",background:"#fff",color:"#dc2626",cursor:"pointer",fontSize:"12px",fontWeight:700}}>Retry</button></div>}

        {/* TABLE */}
        {view==="table"&&(
          <>
            {loading?(
              <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:14,color:"#94a3b8"}}>
                <div style={{width:40,height:40,border:"3px solid #e2e8f0",borderTopColor:"#2563eb",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
                <div style={{fontSize:"14px",fontWeight:600,color:"#64748b"}}>Loading {mod.label}…</div>
              </div>
            ):(
              <div style={{flex:1,overflow:"auto"}}>
                <table style={{width:"max-content",minWidth:"100%",borderCollapse:"collapse",fontSize:"12.5px"}}>
                  <thead style={{position:"sticky",top:0,zIndex:3}}>
                    <tr>
                      <th style={{padding:"10px 12px",background:"#f1f5f9",borderBottom:"2px solid #e2e8f0",borderRight:"1px solid #e2e8f0",fontSize:"10.5px",fontWeight:700,color:"#94a3b8",textAlign:"center",width:42,userSelect:"none"}}>#</th>
                      {visibleFields.map(f=>{
                        const se=sorts.find(s=>s.field===f.key);
                        return(
                          <th key={f.key}
                            draggable onDragStart={e=>onDragStart(e,f.key)} onDragOver={e=>e.preventDefault()} onDrop={e=>onDrop(e,f.key)}
                            style={{padding:"10px 12px",background:"#f1f5f9",borderBottom:"2px solid #e2e8f0",borderRight:"1px solid #e2e8f0",textAlign:"left",fontSize:"11px",fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap",cursor:"pointer",position:"relative",userSelect:"none",width:colWidths[f.key]||DEF_W,minWidth:colWidths[f.key]||DEF_W}}>
                            <div style={{display:"flex",alignItems:"center",gap:3,overflow:"hidden"}}>
                              <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis"}} title={f.label} onClick={()=>toggleSort(f.key)}>{f.label}</span>
                              <span style={{color:se?"#2563eb":"#d1d5db",fontSize:"11px",cursor:"pointer"}} onClick={()=>toggleSort(f.key)}>{se?(se.dir==="asc"?"↑":"↓"):"↕"}</span>
                              <span title="Hide" onClick={e=>{e.stopPropagation();setHiddenCols(s=>{const n=new Set(s);n.add(f.key);return n;})}} style={{color:"#d1d5db",fontSize:"11px",cursor:"pointer",opacity:0.7,marginLeft:1}}>✕</span>
                              <span onMouseDown={e=>startResize(e,f.key)} onClick={e=>e.stopPropagation()} style={{position:"absolute",right:0,top:0,bottom:0,width:5,cursor:"col-resize",background:"transparent"}}/>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {groups
                      ?renderGroups(groups)
                      :pagedRows.length>0
                        ?pagedRows.map((row,ri)=>renderRow(row,ri))
                        :(
                          <tr><td colSpan={visibleFields.length+1} style={{padding:"70px 24px",textAlign:"center"}}>
                            <div style={{fontSize:36,marginBottom:10}}>🔍</div>
                            <div style={{fontSize:"15px",fontWeight:700,color:"#475569",marginBottom:6}}>No records found</div>
                            <div style={{fontSize:"13px",color:"#94a3b8"}}>{filters.length>0||globalSearch?"Try removing or changing the active filters.":"No data available."}</div>
                            {(filters.length>0||globalSearch)&&<button onClick={clearAll} style={{marginTop:12,padding:"7px 18px",borderRadius:8,border:"1px solid #bfdbfe",background:"#eff6ff",color:"#2563eb",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>Clear Filters</button>}
                          </td></tr>
                        )
                    }
                  </tbody>
                  {!groups&&processedData.length>0&&visibleFields.some(f=>f.type==="number")&&(
                    <tfoot>
                      <tr style={{background:"#f8fafc",borderTop:"2px solid #e2e8f0"}}>
                        <td style={{padding:"8px 12px",fontSize:"11px",fontWeight:700,color:"#94a3b8",textAlign:"center"}}>Σ</td>
                        {visibleFields.map((f,i)=>{
                          const s=summary[f.key];
                          return<td key={f.key} style={{padding:"8px 12px",fontSize:"11.5px",fontWeight:700,color:"#475569",borderRight:"1px solid #f0f0f0"}}>
                            {i===0?<span style={{color:"#94a3b8",fontWeight:500}}>{processedData.length.toLocaleString("en-IN")} rows</span>
                              :f.type==="number"&&s?<span title={`Avg: ${s.avg}`} style={{color:"#1d4ed8"}}>Σ {s.sum.toLocaleString("en-IN")}</span>:""}
                          </td>;
                        })}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* Pagination */}
            {!loading&&!groups&&totalPages>1&&(
              <div style={{padding:"8px 20px",borderTop:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:4,background:"#fff",flexShrink:0,fontSize:"12.5px"}}>
                <span style={{color:"#64748b",marginRight:8}}>Rows {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,processedData.length)} of <b>{processedData.length.toLocaleString("en-IN")}</b></span>
                <div style={{marginLeft:"auto",display:"flex",gap:3}}>
                  {[["«",1],["‹",Math.max(1,page-1)]].map(([l,p])=><button key={l} onClick={()=>setPage(p)} disabled={page===1} style={{padding:"5px 10px",borderRadius:6,border:"1px solid #e2e8f0",background:"#f8fafc",cursor:page===1?"not-allowed":"pointer",color:page===1?"#d1d5db":"#374151",fontSize:"12px",fontWeight:600}}>{l}</button>)}
                  {Array.from({length:Math.min(7,totalPages)},(_,i)=>{
                    const pg=totalPages<=7?i+1:page<=4?i+1:page>=totalPages-3?totalPages-6+i:page-3+i;
                    if(pg<1||pg>totalPages) return null;
                    return<button key={pg} onClick={()=>setPage(pg)} style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${pg===page?"#2563eb":"#e2e8f0"}`,background:pg===page?"#2563eb":"#f8fafc",color:pg===page?"#fff":"#374151",fontSize:"12px",fontWeight:pg===page?700:500,cursor:"pointer"}}>{pg}</button>;
                  })}
                  {[["›",Math.min(totalPages,page+1)],["»",totalPages]].map(([l,p])=><button key={l} onClick={()=>setPage(p)} disabled={page===totalPages} style={{padding:"5px 10px",borderRadius:6,border:"1px solid #e2e8f0",background:"#f8fafc",cursor:page===totalPages?"not-allowed":"pointer",color:page===totalPages?"#d1d5db":"#374151",fontSize:"12px",fontWeight:600}}>{l}</button>)}
                </div>
              </div>
            )}
          </>
        )}

        {/* PIVOT */}
        {view==="pivot"&&(
          <div style={{flex:1,overflow:"auto",padding:20}}>
            <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:20,marginBottom:20}}>
              <h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:700,color:"#0f172a"}}>↔ Pivot Table</h3>
              <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"flex-end"}}>
                {[["rowField","Row (Y-axis)"],["colField","Column (X-axis)"],["valueField","Value"]].map(([k,lbl])=>(
                  <div key={k}>
                    <div style={{fontSize:"11px",fontWeight:700,color:"#64748b",marginBottom:5}}>{lbl}</div>
                    <select value={pivotCfg[k]} onChange={e=>setPivotCfg(c=>({...c,[k]:e.target.value}))}
                      style={{padding:"8px 10px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:"12.5px",background:"#fff",outline:"none",minWidth:170,cursor:"pointer"}}>
                      <option value="">— Select —</option>
                      {[...new Set(mod.fields.map(f=>f.group))].map(grp=>(
                        <optgroup key={grp} label={grp}>{mod.fields.filter(f=>f.group===grp).map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</optgroup>
                      ))}
                    </select>
                  </div>
                ))}
                <div>
                  <div style={{fontSize:"11px",fontWeight:700,color:"#64748b",marginBottom:5}}>Aggregation</div>
                  <select value={pivotCfg.aggFn} onChange={e=>setPivotCfg(c=>({...c,aggFn:e.target.value}))}
                    style={{padding:"8px 10px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:"12.5px",background:"#fff",outline:"none",cursor:"pointer"}}>
                    {[["count","Count"],["sum","Sum"],["avg","Average"],["min","Minimum"],["max","Maximum"]].map(([k,l])=><option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
              </div>
            </div>
            {pivot?(
              <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"auto"}}>
                <table style={{borderCollapse:"collapse",fontSize:"12.5px",width:"max-content",minWidth:"100%"}}>
                  <thead>
                    <tr style={{background:"#f1f5f9"}}>
                      <th style={{padding:"10px 14px",fontWeight:700,fontSize:"11px",color:"#475569",textTransform:"uppercase",borderBottom:"2px solid #e2e8f0",borderRight:"1px solid #e2e8f0",background:"#e2e8f0",minWidth:130}}>{flabel(pivotCfg.rowField)} ↓ / {flabel(pivotCfg.colField)} →</th>
                      {pivot.colVals.map(cv=><th key={cv} style={{padding:"10px 14px",fontWeight:700,fontSize:"11px",color:"#475569",textTransform:"uppercase",borderBottom:"2px solid #e2e8f0",borderRight:"1px solid #e2e8f0",textAlign:"center",minWidth:80}}>{cv||"(blank)"}</th>)}
                      <th style={{padding:"10px 14px",fontWeight:700,fontSize:"11px",color:"#1d4ed8",textTransform:"uppercase",borderBottom:"2px solid #bfdbfe",background:"#dbeafe",textAlign:"center",minWidth:80}}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pivot.rowVals.map((rv,ri)=>{
                      const rowTotal=pivot.colVals.reduce((s,cv)=>s+(pivot.agg[rv]?.[cv]?pivot.calc(pivot.agg[rv][cv]):0),0);
                      return(
                        <tr key={rv} style={{background:ri%2===0?"#fff":"#f9fafb"}}>
                          <td style={{padding:"9px 14px",fontWeight:700,color:"#0f172a",borderRight:"1px solid #e2e8f0",background:ri%2===0?"#f8fafc":"#f1f5f9"}}>{rv||"(blank)"}</td>
                          {pivot.colVals.map(cv=>{
                            const vals=pivot.agg[rv]?.[cv]||[],v=vals.length?pivot.calc(vals):"";
                            const mx=Math.max(...pivot.rowVals.map(r=>pivot.agg[r]?.[cv]?.length?pivot.calc(pivot.agg[r][cv]):0),1);
                            const op=v!==""&&Number(v)>0?Math.min(0.35,(Number(v)/mx)*0.35):0;
                            return<td key={cv} style={{padding:"9px 14px",textAlign:"center",borderRight:"1px solid #e2e8f0",background:op>0?`rgba(37,99,235,${op})`:undefined,fontWeight:v?600:400,color:v?"#0f172a":"#d1d5db"}}>{v!==""?v:"—"}</td>;
                          })}
                          <td style={{padding:"9px 14px",textAlign:"center",fontWeight:700,color:"#1d4ed8",background:"#eff6ff",borderLeft:"2px solid #bfdbfe"}}>{rowTotal||"—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{borderTop:"2px solid #bfdbfe",background:"#dbeafe"}}>
                      <td style={{padding:"9px 14px",fontWeight:800,color:"#1d4ed8"}}>Grand Total</td>
                      {pivot.colVals.map(cv=>{const t=pivot.rowVals.reduce((s,rv)=>s+(pivot.agg[rv]?.[cv]?pivot.calc(pivot.agg[rv][cv]):0),0);return<td key={cv} style={{padding:"9px 14px",textAlign:"center",fontWeight:700,color:"#1d4ed8"}}>{t||"—"}</td>;})}
                      <td style={{padding:"9px 14px",textAlign:"center",fontWeight:800,color:"#1e40af",background:"#bfdbfe",borderLeft:"2px solid #93c5fd"}}>{pivot.rowVals.reduce((s,rv)=>s+pivot.colVals.reduce((ss,cv)=>ss+(pivot.agg[rv]?.[cv]?pivot.calc(pivot.agg[rv][cv]):0),0),0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ):(
              <div style={{background:"#fff",borderRadius:12,border:"1px dashed #e2e8f0",padding:"60px 24px",textAlign:"center",color:"#94a3b8"}}>
                <div style={{fontSize:40,marginBottom:12}}>↔</div>
                <div style={{fontSize:"15px",fontWeight:700,color:"#475569",marginBottom:6}}>Configure Pivot Table</div>
                <div style={{fontSize:"13px"}}>Select Row, Column and Value fields above to build the pivot.</div>
              </div>
            )}
          </div>
        )}

        {/* CHART */}
        {view==="chart"&&(
          <div style={{flex:1,overflow:"auto",padding:20}}>
            <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:20,marginBottom:20}}>
              <h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:700,color:"#0f172a"}}>📊 Chart</h3>
              <div style={{display:"flex",gap:14,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div>
                  <div style={{fontSize:"11px",fontWeight:700,color:"#64748b",marginBottom:5}}>Type</div>
                  <div style={{display:"flex",background:"#f1f5f9",borderRadius:8,padding:3,gap:2}}>
                    {[["bar","Bar"],["pie","Pie"]].map(([k,l])=>(
                      <button key={k} onClick={()=>setChartType(k)} style={{padding:"6px 14px",borderRadius:6,border:"none",background:chartType===k?"#fff":"transparent",color:chartType===k?"#2563eb":"#64748b",fontWeight:chartType===k?700:500,fontSize:"12.5px",cursor:"pointer",boxShadow:chartType===k?"0 1px 3px rgba(0,0,0,0.1)":undefined}}>{l}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{fontSize:"11px",fontWeight:700,color:"#64748b",marginBottom:5}}>Category (X-axis)</div>
                  <select value={chartX} onChange={e=>setChartX(e.target.value)} style={{padding:"8px 10px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:"12.5px",background:"#fff",outline:"none",minWidth:180,cursor:"pointer"}}>
                    <option value="">— Select Field —</option>
                    {[...new Set(mod.fields.map(f=>f.group))].map(grp=>(
                      <optgroup key={grp} label={grp}>{mod.fields.filter(f=>f.group===grp).map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</optgroup>
                    ))}
                  </select>
                </div>
                {chartType==="bar"&&(
                  <div>
                    <div style={{fontSize:"11px",fontWeight:700,color:"#64748b",marginBottom:5}}>Value (Y-axis)</div>
                    <select value={chartY} onChange={e=>setChartY(e.target.value)} style={{padding:"8px 10px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:"12.5px",background:"#fff",outline:"none",minWidth:160,cursor:"pointer"}}>
                      <option value="_count">Count</option>
                      {mod.fields.filter(f=>f.type==="number").map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:24,display:"flex",justifyContent:"center",marginBottom:20}}>
              {chartX
                ?chartType==="bar"?<BarChart data={chartData} xKey={chartX} yKey={chartY==="___c"?"_count":chartY} title={`${flabel(chartX)} — Distribution`}/>
                :<PieChart data={chartData} nameKey={chartX} valueKey="_count" title={`${flabel(chartX)} — Distribution`}/>
                :<EmptyChart msg="Select a column above to generate the chart"/>
              }
            </div>
            {visibleFields.filter(f=>f.type==="number").length>0&&(
              <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                {visibleFields.filter(f=>f.type==="number").map(f=>{
                  const s=summary[f.key];
                  return(
                    <div key={f.key} style={{background:"#fff",borderRadius:10,border:"1px solid #e2e8f0",padding:"16px 20px",minWidth:180}}>
                      <div style={{fontSize:"11px",fontWeight:700,color:"#64748b",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"}}>{f.label}</div>
                      <div style={{fontSize:"24px",fontWeight:800,color:"#0f172a"}}>{(s?.sum||0).toLocaleString("en-IN")}</div>
                      <div style={{fontSize:"11.5px",color:"#94a3b8",marginTop:3}}>Avg: {s?.avg||0}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* KPI VIEW */}
      {view==="kpi"&&(
        <div style={{flex:1,overflow:"auto",padding:20}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14,marginBottom:20}}>
            {/* Total records */}
            <div style={{background:"#fff",borderRadius:12,padding:"18px 20px",border:"1px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
              <div style={{fontSize:"11px",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Total Records</div>
              <div style={{fontSize:"32px",fontWeight:800,color:"#2563eb"}}>{processedData.length.toLocaleString("en-IN")}</div>
              <div style={{fontSize:"11.5px",color:"#94a3b8",marginTop:4}}>from {rawData.length.toLocaleString("en-IN")} total</div>
            </div>
            {/* Numeric KPIs */}
            {visibleFields.filter(f=>f.type==="number").map(f=>{
              const s=summary[f.key];
              if(!s) return null;
              return(
                <div key={f.key} style={{background:"#fff",borderRadius:12,padding:"18px 20px",border:"1px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
                  <div style={{fontSize:"11px",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>{f.label}</div>
                  <div style={{fontSize:"28px",fontWeight:800,color:"#0f172a"}}>{s.sum.toLocaleString("en-IN")}</div>
                  <div style={{fontSize:"11.5px",color:"#94a3b8",marginTop:4}}>Avg: {s.avg} · across {processedData.length} records</div>
                </div>
              );
            })}
            {/* Category breakdowns */}
            {visibleFields.filter(f=>f.type==="select").map(f=>{
              const map=new Map();
              for(const r of processedData){const k=String(r[f.key]||"(blank)");map.set(k,(map.get(k)||0)+1);}
              const entries=[...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);
              if(!entries.length) return null;
              const max=entries[0][1];
              return(
                <div key={f.key} style={{background:"#fff",borderRadius:12,padding:"18px 20px",border:"1px solid #e2e8f0",boxShadow:"0 1px 4px rgba(0,0,0,0.05)",gridColumn:"span 2"}}>
                  <div style={{fontSize:"11px",fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:12}}>{f.label} Breakdown</div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {entries.map(([k,v],i)=>{
                      const s=BADGE_MAP[k]||BADGE_MAP[k.toLowerCase()]||{bg:"#f1f5f9",color:"#475569"};
                      return(
                        <div key={k} style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{minWidth:120,fontSize:"12px",fontWeight:600,color:s.color,background:s.bg,padding:"2px 8px",borderRadius:12,textAlign:"center",flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{k}</span>
                          <div style={{flex:1,height:8,background:"#f1f5f9",borderRadius:4,overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${Math.round((v/max)*100)}%`,background:CC[i%10],borderRadius:4,transition:"width 0.3s"}}/>
                          </div>
                          <span style={{fontSize:"12px",fontWeight:700,color:"#0f172a",minWidth:32,textAlign:"right"}}>{v}</span>
                          <span style={{fontSize:"11px",color:"#94a3b8",minWidth:36,textAlign:"right"}}>{Math.round((v/processedData.length)*100)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Top records table */}
          {processedData.length>0&&(
            <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
              <div style={{padding:"12px 16px",borderBottom:"1px solid #e2e8f0",fontWeight:700,fontSize:"13px",color:"#0f172a"}}>Top 10 Records</div>
              <div style={{overflow:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12.5px"}}>
                  <thead><tr style={{background:"#f8fafc"}}>{visibleFields.slice(0,6).map(f=><th key={f.key} style={{padding:"9px 14px",textAlign:"left",fontWeight:700,fontSize:"11px",color:"#475569",textTransform:"uppercase",borderBottom:"1px solid #e2e8f0"}}>{f.label}</th>)}</tr></thead>
                  <tbody>{processedData.slice(0,10).map((row,ri)=><tr key={ri} style={{borderBottom:"1px solid #f1f5f9",background:ri%2===0?"#fff":"#fafafa"}}>{visibleFields.slice(0,6).map(f=><td key={f.key} style={{padding:"9px 14px",color:"#374151"}}>{BADGE_KEYS.has(f.key)&&row[f.key]?<CellBadge val={String(row[f.key])}/>:fmtCell(row[f.key],f.type)||<span style={{color:"#d1d5db"}}>—</span>}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ SAVE MODAL ════════════════════════════════════════════════════════ */}
      {showSave&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:32,width:440,boxShadow:"0 25px 60px rgba(0,0,0,0.2)"}}>
            <h3 style={{margin:"0 0 18px",fontSize:18,fontWeight:800,color:"#0f172a"}}>💾 Save Report</h3>
            <label style={{fontSize:"12.5px",fontWeight:600,color:"#475569",display:"block",marginBottom:6}}>Report Name *</label>
            <input autoFocus value={saveName} onChange={e=>setSaveName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSave()}
              placeholder="e.g. ICU Assets, Warranty Expiry…"
              style={{width:"100%",padding:"11px 14px",border:"1.5px solid #e2e8f0",borderRadius:9,fontSize:"14px",outline:"none",boxSizing:"border-box",marginBottom:12}}/>
            <div style={{fontSize:"12px",color:"#94a3b8",marginBottom:20}}>Saves: <b>{mod.label}</b> · {selectedFields.length} columns · {filters.length} filters · sort &amp; group config</div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setShowSave(false)} style={{padding:"9px 20px",borderRadius:8,border:"1px solid #e2e8f0",background:"#f8fafc",color:"#64748b",fontSize:"13.5px",fontWeight:600,cursor:"pointer"}}>Cancel</button>
              <button onClick={doSave} style={{padding:"9px 24px",borderRadius:8,border:"none",background:"#2563eb",color:"#fff",fontSize:"13.5px",fontWeight:700,cursor:"pointer"}}>Save Report</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ LOAD MODAL ════════════════════════════════════════════════════════ */}
      {showLoad&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.5)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:16,padding:28,width:580,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 25px 60px rgba(0,0,0,0.2)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <h3 style={{margin:0,fontSize:18,fontWeight:800,color:"#0f172a"}}>📂 Saved Reports</h3>
              <button onClick={()=>setShowLoad(false)} style={{padding:"6px 12px",borderRadius:7,border:"1px solid #e2e8f0",background:"#f8fafc",color:"#64748b",cursor:"pointer",fontSize:"13px"}}>✕ Close</button>
            </div>
            {savedReports.length===0
              ?<div style={{textAlign:"center",padding:"50px 0",color:"#94a3b8"}}><div style={{fontSize:36,marginBottom:10}}>📋</div><div style={{fontSize:"15px",fontWeight:700,color:"#475569",marginBottom:6}}>No Saved Reports</div><div style={{fontSize:"13px"}}>Use "Save" to store your report configuration.</div></div>
              :<div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:8}}>
                {savedReports.map(r=>(
                  <div key={r.id} style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",border:"1px solid #e2e8f0",borderRadius:10,background:"#fafafa"}}>
                    <div style={{flex:1,overflow:"hidden"}}>
                      <div style={{fontWeight:700,fontSize:"14px",color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>📋 {r.name}</div>
                      <div style={{fontSize:"11.5px",color:"#94a3b8",display:"flex",gap:8,flexWrap:"wrap"}}>
                        <span>{MODULE_REGISTRY[r.moduleKey]?.icon} {MODULE_REGISTRY[r.moduleKey]?.label}</span>
                        <span>· {r.selectedFields?.length||0} columns</span>
                        <span>· {r.filters?.length||0} filters</span>
                        <span>· {new Date(r.createdAt).toLocaleDateString("en-IN")}</span>
                      </div>
                    </div>
                    <button onClick={()=>doLoad(r)} style={{padding:"7px 18px",borderRadius:8,border:"none",background:"#2563eb",color:"#fff",fontSize:"13px",fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>Load</button>
                    <button onClick={()=>doDelete(r.id)} style={{padding:"7px 14px",borderRadius:8,border:"1px solid #fecaca",background:"#fef2f2",color:"#dc2626",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>Delete</button>
                  </div>
                ))}
              </div>
            }
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
