# Cartify Authentication Flow Documentation

This document outlines the complete authentication flow for the Cartify app, including Guest (Anonymous) access, Account Conversion, and Vendor registration.

## 1. Initial App Launch (Guest Mode)

Every user starts as an Anonymous user to allow frictionless browsing.

### **Step 1: Check/Create Guest Session**
On every app launch, the app should send the unique `device_id` to the backend.

*   **Endpoint:** `POST /auth/guest-login/`
*   **Payload:**
    ```json
    {
      "device_id": "unique-device-identifier-123"
    }
    ```
*   **Logic:** 
    *   If a user with this `device_id` exists, it returns their existing guest token.
    *   If not, it creates a new `ANONYMOUS` user record.
*   **Response:**
    ```json
    {
      "token": "app-auth-token",
      "user_id": 101,
      "role": "ANONYMOUS",
      "show_registration_popup": false
    }
    ```

### **Step 2: Anonymous Engagement (The 2-Month Rule)**
The `guest-login` API automatically calculates if the user has been using the app for more than 60 days.
*   If `show_registration_popup` is `true`, the App should display a premium popup encouraging the user to register for "Early access to new discounts" and "Personalized updates".

---

## 2. The "Sign Up" Logic (Conversion vs. New)

This is where you decide which API to call.

### **Scenario A: User is currently a Guest (Most Common)**
The user has been browsing anonymously and now wants to create an account. You want to **migrate** their favorites and preferences.

*   **Trigger:** User clicks "Sign Up" while the app holds an `ANONYMOUS` role token.
*   **Endpoint:** `POST /auth/convert-guest/`
*   **Payload:**
    ```json
    {
      "device_id": "unique-device-identifier-123",
      "username": "new_user_name",
      "email": "user@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "password": "securepassword"
    }
    ```
*   **Result:** The existing Guest record in the DB is updated to `CUSTOMER`. All their data (favorites, etc.) remains linked to the same `user_id`.

### **Scenario B: Fresh Install / No Guest session**
User just installed the app and immediately goes to a Sign Up screen (bypassing the guest flow, if possible).

*   **Trigger:** No active guest session or `device_id` is not yet registered.
*   **Endpoint:** `POST /auth/register/`
*   **Payload:** Same as above, but adds `"role": "CUSTOMER"`.
*   **Result:** A brand new user record is created.

---

## 3. Vendor Registration & KYC

Vendors follow a slightly different path because they require approval.

### **Step 1: Vendor Signup**
*   **Endpoint:** `POST /auth/register/`
*   **Payload:**
    ```json
    {
      "username": "brand_admin",
      "email": "contact@brand.com",
      "password": "...",
      "role": "VENDOR",
      "brand_name": "Awesome Brand",
      "phone_number": "+123456789",
      "address": "123 Business St",
      "first_name": "Manager",
      "last_name": "Name"
    }
    ```
*   **Logic:** 
    *   Backend creates the `User` and a `VendorProfile`.
    *   `is_approved` is set to `false` by default.

### **Step 2: Restricted Access**
*   When a Vendor logs in, the app should check their `vendor_profile.is_approved` status.
*   If `false`, show a "Waiting for Approval" screen and disable "Add Product" features.

---

## 4. Admin Management

Admin users are created manually or through the Django admin panel. They have full control via the Admin Dashboard.

### **Admin Capabilities:**
1.  **Manage Vendors:** View all vendors and toggle `is_approved`.
2.  **Default Categories:** Create categories that all vendors can see.
3.  **Post on behalf:** Admin can select a vendor and upload products for them.

---

## Summary of API Logic for App Developers

| User Action | Current Role | API to Call |
| :--- | :--- | :--- |
| **App Starts** | None | `/auth/guest-login/` |
| **Sign Up** | `ANONYMOUS` | `/auth/convert-guest/` |
| **Sign Up** | None | `/auth/register/` |
| **Login** | Any/None | `/auth/login/` |
| **Check Email/User** | Any | `/auth/check-user/` |

---
