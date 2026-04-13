-- Add model_preference column to organizations table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS model_preference VARCHAR(50) DEFAULT 'auto' NOT NULL;
