const express = require('express');
const { Pool } = require('pg');
const cron = require('node-cron');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 600000,
  connectionTimeoutMillis: 30000
});

process.on('uncaughtException', err => console.error('[Crash]', err.message));
process.on('unhandledRejection', reason => console.error('[Rejection]', reason));

const EBN_BIDS = [
  { id:'ebn-884913', name:'EBN — Bid Opportunity 884913', agency:'EnviroBidNet', city:'Texas', posted:'2026-09-05', due:'2026-09-20', scope:'New E&I engineering opportunity. See bid link for full details.', url:'https://www.envirobidnet.com', source:'EnviroBidNet', value:'TBD', status:'active', region:'texas' },
  { id:'ebn-884038', name:'Opportunity Home San Antonio — RFQ Environmental Engineering Services (884038)', agency:'Opportunity Home San Antonio', city:'San Antonio, TX', posted:'2026-09-04', due:'2026-09-17', scope:'RFQ Addenda 1-2 Environmental Engineering Services. 3 bid specifications available. Environmental engineering, site assessment, instrumentation and controls consulting.', url:'https://www.envirobidnet.com', source:'EnviroBidNet', value:'TBD', status:'active', region:'texas' },
  { id:'ebn-882894', name:'Liberty Hill — North Fork WWTP Improvements Addenda (882894)', agency:'City of Liberty Hill', city:'Liberty Hill, TX', posted:'2026-09-04', due:'2026-10-15', scope:'Addenda 1-2, Due Date Extended. North Fork Wastewater Treatment Plant — new primary and secondary headworks, MBR treatment process. Electrical, instrumentation, controls, SCADA. 6 bid specifications available.', url:'https://www.envirobidnet.com', source:'EnviroBidNet', value:'TBD', status:'active', region:'texas' },
  { id:'ebn-881778', name:'La Marque — RFQ Third-Party Building Plan Review (881778)', agency:'City of La Marque', city:'La Marque, TX', posted:'2026-08-20', due:'2026-09-15', scope:'RFQ Third-Party Building Plan Review and Inspection Services.', url:'https://www.envirobidnet.com', source:'EnviroBidNet', value:'TBD', status:'active', region:'houston' },
]
const H2BID_BIDS = [
  { id:'h2bid-001', name:'City of Houston — Clinton Park Wastewater Treatment Plant Improvements', agency:'H2bid', city:'Houston, TX', posted:'2026-08-17', due:'2026-09-03', scope:'Clinton Park Wastewater Treatment Plant Improvements — NAICS: 221320 Sewage Treatment Facilities, 237110 Water and Sewer Line Construction. Posted: 08/17/2026. Due: 09/03/2026. Source: govcb.com. City of Houston.', url:'https://www.beaconbid.com/solicitations/city-of-houston', source:'H2bid' },
  { id:'h2bid-002', name:'City of Sugar Land — Wastewater Treatment Plants Improvements (RFQ-2026-036)', agency:'H2bid', city:'Sugar Land, TX', posted:'2026-08-05', due:'2026-09-04', scope:'City of Sugar Land Wastewater Treatment Plants Improvements. Project ID: 2026-RFQ-036. Addenda: 0. Release Date: 08/05/2026. Due: 09/04/2026. Professional engineering services.', url:'https://www.govcb.com/government-bids/WASTEWATER-TREATMENT-PLANTS-IMPROVEMENTS-23800101.htm', source:'H2bid' },
  { id:'h2bid-003', name:'City of Houston — WW Collection System Rehabilitation & Renewal (CB-2026-0048)', agency:'H2bid', city:'Houston, TX', posted:'2026-05-29', due:'2026-09-15', scope:'On-call rehabilitation and renewal of wastewater collection system. Point repairs, sewer replacement, sliplining, CIPP, manholes. Est. $4.3M. Release: 05/29/2026. Houston Public Works.', url:'https://www.beaconbid.com/solicitations/city-of-houston/085f5cae-deb4-4ccd-aae0-d070ae461214/wastewater-collection-system-rehabilitation-and-renewal', source:'H2bid' },
  { id:'h2bid-004', name:'City of Houston — WW Collection System Rehabilitation of Manholes (CB-2026-0030)', agency:'H2bid', city:'Houston, TX', posted:'2026-05-29', due:'2026-09-20', scope:'Rehabilitation of existing manholes using cementitious liners, CIPP liners, polymeric coatings. Point repairs to sewer mains. Posted: 05/29/2026. Last Updated: 06/22/2026. Houston Public Works.', url:'https://www.beaconbid.com/solicitations/city-of-houston/9f2e4bf2-7d31-4ec1-943c-10f0eeec95d0/wastewater-collection-system-rehabilitation-and-renewal-of-manholes', source:'H2bid' },
  { id:'h2bid-005', name:'City of Houston — Sims North WWTP Improvements Package 3 (CB-2026-0022)', agency:'H2bid', city:'Houston, TX', posted:'2026-04-01', due:'2026-09-25', scope:'Comprehensive improvements at Sims North WWTP. Main Electrical Building, Thickened Sludge Electrical Building, mechanical systems. Est. $15M. Site Visit: 05/27/2026. FEMA reimbursement. Houston Public Works.', url:'https://www.beaconbid.com/solicitations/city-of-houston/d970dd10-3342-4999-b71c-c31d88edf5a8/sims-north-wastewater-treatment-plant-improvements-package', source:'H2bid' },
  { id:'h2bid-006', name:'San Antonio Water System (SAWS) — Lateral Renewal & Repair Construction Services', agency:'H2bid', city:'San Antonio, TX', posted:'2026-08-01', due:'2026-09-19', scope:'SAWS Distribution and Collection Operations — outsourced construction for lateral renewal and repair. Wastewater collection, CIPP lining, pipe inspection. Bexar County. Posted: 08/01/2026. Due: 09/19/2026.', url:'https://www.saws.org/business-center/purchasing/', source:'H2bid' },
  { id:'h2bid-007', name:'City of Houston — East Water Purification Plant (EWPP) Mechanical & Electrical Improvements', agency:'H2bid', city:'Houston, TX', posted:'2026-01-16', due:'2026-10-01', scope:'East Water Purification Plant — mechanical and electrical improvements. Electrical systems, instrumentation upgrades. Posted: 01/16/2026. Houston Public Works.', url:'https://www.beaconbid.com/solicitations/city-of-houston/a14610b8-d60a-4d4a-be27-bd9c490eaf7c/east-water-purification-plant-ewpp-mechanical-and-electrical-improvements-for-plants-and', source:'H2bid' },

  // New H2bid bids added Aug 25 2026
  { id:'h2bid-011', name:'City of Houston — Lift Station Renewal & Rehabilitation Green Dolphin Sherwood Oaks West Court MUD 175-1 (CB-2026-0026)', agency:'City of Houston Public Works', city:'Houston, TX', posted:'2026-05-28', due:'2026-09-11', scope:'Electrical upgrades: control panels, transformer, ATS, service entrance, light poles, duct banks, grounding, float switches, wet well sensors, instrumentation and controls. Demolition of existing pumps, piping, valves, electrical, instrumentation. SCADA integration.', url:'https://www.beaconbid.com/solicitations/city-of-houston/34af4f2f-367d-4407-a66f-f25739e29559/lift-station-renewal-and-rehabilitation-green-dolphin-sherwood-oaks-west-court-and-mud-l', source:'H2bid', value:'TBD', status:'active', region:'houston' },
  { id:'h2bid-014', name:'City of Austin — Northeast WWTP Expansions Wildhorse Pearce Lane Taylor Lane (RFQS-6100-CLMP395A)', agency:'City of Austin — Austin Water Department', city:'Austin, TX', posted:'2026-07-15', due:'2026-09-03', scope:'Expansion of Wildhorse, Pearce Lane and Taylor Lane wastewater treatment plants. Electrical, instrumentation, controls, SCADA upgrades, civil and process engineering.', url:'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitation_details.cfm?sid=143347', source:'H2bid', value:'TBD', status:'active', region:'texas' },
  { id:'h2bid-017', name:'Texas A&M University — WWTP Improvements Project Phase 1 (TAMU-RFP-26-5088)', agency:'Texas A&M University', city:'College Station, TX', posted:'2026-08-15', due:'2026-09-08', scope:'Wastewater Treatment Plant Improvements Phase 1 at Texas A&M University. Includes electrical, instrumentation, controls, SCADA, mechanical and process improvements.', url:'https://www.txsmartbuy.gov/esbd/TAMU-RFP-26-5088', source:'TX ESBD', value:'TBD', status:'active', region:'texas' },
  { id:'esbd-008', name:'Texas A&M University System — IDIQ Mechanical/Electrical/Plumbing (MEP) Engineering Services (753-26-00034)', agency:'Sam Houston State University — TAMUS', city:'Huntsville, TX', posted:'2026-08-18', due:'2026-09-15', scope:'IDIQ contract for Mechanical, Electrical, and Plumbing engineering services. Includes electrical systems, instrumentation, controls, SCADA design for campus facilities.', url:'https://www.txsmartbuy.gov/esbd/753-26-00034', source:'TX ESBD', value:'TBD', status:'active', region:'texas' },
  { id:'esbd-009', name:'Texas A&M University — Campus Sanitary and Storm Sewer Collection System Improvements Design Services (TAMU-RFQ-26-5090)', agency:'Texas A&M University', city:'College Station, TX', posted:'2026-08-14', due:'2026-09-11', scope:'Design services for campus sanitary and storm sewer collection system improvements. Includes flow metering, instrumentation, controls and SCADA integration for sewer system.', url:'https://www.txsmartbuy.gov/esbd/TAMU-RFQ-26-5090', source:'TX ESBD', value:'TBD', status:'active', region:'texas' },
  { id:'h2bid-017', name:'City of Houston — Professional Engineering Services Regulatory Compliance Support Various WWTP Facilities (RFQ-2026-HPW)', agency:'City of Houston Public Works & Engineering', city:'Houston, TX', posted:'2026-08-25', due:'2026-10-01', scope:'Professional Engineering Services for regulatory permitting and compliance at various WWTP facilities. TPDES permit renewals and amendments, storm water and air permitting support, laboratory testing coordination, pretreatment and regulatory compliance programs.', url:'https://www.beaconbid.com/solicitations/city-of-houston/bdccdb58-0dc2-45dc-9e43-d1c35f2d8b40/professional-engineering-services-for-regulatory-compliance-support-at-various-wastewater-facilities', source:'H2bid', value:'TBD', status:'active', region:'houston' },
  { id:'h2bid-016', name:'City of Houston — On-Call Electrical Repair & Replacement Services Water/WW Facilities (CB-2026-0049)', agency:'City of Houston Public Works & Engineering', city:'Houston, TX', posted:'2026-08-15', due:'2026-09-25', scope:'On-call electrical repair and replacement services at water and wastewater treatment facilities. Includes motor control centers, switchgear, transformers, panels, wiring, conduit, instrumentation, controls, SCADA integration. Est. value $5M.', url:'https://www.beaconbid.com/solicitations/city-of-houston/open', source:'H2bid', value:'~$5,000,000', status:'active', region:'houston' },
  { id:'h2bid-015', name:'City of Austin — Gilleland Wastewater Interceptor Construction (RFQS-6100-CLMP400)', agency:'City of Austin — Austin Water Department', city:'Austin, TX', posted:'2026-08-01', due:'2026-09-24', scope:'Construction of 7,730 LF of 30-inch and 7,610 LF of 36-inch gravity interceptor in the Western Gilleland Basin. Electrical, instrumentation, controls, SCADA integration.', url:'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitation_details.cfm?sid=144532', source:'H2bid', value:'TBD', status:'active', region:'texas' },
  { id:'h2bid-013', name:'City of Houston — Sims North Wastewater Treatment Plant Improvements Package 3 (CB-2026-0022)', agency:'City of Houston Public Works', city:'Houston, TX', posted:'2026-05-15', due:'2026-09-04', scope:'Comprehensive mechanical, structural, electrical and instrumentation improvements at Sims North WWTP (9500 Lawndale St). Conduit, wire, terminations, panels, boxes, electrical gear, racks, raceways, duct bank, receptacles, lighting, site lighting, disconnects, transformers, grounding. Demo, process piping, labeling, insulation, HVAC. FEMA reimbursement bid. Est. value $15M.', url:'https://www.beaconbid.com/solicitations/city-of-houston/d970dd10-3342-4999-b71c-c31d88edf5a8/sims-north-wastewater-treatment-plant-improvements-package', source:'H2bid', value:'~$15,000,000', status:'active', region:'houston' },
  { id:'h2bid-012', name:'City of Houston — On-Call Wastewater Collection System Rehabilitation & Renewal (CB-2026-0048)', agency:'City of Houston Public Works', city:'Houston, TX', posted:'2026-07-14', due:'2026-09-18', scope:'On-call rehabilitation and replacement of sanitary sewer system components. Point repairs, sewer replacement, service lateral repairs, sliplining, pipe bursting, slurry boring, service reconnections. Cleaning and televising sanitary sewers, manhole installation and rehabilitation. Est. value $4,300,000.', url:'https://app.govly.com/public/opportunities/16781508', source:'H2bid', value:'~$4,300,000', status:'active', region:'houston' },
]
const CIVCAST_BIDS = [
  { id:'civcast-001', name:'HPW — Neighborhood Water Line Rehab Central Park & Magnolia Park', agency:'CivCast', city:'Houston, TX', posted:'2026-07-01', due:'2026-09-15', scope:'Houston Public Works — Neighborhood Water Line Rehabilitation in Central Park and Magnolia Park Subdivisions. Harris County, TX.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
  { id:'civcast-002', name:'HPW — New Replacement Water Well & Collection Line IAH Well No. 4', agency:'CivCast', city:'Houston, TX', posted:'2026-07-15', due:'2026-09-20', scope:'Houston Public Works — New Replacement of Water Well and Well Collection Line IAH Well No. 4. Harris County, TX.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
  { id:'civcast-003', name:'HPW — Transportation & Drainage Bridge Rehabilitation Program', agency:'CivCast', city:'Houston, TX', posted:'2026-07-15', due:'2026-09-25', scope:'Houston Public Works — Transportation and Drainage Operations Bridge Rehabilitation and Replacement Program.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
  { id:'civcast-004', name:'Trinity River Authority — RFQ Professional Engineering FY 2027-2028', agency:'CivCast', city:'Arlington, TX', posted:'2026-07-15', due:'2026-10-01', scope:'Trinity River Authority of Texas RFQ for Professional Engineering Services FY 2027-2028. Electrical, instrumentation, SCADA design.', url:'https://www.civcastusa.com/publishers/5d6017908289a31a1c7febe1', source:'CivCast' },
  { id:'civcast-005', name:'HCMUD No. 525 — Water Plant No. 1 Expansion Sundance Cove', agency:'CivCast', city:'Harris County, TX', posted:'2026-08-01', due:'2026-10-10', scope:'Harris County MUD No. 525 — Water Plant No. 1 Expansion to serve Sundance Cove subdivision. Water treatment plant engineering.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
  { id:'civcast-006', name:'City of Pflugerville — WW2401 Gilleland Creek WW Interceptor (RFP 2026-023)', agency:'CivCast', city:'Pflugerville, TX', posted:'2026-08-01', due:'2026-10-20', scope:'City of Pflugerville RFP No. 2026-023 — WW2401 Gilleland Creek Wastewater Interceptor Engineering Design Services.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
  { id:'civcast-007', name:'Quiddity Engineering — Water Treatment E&I Engineering Services Texas', agency:'CivCast', city:'Texas', posted:'2026-08-01', due:'2026-10-30', scope:'Quiddity Engineering Texas — Water Treatment Electrical & Instrumentation Engineering Services for Texas water utilities.', url:'https://www.civcastusa.com/publishers/5867827b01ec5a264c779277', source:'CivCast' },
]
const ESBD_BIDS = [
  { id:'esbd-001', name:'TDCJ — Wainwright Unit Wastewater Treatment Plant (696-FD-26-P007)', agency:'TX ESBD', city:'Lovelady, TX', posted:'2026-06-01', due:'2026-10-15', scope:'TDCJ construct new 2 MGD WW Treatment Plant at Wainwright Unit. NIGP: 91359,91391,93677-Substation/High Voltage Electrical,96895. Amendment A-003 posted 07/31/2026. Amendment A-002 posted 06/29/2026. Solicitation: 696-FD-26-P007. Source: txsmartbuy.gov/esbd/696-FD-26-P007.', url:'https://www.txsmartbuy.gov/esbd/696-FD-26-P007', source:'TX ESBD' },
  { id:'esbd-002', name:'TWC — Open Enrollment Orientation & Mobility Services Statewide (3202600155)', agency:'TX ESBD', city:'Austin, TX', posted:'2026-05-28', due:'2026-11-24', scope:'Texas Workforce Commission Open Enrollment for Orientation and Mobility Services statewide. Status: Addendum Posted. Contact: Meghan Osborn (737)295-0326. procurement.oe@twc.texas.gov. Posting Date: 05/28/2026. Response Due: 11/24/2026 at 10:00 AM.', url:'https://www.txsmartbuy.gov/esbd/3202600155', source:'TX ESBD' },
  { id:'esbd-003', name:'TX ESBD — New Engineering RFQ Due September 9, 2026', agency:'TX ESBD', city:'Texas', posted:'2026-08-05', due:'2026-09-09', scope:'Texas Electronic State Business Daily (ESBD) new engineering RFQ. Posted August 2026. Due: September 9, 2026. Source: txsmartbuy.gov/esbd. Register through CMBL for Texas state opportunities. No login required to view solicitation details.', url:'https://www.txsmartbuy.gov/esbd', source:'TX ESBD' },
  { id:'esbd-004', name:'GLO/VLB — Professional Services RFQ Statewide Engineering (RFQ No. 7532-LP)', agency:'TX ESBD', city:'Austin, TX', posted:'2026-03-18', due:'2026-09-01', scope:'Texas General Land Office & Veterans Land Board — RFQ No. 7532-LP. Contract: 09/01/2026–08/31/2031. Statewide engineering services. Agency Code 305. Addendum posted. Questions: email GLO team contacts. Source: media.governmentnavigator.com/media/bid/1773859511_2026-03-18_RFQ-7532-LP.pdf', url:'https://www.txsmartbuy.gov/esbd', source:'TX ESBD' },
  { id:'esbd-005', name:'UT Austin — Water Feature VFD Pump & PLC/DMX Control Systems (26PSS001)', agency:'TX ESBD', city:'Austin, TX', posted:'2026-05-15', due:'2026-09-30', scope:'UT Austin — VFD-controlled pumps, PLC/DMX control systems, filtration, UV infrastructure commissioning. Instrumentation & Controls. Contact: trina.bickford@austin.utexas.edu. Posting Date: 05/15/2026. Due: 09/30/2026.', url:'https://www.txsmartbuy.gov/esbd/26PSS001', source:'TX ESBD' },
  { id:'esbd-006', name:'Texas A&M — Professional Engineering Services RFP (TAMUS-RFP-02-3452)', agency:'TX ESBD', city:'College Station, TX', posted:'2026-06-15', due:'2026-10-01', scope:'Texas A&M University System Professional Services RFP for Engineering. Structural, electrical, instrumentation. Contact: dwilkinson@tamus.edu. Posting Date: 06/15/2026. Due: 10/01/2026.', url:'https://www.txsmartbuy.gov/esbd/TAMUS-RFP-02-3452', source:'TX ESBD' },
  { id:'esbd-008', name:'Texas A&M University — WWTP Improvements Project Phase 1 (TAMU-RFP-26-5088)', agency:'Texas A&M University — Facilities & Construction', city:'College Station, TX', posted:'2026-08-20', due:'2026-09-08', scope:'Wastewater Treatment Plant Improvements Phase 1 at Texas A&M University. Electrical, instrumentation, controls, SCADA, mechanical and process improvements to the campus WWTP. Engineering and construction services.', url:'https://www.txsmartbuy.gov/esbd/TAMU-RFP-26-5088', source:'TX ESBD', value:'TBD', status:'active', region:'texas' },
  { id:'esbd-009', name:'Sam Houston State University — IDIQ MEP Engineering Services (753-26-00034)', agency:'Sam Houston State University', city:'Huntsville, TX', posted:'2026-08-15', due:'2026-09-15', scope:'IDIQ Mechanical/Electrical/Plumbing (MEP) Engineering Services for Sam Houston State University. On-call E&I design services, instrumentation, controls, electrical systems for campus facilities.', url:'https://www.txsmartbuy.gov/esbd/753-26-00034', source:'TX ESBD', value:'TBD', status:'active', region:'texas' },
  { id:'esbd-010', name:'Texas A&M University System — Campus Sanitary & Storm Sewer Collection System Improvements (TAMU-RFQ-26-5090)', agency:'Texas A&M University — Facilities & Construction', city:'College Station, TX', posted:'2026-08-18', due:'2026-09-11', scope:'Design services for campus sanitary and storm sewer collection system improvements. Includes pump station controls, instrumentation, SCADA integration, electrical systems for sewer infrastructure.', url:'https://www.txsmartbuy.gov/esbd/TAMU-RFQ-26-5090', source:'TX ESBD', value:'TBD', status:'active', region:'texas' },
  { id:'esbd-011', name:'SHSU — IDIQ Mechanical Electrical Plumbing MEP Engineering Services (753-26-00034)', agency:'Sam Houston State University', city:'Huntsville, TX', posted:'2026-08-15', due:'2026-09-15', scope:'IDIQ Mechanical/Electrical/Plumbing (MEP) Engineering Services for Sam Houston State University facilities. On-call E&I design, instrumentation, controls, electrical systems.', url:'https://www.txsmartbuy.gov/esbd/753-26-00034', source:'TX ESBD', value:'TBD', status:'active', region:'texas' },
  { id:'esbd-012', name:'TAMU — Campus Sanitary and Storm Sewer Collection System Improvements Design Services (TAMU-RFQ-26-5090)', agency:'Texas A&M University', city:'College Station, TX', posted:'2026-08-18', due:'2026-09-11', scope:'Design services for campus sanitary and storm sewer collection system improvements. Includes pump station controls, instrumentation, SCADA integration, electrical systems.', url:'https://www.txsmartbuy.gov/esbd/TAMU-RFQ-26-5090', source:'TX ESBD', value:'TBD', status:'active', region:'texas' },
  { id:'esbd-013', name:'Texas Military Department — Austin Bergstrom International Airport ABIA Foam Systems Repairs (TMD26-FMO-0044573)', agency:'Texas Military Department', city:'Austin, TX', posted:'2026-08-20', due:'2026-09-15', scope:'Austin Bergstrom International Airport foam systems repairs. Electrical, instrumentation and controls for fire suppression systems.', url:'https://www.txsmartbuy.gov/esbd/TMD26-FMO-0044573', source:'TX ESBD', value:'TBD', status:'active', region:'texas' },
  { id:'esbd-007', name:'TPWD — Electrical Construction IDIQ Services Statewide (2025-ElectricConstruct-IDIQ)', agency:'TX ESBD', city:'Austin, TX', posted:'2026-07-01', due:'2026-11-01', scope:'Texas Parks & Wildlife — Multiple Award IDIQ for electrical construction, repairs and replacements statewide. NIGP: 914-38. Solicitation: 2025-ElectricConstruct-IDIQ. Posting Date: 07/01/2026. Due: 11/01/2026.', url:'https://www.txsmartbuy.gov/esbd/2025-ElectricConstruct-IDIQ', source:'TX ESBD' },
]
const TWDB_BIDS = [
  { id:'twdb-001', posted:'2026-01-01', name:'TWDB — Water System Improvements CDBG-MIT Engineering (Karnes City)', agency:'TWDB', city:'Karnes City, TX', due:'Post-Funding', scope:'TWDB CDBG-MIT Water System Improvements — Replace 9,725 LF of existing water lines. Engineering design, electrical and instrumentation.', url:'https://www.twdb.texas.gov/financial/programs/CWSRF/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-002', posted:'2026-01-01', name:'TWDB — Drinking Water State Revolving Fund Engineering Services', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB DWSRF — Engineering services for water system improvements, electrical upgrades, instrumentation and controls for Texas water utilities.', url:'https://www.twdb.texas.gov/financial/programs/DWSRF/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-003', posted:'2026-01-01', name:'TWDB — Clean Water State Revolving Fund Wastewater Engineering', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB CWSRF — Wastewater treatment plant engineering, electrical and instrumentation design, SCADA systems for Texas utilities.', url:'https://www.twdb.texas.gov/financial/programs/CWSRF/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-004', posted:'2026-01-01', name:'TWDB — State Water Implementation Fund Texas (SWIFT) Projects', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB SWIFT Program — Engineering design services for major water supply projects. E&I engineering, pump stations, treatment facilities.', url:'https://www.twdb.texas.gov/financial/programs/swift/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-005', posted:'2026-01-01', name:'TWDB — Regional Water Planning Engineering Services', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB Regional Water Planning Group engineering and professional services. Water supply infrastructure design, E&I engineering.', url:'https://www.twdb.texas.gov/waterplanning/rwp/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-006', posted:'2026-01-01', name:'TWDB — HB 500 Water/WW Infrastructure Engineering', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB HB 500 Flood Infrastructure Fund — Water/Wastewater infrastructure engineering. Electrical design, instrumentation, control systems.', url:'https://www.twdb.texas.gov/financial/programs/FIF/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-007', posted:'2026-01-01', name:'TWDB — Economically Distressed Areas Program (EDAP) Engineering', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB EDAP — Engineering services for economically distressed communities. Water/wastewater system design, electrical, instrumentation and SCADA engineering.', url:'https://www.twdb.texas.gov/financial/programs/edap/index.asp', source:'TWDB', status:'prebid' },
]
const MANUAL_BIDS = [
  { id:'seed-1', posted:'2026-08-01', name:'City of Austin — Water & Wastewater Facilities IDIQ', agency:'City of Austin – Austin Water', city:'Austin', due:'Check link', scope:'IDIQ E&I engineering design work assignments at water & wastewater facilities', value:'IDIQ / TBD', status:'active', region:'austin', url:'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm', source:'Manual' },
  { id:'seed-2', posted:'2026-08-01', name:'HCFCD — Harris County Flood Control E&I Engineering', agency:'Harris County Flood Control District', city:'Houston', due:'Check link', scope:'Electrical & Instrumentation engineering for flood control infrastructure', value:'TBD', status:'active', region:'houston', url:'https://www.harriscountyfcd.org/doing-business/professional-services', source:'Manual' },
  { id:'seed-3', posted:'2026-08-01', name:'LNVA — Lower Neches Valley Authority Water Plant SCADA', agency:'Lower Neches Valley Authority', city:'Beaumont, TX', due:'Check link', scope:'SCADA system design and integration for water treatment plant', value:'TBD', status:'active', region:'statewide', url:'https://www.lnva.dst.tx.us/', source:'Manual' },
  { id:'seed-4', posted:'2026-08-01', name:'BVWACS — Brazos Valley Water Authority Controls Engineering', agency:'Brazos Valley Water Authority', city:'Bryan, TX', due:'Check link', scope:'Controls and instrumentation engineering for water authority infrastructure', value:'TBD', status:'active', region:'statewide', url:'https://www.bvwacs.org/', source:'Manual' },
  { id:'seed-5', posted:'2026-08-01', name:'City of Strawn — WTP SCADA & Electrical Engineering (Post-Funding)', agency:'City of Strawn (TWDB HB500)', city:'Strawn, TX', due:'Post-Funding', scope:'SCADA design, alternate power, electrical design for microfilter replacement', value:'~$1,085,000', status:'prebid', region:'statewide', url:'https://www.twdb.texas.gov/financial/programs/WSIG/index.asp', source:'TWDB' },
  { id:'seed-7', name:'SAWS — Walden Height Booster Station Improvements & W Grosenbacher Rd Pressure Reducing Valve (PS-00188-YR)', agency:'San Antonio Water System (SAWS)', city:'San Antonio, TX', posted:'2026-08-01', due:'2026-09-30', scope:'Improvements to Walden Height Booster Station including electrical, instrumentation, controls, and pressure reducing valve improvements on W Grosenbacher Rd. Pumping station electrical and controls upgrade scope.', url:'https://apps.saws.org/business_center/ContractSol/', source:'Manual', value:'TBD', status:'active', region:'texas' },
  { id:'seed-6', posted:'2026-08-01', name:'SAWS — San Antonio Water System E&I Engineering Services', agency:'San Antonio Water System', city:'San Antonio, TX', due:'Check link', scope:'Electrical & Instrumentation engineering services for water and wastewater infrastructure', value:'TBD', status:'active', region:'statewide', url:'https://www.saws.org/business-center/purchasing/', source:'Manual' },
]
const FIVE_BIDS = [
      { id:'fedbid-001', name:'NAVFAC Mid-Atlantic — IDIQ A-E MEP & SCADA Engineering (N4008524R2674)', agency:'Naval Facilities Engineering Systems Command', city:'NC / SC / Nationwide', posted:'2026-07-15', due:'2026-09-15', solicitationNo:'N4008524R2674', responseDate:'2026-09-15', setAside:'Total Small Business', scope:'IDIQ A-E multi-discipline: SCADA, cybersecurity, LAN, control systems, electrical, mechanical, plumbing, fire protection. 5-year IDIQ.', url:'https://secure.fedbidspeed.com/Handler.ashx?act=nvgt&req=nav&mop=opportunity!main&pk=75dcdd81-43c5-4215-924c-4f81c893e2fc', source:'FedBids', value:'$60M IDIQ', status:'active', region:'statewide', userState:'active', category:'SCADA' },
      { id:'fedbid-006', name:'48 CES — Wastewater Plant SCADA System RAF Lakenheath (FA558725Q0077)', agency:'48th Civil Engineer Squadron — US Air Force', city:'TX / Nationwide', posted:'2026-08-10', due:'2026-09-19', solicitationNo:'FA558725Q0077', responseDate:'2026-09-19', setAside:'Small Business', scope:'SCADA system for wastewater treatment plant. PLC, HMI, instrumentation, controls, commissioning.', url:'https://secure.fedbidspeed.com/Handler.ashx?act=inip&req=nav&mop=fbo-home!home', source:'FedBids', value:'TBD', status:'active', region:'statewide', userState:'active', category:'Wastewater' },
      { id:'fedbid-007', name:'USIBWC — SCADA Lifecycle Support Services (W912BV-26-R-0012)', agency:'US International Boundary and Water Commission', city:'El Paso, TX', posted:'2026-08-01', due:'2026-09-30', solicitationNo:'W912BV-26-R-0012', responseDate:'2026-09-30', setAside:'Small Business', scope:'SCADA Lifecycle Support for water infrastructure. Instrumentation, controls, PLC/HMI maintenance and upgrades along US-Mexico border.', url:'https://sam.gov/opp/86f857e87eaa41e5aed1eebce062e685/view', source:'FedBids', value:'TBD', status:'active', region:'statewide', userState:'active', category:'SCADA' },
      { id:'fedbid-008', name:'NAVFAC SW — Wastewater Treatment Plant E&I Upgrades (N6247326R0012)', agency:'Naval Facilities Engineering Systems Command Southwest', city:'San Diego, CA / Nationwide', posted:'2026-08-20', due:'2026-10-15', solicitationNo:'N6247326R0012', responseDate:'2026-10-15', setAside:'Small Business', scope:'Electrical and instrumentation upgrades to WWTP. Motor control centers, switchgear, instrumentation, SCADA integration, controls, commissioning.', url:'https://sam.gov/search?index=opp&q=N6247326R0012&is_active=true', source:'FedBids', value:'TBD', status:'active', region:'statewide', userState:'active', category:'Electrical' },
      { id:'fedbid-009', name:'Army Corps of Engineers — Water Treatment SCADA & Controls IDIQ (W912P6-26-R-0045)', agency:'US Army Corps of Engineers (USACE)', city:'Nationwide', posted:'2026-08-15', due:'2026-10-01', solicitationNo:'W912P6-26-R-0045', responseDate:'2026-10-01', setAside:'Total Small Business', scope:'IDIQ for water treatment plant SCADA and controls upgrades. Electrical, instrumentation, PLC/HMI programming, SCADA integration, startup and commissioning.', url:'https://sam.gov/search?index=opp&q=W912P6-26-R-0045&is_active=true', source:'FedBids', value:'TBD', status:'active', region:'statewide', userState:'active', category:'Water' },
    ]

function detectRegion(city) {
  if (!city) return 'texas';
  const c = city.toLowerCase();
  if (c.includes('houston')) return 'houston';
  if (c.includes('austin')) return 'austin';
  if (c.includes('san antonio')) return 'san-antonio';
  if (c.includes('dallas') || c.includes('fort worth')) return 'dallas';
  return 'texas';
}

async function saveBid(bid) {
  const id = bid.id || ('bid-' + Date.now());
  bid.id = id;
  await pool.query(
    'INSERT INTO bids(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=$2, updated_at=NOW()',
    [id, JSON.stringify(bid)]
  );
}

async function seedAllBids() {
  const allBids = [
    ...FIVE_BIDS,
    ...EBN_BIDS,
    ...H2BID_BIDS,
    ...CIVCAST_BIDS,
    ...ESBD_BIDS,
    ...TWDB_BIDS,
    ...MANUAL_BIDS
  ];
  for (const b of allBids) {
    await saveBid({ ...b, region: detectRegion(b.city), scrapedAt: new Date().toISOString() });
  }
  console.log('[Seed] Seeded', allBids.length, 'bids');
}

async function initDB() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bids (id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  const cnt = await pool.query('SELECT COUNT(*) FROM bids');
  if (parseInt(cnt.rows[0].count) === 0) {
    await seedAllBids();
  }
  console.log('[DB] Ready. Bids:', cnt.rows[0].count);
}

// ── HEALTH
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── SERVE APP
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── GET ALL BIDS
app.get('/api/bids', async (req, res) => {
  try {
    const r = await pool.query('SELECT data FROM bids ORDER BY created_at ASC');
    res.json({ bids: r.rows.map(r => r.data) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE BID
app.delete('/api/bids/:id', async (req, res) => {
  try {
    await pool.query("DELETE FROM bids WHERE id=$1 OR data->>'id'=$1", [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── UPDATE BID STATE
app.post('/api/bids/:id/state', async (req, res) => {
  try {
    const { state } = req.body;
    const r = await pool.query('SELECT data FROM bids WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'not found' });
    const bid = r.rows[0].data;
    bid.userState = state;
    await pool.query('UPDATE bids SET data=$1 WHERE id=$2', [JSON.stringify(bid), req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── FEDBIDS INGEST (from Make.com)
app.post('/api/bids/fedbids-ingest', async (req, res) => {
  try {
    const b = req.body || {};
    const subject = b.subject || b.Subject || b.name || b.title || '';
    const emailBody = b.body || b.Body || b.text || b.Text || b.snippet || b.Snippet || b.content || '';
    const allText = subject + ' ' + emailBody;
    console.log('[FedBids] Subject:', subject.substring(0,80));
    console.log('[FedBids] Body length:', emailBody.length);

    // Extract BidSpeed pk link
    const pkMatch = allText.match(/pk=([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    const bidUrl = pkMatch
      ? 'https://secure.fedbidspeed.com/Handler.ashx?act=nvgt&req=nav&mop=opportunity!main&pk=' + pkMatch[1]
      : 'https://secure.fedbidspeed.com/Handler.ashx?act=inip&req=nav&mop=fbo-home!home';

    // Extract solicitation number
    const solMatch = allText.match(/([A-Z]{1,6}-?[0-9]{2,6}-[A-Z]{1,2}-?[0-9]{4,6})/);
    const solNo = solMatch ? solMatch[1] : '';

    // Always generate valid ID
    const solClean = solNo.replace(/[^a-zA-Z0-9]/g, '');
    const id = 'fedbid-' + (solClean.length >= 3 ? solClean : String(Date.now()).slice(-10));

    // Bid name from subject
    const bidName = (subject && subject.length > 5) ? subject.trim() : ('FedBid ' + (solNo || id));

    // Duplicate check
    if (solNo) {
      const dup = await pool.query("SELECT id FROM bids WHERE data->>'solicitationNo'=$1", [solNo]);
      if (dup.rows.length > 0) return res.json({ success:true, skipped:true, reason:'Duplicate', solNo });
    }
    const dup2 = await pool.query('SELECT id FROM bids WHERE id=$1', [id]);
    if (dup2.rows.length > 0) return res.json({ success:true, skipped:true, reason:'Duplicate ID', id });

    // Extract due date
    let due = '';
    const dPats = [
      /(?:response|due|deadline)[^:]*:[^0-9]*([0-9]{1,2}\/[0-9]{1,2}\/20[2-9][0-9])/i,
      /(?:response|due|deadline)[^:]*:[^0-9]*(20[2-9][0-9]-[0-9]{2}-[0-9]{2})/i,
    ];
    for (const pat of dPats) {
      const m = allText.match(pat);
      if (m) { try { const dt=new Date(m[1]); if(!isNaN(dt)&&dt.getFullYear()>=2026){due=dt.toISOString().split('T')[0];break;} }catch(e2){} }
    }

    await saveBid({ id, name:bidName.substring(0,200), agency:'Federal Agency', city:'Nationwide',
      posted:new Date().toISOString().split('T')[0], due, solicitationNo:solNo, responseDate:due,
      setAside:'See Solicitation', scope:emailBody.substring(0,500), url:bidUrl,
      source:'FedBids', value:'TBD', status:'active', region:'statewide', userState:'active',
      scrapedAt:new Date().toISOString() });

    console.log('[FedBids] ✅ Saved:', id, bidName.substring(0,50));
    res.json({ success:true, bid:{ id, name:bidName, solNo, due, url:bidUrl } });
  } catch(e) { console.error('[FedBids Error]', e.message); res.status(500).json({error:e.message}); }
});

// ── EBN INGEST
app.post('/api/bids/ebn-ingest', async (req, res) => {
  try {
    const b = req.body || {};
    const subject = b.subject || b.Subject || '';
    const emailBody = b.body || b.text || b.snippet || '';
    const combined = subject + ' ' + emailBody;
    const urlMatch = combined.match(/subscriber_view_bid[/]([0-9]{6,15})/i);
    const bidNum = b.bidNum || (urlMatch && urlMatch[1]) || '';
    if (!bidNum) return res.json({ success:true, skipped:true, reason:'No bid number' });
    const id = 'ebn-' + bidNum;
    const dup = await pool.query('SELECT id FROM bids WHERE id=$1', [id]);
    if (dup.rows.length > 0) return res.json({ success:true, skipped:true, id });
    const dateM = combined.match(/Expires?[:\s]+(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i);
    let due = '';
    if (dateM) { try { const dt=new Date(dateM[1]); if(!isNaN(dt)) due=dt.toISOString().split('T')[0]; }catch(e2){} }
    await saveBid({ id, name:subject||'EBN Bid '+bidNum, agency:'EnviroBidNet', city:'Texas',
      posted:new Date().toISOString().split('T')[0], due, scope:emailBody.substring(0,400),
      url:'https://www.envirobidnet.com/subscriber_view_bid/'+bidNum,
      source:'EnviroBidNet', value:'TBD', status:'active', region:'texas', userState:'active',
      scrapedAt:new Date().toISOString() });
    res.json({ success:true, bid:{ id, name:subject, due } });
  } catch(e) { res.status(500).json({error:e.message}); }
});

// ── DEDUPE FEDBIDS
app.get('/api/dedupe-fedbids', async (req, res) => {
  try {
    const del = await pool.query("DELETE FROM bids WHERE data->>'source'='FedBids' AND id NOT LIKE 'fedbid-00%'");
    for (const b of FIVE_BIDS) {
      await saveBid({ ...b, scrapedAt: new Date().toISOString() });
    }
    res.json({ success:true, deleted:del.rowCount, reseeded:FIVE_BIDS.length });
  } catch(e) { res.status(500).json({error:e.message}); }
});

// ── CLEAN EBN
app.get('/api/clean-ebn', async (req, res) => {
  try {
    const del = await pool.query("DELETE FROM bids WHERE data->>'source'='EnviroBidNet' AND (id LIKE 'ebn-auto-%' OR id LIKE 'ebn-178%')");
    const del2 = await pool.query("DELETE FROM bids WHERE data->>'source'='EnviroBidNet' AND data->>'due'!='' AND (data->>'due')::date < CURRENT_DATE");
    for (const b of EBN_BIDS) {
      await saveBid({ ...b, scrapedAt: new Date().toISOString() });
    }
    res.json({ success:true, deleted:del.rowCount+del2.rowCount, reseeded:EBN_BIDS.length });
  } catch(e) { res.status(500).json({error:e.message}); }
});

// ── RESET (reseed everything)
app.get('/api/reset', async (req, res) => {
  try {
    await pool.query('DELETE FROM bids');
    await seedAllBids();
    res.json({ success:true, message:'All bids reseeded' });
  } catch(e) { res.status(500).json({error:e.message}); }
});

// ── FIX FEDBIDS URLS
app.get('/api/fix-fedbids-urls', async (req, res) => {
  try {
    const PK_001 = 'https://secure.fedbidspeed.com/Handler.ashx?act=nvgt&req=nav&mop=opportunity!main&pk=75dcdd81-43c5-4215-924c-4f81c893e2fc';
    const r1 = await pool.query("SELECT data FROM bids WHERE id='fedbid-001'");
    if (r1.rows.length > 0) {
      const b = r1.rows[0].data; b.url = PK_001;
      await pool.query("UPDATE bids SET data=$1 WHERE id='fedbid-001'", [JSON.stringify(b)]);
    }
    res.json({ success:true, message:'FedBid URLs updated' });
  } catch(e) { res.status(500).json({error:e.message}); }
});

// ── AUTO EXPIRE
async function autoExpireAndClean() {
  try {
    await pool.query(`UPDATE bids SET data=jsonb_set(data,'{status}','"expired"') WHERE data->>'source' NOT IN ('FedBids','TWDB') AND data->>'due'!='' AND data->>'status'='active' AND (data->>'due')::date < CURRENT_DATE`);
  } catch(e) { console.error('[Expire]', e.message); }
}

cron.schedule('0 */4 * * *', async () => {
  try { await autoExpireAndClean(); } catch(e) { console.error('[Cron]', e.message); }
});

app.use((err,req,res,next) => { console.error('[Error]',err.message); res.status(500).json({error:err.message}); });

app.listen(PORT, '0.0.0.0', () => {
  console.log('[SRI Bids] Running on port', PORT);
  setTimeout(() => initDB().catch(e => console.error('[DB]', e.message)), 100);
});
