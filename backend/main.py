from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import os

app = FastAPI()

# Enable CORS so the mobile app can access the data
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

import mysql.connector
from mysql.connector import Error

# Remove FIXED PASSWORDS DEFINITION
# USERS_DB = { ... }

class LoginRequest(BaseModel):
    username: str
    password: str

# Use absolute path to ensure the file is found regardless of where uvicorn starts
CSV_FILE_PATH = os.path.join(os.path.dirname(__file__), "Sales Profit Report - By Product Group 2024.csv")

# Database connection settings
DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',          # Update with your MariaDB username
    'password': '',          # Update with your MariaDB password
    'database': 'mpt_omniportal'
}

@app.get("/")
def read_root():
    return {"message": "MPT OmniPortal Backend is running"}

@app.post("/api/login")
def login(request: LoginRequest):
    try:
        # Connect to MariaDB
        conn = mysql.connector.connect(**DB_CONFIG)
        cursor = conn.cursor(dictionary=True)
        
        # Check users table
        query = "SELECT * FROM users WHERE username = %s AND password = %s"
        cursor.execute(query, (request.username, request.password))
        user_record = cursor.fetchone()
        
        if user_record:
            return {
                "message": "Login successful",
                "token": "mock-jwt-token-778899",
                "user": {
                    "id": user_record["id"],
                    "username": user_record["username"],
                    "role": "admin"
                }
            }
        else:
            raise HTTPException(status_code=401, detail="Invalid username or password")
            
    except Error as e:
        print(f"Database error: {e}")
        raise HTTPException(status_code=500, detail="Database connection error")
        
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()


@app.get("/api/summary")
def get_summary():
    try:
        if not os.path.exists(CSV_FILE_PATH):
            return {"error": "CSV file not found"}

        # Read and clean data
        df = pd.read_csv(CSV_FILE_PATH)
        df['trx_amt'] = pd.to_numeric(df['trx_amt'], errors='coerce').fillna(0)
        df['cost_amt'] = pd.to_numeric(df['cost_amt'], errors='coerce').fillna(0)
        df['trx_date'] = pd.to_datetime(df['trx_date'], errors='coerce')
        df['month'] = df['trx_date'].dt.strftime('%Y-%m')

        outlets = []
        for outlet_code, outlet_df in df.groupby('com_unit'):
            salesmen = outlet_df.groupby('saleman_cd')['trx_amt'].sum().to_dict()
            brands = outlet_df.groupby('inv_desc')['trx_amt'].sum().to_dict()

            # Build full salesman profiles with monthly and brand breakdowns
            salesman_profiles = {}
            for salesman_id, salesman_df in outlet_df.groupby('saleman_cd'):
                salesman_brands = salesman_df.groupby('inv_desc')['trx_amt'].sum().to_dict()

                monthly_data = {}
                valid_monthly = salesman_df.dropna(subset=['month'])
                for month_key, month_df in valid_monthly.groupby('month'):
                    month_brands = month_df.groupby('inv_desc')['trx_amt'].sum().to_dict()
                    monthly_data[str(month_key)] = {
                        "revenue": float(month_df['trx_amt'].sum()),
                        "brands": {str(k): float(v) for k, v in month_brands.items()}
                    }

                daily_revenue = {}
                valid_daily = salesman_df.dropna(subset=['trx_date'])
                for date_val, date_df in valid_daily.groupby(valid_daily['trx_date'].dt.date):
                    daily_revenue[str(date_val)] = float(date_df['trx_amt'].sum())

                salesman_profiles[str(salesman_id)] = {
                    "name": str(salesman_id),
                    "totalRevenue": float(salesman_df['trx_amt'].sum()),
                    "brands": {str(k): float(v) for k, v in salesman_brands.items()},
                    "monthlyData": monthly_data,
                    "dailyRevenue": daily_revenue
                }

            outlets.append({
                "code": str(outlet_code).strip(),
                "name": f"Branch {outlet_code}",
                "totalRevenue": float(outlet_df['trx_amt'].sum()),
                "totalInvestment": float(outlet_df['cost_amt'].sum()),
                "transactionCount": int(len(outlet_df)),
                "salesmen": {str(k): float(v) for k, v in salesmen.items()},
                "brands": {str(k): float(v) for k, v in brands.items()},
                "salesmanProfiles": salesman_profiles
            })

        outlets.sort(key=lambda x: x['totalRevenue'], reverse=True)

        return {
            "message": "Data successfully processed",
            "outlets": outlets
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    # 0.0.0.0 tells the server to listen on all available network interfaces
    uvicorn.run(app, host="0.0.0.0", port=8000)