-- Update system URL to new domain
UPDATE global_settings
SET system_url = 'https://sistema.inhouseaida.com'
WHERE id = 1;

-- Also update any old references in the database
UPDATE global_settings
SET system_url = REPLACE(system_url, 'sistema.n8ninhousecompany.cloud', 'sistema.inhouseaida.com')
WHERE system_url LIKE '%sistema.n8ninhousecompany.cloud%';

-- Update custom_domain_url if it exists
UPDATE global_settings
SET custom_domain_url = 'https://sistema.inhouseaida.com'
WHERE id = 1 AND (custom_domain_url IS NULL OR custom_domain_url = '' OR custom_domain_url LIKE '%sistema.n8ninhousecompany.cloud%');
