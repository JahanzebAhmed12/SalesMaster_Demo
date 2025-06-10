import { 
  users, sales, purchases, products, customers, suppliers,
  type User, type InsertUser, type Sale, type InsertSale,
  type Purchase, type InsertPurchase, type Product, type InsertProduct,
  type Customer, type InsertCustomer, type Supplier, type InsertSupplier
} from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Sales methods
  getSales(): Promise<Sale[]>;
  getSale(id: number): Promise<Sale | undefined>;
  createSale(sale: InsertSale): Promise<Sale>;
  
  // Purchase methods
  getPurchases(): Promise<Purchase[]>;
  getPurchase(id: number): Promise<Purchase | undefined>;
  createPurchase(purchase: InsertPurchase): Promise<Purchase>;
  
  // Product methods
  getProducts(): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  
  // Customer methods
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  
  // Supplier methods
  getSuppliers(): Promise<Supplier[]>;
  getSupplier(id: number): Promise<Supplier | undefined>;
  createSupplier(supplier: InsertSupplier): Promise<Supplier>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private sales: Map<number, Sale>;
  private purchases: Map<number, Purchase>;
  private products: Map<number, Product>;
  private customers: Map<number, Customer>;
  private suppliers: Map<number, Supplier>;
  private currentId: number;

  constructor() {
    this.users = new Map();
    this.sales = new Map();
    this.purchases = new Map();
    this.products = new Map();
    this.customers = new Map();
    this.suppliers = new Map();
    this.currentId = 1;
    
    // Initialize with default admin user
    this.createUser({ username: "admin", password: "password" });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const user: User = { ...insertUser, id, role: "admin" };
    this.users.set(id, user);
    return user;
  }

  // Sales methods
  async getSales(): Promise<Sale[]> {
    return Array.from(this.sales.values()).sort((a, b) => 
      new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
    );
  }

  async getSale(id: number): Promise<Sale | undefined> {
    return this.sales.get(id);
  }

  async createSale(insertSale: InsertSale): Promise<Sale> {
    const id = this.currentId++;
    const sale: Sale = { 
      id,
      invoiceNumber: insertSale.invoiceNumber,
      customerName: insertSale.customerName,
      amount: insertSale.amount,
      vehicleDetails: insertSale.vehicleDetails || null,
      gateNumber: insertSale.gateNumber || null,
      date: new Date(),
      status: "completed"
    };
    this.sales.set(id, sale);
    return sale;
  }

  // Purchase methods
  async getPurchases(): Promise<Purchase[]> {
    return Array.from(this.purchases.values()).sort((a, b) => 
      new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
    );
  }

  async getPurchase(id: number): Promise<Purchase | undefined> {
    return this.purchases.get(id);
  }

  async createPurchase(insertPurchase: InsertPurchase): Promise<Purchase> {
    const id = this.currentId++;
    const purchase: Purchase = { 
      ...insertPurchase, 
      id, 
      date: new Date(),
      status: "pending"
    };
    this.purchases.set(id, purchase);
    return purchase;
  }

  // Product methods
  async getProducts(): Promise<Product[]> {
    return Array.from(this.products.values());
  }

  async getProduct(id: number): Promise<Product | undefined> {
    return this.products.get(id);
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const id = this.currentId++;
    const product: Product = { 
      ...insertProduct, 
      id,
      stock: insertProduct.stock ?? 0
    };
    this.products.set(id, product);
    return product;
  }

  // Customer methods
  async getCustomers(): Promise<Customer[]> {
    return Array.from(this.customers.values());
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    return this.customers.get(id);
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const id = this.currentId++;
    const customer: Customer = { 
      ...insertCustomer, 
      id,
      address: insertCustomer.address ?? null,
      email: insertCustomer.email ?? null,
      phone: insertCustomer.phone ?? null
    };
    this.customers.set(id, customer);
    return customer;
  }

  // Supplier methods
  async getSuppliers(): Promise<Supplier[]> {
    return Array.from(this.suppliers.values());
  }

  async getSupplier(id: number): Promise<Supplier | undefined> {
    return this.suppliers.get(id);
  }

  async createSupplier(insertSupplier: InsertSupplier): Promise<Supplier> {
    const id = this.currentId++;
    const supplier: Supplier = { 
      ...insertSupplier, 
      id,
      address: insertSupplier.address ?? null,
      email: insertSupplier.email ?? null,
      phone: insertSupplier.phone ?? null
    };
    this.suppliers.set(id, supplier);
    return supplier;
  }
}

export const storage = new MemStorage();
