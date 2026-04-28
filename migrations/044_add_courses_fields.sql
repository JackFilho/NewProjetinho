-- Add courses information fields to companies table
ALTER TABLE companies
ADD COLUMN courses_description TEXT AFTER google_maps_location,
ADD COLUMN courses_images TEXT AFTER courses_description,
ADD COLUMN courses_pdfs TEXT AFTER courses_images;
