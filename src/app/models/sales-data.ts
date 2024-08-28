export interface Sale {
  _id: string;
  _rev: string;
  Order_ID: string;
  Fulfillment_Date: string;
  Order_Date: string;
  Ship_Date: string;
  Ship_Mode: string;
  Customer_ID: string;
  Customer_Name: string;
  Segment: string;
  City: string;
  State: string;
  Country: string;
  Region: string;
  Product_ID: string;
  Category: string;
  Sub_Category: string;
  Product_Name: string;
  Sales: number;
  Quantity: number;
  Discount: number;
  Profit: number;
  type: string;
}
