import {
  pgTable,
  text,
  varchar,
  timestamp,
  json,
  index,
  serial,
  decimal,
  boolean,
  date,
  integer,
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
  phone: varchar("phone", { length: 20 }),
  zipCode: varchar("zip_code", { length: 10 }),
  number: varchar("number", { length: 20 }),
  neighborhood: varchar("neighborhood", { length: 255 }),
  city: varchar("city", { length: 255 }),
  state: varchar("state", { length: 2 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  planId: integer("plan_id"),
  isActive: boolean("is_active").notNull().default(true),
  aiAgentPrompt: text("ai_agent_prompt"),
  resetToken: varchar("reset_token", { length: 255 }),
  resetTokenExpires: timestamp("reset_token_expires"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscription plans table
export const plans = pgTable("plans", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  freeDays: integer("free_days").notNull().default(0),
  price: decimal("price", { precision: "10", scale: 2 }).notNull(),
  maxProfessionals: integer("max_professionals").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  permissions: json("permissions").$type<{
    dashboard: boolean;
    appointments: boolean;
    services: boolean;
    professionals: boolean;
    clients: boolean;
    reviews: boolean;
    tasks: boolean;
    pointsProgram: boolean;
    loyalty: boolean;
    inventory: boolean;
    messages: boolean;
    coupons: boolean;
    financial: boolean;
    reports: boolean;
    settings: boolean;
  }>().default({
    dashboard: true,
    appointments: true,
    services: true,
    professionals: true,
    clients: true,
    reviews: false,
    tasks: false,
    pointsProgram: false,
    loyalty: false,
    inventory: false,
    messages: false,
    coupons: false,
    financial: false,
    reports: false,
    settings: true,
  }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Global settings table
export const globalSettings = pgTable("global_settings", {
  id: serial("id").primaryKey(),
  systemName: varchar("system_name", { length: 255 }).default("AdminPro"),
  logoUrl: varchar("logo_url", { length: 500 }),
  faviconUrl: varchar("favicon_url", { length: 500 }),
  primaryColor: varchar("primary_color", { length: 7 }).notNull().default("#2563eb"),
  secondaryColor: varchar("secondary_color", { length: 7 }).notNull().default("#64748b"),
  backgroundColor: varchar("background_color", { length: 7 }).notNull().default("#f8fafc"),
  textColor: varchar("text_color", { length: 7 }).notNull().default("#1e293b"),
  evolutionApiUrl: varchar("evolution_api_url", { length: 500 }),
  evolutionApiGlobalKey: varchar("evolution_api_global_key", { length: 500 }),
  openaiApiKey: varchar("openai_api_key", { length: 500 }),
  openaiModel: varchar("openai_model", { length: 100 }).notNull().default("gpt-4o"),
  openaiTemperature: varchar("openai_temperature", { length: 10 }).notNull().default("0.70"),
  openaiMaxTokens: varchar("openai_max_tokens", { length: 10 }).notNull().default("4000"),
  // SMTP Configuration
  smtpHost: varchar("smtp_host", { length: 255 }),
  smtpPort: varchar("smtp_port", { length: 10 }),
  smtpUser: varchar("smtp_user", { length: 255 }),
  smtpPassword: varchar("smtp_password", { length: 255 }),
  smtpFromEmail: varchar("smtp_from_email", { length: 255 }),
  smtpFromName: varchar("smtp_from_name", { length: 255 }),
  smtpSecure: varchar("smtp_secure", { length: 10 }).default("tls"),
  customHtml: text("custom_html"),
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
  price: decimal("price", { precision: "10", scale: 2 }).notNull(),
  duration: integer("duration").notNull(),
  color: varchar("color", { length: 7 }).default("#3B82F6"),
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
  specialties: json("specialties").$type<string[]>(),
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
  duration: integer("duration").default(30),
  totalPrice: decimal("total_price", { precision: "10", scale: 2 }).default("0.00"),
  status: varchar("status", { length: 50 }).notNull().default("agendado"),
  notes: text("notes"),
  reminderSent: boolean("reminder_sent").default(false),
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

// Clients table
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  birthDate: date("birth_date"),
  notes: text("notes"),
  points: integer("points").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Birthday messages table
export const birthdayMessages = pgTable("birthday_messages", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  message: text("message").notNull(),
  messageTemplate: text("message_template"),
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

// Tasks table
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  priority: varchar("priority", { length: 20 }).notNull().default("medium"),
  dueDate: date("due_date"),
  assignedTo: integer("assigned_to"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Point transactions table
export const pointTransactions = pgTable("point_transactions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  clientId: integer("client_id").notNull(),
  appointmentId: integer("appointment_id"),
  points: integer("points").notNull(),
  type: varchar("type", { length: 20 }).notNull(), // 'earned' or 'redeemed'
  description: varchar("description", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Inventory items table
export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  quantity: integer("quantity").notNull().default(0),
  minQuantity: integer("min_quantity").default(0),
  price: decimal("price", { precision: "10", scale: 2 }),
  category: varchar("category", { length: 100 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Coupons table
export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  code: varchar("code", { length: 50 }).notNull(),
  description: text("description"),
  discountType: varchar("discount_type", { length: 20 }).notNull(), // 'percentage' or 'fixed'
  discountValue: decimal("discount_value", { precision: "10", scale: 2 }).notNull(),
  minAmount: decimal("min_amount", { precision: "10", scale: 2 }),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").default(0),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Financial records table
export const financialRecords = pgTable("financial_records", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  appointmentId: integer("appointment_id"),
  type: varchar("type", { length: 20 }).notNull(), // 'income' or 'expense'
  category: varchar("category", { length: 100 }),
  description: text("description"),
  amount: decimal("amount", { precision: "10", scale: 2 }).notNull(),
  date: date("date").notNull(),
  paymentMethod: varchar("payment_method", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const companiesRelations = relations(companies, ({ many, one }) => ({
  services: many(services),
  professionals: many(professionals),
  appointments: many(appointments),  
  clients: many(clients),
  whatsappInstances: many(whatsappInstances),
  conversations: many(conversations),
  plan: one(plans, {
    fields: [companies.planId],
    references: [plans.id],
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

export const appointmentsRelations = relations(appointments, ({ one }) => ({
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
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  company: one(companies, {
    fields: [clients.companyId],
    references: [companies.id],
  }),
  pointTransactions: many(pointTransactions),
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

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type Admin = typeof admins.$inferSelect;
export type InsertAdmin = z.infer<typeof insertAdminSchema>;

export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;

export type Plan = typeof plans.$inferSelect;
export type InsertPlan = z.infer<typeof insertPlanSchema>;

export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;

export type Professional = typeof professionals.$inferSelect;
export type InsertProfessional = z.infer<typeof insertProfessionalSchema>;

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;

export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;

export type WhatsappInstance = typeof whatsappInstances.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type PointTransaction = typeof pointTransactions.$inferSelect;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type FinancialRecord = typeof financialRecords.$inferSelect;