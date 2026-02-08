import {
  mysqlTable,
  varchar,
  text,
  int,
  decimal,
  boolean,
  timestamp,
  date,
  datetime,
  json,
  index,
  serial,
  mysqlEnum,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table for express-session
export const sessions = mysqlTable(
  "sessions",
  {
    sid: varchar("sid", { length: 255 }).primaryKey(),
    sess: text("sess").notNull(),
    expire: varchar("expire", { length: 255 }).notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Admin users table
export const admins = mysqlTable("admins", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  isActive: int("is_active").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Companies table
export const companies = mysqlTable("companies", {
  id: serial("id").primaryKey(),
  fantasyName: varchar("fantasy_name", { length: 255 }).notNull(),
  document: varchar("document", { length: 20 }).notNull().unique(),
  address: text("address").notNull(),
  googleMapsLocation: varchar("google_maps_location", { length: 500 }),
  coursesDescription: text("courses_description"),
  coursesImages: text("courses_images"), // JSON array of image URLs
  coursesPdfs: text("courses_pdfs"), // JSON array of PDF URLs
  phone: varchar("phone", { length: 20 }),
  zipCode: varchar("zip_code", { length: 10 }),
  number: varchar("number", { length: 20 }),
  neighborhood: varchar("neighborhood", { length: 255 }),
  city: varchar("city", { length: 255 }),
  state: varchar("state", { length: 2 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  planId: int("plan_id"),
  planStatus: varchar("plan_status", { length: 50 }).default("inactive"),
  isActive: int("is_active").notNull().default(1),
  aiAgentPrompt: text("ai_agent_prompt"),
  agentInactivityTimeout: int("agent_inactivity_timeout").default(30), // Minutes: 10, 20, 30, 60
  agentPaused: int("agent_paused").notNull().default(0), // 1 = paused, 0 = active
  autoSelectProfessional: int("auto_select_professional").notNull().default(0), // Auto select when only one professional exists
  openaiApiKey: varchar("openai_api_key", { length: 255 }), // OpenAI API key for this company
  openaiModel: varchar("openai_model", { length: 100 }).default("gpt-4o-mini"), // OpenAI model to use
  openaiTemperature: decimal("openai_temperature", { precision: 3, scale: 2 }).default("0.70"), // Temperature for AI responses (0.0 - 2.0)
  openaiMaxTokens: int("openai_max_tokens").default(180), // Maximum tokens for AI responses
  humanRequestEnabled: int("human_request_enabled").notNull().default(0), // Enable/disable human request feature
  humanRequestContact: varchar("human_request_contact", { length: 255 }), // WhatsApp group ID or phone number
  humanRequestMessage: text("human_request_message"), // Custom notification message
  humanRequestKeywords: text("human_request_keywords"), // JSON array of trigger keywords
  humanRequestTimeout: int("human_request_timeout").notNull().default(30), // Minutes: 10, 20, 30, 60
  // Course notification settings (similar to human request)
  courseNotificationEnabled: int("course_notification_enabled").notNull().default(0), // Enable/disable course notification feature
  courseNotificationContact: varchar("course_notification_contact", { length: 255 }), // WhatsApp group ID or phone number for course notifications
  courseNotificationMessage: text("course_notification_message"), // Custom notification message for course inquiries
  courseNotificationKeywords: text("course_notification_keywords"), // Keywords that trigger course notification (one per line)
  courseNotificationTimeout: int("course_notification_timeout").notNull().default(30), // Minutes: 10, 20, 30, 60
  ignoredNumbers: text("ignored_numbers"), // List of phone numbers to ignore (one per line)
  birthdayMessage: text("birthday_message"),
  resetToken: varchar("reset_token", { length: 255 }),
  resetTokenExpires: varchar("reset_token_expires", { length: 255 }),
  tourEnabled: int("tour_enabled").notNull().default(1),
  trialExpiresAt: timestamp("trial_expires_at"),
  trialAlertShown: int("trial_alert_shown").notNull().default(0),
  subscriptionStatus: varchar("subscription_status", { length: 20 }).default("trial"),
  asaasApiKey: varchar("asaas_api_key", { length: 255 }),
  asaasWebhookUrl: varchar("asaas_webhook_url", { length: 500 }),
  asaasEnvironment: varchar("asaas_environment", { length: 20 }).default("sandbox"),
  asaasEnabled: boolean("asaas_enabled").default(false),
  asaasCustomerId: varchar("asaas_customer_id", { length: 100 }),
  asaasSubscriptionId: varchar("asaas_subscription_id", { length: 100 }),
  n8nWebhookUrl: varchar("n8n_webhook_url", { length: 500 }),
  n8nWebhookEnabled: boolean("n8n_webhook_enabled").default(false),
  financialPasswordEnabled: int("financial_password_enabled").notNull().default(0),
  financialPassword: varchar("financial_password", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Payment alerts table
export const paymentAlerts = mysqlTable("payment_alerts", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  alertType: varchar("alert_type", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  shownAt: timestamp("shown_at"),
  isShown: boolean("is_shown").default(false),
});



// Subscription plans table
export const plans = mysqlTable("plans", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  freeDays: int("free_days").notNull().default(0),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  annualPrice: decimal("annual_price", { precision: 10, scale: 2 }),
  maxProfessionals: int("max_professionals").notNull().default(1),
  isActive: int("is_active").notNull().default(1),
  permissions: json("permissions").$type<{
    dashboard: boolean;
    appointments: boolean;
    services: boolean;
    professionals: boolean;
    clients: boolean;
    reviews: boolean;
    messages: boolean;
    financial: boolean;
    reports: boolean;
    settings: boolean;
    support: boolean;
    subscription: boolean;
  }>().default({
    dashboard: true,
    appointments: true,
    services: true,
    professionals: true,
    clients: true,
    reviews: false,
    messages: false,
    financial: false,
    reports: false,
    settings: true,
    support: true,
    subscription: true,
  }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Admin alerts/announcements table
export const adminAlerts = mysqlTable("admin_alerts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 50 }).notNull().default("info"), // info, warning, success, error, holiday
  isActive: int("is_active").notNull().default(1),
  showToAllCompanies: int("show_to_all_companies").notNull().default(1),
  targetCompanyIds: json("target_company_ids").$type<number[]>().default([]),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Company alert views table (to track which companies have seen the alert)
export const companyAlertViews = mysqlTable("company_alert_views", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  alertId: int("alert_id").notNull(),
  viewedAt: timestamp("viewed_at").defaultNow(),
});

// Global settings table
export const globalSettings = mysqlTable("global_settings", {
  id: serial("id").primaryKey(),
  systemName: varchar("system_name", { length: 255 }).default("AdminPro"),
  systemDescription: text("system_description"),
  logoUrl: varchar("logo_url", { length: 500 }),
  faviconUrl: varchar("favicon_url", { length: 500 }),
  primaryColor: varchar("primary_color", { length: 7 }).notNull().default("#2563eb"),
  secondaryColor: varchar("secondary_color", { length: 7 }).notNull().default("#64748b"),
  backgroundColor: varchar("background_color", { length: 7 }).notNull().default("#f8fafc"),
  textColor: varchar("text_color", { length: 7 }).notNull().default("#1e293b"),
  // tourColor: varchar("tour_color", { length: 7 }).notNull().default("#b845dc"), // Temporarily disabled for schema sync
  evolutionApiUrl: varchar("evolution_api_url", { length: 500 }),
  evolutionApiGlobalKey: varchar("evolution_api_global_key", { length: 500 }),
  defaultBirthdayMessage: text("default_birthday_message"),
  defaultAiPrompt: text("default_ai_prompt"), // Default AI prompt for new companies
  // SMTP Configuration
  smtpHost: varchar("smtp_host", { length: 255 }),
  smtpPort: varchar("smtp_port", { length: 10 }),
  smtpUser: varchar("smtp_user", { length: 255 }),
  smtpPassword: varchar("smtp_password", { length: 255 }),
  smtpFromEmail: varchar("smtp_from_email", { length: 255 }),
  smtpFromName: varchar("smtp_from_name", { length: 255 }),
  smtpSecure: varchar("smtp_secure", { length: 10 }).default("tls"),
  customHtml: text("custom_html"),
  customDomainUrl: varchar("custom_domain_url", { length: 500 }),
  systemUrl: varchar("system_url", { length: 500 }),
  supportWhatsapp: varchar("support_whatsapp", { length: 20 }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Training videos table
export const trainingVideos = mysqlTable("training_videos", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  youtubeUrl: varchar("youtube_url", { length: 500 }).notNull(),
  description: text("description"),
  menuLocation: varchar("menu_location", { length: 100 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// WhatsApp instances table
export const whatsappInstances = mysqlTable("whatsapp_instances", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  instanceName: varchar("instance_name", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }),
  qrCode: text("qr_code"),
  webhook: varchar("webhook", { length: 500 }),
  apiUrl: varchar("api_url", { length: 500 }),
  apiKey: varchar("api_key", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Conversations table
export const conversations = mysqlTable("conversations", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  whatsappInstanceId: int("whatsapp_instance_id").notNull(),
  phoneNumber: varchar("phone_number", { length: 50 }).notNull(),
  contactName: varchar("contact_name", { length: 255 }),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  takeoverMode: mysqlEnum("takeover_mode", ["agent", "human"]).default("agent"),
  courseSentAt: timestamp("course_sent_at"), // Timestamp when course notification was sent (null = never sent)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Messages table
export const messages = mysqlTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: int("conversation_id").notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  content: text("content").notNull(),
  messageId: varchar("message_id", { length: 255 }),
  messageType: varchar("message_type", { length: 50 }),
  delivered: int("delivered").default(0),
  timestamp: timestamp("timestamp").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Services table
export const services = mysqlTable("services", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  professionalId: int("professional_id"), // NULL = available to all professionals
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  duration: int("duration").notNull(),
  color: varchar("color", { length: 7 }).default("#3B82F6"),
  isActive: int("is_active").notNull().default(1),
  expense: decimal("expense", { precision: 10, scale: 2 }).default("0.00"), // Despesa/custo do serviço
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Professionals table
export const professionals = mysqlTable("professionals", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  password: varchar("password", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  timeInterval: int("time_interval").notNull().default(30), // Appointment interval in minutes (15, 30, 60, etc.)
  minimumAdvanceHours: decimal("minimum_advance_hours", { precision: 4, scale: 2 }).notNull().default("0"), // Minimum hours in advance required for booking (0 = no minimum, 0.5 = 30min)
  specialties: json("specialties").$type<string[]>(),
  workDays: json("work_days"),
  workStartTime: varchar("work_start_time", { length: 10 }),
  workEndTime: varchar("work_end_time", { length: 10 }),
  active: int("active").default(1),
  archived: int("archived").default(0), // Soft delete: 0 = active, 1 = archived (preserves historical data)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Professional breaks/pauses table
export const professionalBreaks = mysqlTable("professional_breaks", {
  id: serial("id").primaryKey(),
  professionalId: int("professional_id").notNull(),
  dayOfWeek: varchar("day_of_week", { length: 20 }).notNull(), // domingo, segunda, terca, etc.
  startTime: varchar("start_time", { length: 10 }).notNull(), // HH:MM format
  endTime: varchar("end_time", { length: 10 }).notNull(), // HH:MM format
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Professional days off table - specific dates when professional is not available
export const professionalDaysOff = mysqlTable("professional_days_off", {
  id: serial("id").primaryKey(),
  professionalId: int("professional_id").notNull(),
  dateOff: date("date_off").notNull(), // Specific date when professional is off
  reason: varchar("reason", { length: 255 }), // Optional reason (férias, consulta médica, etc.)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Professional exceptional schedules table - specific dates with custom working hours
export const professionalExceptionalSchedules = mysqlTable("professional_exceptional_schedules", {
  id: serial("id").primaryKey(),
  professionalId: int("professional_id").notNull(),
  exceptionDate: date("exception_date").notNull(), // Specific date with exceptional schedule
  startTime: varchar("start_time", { length: 10 }).notNull(), // HH:MM format
  endTime: varchar("end_time", { length: 10 }).notNull(), // HH:MM format
  reason: varchar("reason", { length: 255 }), // Optional reason (manhã apenas, fechado à tarde, etc.)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Professional schedules table - individual working hours for each day of the week
export const professionalSchedules = mysqlTable("professional_schedules", {
  id: serial("id").primaryKey(),
  professionalId: int("professional_id").notNull(),
  dayOfWeek: int("day_of_week").notNull(), // 0=Sunday, 1=Monday, 2=Tuesday, etc.
  startTime: varchar("start_time", { length: 10 }).notNull(), // HH:MM format
  endTime: varchar("end_time", { length: 10 }).notNull(), // HH:MM format
  isEnabled: int("is_enabled").notNull().default(1), // 1=enabled, 0=disabled
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export type ProfessionalSchedule = typeof professionalSchedules.$inferSelect;
export type InsertProfessionalSchedule = typeof professionalSchedules.$inferInsert;

// Appointments table
export const appointments = mysqlTable("appointments", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  professionalId: int("professional_id").notNull(),
  serviceId: int("service_id").notNull(),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  clientPhone: varchar("client_phone", { length: 50 }),
  clientEmail: varchar("client_email", { length: 255 }),
  appointmentDate: date("appointment_date").notNull(),
  appointmentTime: varchar("appointment_time", { length: 10 }).notNull(),
  duration: int("duration").default(30),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).default("0.00"),
  expense: decimal("expense", { precision: 10, scale: 2 }).default("0.00"),
  status: varchar("status", { length: 50 }).notNull().default("agendado"),
  notes: text("notes"),
  reminderSent: int("reminder_sent").default(0),
  asaasPaymentId: varchar("asaas_payment_id", { length: 255 }),
  asaasPaymentStatus: varchar("asaas_payment_status", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Status table
export const status = mysqlTable("status", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 7 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Clients table
export const clients = mysqlTable("clients", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  birthDate: date("birth_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Birthday messages table
export const birthdayMessages = mysqlTable("birthday_messages", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  message: text("message").notNull(),
  messageTemplate: text("message_template"),
  isActive: int("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Birthday message history table
export const birthdayMessageHistory = mysqlTable("birthday_message_history", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  clientId: int("client_id").notNull(),
  message: text("message").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
});



// Reminder settings table
export const reminderSettings = mysqlTable("reminder_settings", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  reminderType: varchar("reminder_type", { length: 50 }).notNull(),
  isActive: int("is_active").default(1),
  messageTemplate: text("message_template").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Reminder history table
export const reminderHistory = mysqlTable("reminder_history", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  appointmentId: int("appointment_id").notNull(),
  reminderType: varchar("reminder_type", { length: 50 }).notNull(),
  clientPhone: varchar("client_phone", { length: 20 }).notNull(),
  message: text("message").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
  status: varchar("status", { length: 20 }).default("sent"),
  whatsappInstanceId: int("whatsapp_instance_id"),
});

// Professional reviews table
export const professionalReviews = mysqlTable("professional_reviews", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  professionalId: int("professional_id").notNull(),
  appointmentId: int("appointment_id").notNull(),
  clientPhone: varchar("client_phone", { length: 50 }).notNull(),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  rating: int("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Review invitations table
export const reviewInvitations = mysqlTable("review_invitations", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  whatsappInstanceId: int("whatsapp_instance_id"),
  professionalId: int("professional_id").notNull(),
  appointmentId: int("appointment_id").notNull(),
  clientPhone: varchar("client_phone", { length: 50 }).notNull(),
  invitationToken: varchar("invitation_token", { length: 255 }).notNull().unique(),
  sentAt: timestamp("sent_at"),
  reviewSubmittedAt: timestamp("review_submitted_at"),
  status: varchar("status", { length: 50 }).default("pending"),
});


// Message campaigns table
export const messageCampaigns = mysqlTable("message_campaigns", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  message: text("message").notNull(),
  scheduledDate: datetime("scheduled_date").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, sending, completed, failed
  targetType: varchar("target_type", { length: 20 }).notNull(), // all, specific
  selectedClients: json("selected_clients"), // array of client IDs for specific targeting
  sentCount: int("sent_count").default(0),
  totalTargets: int("total_targets").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Financial categories table
export const financialCategories = mysqlTable("financial_categories", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 7 }).notNull().default("#3B82F6"),
  isRecurring: int("is_recurring").default(0), // 0 = não recorrente, 1 = recorrente mensal
  recurringDay: int("recurring_day"), // Dia do mês para lançar a transação recorrente (1-31, opcional)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Payment methods table
export const paymentMethods = mysqlTable("payment_methods", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 20 }).notNull(), // cash, card, pix, transfer, other
  isActive: int("is_active").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Financial transactions table
export const financialTransactions = mysqlTable("financial_transactions", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(), // income, expense
  categoryId: int("category_id").notNull(),
  date: date("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Relations
export const companiesRelations = relations(companies, ({ many }) => ({
  professionals: many(professionals),
  services: many(services),
  appointments: many(appointments),
  whatsappInstances: many(whatsappInstances),
  clients: many(clients),
  birthdayMessages: many(birthdayMessages),
  reminderSettings: many(reminderSettings),
  messageCampaigns: many(messageCampaigns),
  financialCategories: many(financialCategories),
  paymentMethods: many(paymentMethods),
  financialTransactions: many(financialTransactions),
}));

export const messageCampaignsRelations = relations(messageCampaigns, ({ one }) => ({
  company: one(companies, {
    fields: [messageCampaigns.companyId],
    references: [companies.id],
  }),
}));

export const clientsRelations = relations(clients, ({ one }) => ({
  company: one(companies, {
    fields: [clients.companyId],
    references: [companies.id],
  }),
}));

// Insert schemas
export const insertAdminSchema = createInsertSchema(admins).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  isActive: z.union([z.boolean(), z.number()]).transform(val => typeof val === 'boolean' ? (val ? 1 : 0) : val),
  tourEnabled: z.union([z.boolean(), z.number()]).transform(val => typeof val === 'boolean' ? (val ? 1 : 0) : val).default(1),
  financialPasswordEnabled: z.union([z.boolean(), z.number()]).transform(val => typeof val === 'boolean' ? (val ? 1 : 0) : val).default(0),
});

export const insertPlanSchema = createInsertSchema(plans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGlobalSettingsSchema = createInsertSchema(globalSettings).omit({
  id: true,
  updatedAt: true,
});

export const insertWhatsappInstanceSchema = createInsertSchema(whatsappInstances).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export const insertServiceSchema = createInsertSchema(services).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProfessionalSchema = createInsertSchema(professionals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProfessionalBreakSchema = createInsertSchema(professionalBreaks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProfessionalDayOffSchema = createInsertSchema(professionalDaysOff).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProfessionalExceptionalScheduleSchema = createInsertSchema(professionalExceptionalSchedules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStatusSchema = createInsertSchema(status).omit({
  id: true,
  createdAt: true,
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBirthdayMessageSchema = createInsertSchema(birthdayMessages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBirthdayMessageHistorySchema = createInsertSchema(birthdayMessageHistory).omit({
  id: true,
  sentAt: true,
});

export const insertReminderSettingsSchema = createInsertSchema(reminderSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReminderHistorySchema = createInsertSchema(reminderHistory).omit({
  id: true,
  sentAt: true,
});

export const insertProfessionalReviewSchema = createInsertSchema(professionalReviews).omit({
  id: true,
  createdAt: true,
});

export const insertReviewInvitationSchema = createInsertSchema(reviewInvitations).omit({
  id: true,
});

export const insertMessageCampaignSchema = createInsertSchema(messageCampaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFinancialCategorySchema = createInsertSchema(financialCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaymentMethodSchema = createInsertSchema(paymentMethods).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFinancialTransactionSchema = createInsertSchema(financialTransactions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAdminAlertSchema = createInsertSchema(adminAlerts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCompanyAlertViewSchema = createInsertSchema(companyAlertViews).omit({
  id: true,
  viewedAt: true,
});

export const insertPaymentAlertSchema = createInsertSchema(paymentAlerts).omit({
  id: true,
  createdAt: true,
  shownAt: true,
});



// Type exports
export type Admin = typeof admins.$inferSelect;
export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type GlobalSettings = typeof globalSettings.$inferSelect;
export type InsertGlobalSettings = z.infer<typeof insertGlobalSettingsSchema>;
export type TrainingVideo = typeof trainingVideos.$inferSelect;
export type InsertTrainingVideo = typeof trainingVideos.$inferInsert;
export type WhatsappInstance = typeof whatsappInstances.$inferSelect;
export type InsertWhatsappInstance = z.infer<typeof insertWhatsappInstanceSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Professional = typeof professionals.$inferSelect;
export type InsertProfessional = z.infer<typeof insertProfessionalSchema>;
export type ProfessionalBreak = typeof professionalBreaks.$inferSelect;
export type InsertProfessionalBreak = z.infer<typeof insertProfessionalBreakSchema>;
export type ProfessionalDayOff = typeof professionalDaysOff.$inferSelect;
export type InsertProfessionalDayOff = z.infer<typeof insertProfessionalDayOffSchema>;
export type ProfessionalExceptionalSchedule = typeof professionalExceptionalSchedules.$inferSelect;
export type InsertProfessionalExceptionalSchedule = z.infer<typeof insertProfessionalExceptionalScheduleSchema>;
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Status = typeof status.$inferSelect;
export type InsertStatus = z.infer<typeof insertStatusSchema>;
export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type BirthdayMessage = typeof birthdayMessages.$inferSelect;
export type InsertBirthdayMessage = z.infer<typeof insertBirthdayMessageSchema>;
export type BirthdayMessageHistory = typeof birthdayMessageHistory.$inferSelect;
export type InsertBirthdayMessageHistory = z.infer<typeof insertBirthdayMessageHistorySchema>;
export type ReminderSettings = typeof reminderSettings.$inferSelect;
export type InsertReminderSettings = z.infer<typeof insertReminderSettingsSchema>;
export type ReminderHistory = typeof reminderHistory.$inferSelect;
export type InsertReminderHistory = z.infer<typeof insertReminderHistorySchema>;
export type ProfessionalReview = typeof professionalReviews.$inferSelect;
export type InsertProfessionalReview = z.infer<typeof insertProfessionalReviewSchema>;
export type ReviewInvitation = typeof reviewInvitations.$inferSelect;
export type InsertReviewInvitation = z.infer<typeof insertReviewInvitationSchema>;
export type MessageCampaign = typeof messageCampaigns.$inferSelect;
export type InsertMessageCampaign = z.infer<typeof insertMessageCampaignSchema>;
export type AdminAlert = typeof adminAlerts.$inferSelect;
export type InsertAdminAlert = z.infer<typeof insertAdminAlertSchema>;
export type CompanyAlertView = typeof companyAlertViews.$inferSelect;
export type InsertCompanyAlertView = z.infer<typeof insertCompanyAlertViewSchema>;
export type PaymentAlert = typeof paymentAlerts.$inferSelect;
export type InsertPaymentAlert = z.infer<typeof insertPaymentAlertSchema>;



// Support ticket types table
export const supportTicketTypes = mysqlTable("support_ticket_types", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Support ticket statuses table
export const supportTicketStatuses = mysqlTable("support_ticket_statuses", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 7 }).notNull().default("#6b7280"), // hex color
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Support tickets table
export const supportTickets = mysqlTable("support_tickets", {
  id: serial("id").primaryKey(),
  companyId: int("company_id").notNull(),
  typeId: int("type_id"),
  statusId: int("status_id"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  priority: varchar("priority", { length: 20 }).notNull().default("medium"), // low, medium, high, urgent
  category: varchar("category", { length: 100 }).notNull().default("general"), // general, technical, billing, feature_request
  adminResponse: text("admin_response"),
  attachments: text("attachments"), // Comma-separated filenames
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const insertSupportTicketTypeSchema = createInsertSchema(supportTicketTypes).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSupportTicketStatusSchema = createInsertSchema(supportTicketStatuses).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({ id: true, createdAt: true, updatedAt: true });

export type SupportTicketType = typeof supportTicketTypes.$inferSelect;
export type InsertSupportTicketType = z.infer<typeof insertSupportTicketTypeSchema>;
export type SupportTicketStatus = typeof supportTicketStatuses.$inferSelect;
export type InsertSupportTicketStatus = z.infer<typeof insertSupportTicketStatusSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;

// Tour guiado system
export const tourSteps = mysqlTable("tour_steps", {
  id: int("id").primaryKey().autoincrement(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  targetElement: varchar("target_element", { length: 255 }).notNull(), // CSS selector
  placement: varchar("placement", { length: 20 }).default("bottom"), // top, bottom, left, right
  stepOrder: int("step_order").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow()
});

export const companyTourProgress = mysqlTable("company_tour_progress", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  hasCompletedTour: boolean("has_completed_tour").default(false),
  currentStep: int("current_step").default(1),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow()
});

export const insertTourStepSchema = createInsertSchema(tourSteps).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCompanyTourProgressSchema = createInsertSchema(companyTourProgress).omit({ id: true, createdAt: true, updatedAt: true });

export type TourStep = typeof tourSteps.$inferSelect;
export type InsertTourStep = z.infer<typeof insertTourStepSchema>;
export type CompanyTourProgress = typeof companyTourProgress.$inferSelect;
export type InsertCompanyTourProgress = z.infer<typeof insertCompanyTourProgressSchema>;