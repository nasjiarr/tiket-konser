import crypto from "crypto";
// @ts-ignore
import midtransClient from "midtrans-client";

export class MidtransService {
  private static snapClient = new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
    serverKey: process.env.MIDTRANS_SERVER_KEY || "SB-Mid-server-xxxx",
    clientKey: process.env.MIDTRANS_CLIENT_KEY || "SB-Mid-client-xxxx"
  });

  /**
   * Create Snap payment token
   */
  static async createTransaction(params: {
    orderId: string;
    grossAmount: number;
    customerDetails: {
      name: string;
      email: string;
      phone: string;
    };
    itemDetails: Array<{
      id: string;
      price: number;
      quantity: number;
      name: string;
    }>;
  }) {
    const serverKey = process.env.MIDTRANS_SERVER_KEY || "";
    const isMock = !serverKey || serverKey.includes("xxxx");

    // If sandbox key is placeholder, generate simulated Snap token for local dev
    if (isMock) {
      const mockToken = `snap_token_mock_${params.orderId.slice(0, 8)}_${Date.now()}`;
      return {
        token: mockToken,
        redirect_url: `https://app.sandbox.midtrans.com/snap/v2/vtweb/${mockToken}`,
        isMock: true
      };
    }

    try {
      const parameter = {
        transaction_details: {
          order_id: params.orderId,
          gross_amount: Math.round(params.grossAmount)
        },
        customer_details: {
          first_name: params.customerDetails.name,
          email: params.customerDetails.email,
          phone: params.customerDetails.phone
        },
        item_details: params.itemDetails
      };

      const transaction = await this.snapClient.createTransaction(parameter);
      return {
        token: transaction.token,
        redirect_url: transaction.redirect_url,
        isMock: false
      };
    } catch (err: any) {
      console.warn("⚠️ Midtrans API call failed, falling back to mock snap token:", err.message);
      const mockToken = `snap_token_mock_${params.orderId.slice(0, 8)}_${Date.now()}`;
      return {
        token: mockToken,
        redirect_url: `https://app.sandbox.midtrans.com/snap/v2/vtweb/${mockToken}`,
        isMock: true
      };
    }
  }

  /**
   * Verify Midtrans Webhook SHA-512 Signature
   * Formula: SHA512(order_id + status_code + gross_amount + ServerKey)
   */
  static verifySignature(
    orderId: string,
    statusCode: string,
    grossAmount: string,
    signatureKey: string
  ): boolean {
    const serverKey = process.env.MIDTRANS_SERVER_KEY || "SB-Mid-server-xxxx";

    // Allow mock signature in development if serverKey is dummy
    if (signatureKey === "mock_valid_signature" && serverKey.includes("xxxx")) {
      return true;
    }

    // Midtrans gross_amount may have .00 or not, normalize if needed
    const rawString = `${orderId}${statusCode}${grossAmount}${serverKey}`;
    const hash = crypto.createHash("sha512").update(rawString).digest("hex");

    return hash.toLowerCase() === signatureKey.toLowerCase();
  }
}
