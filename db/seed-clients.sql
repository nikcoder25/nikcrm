-- Optional: preload your 11 clients. Run in the Neon SQL editor (Netlify DB >
-- open in Neon), after the tables exist (open the app once so the API creates
-- them, or run db/schema.sql first).
insert into clients (name, niche, status, source, package, fee, team_member, start_month, renewal_month, risk, notes) values
('platinumhvacllc.com','HVAC','active','Fiverr','Standard',0,'','2026-05','2026-06','low','monthly seo (8th month) | Order: zach_komorowski'),
('greenbaymovingco.com','Moving','active','Fiverr','Standard',0,'Sukhendra','2026-05','2026-06','low','monthly seo (9th month) | Order: zach_komorowski'),
('cbrookspaving.com','Paving','active','Fiverr','Standard',0,'','2026-05','2026-06','low','monthly seo (12th month) | Order: zach_komorowski | Sheet: https://www.canva.com/design/DAGvl9rjG6c/jX0B6OIeHWhaYH0Uz1I_Vg/edit?utm_content=DAGvl9rjG6c&utm_campaign=designshare&utm_medium=link2&utm_source=sharebutton'),
('girdnerheatandair.com','HVAC','active','Fiverr','Standard',0,'','2026-05','2026-06','low','monthly seo (6th month) | Order: zach_komorowski'),
('Ridgeline Heating and Cooling','HVAC','active','Fiverr','Standard',0,'Nikhil (Owner)','2026-05','2026-06','low','monthly seo (11th month) | Brand: Ridgeline Heating and Cooling | Order: zach_komorowski | Sheet: https://www.canva.com/design/DAHJuE40yOQ/jC2Su4W86VvbxbSpLFGivg/edit'),
('nestadu.com','ADU / Construction','active','Fiverr','Standard',0,'Nikhil (Owner)','2026-05','2026-06','low','monthly seo | Order: jw_west | Sheet: https://www.canva.com/design/DAHJ_QYFm9E/SVDHFqB5v-LIPs9VMSPIyQ/edit'),
('The Comfort Specialists','','active','Fiverr','Standard',0,'Nikhil (Owner)','2026-05','2026-06','low','monthly seo (10th month) | Brand: The Comfort Specialists | Order: zach_komorowski | Sheet: https://www.canva.com/design/DAHKe8ffGPU/SKlxcF3LR44oW5YQQDj-uQ/edit'),
('airprosolutionsllc.com','HVAC','active','Fiverr','Standard',0,'Nikhil (Owner)','2026-05','2026-06','low','monthly seo (11th month) | Order: zach_komorowski | Sheet: https://www.canva.com/design/DAHLBfyCyXI/dkhE83M6LzAtfKBXte6UaQ/edit'),
('geraldgriffinheatingandcooling.com','HVAC','upcoming','Fiverr','Standard',0,'','2026-06','2026-07','low','monthly seo | Order: zach_komorowski'),
('allstarplumbing.co','Plumbing','upcoming','Fiverr','Standard',0,'','2026-06','2026-07','low','monthly seo | Order: zach_komorowski'),
('miniml.ai','SaaS','active','Fiverr','Standard',0,'Nikhil (Owner)','2026-03','2026-04','low','monthly seo | Order: jw_west | Sheet: https://www.canva.com/design/DAHHMML1lqU/IKYPZfaxlw-SSKefwk8cWw/edit');
