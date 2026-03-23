-- Database schema for $.com Financial Server

CREATE TABLE IF NOT EXISTS accounts (
    id VARCHAR(50) PRIMARY KEY,
    owner_id VARCHAR(50) NOT NULL,
    balance DECIMAL(18, 8) NOT NULL DEFAULT 0.0,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id SERIAL PRIMARY KEY,
    account_id VARCHAR(50) REFERENCES accounts(id) ON DELETE RESTRICT,
    amount DECIMAL(18, 8) NOT NULL,
    type VARCHAR(20) NOT NULL, -- 'CREDIT' or 'DEBIT'
    reference_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ledger_account_id ON ledger_entries(account_id);

-- Insert some test accounts for demonstration if they don't exist
INSERT INTO accounts (id, owner_id, balance, currency) VALUES 
('system-hot-wallet', 'system', 1000000.00, 'USD'),
('user-1-wallet', 'user-1', 500.00, 'USD')
ON CONFLICT (id) DO NOTHING;
