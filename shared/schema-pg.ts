import {
  pgTable,
  text,
  varchar,
  timestamp,
  json,
  index,
  integer,
  decimal,
  boolean,
  date,
  serial,
} from "drizzle-orm/pg-core";
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
  document: varchar("document", { length: 20 }).notNull().unique(),
  address: text("address").notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  aiAgentPrompt: text("ai_agent_prompt"),
  trialDays: integer("trial_days"),
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
export const globalSettings = pgTable("global_settings", {
  id: serial("id").primaryKey(),
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
  openaiTemperature: decimal("openai_temperature", { precision: 3, scale: 2 }).notNull().default("0.70"),
  openaiMaxTokens: integer("openai_max_tokens").notNull().default(4000),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// WhatsApp instances table
export const whatsappInstances = pgTable("whatsapp_instances", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  instanceName: varchar("instance_name", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }),
  qrCode: text("qr_code"),
  webhook: varchar("webhook", { length: 500 }),
  apiUrl: varchar("api_url", { length: 500 }),
  apiKey: varchar("api_key", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Conversations table
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  whatsappInstanceId: integer("whatsapp_instance_id").notNull(),
  phoneNumber: varchar("phone_number", { length: 50 }).notNull(),
  contactName: varchar("contact_name", { length: 255 }),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Messages table
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  content: text("content").notNull(),
  messageId: varchar("message_id", { length: 255 }),
  messageType: varchar("message_type", { length: 50 }),
  delivered: boolean("delivered").default(false),
  timestamp: timestamp("timestamp").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Services table
export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  duration: integer("duration").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  points: integer("points").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Professionals table
export const professionals = pgTable("professionals", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  specialties: text("specialties").array(),
  workDays: json("work_days"),
  workStartTime: varchar("work_start_time", { length: 10 }),
  workEndTime: varchar("work_end_time", { length: 10 }),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Appointments table
export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  professionalId: integer("professional_id").notNull(),
  serviceId: integer("service_id").notNull(),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  clientPhone: varchar("client_phone", { length: 50 }),
  clientEmail: varchar("client_email", { length: 255 }),
  appointmentDate: date("appointment_date").notNull(),
  appointmentTime: varchar("appointment_time", { length: 10 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("agendado"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Status table
export const status = pgTable("status", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 7 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Birthday messages table
export const birthdayMessages = pgTable("birthday_messages", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  message: text("message").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Birthday message history table
export const birthdayMessageHistory = pgTable("birthday_message_history", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  clientId: integer("client_id").notNull(),
  message: text("message").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
});

// Clients table
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  birthDate: date("birth_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Reminder settings table
export const reminderSettings = pgTable("reminder_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  reminderType: varchar("reminder_type", { length: 50 }).notNull(),
  isActive: boolean("is_active").default(true),
  messageTemplate: text("message_template").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Reminder history table
export const reminderHistory = pgTable("reminder_history", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  appointmentId: integer("appointment_id").notNull(),
  reminderType: varchar("reminder_type", { length: 50 }).notNull(),
  clientPhone: varchar("client_phone", { length: 20 }).notNull(),
  message: text("message").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
  status: varchar("status", { length: 20 }).default("sent"),
  whatsappInstanceId: integer("whatsapp_instance_id"),
});

// Professional reviews table
export const professionalReviews = pgTable("professional_reviews", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  professionalId: integer("professional_id").notNull(),
  appointmentId: integer("appointment_id").notNull(),
  clientPhone: varchar("client_phone", { length: 50 }).notNull(),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Review invitations table
export const reviewInvitations = pgTable("review_invitations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  whatsappInstanceId: integer("whatsapp_instance_id"),
  professionalId: integer("professional_id").notNull(),
  appointmentId: integer("appointment_id").notNull(),
  clientPhone: varchar("client_phone", { length: 50 }).notNull(),
  invitationToken: varchar("invitation_token", { length: 255 }).notNull().unique(),
  sentAt: timestamp("sent_at"),
  reviewSubmittedAt: timestamp("review_submitted_at"),
  status: varchar("status", { length: 50 }).default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Tasks table
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  dueDate: date("due_date").notNull(),
  completed: boolean("completed").default(false),
  recurrence: varchar("recurrence", { length: 50 }).default("none"),
  whatsappNumber: varchar("whatsapp_number", { length: 50 }),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Task reminders table
export const taskReminders = pgTable("task_reminders", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  whatsappNumber: varchar("whatsapp_number", { length: 50 }).notNull(),
  message: text("message").notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
});

// Client points table
export const clientPoints = pgTable("client_points", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  companyId: integer("company_id").notNull(),
  totalPoints: integer("total_points").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Points campaigns table
export const pointsCampaigns = pgTable("points_campaigns", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  requiredPoints: integer("required_points").notNull(),
  rewardServiceId: integer("reward_service_id").notNull(),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Points history table
export const pointsHistory = pgTable("points_history", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  clientId: integer("client_id").notNull(),
  pointsChange: integer("points_change").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Coupons table
export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 255 }).notNull().unique(),
  discountType: varchar("discount_type", { length: 50 }).notNull(), // 'percentage' or 'fixed'
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
  expiresAt: timestamp("expires_at"),
  maxUses: integer("max_uses").notNull().default(1),
  usesCount: integer("uses_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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
  tasks: many(tasks),
  clientPoints: many(clientPoints),
  pointsCampaigns: many(pointsCampaigns),
}));

export const clientsRelations = relations(clients, ({ one }) => ({
  company: one(companies, {
    fields: [clients.companyId],
    references: [companies.id],
  }),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  companies: many(companies),
}));

export const whatsappInstancesRelations = relations(whatsappInstances, ({ one, many }) => ({
  company: one(companies, {
    fields: [whatsappInstances.companyId],
    references: [companies.id],
  }),
  conversations: many(conversations),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
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
}));

export const appointmentsRelations = relations(appointments, ({ one, many }) => ({
  company: one(companies, {
    fields: [appointments.companyId],
    references: [companies.id],
  }),
  professional: one(professionals, {
    fields: [appointments.professionalId],
    references: [professionals.id],
  }),
  service: one(services, {
    fields: [appointments.serviceId],
    references: [services.id],
  }),
  reviews: many(professionalReviews),
}));

export const professionalReviewsRelations = relations(professionalReviews, ({ one }) => ({
  company: one(companies, {
    fields: [professionalReviews.companyId],
    references: [companies.id],
  }),
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
  company: one(companies, {
    fields: [reviewInvitations.companyId],
    references: [companies.id],
  }),
  professional: one(professionals, {
    fields: [reviewInvitations.professionalId],
    references: [professionals.id],
  }),
  appointment: one(appointments, {
    fields: [reviewInvitations.appointmentId],
    references: [appointments.id],
  }),
}));

export const clientPointsRelations = relations(clientPoints, ({ one }) => ({
  client: one(clients, {
    fields: [clientPoints.clientId],
    references: [clients.id],
  }),
  company: one(companies, {
    fields: [clientPoints.companyId],
    references: [companies.id],
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
  client: one(clients, {
    fields: [pointsHistory.clientId],
    references: [clients.id],
  }),
  company: one(companies, {
    fields: [pointsHistory.companyId],
    references: [companies.id],
  }),
}));

// Insert schemas
export const insertAdminSchema = createInsertSchema(admins).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCompanySchema = createInsertSchema(companies, {
  email: z.string().email({ message: "E-mail inválido" }),
  password: z.string().min(6, { message: "Senha deve ter pelo menos 6 caracteres" }),
  fantasyName: z.string().min(2, { message: "Nome fantasia deve ter pelo menos 2 caracteres" }),
  document: z.string().min(11, { message: "CNPJ/CPF é obrigatório" }),
  address: z.string().min(5, { message: "Endereço é obrigatório" }),
}).extend({
  trialDays: z.number().int().optional(),
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
  createdAt: true,
});

export const insertClientPointsSchema = createInsertSchema(clientPoints).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPointsCampaignSchema = createInsertSchema(pointsCampaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPointsHistorySchema = createInsertSchema(pointsHistory).omit({
  id: true,
  createdAt: true,
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type TaskReminder = typeof taskReminders.$inferSelect;
export type InsertTaskReminder = typeof taskReminders.$inferInsert;

export const insertCouponSchema = createInsertSchema(coupons);
export type Coupon = typeof coupons.$inferSelect;
export type InsertCoupon = z.infer<typeof insertCouponSchema>;