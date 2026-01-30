import {
  mysqlTable,
  text,
  varchar,
  timestamp,
  json,
  index,
  int,
  decimal,
  boolean,
  date,
} from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table for express-session
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid", { length: 255 }).primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Admin users table
export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Companies table
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  fantasyName: varchar("fantasy_name", { length: 255 }).notNull(),
  document: varchar("document", { length: 20 }).notNull().unique(), // CNPJ or CPF
  address: text("address").notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  aiAgentPrompt: text("ai_agent_prompt"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscription plans table
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  freeDays: integer("free_days").notNull().default(0),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Global settings table
export const globalSettings = mysqlTable("global_settings", {
  id: int("id").primaryKey().autoincrement(),
  systemName: varchar("system_name", { length: 255 }).notNull().default("AdminPro"),
  logoUrl: varchar("logo_url", { length: 500 }),
  primaryColor: varchar("primary_color", { length: 7 }).notNull().default("#2563eb"),
  secondaryColor: varchar("secondary_color", { length: 7 }).notNull().default("#64748b"),
  backgroundColor: varchar("background_color", { length: 7 }).notNull().default("#f8fafc"),
  textColor: varchar("text_color", { length: 7 }).notNull().default("#1e293b"),
  evolutionApiUrl: varchar("evolution_api_url", { length: 500 }),
  evolutionApiGlobalKey: varchar("evolution_api_global_key", { length: 500 }),
  openaiApiKey: varchar("openai_api_key", { length: 500 }),
  openaiModel: varchar("openai_model", { length: 100 }).notNull().default("gpt-4o"),
  openaiTemperature: decimal("openai_temperature", { precision: 3, scale: 2 }).notNull().default("0.70").$type<number>(),
  openaiMaxTokens: int("openai_max_tokens").notNull().default(4000),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// WhatsApp instances table
export const whatsappInstances = mysqlTable("whatsapp_instances", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  instanceName: varchar("instance_name", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).default("disconnected"),
  qrCode: text("qr_code"),
  webhook: varchar("webhook", { length: 500 }),
  apiUrl: varchar("api_url", { length: 500 }),
  apiKey: varchar("api_key", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Conversations table
export const conversations = mysqlTable("conversations", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  whatsappInstanceId: int("whatsapp_instance_id").notNull().references(() => whatsappInstances.id, { onDelete: "cascade" }),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  contactName: varchar("contact_name", { length: 100 }),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Messages table
export const messages = mysqlTable("messages", {
  id: int("id").primaryKey().autoincrement(),
  conversationId: int("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  messageId: varchar("message_id", { length: 100 }),
  content: text("content").notNull(),
  role: varchar("role", { length: 20 }).notNull(), // 'user' or 'assistant'
  messageType: varchar("message_type", { length: 50 }).default("text"), // 'text', 'image', etc.
  delivered: boolean("delivered").default(false),
  timestamp: timestamp("timestamp").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Services table
export const services = mysqlTable("services", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  duration: int("duration").notNull(), // in minutes
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  color: varchar("color", { length: 7 }).default("#3b82f6"),
  points: int("points").default(0), // points awarded for this service
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Professionals table
export const professionals = mysqlTable("professionals", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  specialties: json("specialties").$type<string[]>().default([]),
  workDays: json("work_days").$type<number[]>().default([1, 2, 3, 4, 5]), // 0=sunday, 1=monday, etc
  workStartTime: varchar("work_start_time", { length: 5 }).default("09:00"),
  workEndTime: varchar("work_end_time", { length: 5 }).default("18:00"),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Appointments table
export const appointments = mysqlTable("appointments", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  serviceId: int("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  professionalId: int("professional_id").notNull().references(() => professionals.id, { onDelete: "cascade" }),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  clientEmail: varchar("client_email", { length: 255 }),
  clientPhone: varchar("client_phone", { length: 20 }).notNull(),
  appointmentDate: date("appointment_date").notNull(),
  appointmentTime: varchar("appointment_time", { length: 5 }).notNull(),
  duration: int("duration").notNull(), // in minutes
  notes: text("notes"),
  status: varchar("status", { length: 20 }).default("scheduled"), // scheduled, confirmed, cancelled, completed
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  reminderSent: boolean("reminder_sent").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Status table
export const status = mysqlTable("status", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 7 }).notNull(), // hex color
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Birthday messages table
export const birthdayMessages = mysqlTable("birthday_messages", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  messageTemplate: text("message_template").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Birthday message history table
export const birthdayMessageHistory = mysqlTable("birthday_message_history", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  clientId: int("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  clientPhone: varchar("client_phone", { length: 20 }).notNull(),
  message: text("message").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
  status: varchar("status", { length: 20 }).default("sent"), // sent, failed, pending
  whatsappInstanceId: int("whatsapp_instance_id").references(() => whatsappInstances.id),
});

// Clients table
export const clients = mysqlTable("clients", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  birthDate: date("birth_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Reminder Settings table
export const reminderSettings = mysqlTable("reminder_settings", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  reminderType: varchar("reminder_type", { length: 50 }).notNull(), // 'confirmation', '24h', '1h'
  isActive: boolean("is_active").default(true),
  messageTemplate: text("message_template").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Reminder History table
export const reminderHistory = mysqlTable("reminder_history", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  appointmentId: int("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
  reminderType: varchar("reminder_type", { length: 50 }).notNull(),
  clientPhone: varchar("client_phone", { length: 20 }).notNull(),
  message: text("message").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
  status: varchar("status", { length: 20 }).default("sent"), // sent, failed, pending
  whatsappInstanceId: int("whatsapp_instance_id").references(() => whatsappInstances.id),
});

// Professional Reviews table
export const professionalReviews = mysqlTable("professional_reviews", {
  id: int("id").primaryKey().autoincrement(),
  professionalId: int("professional_id").notNull().references(() => professionals.id, { onDelete: "cascade" }),
  appointmentId: int("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  clientPhone: varchar("client_phone", { length: 20 }),
  rating: int("rating").notNull(), // 1-5 stars
  comment: text("comment"),
  reviewDate: timestamp("review_date").defaultNow(),
  isVisible: boolean("is_visible").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Review Invitations table (to track sent invitations)
export const reviewInvitations = mysqlTable("review_invitations", {
  id: int("id").primaryKey().autoincrement(),
  appointmentId: int("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
  professionalId: int("professional_id").notNull().references(() => professionals.id, { onDelete: "cascade" }),
  companyId: int("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  clientPhone: varchar("client_phone", { length: 20 }).notNull(),
  invitationToken: varchar("invitation_token", { length: 255 }).notNull().unique(),
  sentAt: timestamp("sent_at").defaultNow(),
  reviewSubmittedAt: timestamp("review_submitted_at"),
  status: varchar("status", { length: 20 }).default("sent"), // sent, viewed, completed, expired
  whatsappInstanceId: int("whatsapp_instance_id").references(() => whatsappInstances.id),
});

// Tasks table
export const tasks = mysqlTable("tasks", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  companyId: int("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  dueDate: date("due_date").notNull(),
  recurrence: varchar("recurrence", { length: 20 }).notNull(), // daily, weekly, biweekly, monthly
  isActive: boolean("is_active").notNull().default(true),
  color: varchar("color", { length: 7 }).notNull().default("#3B82F6"), // hex color
  whatsappNumber: varchar("whatsapp_number", { length: 20 }), // WhatsApp number with DDI 55
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Task reminders table
export const taskReminders = mysqlTable("task_reminders", {
  id: int("id").primaryKey().autoincrement(),
  taskId: int("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  whatsappNumber: varchar("whatsapp_number", { length: 20 }).notNull(),
  message: text("message").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const companiesRelations = relations(companies, ({ many }) => ({
  whatsappInstances: many(whatsappInstances),
  conversations: many(conversations),
  services: many(services),
  professionals: many(professionals),
  appointments: many(appointments),
  clients: many(clients),
}));

export const clientsRelations = relations(clients, ({ one }) => ({
  company: one(companies, {
    fields: [clients.companyId],
    references: [companies.id],
  }),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  // Add future relations here if needed
}));

export const whatsappInstancesRelations = relations(whatsappInstances, ({ one, many }) => ({
  company: one(companies, {
    fields: [whatsappInstances.companyId],
    references: [companies.id],
  }),
  conversations: many(conversations),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  company: one(companies, {
    fields: [conversations.companyId],
    references: [companies.id],
  }),
  whatsappInstance: one(whatsappInstances, {
    fields: [conversations.whatsappInstanceId],
    references: [whatsappInstances.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  company: one(companies, {
    fields: [services.companyId],
    references: [companies.id],
  }),
  appointments: many(appointments),
}));

export const professionalsRelations = relations(professionals, ({ one, many }) => ({
  company: one(companies, {
    fields: [professionals.companyId],
    references: [companies.id],
  }),
  appointments: many(appointments),
  reviews: many(professionalReviews),
  reviewInvitations: many(reviewInvitations),
}));

export const appointmentsRelations = relations(appointments, ({ one, many }) => ({
  company: one(companies, {
    fields: [appointments.companyId],
    references: [companies.id],
  }),
  service: one(services, {
    fields: [appointments.serviceId],
    references: [services.id],
  }),
  professional: one(professionals, {
    fields: [appointments.professionalId],
    references: [professionals.id],
  }),
  reviews: many(professionalReviews),
  reviewInvitations: many(reviewInvitations),
}));

export const professionalReviewsRelations = relations(professionalReviews, ({ one }) => ({
  professional: one(professionals, {
    fields: [professionalReviews.professionalId],
    references: [professionals.id],
  }),
  appointment: one(appointments, {
    fields: [professionalReviews.appointmentId],
    references: [appointments.id],
  }),
}));

export const reviewInvitationsRelations = relations(reviewInvitations, ({ one }) => ({
  appointment: one(appointments, {
    fields: [reviewInvitations.appointmentId],
    references: [appointments.id],
  }),
  professional: one(professionals, {
    fields: [reviewInvitations.professionalId],
    references: [professionals.id],
  }),
  whatsappInstance: one(whatsappInstances, {
    fields: [reviewInvitations.whatsappInstanceId],
    references: [whatsappInstances.id],
  }),
}));

// Client Points table
export const clientPoints = mysqlTable("client_points", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  clientId: int("client_id").notNull(),
  totalPoints: int("total_points").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Points Campaigns table
export const pointsCampaigns = mysqlTable("points_campaigns", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  requiredPoints: int("required_points").notNull(),
  rewardServiceId: int("reward_service_id").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Points History table
export const pointsHistory = mysqlTable("points_history", {
  id: int("id").primaryKey().autoincrement(),
  companyId: int("company_id").notNull(),
  clientId: int("client_id").notNull(),
  appointmentId: int("appointment_id"),
  pointsChange: int("points_change").notNull(), // positive for gained, negative for spent
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations for points tables
export const clientPointsRelations = relations(clientPoints, ({ one }) => ({
  company: one(companies, {
    fields: [clientPoints.companyId],
    references: [companies.id],
  }),
  client: one(clients, {
    fields: [clientPoints.clientId],
    references: [clients.id],
  }),
}));

export const pointsCampaignsRelations = relations(pointsCampaigns, ({ one }) => ({
  company: one(companies, {
    fields: [pointsCampaigns.companyId],
    references: [companies.id],
  }),
  rewardService: one(services, {
    fields: [pointsCampaigns.rewardServiceId],
    references: [services.id],
  }),
}));

export const pointsHistoryRelations = relations(pointsHistory, ({ one }) => ({
  company: one(companies, {
    fields: [pointsHistory.companyId],
    references: [companies.id],
  }),
  client: one(clients, {
    fields: [pointsHistory.clientId],
    references: [clients.id],
  }),
  appointment: one(appointments, {
    fields: [pointsHistory.appointmentId],
    references: [appointments.id],
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
});

export const insertPlanSchema = createInsertSchema(plans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGlobalSettingsSchema = createInsertSchema(globalSettings).omit({
  id: true,
  updatedAt: true,
}).extend({
  openaiTemperature: z.number().min(0).max(2).optional(),
  openaiMaxTokens: z.number().min(1).max(200000).optional(),
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

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStatusSchema = createInsertSchema(status).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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

// Reminder Settings insert schema
export const insertReminderSettingsSchema = createInsertSchema(reminderSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Reminder History insert schema
export const insertReminderHistorySchema = createInsertSchema(reminderHistory).omit({
  id: true,
  sentAt: true,
});

// Professional Reviews insert schema
export const insertProfessionalReviewSchema = createInsertSchema(professionalReviews).omit({
  id: true,
  reviewDate: true,
  createdAt: true,
});

// Review Invitations insert schema
export const insertReviewInvitationSchema = createInsertSchema(reviewInvitations).omit({
  id: true,
  sentAt: true,
  reviewSubmittedAt: true,
});

// Client Points insert schema
export const insertClientPointsSchema = createInsertSchema(clientPoints).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Points Campaigns insert schema
export const insertPointsCampaignSchema = createInsertSchema(pointsCampaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Points History insert schema
export const insertPointsHistorySchema = createInsertSchema(pointsHistory).omit({
  id: true,
  createdAt: true,
});

// Types
export type Admin = typeof admins.$inferSelect;
export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type GlobalSettings = typeof globalSettings.$inferSelect;
export type InsertGlobalSettings = z.infer<typeof insertGlobalSettingsSchema>;
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
export type ClientPoints = typeof clientPoints.$inferSelect;
export type InsertClientPoints = z.infer<typeof insertClientPointsSchema>;
export type PointsCampaign = typeof pointsCampaigns.$inferSelect;
export type InsertPointsCampaign = z.infer<typeof insertPointsCampaignSchema>;
export type PointsHistory = typeof pointsHistory.$inferSelect;
export type InsertPointsHistory = z.infer<typeof insertPointsHistorySchema>;

// Tasks insert schema
export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;