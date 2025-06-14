import { sql } from "drizzle-orm";
import { 
  integer, 
  pgTable, 
  text, 
  timestamp, 
  varchar, 
  boolean,
  numeric,
  date
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// Users Table
export const users = pgTable("users", {
  id: integer("id").primaryKey().notNull(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  userType: varchar("user_type", { length: 50 }).notNull().default("user"),
  status: varchar("status", { length: 50 }).notNull().default("Active"),
  employeeId: varchar("employee_id", { length: 50 }).unique(),
  name: varchar("name", { length: 255 }),
  department: varchar("department", { length: 100 }),
  email: varchar("email", { length: 255 }).unique(),
  phone: varchar("phone", { length: 50 }),
  joinDate: date("join_date"),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
  overtimeRate: numeric("overtime_rate", { precision: 10, scale: 2 }),
  taxCode: varchar("tax_code", { length: 50 }),
  nationalInsuranceNumber: varchar("national_insurance_number", { length: 50 }),
  bankAccount: varchar("bank_account", { length: 50 }),
  bankSortCode: varchar("bank_sort_code", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Attendance Table
export const attendance = pgTable("attendance", {
  id: integer("id").primaryKey().notNull(),
  userId: integer("user_id").notNull().references(() => users.id),
  date: date("date").notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  checkIn: timestamp("check_in"),
  checkOut: timestamp("check_out"),
  regularHours: numeric("regular_hours", { precision: 5, scale: 2 }),
  overtimeHours: numeric("overtime_hours", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Leave Table
export const leaves = pgTable("leaves", {
  id: integer("id").primaryKey().notNull(),
  userId: integer("user_id").notNull().references(() => users.id),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  reason: text("reason").notNull(),
  approvedBy: integer("approved_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Payroll Table
export const payroll = pgTable("payroll", {
  id: integer("id").primaryKey().notNull(),
  userId: integer("user_id").notNull().references(() => users.id),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  regularHours: numeric("regular_hours", { precision: 10, scale: 2 }).notNull(),
  overtimeHours: numeric("overtime_hours", { precision: 10, scale: 2 }).notNull(),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }).notNull(),
  overtimeRate: numeric("overtime_rate", { precision: 10, scale: 2 }).notNull(),
  grossPay: numeric("gross_pay", { precision: 10, scale: 2 }).notNull(),
  tax: numeric("tax", { precision: 10, scale: 2 }).notNull(),
  nationalInsurance: numeric("national_insurance", { precision: 10, scale: 2 }).notNull(),
  netPay: numeric("net_pay", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  paymentDate: date("payment_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

export const insertAttendanceSchema = createInsertSchema(attendance);
export const selectAttendanceSchema = createSelectSchema(attendance);

export const insertLeaveSchema = createInsertSchema(leaves);
export const selectLeaveSchema = createSelectSchema(leaves);

export const insertPayrollSchema = createInsertSchema(payroll);
export const selectPayrollSchema = createSelectSchema(payroll);

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Attendance = typeof attendance.$inferSelect;
export type InsertAttendance = typeof attendance.$inferInsert;

export type Leave = typeof leaves.$inferSelect;
export type InsertLeave = typeof leaves.$inferInsert;

export type Payroll = typeof payroll.$inferSelect;
export type InsertPayroll = typeof payroll.$inferInsert; 