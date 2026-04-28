-- Add Google Maps location and send location toggle to companies table
ALTER TABLE companies
ADD COLUMN google_maps_location VARCHAR(500) AFTER address,
ADD COLUMN send_location_on_address_request BOOLEAN DEFAULT FALSE AFTER google_maps_location;
