import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function createReviewsTables() {
  try {
    // Create professional_reviews table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS professional_reviews (
        id SERIAL PRIMARY KEY,
        professional_id INTEGER NOT NULL,
        appointment_id INTEGER NOT NULL,
        client_name VARCHAR(255) NOT NULL,
        client_phone VARCHAR(20),
        rating INTEGER NOT NULL,
        comment TEXT,
        review_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_visible BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
      )
    `);
    
    // Create indexes for professional_reviews
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_professional_reviews_professional_id ON professional_reviews(professional_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_professional_reviews_appointment_id ON professional_reviews(appointment_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_professional_reviews_rating ON professional_reviews(rating)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_professional_reviews_review_date ON professional_reviews(review_date)`);
    
    console.log('✅ Professional reviews table created successfully');

    // Create review_invitations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS review_invitations (
        id SERIAL PRIMARY KEY,
        appointment_id INTEGER NOT NULL,
        professional_id INTEGER NOT NULL,
        client_phone VARCHAR(20) NOT NULL,
        invitation_token VARCHAR(255) NOT NULL UNIQUE,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        review_submitted_at TIMESTAMP NULL,
        status VARCHAR(20) DEFAULT 'sent',
        whatsapp_instance_id INTEGER,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
        FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
        FOREIGN KEY (whatsapp_instance_id) REFERENCES whatsapp_instances(id)
      )
    `);
    
    // Create indexes for review_invitations
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_review_invitations_appointment_id ON review_invitations(appointment_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_review_invitations_professional_id ON review_invitations(professional_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_review_invitations_token ON review_invitations(invitation_token)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_review_invitations_status ON review_invitations(status)`);
    
    console.log('✅ Review invitations table created successfully');

  } catch (error) {
    console.error('❌ Error creating reviews tables:', error.message);
  } finally {
    await pool.end();
  }
}

createReviewsTables();