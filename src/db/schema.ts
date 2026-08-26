import { relations } from 'drizzle-orm';
import { bigint, boolean, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Enums
export const dealStatusEnum = pgEnum('deal_status', ['draft', 'live', 'paused', 'closed']);
export const eoiStatusEnum = pgEnum('eoi_status', ['sent', 'approved', 'declined', 'expired']);
export const tokenTransactionTypeEnum = pgEnum('token_transaction_type', ['credit', 'debit']);

// 1. USERS
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  profile_image: text('profile_image'),
  phone: text('phone'),
  isPhoneVerified: boolean('is_phone_verified').default(false),
  profileCompletedOnce: boolean('profile_completed_once').default(false),
  profileCompletion: integer('profile_completion').default(0),
  tokens: integer('tokens').default(0),

  // Professional Profile Fields (PRD-aligned)
  firmName: text('firm_name'),
  role: text('role'),
  customRole: text('custom_role'),
  category: text('category').array(),
  customCategory: text('custom_category'),
  baseLocation: text('base_location'),
  baseCity: text('base_city'),
  baseCountry: text('base_country'),
  geographies: text('geographies').array(),
  crossBorder: boolean('cross_border').default(false),
  corridors: text('deal_corridors').array(),
  sectors: text('sectors').array(),
  intent: text('intent').array(),
  expertiseDescription: text('expertise_description'),
  activeMandates: text('active_mandates').array(),
  prioritySectors: text('priority_sectors').array(),
  coAdvisory: boolean('open_to_coadvisory').default(false),
  collaborationModel: text('collaboration_model').array(),
  profileAttachmentUrl: text('profile_attachment_url'),
  additionalInfo: text('additional_info'),
  document_url: text('document_url'),
  document_text: text('document_text'),


  // OTP Verification
  otpCode: text('otp_code'),
  otpExpires: timestamp('otp_expires'),
  otpAttempts: integer('otp_attempts').default(0),

  source: text('source').default('web'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Auth.js Tables
export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    compoundKey: primaryKey(account.provider, account.providerAccountId),
    userIdIdx: index('accounts_user_id_idx').on(account.userId),
  })
);

export const sessions = pgTable(
  'sessions',
  {
    sessionToken: text('session_token').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (session) => ({
    userIdIdx: index('sessions_user_id_idx').on(session.userId),
  })
);

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey(vt.identifier, vt.token),
  })
);

// 2. DEALS
export const deals = pgTable('deals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  sector: text('sector'),
  region: text('region'),
  size: text('size'),
  status: dealStatusEnum('status').default('live').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. MATCHES
export const matches = pgTable('matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'cascade' }).notNull(),
  matchData: jsonb('match_data').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. EOIs (Expressions of Interest)
export const eois = pgTable('eois', {
  id: uuid('id').primaryKey().defaultRandom(),
  dealId: uuid('deal_id').references(() => proposals.id, { onDelete: 'cascade' }).notNull(),
  matchId: uuid('match_id').references(() => proposalMatches.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  receiverId: uuid('receiver_id').references(() => users.id, { onDelete: 'cascade' }),
  status: eoiStatusEnum('status').default('sent').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 5. TOKEN TRANSACTIONS (Ledger)
export const tokenTransactions = pgTable('token_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  type: text('type').notNull(), // 'credit', 'debit', 'purchase'
  action: text('action').notNull(),
  amount: integer('amount').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  // Stage 3 (Razorpay + promo + token economy) additions — nullable, additive only.
  balanceBefore: integer('balance_before'),
  referenceType: text('reference_type'),
  referenceId: uuid('reference_id'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 5.1 TOKEN PACKAGES — server-authoritative pricing, DB-driven so the team
// can set/change real commercial numbers without a code deploy. Seeded
// empty/inactive; see supabase/migrations/20260827_token_economy_and_payments.sql.
export const tokenPackages = pgTable('token_packages', {
  id: text('id').primaryKey(), // short slug, e.g. 'starter'
  name: text('name').notNull(),
  tokens: integer('tokens').notNull(),
  pricePaise: bigint('price_paise', { mode: 'number' }).notNull(),
  currency: text('currency').default('INR').notNull(),
  active: boolean('active').default(false).notNull(),
  displayOrder: integer('display_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 5.2 PROMO CODES
export const promocodes = pgTable('promocodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  discountType: text('discount_type').notNull(), // 'PERCENTAGE' | 'FIXED_AMOUNT' | 'TOKEN_BONUS'
  discountValue: numeric('discount_value').default('0').notNull(),
  tokenBonus: integer('token_bonus'),
  startAt: timestamp('start_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  maxTotalUses: integer('max_total_uses'),
  maxUsesPerUser: integer('max_uses_per_user').default(1).notNull(),
  minimumPurchaseAmountPaise: bigint('minimum_purchase_amount_paise', { mode: 'number' }).default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  applicablePackageIds: text('applicable_package_ids').array(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 5.3 PAYMENT TRANSACTIONS — one row per Razorpay order attempt (or one
// free-promo redemption, which never touches Razorpay — see razorpayOrderId).
export const paymentTransactions = pgTable('payment_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  packageId: text('package_id').references(() => tokenPackages.id).notNull(),
  razorpayOrderId: text('razorpay_order_id'),
  razorpayPaymentId: text('razorpay_payment_id'),
  amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
  originalAmountPaise: bigint('original_amount_paise', { mode: 'number' }).notNull(),
  discountAmountPaise: bigint('discount_amount_paise', { mode: 'number' }).default(0).notNull(),
  currency: text('currency').default('INR').notNull(),
  tokenQuantity: integer('token_quantity').notNull(),
  promoCodeId: uuid('promo_code_id').references(() => promocodes.id),
  status: text('status').default('CREATED').notNull(), // CREATED | AUTHORIZED | CAPTURED | FAILED | REFUNDED
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
});

// 5.4 PROMO REDEMPTIONS — one row per successful use, inserted only when
// the associated payment actually succeeds (never for a failed/cancelled attempt).
export const promoRedemptions = pgTable('promo_redemptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  promoCodeId: uuid('promo_code_id').references(() => promocodes.id).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  paymentTransactionId: uuid('payment_transaction_id').references(() => paymentTransactions.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});



// 7. NOTIFICATIONS
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  type: text('type').notNull(),
  message: text('message').notNull(),
  isRead: text('is_read').default('false').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 8. MANDATES
export const mandates = pgTable('mandates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  rawText: text('raw_text').notNull(),
  normalisedText: text('normalised_text'),
  intent: text('intent'), // BUY_SIDE, SELL_SIDE, INVESTMENT
  sectors: text('sectors').array(),
  geographies: text('geographies').array(),
  dealSizeMinCr: numeric('deal_size_min_cr'),
  dealSizeMaxCr: numeric('deal_size_max_cr'),
  revenueMinCr: numeric('revenue_min_cr'),
  revenueMaxCr: numeric('revenue_max_cr'),
  dealStructure: text('deal_structure'), // Asset, Share, Majority
  specialConditions: text('special_conditions').array(),
  fraudFlags: text('fraud_flags').array(),
  urgency: text('urgency'), // Low, Medium, High
  buyerType: text('buyer_type'), // Strategic, Financial
  status: text('status').default('ACTIVE').notNull(),
  source: text('source').default('WEB').notNull(),
  document_url: text('document_url'),
  document_text: text('document_text'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 8.1 PROPOSALS (for matchmaking engine — semantic embeddings + scoring)
// SYNCHRONIZED WITH LIVE DB SCHEMA (2026-05-12)
export const proposals = pgTable('proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  rawText: text('raw_text'),
  normalisedText: text('normalised_text').notNull(),
  intent: text('intent').notNull(),
  sectors: text('sectors').array(),
  geographies: text('geographies').array(),
  dealStructure: text('deal_structure'),
  dealSizeMinCr: numeric('deal_size_min_cr'),
  dealSizeMaxCr: numeric('deal_size_max_cr'),
  revenueMinCr: numeric('revenue_min_cr'),
  revenueMaxCr: numeric('revenue_max_cr'),
  specialConditions: text('special_conditions').array(),
  qualityScore: numeric('quality_score'),
  qualityTier: text('quality_tier'),
  status: text('status').default('ACTIVE').notNull(),
  fraudFlags: text('fraud_flags').array(),
  advisorName: text('advisor_name'),
  contactPhone: text('contact_phone'),
  source: text('source').default('WEB'),
  refCode: text('ref_code'),
  metadata: jsonb('metadata').default({}),
  embeddingStatus: text('embedding_status').default('PENDING'),
  summaryText: text('summary_text'),
  
  // Missing canonical fields (newly added)
  currency: text('currency'),
  urgency: text('urgency'),
  inferredUrgency: text('inferred_urgency'),
  buyerType: text('buyer_type'),
  inferredBuyerType: text('inferred_buyer_type'),
  intentValidated: boolean('intent_validated'),
  
  // Existing in DB, but previously missing from Drizzle
  documentUrl: text('document_url'),
  documentText: text('document_text'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdx: index('idx_proposals_user_id').on(table.userId),
  intentIdx: index('idx_proposals_intent').on(table.intent),
  statusIdx: index('idx_proposals_status').on(table.status),
}));

// 8.2 PROPOSAL MATCHES (scored matches between proposals)
export const proposalMatches = pgTable('proposal_matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  proposalId: uuid('proposal_id').references(() => proposals.id, { onDelete: 'cascade' }).notNull(),
  matchedProposalId: uuid('matched_proposal_id').references(() => proposals.id, { onDelete: 'cascade' }).notNull(),
  similarityScore: numeric('similarity_score').notNull(),
  intentScore: numeric('intent_score').default('0'),
  industryScore: numeric('industry_score').default('0'),
  financialScore: numeric('financial_score').default('0'),
  nicheScore: numeric('niche_score').default('0'),
  geographyBoost: numeric('geography_boost').default('0'),
  finalScore: numeric('final_score').notNull(),
  confidenceScore: numeric('confidence_score').default('0'),
  matchReason: text('match_reason').notNull(),
  matchArchetype: text('match_archetype'),
  status: text('status').default('ACTIVE'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  proposalIdx: index('idx_pm_proposal_id').on(table.proposalId),
  matchedIdx: index('idx_pm_matched_id').on(table.matchedProposalId),
  scoreIdx: index('idx_pm_final_score').on(table.finalScore),
}));

// 8.5 DOCUMENTS
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  extracted_text: text('extracted_text'),
  structured_data: jsonb('structured_data'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// 9. CHAT SESSIONS
export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
  title: text('title').default('New Deal Intake'),
  state: jsonb('state').default({}),
  stateVersion: integer('state_version').default(0).notNull(),  // ADDED for OCC
  source: text('source').default('WEB').notNull(),
  whatsappPhoneNumber: text('whatsapp_phone_number'),
  // WhatsApp-only UI navigation context (which screen a numbered reply like
  // "1" should be interpreted against — e.g. { screen: 'COUNTERPARTY_DETAIL',
  // index: 1 }). Kept as its own column, same pattern as whatsappPhoneNumber
  // above, rather than folded into the mandate-intake `state` blob.
  whatsappUiState: jsonb('whatsapp_ui_state'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  whatsappPhoneIdx: index('idx_chat_sessions_whatsapp_phone').on(table.whatsappPhoneNumber),
}));

// 10. CHAT MESSAGES
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  chatId: uuid('chat_id').references(() => chatSessions.id, { onDelete: 'cascade' }).notNull(),
  role: text('role').notNull(), // 'user', 'assistant'
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 11. SAVED SEARCHES — async re-match queue for zero-match proposals
export const savedSearches = pgTable('saved_searches', {
  searchId: uuid('search_id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  proposalId: uuid('proposal_id').references(() => proposals.id, { onDelete: 'cascade' }),
  queryObject: jsonb('query_object').notNull(),
  status: text('status').default('PENDING').notNull(),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  notifiedAt: timestamp('notified_at'),
}, (table) => ({
  statusIdx: index('idx_saved_searches_status').on(table.status),
  userIdx: index('idx_saved_searches_user').on(table.userId),
}));

// 12. WHATSAPP INBOUND EVENTS — raw capture + idempotency ledger for inbound
// webhook deliveries (WappBiz's inbound payload/signature format is not
// documented, so raw_payload is stored as-is; provider_message_id is filled
// in once a real field is confirmed from an observed payload).
export const whatsappInboundEvents = pgTable('whatsapp_inbound_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').default('wappbiz').notNull(),
  providerMessageId: text('provider_message_id'),
  rawPayload: jsonb('raw_payload').notNull(),
  processed: boolean('processed').default(false).notNull(),
  processedAt: timestamp('processed_at'),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  providerMessageIdx: index('idx_whatsapp_inbound_provider_msg').on(table.providerMessageId),
}));

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  deals: many(deals),
  tokenTransactions: many(tokenTransactions),
  notifications: many(notifications),
  mandates: many(mandates),
  chatSessions: many(chatSessions),
  sentEois: many(eois, { relationName: 'sender' }),
  receivedEois: many(eois, { relationName: 'receiver' }),
  endUserProfile: one(endUserProfiles),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const dealsRelations = relations(deals, ({ one, many }) => ({
  user: one(users, { fields: [deals.userId], references: [users.id] }),
  matches: many(matches),
  eois: many(eois),
}));

export const matchesRelations = relations(matches, ({ one }) => ({
  deal: one(deals, { fields: [matches.dealId], references: [deals.id] }),
}));

export const eoisRelations = relations(eois, ({ one }) => ({
  deal: one(proposals, { fields: [eois.dealId], references: [proposals.id] }),
  match: one(proposalMatches, { fields: [eois.matchId], references: [proposalMatches.id] }),
  sender: one(users, { fields: [eois.senderId], references: [users.id], relationName: 'sender' }),
  receiver: one(users, { fields: [eois.receiverId], references: [users.id], relationName: 'receiver' }),
}));

export const tokenTransactionsRelations = relations(tokenTransactions, ({ one }) => ({
  user: one(users, { fields: [tokenTransactions.userId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const mandatesRelations = relations(mandates, ({ one }) => ({
  user: one(users, { fields: [mandates.userId], references: [users.id] }),
}));

export const proposalsRelations = relations(proposals, ({ one, many }) => ({
  user: one(users, { fields: [proposals.userId], references: [users.id] }),
  matches: many(proposalMatches, { relationName: 'sourceProposal' }),
  matchedBy: many(proposalMatches, { relationName: 'matchedProposal' }),
}));

export const proposalMatchesRelations = relations(proposalMatches, ({ one }) => ({
  proposal: one(proposals, { fields: [proposalMatches.proposalId], references: [proposals.id], relationName: 'sourceProposal' }),
  matchedProposal: one(proposals, { fields: [proposalMatches.matchedProposalId], references: [proposals.id], relationName: 'matchedProposal' }),
}));

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  user: one(users, { fields: [chatSessions.userId], references: [users.id] }),
  document: one(documents, { fields: [chatSessions.documentId], references: [documents.id] }),
  messages: many(chatMessages),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, { fields: [documents.userId], references: [users.id] }),
  chats: many(chatSessions),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  chat: one(chatSessions, { fields: [chatMessages.chatId], references: [chatSessions.id] }),
}));

// 6. END USER PROFILES (Business Promoter specific)
export const endUserProfiles = pgTable('end_user_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  companyName: text('company_name').notNull(),
  website: text('website').notNull(),
  sectors: text('sectors').array(),
  intent: text('intent').array().notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const endUserProfilesRelations = relations(endUserProfiles, ({ one }) => ({
  user: one(users, {
    fields: [endUserProfiles.userId],
    references: [users.id],
  }),
}));
