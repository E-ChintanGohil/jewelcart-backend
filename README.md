# Jewelcart Backend API

Node.js + Express + MySQL backend for Jewelcart jewelry e-commerce application.

## Features

-   **Authentication**: JWT-based authentication with role-based access control
-   **Products**: Complete product management with dynamic pricing
-   **Categories**: Product categorization system
-   **Customers**: Customer management with addresses, preferences, and notes
-   **Orders**: Order processing with inventory management
-   **Materials**: Gold/Silver material and karat price management
-   **Settings**: Site configuration and pricing controls
-   **Payments**: Razorpay integration for Indian payments
-   **Security**: Helmet, rate limiting, input validation, and sanitization

## Prerequisites

-   Node.js 18+
-   MySQL 8.0+
-   XAMPP (for local MySQL) or MySQL server

## Installation

1. **Install dependencies:**

    ```bash
    cd backend
    npm install
    ```

2. **Database Setup:**

    - Start MySQL server (through XAMPP or standalone)
    - Create database and run schema:

    ```bash
    mysql -u root -p < src/config/database.sql
    ```

3. **Environment Configuration:**

    ```bash
    cp .env.example .env
    ```

    Edit `.env` with your configuration:

    ```env
    # Database Configuration
    DB_HOST=localhost
    DB_USER=root
    DB_PASSWORD=your_mysql_password
    DB_NAME=jewelcart
    DB_PORT=3306

    # JWT Configuration
    JWT_SECRET=your-super-secret-jwt-key-here
    JWT_EXPIRES_IN=7d

    # Server Configuration
    PORT=5000
    NODE_ENV=development

    # Razorpay Configuration
    RAZORPAY_KEY_ID=your-razorpay-key-id
    RAZORPAY_KEY_SECRET=your-razorpay-key-secret

    # Frontend URL for CORS
    FRONTEND_URL=http://localhost:8080
    ```

4. **Start Development Server:**
    ```bash
    npm run dev
    ```

## API Endpoints

### Authentication

-   `POST /api/auth/login` - User login
-   `POST /api/auth/register` - User registration
-   `GET /api/auth/me` - Get current user
-   `POST /api/auth/logout` - Logout
-   `PUT /api/auth/change-password` - Change password

### Products

-   `GET /api/products` - Get products (public)
-   `GET /api/products/admin` - Get all products (staff)
-   `GET /api/products/:id` - Get single product
-   `POST /api/products` - Create product (staff)
-   `PUT /api/products/:id` - Update product (staff)
-   `DELETE /api/products/:id` - Delete product (staff)
-   `PUT /api/products/:id/stock` - Update stock (staff)

### Categories

-   `GET /api/categories` - Get all categories
-   `GET /api/categories/:id` - Get single category
-   `POST /api/categories` - Create category (staff)
-   `PUT /api/categories/:id` - Update category (staff)
-   `DELETE /api/categories/:id` - Delete category (staff)

### Customers

-   `GET /api/customers` - Get all customers (staff)
-   `GET /api/customers/:id` - Get single customer (staff)
-   `POST /api/customers` - Create customer (staff)
-   `PUT /api/customers/:id` - Update customer (staff)
-   `POST /api/customers/:id/notes` - Add customer note (staff)

### Orders

-   `GET /api/orders` - Get all orders (staff)
-   `GET /api/orders/:id` - Get single order (staff)
-   `POST /api/orders` - Create order (staff)
-   `PUT /api/orders/:id/status` - Update order status (staff)

### Materials

-   `GET /api/materials` - Get all materials with karats
-   `GET /api/materials/:id` - Get single material
-   `PUT /api/materials/:id/karats/:karatId` - Update karat price (staff)

### Settings

-   `GET /api/settings` - Get site settings
-   `PUT /api/settings` - Update settings (staff)

### Payments

-   `POST /api/payments/create-order` - Create Razorpay order
-   `POST /api/payments/verify` - Verify payment
-   `GET /api/payments/:payment_id` - Get payment details (staff)
-   `POST /api/payments/:payment_id/refund` - Create refund (staff)

## Default Login

-   **Email**: admin@jewelcart.com
-   **Password**: admin123

## Database Schema

The database includes the following main tables:

-   `users` - User authentication and roles
-   `materials` & `karats` - Gold/Silver materials and purity levels
-   `categories` - Product categories
-   `products` - Products with dynamic pricing
-   `product_images` & `product_tags` - Product multimedia and tags
-   `customers` - Customer information
-   `customer_addresses` - Customer addresses
-   `customer_preferences` & `customer_notes` - Customer details
-   `orders` & `order_items` - Order management
-   `settings` - Site configuration

## Price Calculation

Products use dynamic pricing based on:

-   Base price (craftsmanship, design, etc.)
-   Material cost (price per gram × weight)
-   Current gold/silver rates stored in karats table

Formula: `Total Price = Base Price + (Price Per Gram × Weight)`

## Security Features

-   JWT token authentication
-   Role-based access control (admin/staff)
-   Input validation and sanitization
-   Rate limiting (100 requests per 15 minutes)
-   Helmet security headers
-   CORS configuration
-   SQL injection prevention with parameterized queries

## Development Commands

```bash
npm run dev      # Start development server with nodemon
npm start        # Start production server
npm test         # Run tests (when implemented)
npm run seed     # Seed database with sample data (when implemented)
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Use a proper MySQL server (not XAMPP)
3. Set strong JWT secret
4. Configure proper Razorpay credentials
5. Set up SSL/HTTPS
6. Use PM2 or similar for process management
7. Set up database backups
8. Configure logging and monitoring

## Integration with Frontend

The backend is designed to replace the localStorage-based data management in the frontend. Update the frontend's data service to make HTTP requests to these API endpoints instead of using localStorage.

-   Admin: admin@jewelcart.com / admin123
-   Customer: customer@jewelcart.com / customer123
