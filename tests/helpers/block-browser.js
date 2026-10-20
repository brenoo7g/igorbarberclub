// Fictional colleague linked to the existing disposable Mini Site professional.
export async function installBlockBrowser(db, hash) {
  const now = new Date().toISOString();
  await db.run(
    "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES('mini-block-professional','Rafael Horizonte','mini-block-professional@example.test','21999998888',?,'client',?)",
    [hash, now],
  );
  await db.run(
    "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES('minisite-browser','mini-block-professional','professional',?)",
    [now],
  );
  await db.run(
    "INSERT INTO professional_users(company_id,user_id,barber_id,created_at) VALUES('minisite-browser','mini-block-professional','minisite-person',?)",
    [now],
  );
}
