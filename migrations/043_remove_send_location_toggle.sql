-- Remove send_location_on_address_request column from companies table
-- Logic: if google_maps_location is filled, send it; otherwise, don't send
ALTER TABLE companies
DROP COLUMN send_location_on_address_request;
