import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertSaleSchema, insertPurchaseSchema, insertProductSchema, insertCustomerSchema, insertSupplierSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      
      if (!user || user.password !== password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      res.json({ user: { id: user.id, username: user.username, role: user.role } });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Sales routes
  app.get("/api/sales", async (req, res) => {
    try {
      const sales = await storage.getSales();
      res.json(sales);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sales" });
    }
  });

  app.post("/api/sales", async (req, res) => {
    try {
      const saleData = insertSaleSchema.parse(req.body);
      const sale = await storage.createSale(saleData);
      res.json(sale);
    } catch (error) {
      res.status(400).json({ message: "Invalid sale data" });
    }
  });

  // Purchase routes
  app.get("/api/purchases", async (req, res) => {
    try {
      const purchases = await storage.getPurchases();
      res.json(purchases);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch purchases" });
    }
  });

  app.post("/api/purchases", async (req, res) => {
    try {
      const purchaseData = insertPurchaseSchema.parse(req.body);
      const purchase = await storage.createPurchase(purchaseData);
      res.json(purchase);
    } catch (error) {
      res.status(400).json({ message: "Invalid purchase data" });
    }
  });

  // Product routes
  app.get("/api/products", async (req, res) => {
    try {
      const products = await storage.getProducts();
      res.json(products);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const productData = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(productData);
      res.json(product);
    } catch (error) {
      res.status(400).json({ message: "Invalid product data" });
    }
  });

  // Customer routes
  app.get("/api/customers", async (req, res) => {
    try {
      const customers = await storage.getCustomers();
      res.json(customers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      const customerData = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(customerData);
      res.json(customer);
    } catch (error) {
      res.status(400).json({ message: "Invalid customer data" });
    }
  });

  // Supplier routes
  app.get("/api/suppliers", async (req, res) => {
    try {
      const suppliers = await storage.getSuppliers();
      res.json(suppliers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch suppliers" });
    }
  });

  app.post("/api/suppliers", async (req, res) => {
    try {
      const supplierData = insertSupplierSchema.parse(req.body);
      const supplier = await storage.createSupplier(supplierData);
      res.json(supplier);
    } catch (error) {
      res.status(400).json({ message: "Invalid supplier data" });
    }
  });

  // Dashboard stats
  app.get("/api/dashboard/stats", async (req, res) => {
    try {
      const sales = await storage.getSales();
      const purchases = await storage.getPurchases();
      const products = await storage.getProducts();
      
      const todaySales = sales
        .filter(s => new Date(s.date || 0).toDateString() === new Date().toDateString())
        .reduce((sum, s) => sum + parseFloat(s.amount || "0"), 0);
      
      const totalPurchases = purchases.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
      const totalSales = sales.reduce((sum, s) => sum + parseFloat(s.amount || "0"), 0);
      const profitMargin = totalSales > 0 ? ((totalSales - totalPurchases) / totalSales) * 100 : 0;
      
      res.json({
        todaySales,
        totalPurchases,
        profitMargin,
        stockItems: products.length,
        recentTransactions: sales.slice(0, 5)
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // Chart data
  app.get("/api/dashboard/charts", async (req, res) => {
    try {
      const sales = await storage.getSales();
      const purchases = await storage.getPurchases();
      
      // Last 7 days data
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        return date.toDateString();
      });
      
      const salesByDay = last7Days.map(day => {
        return sales
          .filter(s => new Date(s.date || 0).toDateString() === day)
          .reduce((sum, s) => sum + parseFloat(s.amount || "0"), 0);
      });
      
      const purchasesByDay = last7Days.map(day => {
        return purchases
          .filter(p => new Date(p.date || 0).toDateString() === day)
          .reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);
      });
      
      res.json({
        salesPurchase: {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          salesData: salesByDay,
          purchaseData: purchasesByDay
        },
        profitTrend: {
          labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
          data: [4000, 5500, 4800, 6200]
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch chart data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
