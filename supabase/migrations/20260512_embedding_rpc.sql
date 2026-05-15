-- Helper RPC for updating proposal embeddings from application code
-- (Supabase JS client doesn't natively handle vector columns)

CREATE OR REPLACE FUNCTION update_proposal_embedding(
    proposal_id UUID,
    embedding_vector TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE proposals
    SET embedding = embedding_vector::vector(1536),
        embedding_status = 'COMPLETE',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = proposal_id;
END;
$$;
